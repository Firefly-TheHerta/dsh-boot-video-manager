/*
 * dsh-boot-video-manager 宿主半侧行为测试。
 *
 * 不依赖正在运行的 DSH：把 apply() 挂到一个假 ctx 上，直接调路由处理函数，
 * 用临时素材目录验证「顺序播放」的核心契约：
 *   · 池目录里始终只留「下一次要播的那一支」
 *   · 每次 apply（= 每次启动）把游标推进一格
 *   · 排序后「下一个播哪支」不会被挪跑
 *   · 路径穿越 / 扩展名 / 锚点保护都能挡住
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const ROOT = path.join(__dirname, 'tmp-bvm')
const ASSETS = path.join(ROOT, 'assets', 'videos')
const DISABLED = path.join(ASSETS, 'disabled')
const RECYCLE = path.join(ASSETS, 'recycle')
const STATE = path.join(ROOT, 'state', 'playlist.json')

const pool = () =>
  fs.existsSync(ASSETS)
    ? fs.readdirSync(ASSETS).filter((n) => fs.statSync(path.join(ASSETS, n)).isFile()).sort()
    : []

function reset() {
  fs.rmSync(ROOT, { recursive: true, force: true })
  fs.mkdirSync(ASSETS, { recursive: true })
  for (const name of ['a.mp4', 'b.mp4', 'c.mp4']) {
    fs.writeFileSync(path.join(ASSETS, name), Buffer.alloc(1000 + name.charCodeAt(0), 7))
  }
}

let version = 0
/** 模拟一次「启动」：重新 import 模块（绕过 ESM 缓存）+ apply。 */
async function boot() {
  version += 1
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'index.js')).href + '?v=' + version)
  const routes = []
  const ctx = {
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    effect: (fn) => fn(),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  mod.apply(ctx)
  return { mod, routes }
}

function fakeReq(method, url, body) {
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined && body !== null) yield Buffer.from(body)
    },
  }
}

async function call(routes, method, url, body) {
  const bare = url.split('?')[0]
  const matches = routes.filter((route) =>
    route.kind === 'exact' ? route.path === bare : bare.startsWith(route.path))
  assert.ok(matches.length > 0, '没有匹配的路由: ' + url)
  matches.sort((left, right) => right.path.length - left.path.length)

  const res = {
    status: 0,
    headers: null,
    headersSent: false,
    body: '',
    writeHead(status, headers) { res.status = status; res.headers = headers; res.headersSent = true },
    end(chunk) { if (chunk) res.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) },
  }
  matches[0].handler(fakeReq(method, url, body), res)
  for (let i = 0; i < 400 && res.body === ''; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.ok(res.body !== '', '处理函数没有回应: ' + url)
  let json = null
  try { json = JSON.parse(res.body) } catch { json = null }
  return { status: res.status, json }
}

async function main() {
  reset()
  process.env.DSH_BOOT_VIDEO_DIR = ASSETS
  process.env.DSH_BOOT_VIDEO_STATE = STATE

  // ---------------------------------------------------------------- 第一次启动
  let { routes } = await boot()
  console.log('routes         :', routes.map((r) => r.kind + ' ' + r.path.replace('/plugins/dsh-boot-video-manager', '')).join(' | '))
  assert.strictEqual(routes.length, 8)
  assert.ok(routes.every((route) => route.path.startsWith('/plugins/dsh-boot-video-manager')))
  assert.ok(fs.existsSync(STATE), '状态文件应该被写出来')
  console.log('池（启动 1 后）:', JSON.stringify(pool()))
  assert.deepStrictEqual(pool(), ['a.mp4'], '启动 1 池里应该只有 a.mp4（1 号）')

  let state = (await call(routes, 'GET', '/plugins/dsh-boot-video-manager/state')).json
  assert.deepStrictEqual(state.items.map((i) => i.name), ['a.mp4', 'b.mp4', 'c.mp4'])
  assert.strictEqual(state.mode, 'sequence')
  assert.strictEqual(state.cursor, 1)
  assert.strictEqual(state.nextName, 'b.mp4', '下一个应该是 b.mp4')
  assert.strictEqual(state.playableCount, 3)
  assert.strictEqual(state.bootPluginPresent, false, '临时目录旁边没有 entry.js')
  console.log('启动 1 状态    : cursor=' + state.cursor + ' next=' + state.nextName + ' playable=' + state.playableCount)

  // ------------------------------------------------------------------ 重排顺序
  let response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/order',
    JSON.stringify({ names: ['c.mp4', 'b.mp4', 'a.mp4'] }))
  assert.strictEqual(response.status, 200)
  assert.deepStrictEqual(response.json.items.map((i) => i.name), ['c.mp4', 'b.mp4', 'a.mp4'])
  assert.strictEqual(response.json.nextName, 'b.mp4', '排序不应该把「下一个」挪跑')
  console.log('重排后         : next=' + response.json.nextName + '（保持不变）')

  // ------------------------------------------------------------------ 参数校验
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/order',
    JSON.stringify({ names: ['c.mp4', 'b.mp4'] }))
  assert.strictEqual(response.status, 400)
  console.log('order 少一项   : ' + response.status + ' ' + response.json.error)

  response = await call(routes, 'GET', '/plugins/dsh-boot-video-manager/order', undefined)
  assert.strictEqual(response.status, 405)
  console.log('order 用 GET   : ' + response.status + ' ' + response.json.error)

  // ------------------------------------------------------- 锚点保护 / 取消参与
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/include',
    JSON.stringify({ name: 'b.mp4', included: false }))
  assert.strictEqual(response.status, 400, '不能取消「下一个就是它」的那一支')
  console.log('取消锚点参与   : ' + response.status + ' ' + response.json.error)

  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/include',
    JSON.stringify({ name: 'a.mp4', included: false }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.playableCount, 2)
  assert.ok(fs.existsSync(path.join(DISABLED, 'a.mp4')), 'a.mp4 应该被挪进 disabled/')
  console.log('取消 a 参与    : ok，playable=' + response.json.playableCount + '，disabled=' + fs.readdirSync(DISABLED).join(','))

  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/include',
    JSON.stringify({ name: 'a.mp4', included: true }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.playableCount, 3)
  // 顺序模式下「参与播放」≠「在池里」：不是当前目标的那几支就停在 disabled/，
  // 等游标轮到它们才会被搬回池目录。
  assert.ok(response.json.items.find((item) => item.name === 'a.mp4').included, 'a.mp4 应该重新参与播放')
  assert.ok(fs.existsSync(path.join(DISABLED, 'a.mp4')), 'a.mp4 还不是目标，应该仍在 disabled/')
  console.log('恢复 a 参与    : ok，playable=' + response.json.playableCount +
    '，a 仍在 disabled/（等轮次）')

  // -------------------------------------------------------------- 指定下一个
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/next',
    JSON.stringify({ name: 'c.mp4' }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.nextName, 'c.mp4')
  assert.deepStrictEqual(pool(), ['c.mp4'], '池里应该换成 c.mp4')
  console.log('指定下一个=c   : ok，池=' + JSON.stringify(pool()))

  // ------------------------------------------------------------------ 回收
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/recycle',
    JSON.stringify({ name: 'b.mp4' }))
  assert.strictEqual(response.status, 200)
  assert.deepStrictEqual(response.json.items.map((i) => i.name), ['c.mp4', 'a.mp4'])
  assert.strictEqual(fs.readdirSync(RECYCLE).length, 1)
  console.log('回收 b         : ok，recycle=' + fs.readdirSync(RECYCLE).join(','))

  // ---------------------------------------------------- 第二次「启动」推进游标
  ;({ routes } = await boot())
  assert.deepStrictEqual(pool(), ['c.mp4'], '启动 2 应该播 c.mp4（上一个 commit 指定的下一个）')
  state = (await call(routes, 'GET', '/plugins/dsh-boot-video-manager/state')).json
  assert.strictEqual(state.nextName, 'a.mp4', '启动 2 之后下一个应该是 a.mp4')
  console.log('启动 2         : 池=' + JSON.stringify(pool()) + ' next=' + state.nextName)

  ;({ routes } = await boot())
  assert.deepStrictEqual(pool(), ['a.mp4'], '启动 3 应该播 a.mp4')
  state = (await call(routes, 'GET', '/plugins/dsh-boot-video-manager/state')).json
  assert.strictEqual(state.nextName, 'c.mp4', 'a 之后回到 c.mp4（环形）')
  console.log('启动 3         : 池=' + JSON.stringify(pool()) + ' next=' + state.nextName + '（环形回到 c）')

  // ---------------------------------------------------------------- 随机模式
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/mode',
    JSON.stringify({ mode: 'random' }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.nextName, null)
  assert.deepStrictEqual(pool(), ['a.mp4', 'c.mp4'], '随机模式下参与播放的都应该在池里')
  console.log('切随机         : ok，池=' + JSON.stringify(pool()) + ' next=null')

  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/mode',
    JSON.stringify({ mode: 'nope' }))
  assert.strictEqual(response.status, 400)
  console.log('非法 mode      : ' + response.status + ' ' + response.json.error)

  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/mode',
    JSON.stringify({ mode: 'sequence' }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(pool().length, 1, '切回顺序模式应该只剩一支在池里')
  console.log('切回顺序       : ok，池=' + JSON.stringify(pool()))

  // ---------------------------------------------------------------- 单次模式
  state = (await call(routes, 'GET', '/plugins/dsh-boot-video-manager/state')).json
  const beforeSingle = state.nextName
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/mode',
    JSON.stringify({ mode: 'single' }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.mode, 'single')
  assert.strictEqual(response.json.pinned, beforeSingle, '切到单次模式应该固定住原来「下一个」那支')
  assert.strictEqual(response.json.nextName, response.json.pinned)
  assert.deepStrictEqual(pool(), [response.json.pinned], '池里只剩固定那支')
  console.log('切单次         : ok，固定=' + response.json.pinned + '，池=' + JSON.stringify(pool()))

  // 连续两次「启动」都应该播同一支，而且游标不推进
  for (const round of [1, 2]) {
    ;({ routes } = await boot())
    const after = (await call(routes, 'GET', '/plugins/dsh-boot-video-manager/state')).json
    assert.deepStrictEqual(pool(), [after.pinned], '第 ' + round + ' 次启动池里应该还是固定那支')
    assert.strictEqual(after.lastPlayed, after.pinned, '第 ' + round + ' 次启动应该播了固定那支')
    console.log('单次启动 ' + round + '     : 播=' + after.lastPlayed + '，池=' + JSON.stringify(pool()) + '（不变）')
  }

  // 「固定播这支」= 单次模式下的 /next
  const pinnedBefore = response.json.pinned
  const other = ['c.mp4', 'a.mp4'].find((name) => name !== pinnedBefore)
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/next',
    JSON.stringify({ name: other }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.pinned, other, '单次模式下 /next 改的是固定哪一支')
  assert.deepStrictEqual(pool(), [other])
  console.log('固定改成 ' + other + ' : ok，池=' + JSON.stringify(pool()) + '（原 ' + pinnedBefore + '）')

  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/include',
    JSON.stringify({ name: other, included: false }))
  assert.strictEqual(response.status, 400, '不能取消固定那支的参与')
  console.log('取消固定参与   : ' + response.status + ' ' + response.json.error)

  // 回收固定那支之后必须自动落到另一支，绝不能把池清空（否则开屏直接没动画）
  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/recycle',
    JSON.stringify({ name: other }))
  assert.strictEqual(response.status, 200)
  assert.notStrictEqual(response.json.pinned, other, '固定那支被回收后应该自动换一支')
  assert.strictEqual(response.json.nextName, response.json.pinned)
  assert.deepStrictEqual(pool(), [response.json.pinned], '池不能被清空')
  console.log('回收固定那支   : ok，自动改成 ' + response.json.pinned + '，池=' + JSON.stringify(pool()))

  response = await call(routes, 'POST', '/plugins/dsh-boot-video-manager/mode',
    JSON.stringify({ mode: 'sequence' }))
  assert.strictEqual(response.status, 200)
  assert.strictEqual(response.json.mode, 'sequence')
  console.log('单次→顺序      : ok，next=' + response.json.nextName)

  // ------------------------------------------------------ 上传：安全与正常路径
  response = await call(routes, 'POST',
    '/plugins/dsh-boot-video-manager/upload?name=' + encodeURIComponent('../evil.mp4'), Buffer.alloc(10))
  assert.strictEqual(response.status, 400)
  console.log('穿越上传       : ' + response.status + ' ' + response.json.error)

  response = await call(routes, 'POST',
    '/plugins/dsh-boot-video-manager/upload?name=notes.txt', Buffer.alloc(10))
  assert.strictEqual(response.status, 400)
  console.log('错扩展名       : ' + response.status + ' ' + response.json.error)

  const payload = Buffer.alloc(4321, 3)
  response = await call(routes, 'POST',
    '/plugins/dsh-boot-video-manager/upload?name=' + encodeURIComponent('d.mp4'), payload)
  assert.strictEqual(response.status, 200)
  const afterUpload = response.json.items.map((i) => i.name)
  assert.strictEqual(afterUpload[afterUpload.length - 1], 'd.mp4', '新上传的排在末尾')
  // 上传完会重新摆位：此刻的目标还是 c.mp4，所以 d.mp4 被停到 disabled/ 等轮次。
  const parked = fs.existsSync(path.join(ASSETS, 'd.mp4'))
    ? path.join(ASSETS, 'd.mp4')
    : path.join(DISABLED, 'd.mp4')
  assert.ok(fs.existsSync(parked), 'd.mp4 应该落在池目录或 disabled/')
  assert.strictEqual(fs.statSync(parked).size, 4321, '落盘字节数必须一致')
  console.log('上传 d.mp4     : ok，' + fs.statSync(parked).size + ' 字节，排在末尾（' +
    (parked.includes('disabled') ? '在 disabled/ 等轮次' : '在池中') + '）')

  response = await call(routes, 'POST',
    '/plugins/dsh-boot-video-manager/recycle', JSON.stringify({ name: 'nope.mp4' }))
  assert.strictEqual(response.status, 404)
  console.log('回收不存在     : ' + response.status + ' ' + response.json.error)

  console.log('\n宿主半侧行为测试通过。')
  fs.rmSync(ROOT, { recursive: true, force: true })
}

main().catch((error) => {
  console.error('失败:', error)
  process.exitCode = 1
})
