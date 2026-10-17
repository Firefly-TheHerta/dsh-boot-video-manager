/*
 * dsh-boot-video-manager 客户端半侧冒烟 + 渲染测试。
 *
 * 不依赖浏览器：把 lib/client.js 喂给假的 __ModuleLoader__，用一套最小 hooks
 * 运行时渲染两次（先 loading，再 ready），检查 slot 注册与播放列表 UI 的结构。
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

/* --------------------------------------------------------- 假 __ModuleLoader__ */
let loaded = null
const fakeDocument = {
  getElementById: () => null,
  createElement: () => ({ dataset: {}, style: {}, textContent: '' }),
  head: { appendChild: () => {} },
}
new Function('window', 'document', code)(
  { __ModuleLoader__: { load: (options) => { loaded = options } } },
  fakeDocument,
)
assert.ok(loaded !== null, 'client.js 没有调用 __ModuleLoader__.load')
console.log('module id      :', loaded.id)
assert.strictEqual(loaded.id, 'dsh-boot-video-manager')

/* ------------------------------------------------------------- 最小 hooks 运行时 */
const hooks = []
let hookIndex = 0
const effects = []
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => {
    const slot = hookIndex
    hookIndex += 1
    if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial
    return [hooks[slot], (value) => {
      hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value
    }]
  },
  useEffect: (fn) => { effects.push(fn) },
  useRef: (initial) => {
    const slot = hookIndex
    hookIndex += 1
    if (!(slot in hooks)) hooks[slot] = { current: initial === undefined ? null : initial }
    return hooks[slot]
  },
  useCallback: (fn) => fn,
}
function render(component, props) {
  hookIndex = 0
  return component(props)
}
/**
 * 把元素树摊平成一张节点表。因为假 createElement 不会调用函数组件，
 * 遇到 type 是函数的元素就地展开一次（PlaylistRow 不用 hooks，安全）。
 */
function collect(tree) {
  const nodes = []
  const visit = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (typeof node.type === 'function') { visit(node.type(node.props || {})); return }
    nodes.push(node)
    for (const child of node.children || []) visit(child)
  }
  visit(tree)
  return nodes
}

/* ------------------------------------------------------------------ 加载 factory */
const required = []
const mod = loaded.factory((name) => {
  required.push(name)
  if (name === 'react') return fakeReact
  throw new Error('意外的模块请求: ' + name)
})
console.log('requires       :', required.join(', ') || '(无)')
console.log('exports        :', Object.keys(mod).join(', '))
console.log('inject         :', JSON.stringify(mod.inject))
console.log('NS             :', mod.NS)
assert.deepStrictEqual(required, ['react'], '只应该 require("react")')
assert.strictEqual(mod.NS, 'settings.bootVideoManager')
assert.deepStrictEqual(mod.inject, ['slots', 'locale'])

/* ------------------------------------------------------------------ apply/slot */
/* ------------------------------------------------- 假的设置服务（configForms） */
// 上游「启动动画」插件（dsh-boot-animation）的设置：声音开关就存在这里。
const BOOT_SETTINGS = { sound: true, clickToEnter: false }
const formListeners = []
const setCalls = []
const fakeForm = {
  getSnapshot: () => ({
    status: 'ready', writable: true, revision: 1, value: Object.assign({}, BOOT_SETTINGS),
  }),
  subscribe: (listener) => {
    formListeners.push(listener)
    return () => {
      const index = formListeners.indexOf(listener)
      if (index >= 0) formListeners.splice(index, 1)
    }
  },
  set: (field, value) => {
    setCalls.push(field + '=' + String(value))
    BOOT_SETTINGS[field] = value
    formListeners.slice().forEach((listener) => listener())
    return Promise.resolve(true)
  },
}
const fakeForms = {
  get: (id) => {
    assert.strictEqual(id, 'boot-animation', '只应该读上游「启动动画」插件的命名空间')
    return fakeForm
  },
  whileServed: (namespaces, register) => {
    assert.deepStrictEqual(namespaces, ['boot-animation'])
    return register(new Set(namespaces))
  },
}
const fakeOwner = {
  get: (name) => (name === 'configForms' ? fakeForms : undefined),
  effect: (fn) => { fn(); return () => {} },
}
// ctx.inject 故意先不回调：先看「设置服务还没到」时面板长什么样，后面再手工接上。
const injectCalls = []

const registered = []
const ctx = {
  effect: (fn) => fn(),
  inject: (deps, fn) => { injectCalls.push({ deps, fn }); return () => {} },
  locale: {
    register: (ns, dict) => {
      console.log('locale.register:', ns, '=>', Object.keys(dict).join(','))
      assert.deepStrictEqual(Object.keys(dict).sort(), ['en', 'zh'])
      return () => {}
    },
    bind: (ns) => (key) => '<' + ns + ':' + key + '>',
  },
  slots: {
    inject: (name, fn) => { console.log('slots.inject   :', name); return fn() },
    register: (descriptor, component) => { registered.push({ descriptor, component }); return () => {} },
  },
  logger: { info: () => {}, error: () => {}, warn: () => {} },
}
mod.apply(ctx)
assert.strictEqual(registered.length, 1)
const { descriptor, component } = registered[0]
console.log('slot           :', descriptor.name, '| id=' + descriptor.id, '| order=' + descriptor.order, '| label=' + descriptor.label())
assert.strictEqual(descriptor.name, 'settings.section')
assert.strictEqual(descriptor.id, 'boot-videos')
assert.strictEqual(descriptor.order, 60)
assert.strictEqual(descriptor.label(), '<settings.bootVideoManager:nav>')

/* -------------------------------------------------------------- 第一次渲染（loading） */
const props = Object.assign({}, descriptor.inject())
let tree = render(component, props)
assert.strictEqual(tree.props.className, 'bvm-root')
assert.strictEqual(tree.children[0].props.className, 'bvm-muted')
console.log('渲染 #1        : loading 分支 ok')

/* ---------------------------------------------------- 跑 effect（触发 refresh），再渲染 */
const READY = {
  ok: true,
  dir: 'D:\\dsh-boot-animation\\assets\\videos',
  exists: true,
  bootPluginPresent: true,
  mode: 'sequence',
  cursor: 1,
  nextName: 'b.mp4',
  lastPlayed: 'a.mp4',
  playableCount: 2,
  items: [
    { index: 0, name: 'a.mp4', bytes: 1024, mtime: 0, included: true, inPool: true },
    { index: 1, name: 'b.mp4', bytes: 2048, mtime: 0, included: true, inPool: false },
    { index: 2, name: 'c.mp4', bytes: 3072, mtime: 0, included: false, inPool: false },
  ],
  recycled: ['20261015T113855-old.mp4'],
  recycledCount: 1,
  totalBytes: 6144,
}
let fetchCalls = 0
global.fetch = async () => {
  fetchCalls += 1
  return { ok: true, status: 200, text: async () => JSON.stringify(READY) }
}

async function main() {
  for (const effect of effects) await effect()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.strictEqual(hooks[0].status, 'ready', 'refresh() 应该把状态推到 ready')
  tree = render(component, props)
  assert.strictEqual(tree.props.className, 'bvm-root')

  const nodes = collect(tree)

  const texts = nodes
    .map((node) => (node.children || []).filter((child) => typeof child === 'string').join(''))
    .filter((text) => text !== '')
  const classes = nodes.map((node) => (node.props && node.props.className) || '')
  const byClass = (className) => nodes.filter((node) => (node.props && node.props.className === className))

  const rows = nodes.filter((node) => node.props && node.props['data-name'])
  console.log('渲染 #2        : 行数 =', rows.length, '| 名称 =', rows.map((r) => r.props['data-name']).join(', '))
  assert.deepStrictEqual(rows.map((row) => row.props['data-name']), ['a.mp4', 'b.mp4', 'c.mp4'])

  // 编号
  const numbers = byClass('bvm-num').map((node) => node.children[0])
  assert.deepStrictEqual(numbers, ['1.', '2.', '3.'])
  console.log('编号           :', numbers.join(' '))

  // 勾选状态
  const checks = nodes.filter((node) => node.type === 'input' && node.props.type === 'checkbox')
  assert.deepStrictEqual(checks.map((node) => node.props.checked), [true, true, false])
  console.log('勾选           :', checks.map((node) => node.props.checked).join(', '))

  // 徽章：a 在池中且已播过；b 是下一个；c 没有
  const badges = byClass('bvm-badge').map((node) => node.children[0])
  const doneBadges = byClass('bvm-badge bvm-badge-done').map((node) => node.children[0])
  console.log('徽章           :', badges.join(' / '), '| 已播过 =', doneBadges.join(' / '))
  assert.ok(badges.includes('<settings.bootVideoManager:nowInPool>'))
  assert.ok(badges.includes('<settings.bootVideoManager:nextUp>'))
  assert.ok(doneBadges.includes('<settings.bootVideoManager:lastPlayed>'))

  // c 应该被标成「不参与」
  assert.ok(rows[2].props.className.includes('bvm-item-off'), 'c.mp4 应该带 bvm-item-off')
  assert.ok(!rows[0].props.className.includes('bvm-item-off'), 'a.mp4 不应该带 bvm-item-off')

  // 上移/下移按钮的禁用状态
  const upButtons = nodes.filter((node) => (node.children || []).includes('↑'))
  const downButtons = nodes.filter((node) => (node.children || []).includes('↓'))
  assert.strictEqual(upButtons.length, 3)
  assert.deepStrictEqual(upButtons.map((node) => node.props.disabled), [true, false, false])
  assert.deepStrictEqual(downButtons.map((node) => node.props.disabled), [false, false, true])
  console.log('↑↓ 禁用        : up=' + upButtons.map((n) => n.props.disabled).join(',') + ' down=' + downButtons.map((n) => n.props.disabled).join(','))

  // 顺序模式的「设为下一个」：b（已经是下一个）应该被禁用，c（不参与）也应该被禁用
  const setNext = nodes.filter((node) => (node.children || []).includes('<settings.bootVideoManager:setNext>'))
  assert.strictEqual(setNext.length, 3, '顺序模式下每一行都有「设为下一个」')
  assert.deepStrictEqual(setNext.map((node) => node.props.disabled), [false, true, true])
  console.log('设为下一个禁用 :', setNext.map((n) => n.props.disabled).join(','))

  // 播放方式分段控件：顺序那个应该是选中态
  const segOn = byClass('bvm-seg-on').map((node) => node.children[0])
  assert.deepStrictEqual(segOn, ['<settings.bootVideoManager:modeSequence>'])

  // 摘要行 + 回收区
  assert.ok(texts.some((text) => text.includes('<settings.bootVideoManager:total>')), '缺总计文本')
  assert.ok(texts.some((text) => text.includes('20261015T113855-old.mp4')), '回收区应该列出文件名')
  console.log('摘要 / 回收区  : ok')

  // 随机模式：不应该有「设为下一个」
  hooks[0] = { status: 'ready', data: Object.assign({}, READY, { mode: 'random', nextName: null }) }
  const randomNodes = collect(render(component, props))
  const setNextRandom = randomNodes.filter((node) => (node.children || []).includes('<settings.bootVideoManager:setNext>'))
  assert.strictEqual(setNextRandom.length, 0, '随机模式不该出现「设为下一个」')
  const segOnRandom = randomNodes.filter((node) => node.props && node.props.className === 'bvm-seg-on')
  assert.strictEqual(segOnRandom[0].children[0], '<settings.bootVideoManager:modeRandom>')
  console.log('随机模式       : 无「设为下一个」，分段控件切到随机')

  // 单次模式：第三段选中，每行按钮变成「固定播这支」，固定那支带「每次播」徽章
  hooks[0] = {
    status: 'ready',
    data: Object.assign({}, READY, { mode: 'single', pinned: 'b.mp4', nextName: 'b.mp4' }),
  }
  const singleNodes = collect(render(component, props))
  const segOnSingle = singleNodes.filter((node) => node.props && node.props.className === 'bvm-seg-on')
  assert.deepStrictEqual(segOnSingle.map((node) => node.children[0]),
    ['<settings.bootVideoManager:modeSingle>'], '单次模式应该选中第三段')
  const pinButtons = singleNodes.filter((node) => (node.children || []).includes('<settings.bootVideoManager:pinIt>'))
  assert.strictEqual(pinButtons.length, 3, '单次模式下每一行都有「固定播这支」')
  assert.deepStrictEqual(pinButtons.map((node) => node.props.disabled), [false, true, true],
    '固定那支和不参与的那支应该禁用')
  assert.strictEqual(
    singleNodes.filter((node) => (node.children || []).includes('<settings.bootVideoManager:setNext>')).length,
    0, '单次模式不该再出现「设为下一个」')
  const singleBadges = singleNodes
    .filter((node) => node.props && node.props.className === 'bvm-badge')
    .map((node) => node.children[0])
  assert.ok(singleBadges.includes('<settings.bootVideoManager:pinnedBadge>'), '固定那支应该带「每次播」徽章')
  assert.ok(!singleBadges.includes('<settings.bootVideoManager:nextUp>'), '单次模式不该出现「下一个」徽章')
  const singleTexts = singleNodes
    .map((node) => (node.children || []).filter((child) => typeof child === 'string').join(''))
  assert.ok(singleTexts.some((text) => text.includes('<settings.bootVideoManager:pinnedBadge>：b.mp4')),
    '摘要应该写成「每次播：b.mp4」')
  console.log('单次模式       : 三段控件选中「单次播放」，每行「固定播这支」，固定那支带「每次播」')

  // 兼容旧宿主（没有 items，只有 enabled/disabled）：应该说清「要重启 DSH」
  hooks[0] = {
    status: 'ready',
    data: {
      ok: true, dir: 'D:\\dsh-boot-animation\\assets\\videos', exists: true, bootPluginPresent: true,
      enabled: [{ name: 'maid-splash.mp4', bytes: 1990488 }], disabled: [], recycled: [],
      recycledCount: 0, totalBytes: 1990488,
    },
  }
  const legacyNodes = collect(render(component, props))
  const legacyText = legacyNodes.map((node) => (node.children || []).filter((c) => typeof c === 'string').join('')).join(' ')
  assert.ok(legacyText.includes('<settings.bootVideoManager:restartNeeded>'), '旧宿主应提示重启 DSH')
  assert.ok(legacyText.includes('maid-splash.mp4'), '旧宿主至少要列出已有素材')
  assert.strictEqual(
    legacyNodes.filter((node) => (node.children || []).includes('<settings.bootVideoManager:setNext>')).length, 0)
  console.log('旧宿主兼容     : 提示重启 DSH，并列出已有素材')

  /* ------------------------------------------------------------ 声音卡片 */
  // 还没接上设置服务：卡片在，但只提示去装上游插件，不该出现开关
  const earlyGroups = byClass('bvm-group').map((node) => node.children[0])
  assert.ok(earlyGroups.includes('<settings.bootVideoManager:soundTitle>'), '声音卡片的标题应该在')
  assert.strictEqual(
    nodes.filter((node) => node.type === 'button'
      && (node.children || []).includes('<settings.bootVideoManager:on>')).length,
    0, '没接上设置服务时不该有声音开关')
  assert.ok(texts.join(' ').includes('<settings.bootVideoManager:soundMissing>'),
    '没接上设置服务时应提示装上游插件')
  console.log('声音卡片 #1    : 还没接上设置服务 -> 提示安装上游插件')

  // 手工把设置服务接上（真实环境里 ctx.inject 会自己回调），再渲染
  assert.strictEqual(injectCalls.length, 1, 'apply() 应该用动态 inject 等 configForms')
  assert.deepStrictEqual(injectCalls[0].deps, ['configForms'])
  injectCalls[0].fn(fakeOwner)
  const soundPort = props.sound
  assert.strictEqual(soundPort.getSnapshot().ready, true, '接上后 port 应该 ready')
  for (const effect of effects) await effect()
  const soundNodes = collect(render(component, props))
  const soundSelected = soundNodes
    .filter((node) => node.props && node.props.className === 'bvm-seg-on')
    .map((node) => node.children[0])
  assert.ok(soundSelected.includes('<settings.bootVideoManager:on>'), 'sound=true 时「开」应该选中')
  assert.ok(soundSelected.includes('<settings.bootVideoManager:off>'), 'clickToEnter=false 时「关」应该选中')
  const soundText = soundNodes
    .map((node) => (node.children || []).filter((child) => typeof child === 'string').join(''))
    .join(' ')
  assert.ok(soundText.includes('<settings.bootVideoManager:soundPlayHint>'), '开着声音时要说明浏览器限制')
  assert.ok(soundText.includes('<settings.bootVideoManager:soundBoot>'), '要说明开机自启为什么没声音')
  assert.ok(soundText.includes('<settings.bootVideoManager:audioStateUnknown>'),
    '还没采到音频自检结果时，要说「没采到结论」')
  console.log('声音卡片 #2    : 两个开关 + 浏览器自动播放说明')

  // 点「播放影片声音 → 关」：应该走 form.set('sound', false)
  const soundCard = soundNodes.find((node) => node.props && node.props.className === 'bvm-card'
    && (node.children || []).some((child) => child && child.children
      && child.children.includes('<settings.bootVideoManager:soundTitle>')))
  assert.ok(soundCard !== undefined, '应该能找到声音卡片')
  const soundButtons = collect(soundCard).filter((node) => node.type === 'button')
  assert.deepStrictEqual(soundButtons.map((node) => node.children[0]), [
    '<settings.bootVideoManager:on>', '<settings.bootVideoManager:off>',
    '<settings.bootVideoManager:on>', '<settings.bootVideoManager:off>',
  ], '声音卡片应有「播放影片声音」「点鼠标直接进入」两组开关')
  soundButtons[1].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepStrictEqual(setCalls, ['sound=false'], '点「关」应该写 sound=false')
  for (const effect of effects) await effect()
  const mutedNodes = collect(render(component, props))
  const mutedSelected = mutedNodes
    .filter((node) => node.props && node.props.className === 'bvm-seg-on')
    .map((node) => node.children[0])
  assert.ok(mutedSelected.includes('<settings.bootVideoManager:off>'), '关掉后应该选中「关」')
  const mutedText = mutedNodes
    .map((node) => (node.children || []).filter((child) => typeof child === 'string').join(''))
    .join(' ')
  assert.ok(mutedText.includes('<settings.bootVideoManager:soundPlayOffHint>'), '关掉后应显示「已彻底静音」')
  console.log('声音卡片 #3    : 点「关」写进上游设置，文案跟着变')

  /* ------------------------------------------------------------ 音频自检 */
  // 面板按「上次开屏的结论」显示一行带颜色点的状态，结论来自启动动画写下的 data-sound。
  // 注意假 hooks 的脾气：render() 会把 hookIndex 归零，而 useState 只在槽位不存在时
  // 才调 getSnapshot()。所以换了 props.diag 之后要先渲染一次（这次渲染才登记属于新
  // port 的 effect），再跑 effect 把快照写回槽位，最后再渲染才看得到新文案。
  const textOf = (tree0) => collect(tree0)
    .map((node) => (node.children || []).filter((child) => typeof child === 'string').join(''))
    .join(' ')
  const diagText = async (record) => {
    props.diag = { getSnapshot: () => record, subscribe: () => () => {} }
    render(component, props)
    for (const effect of effects) await effect()
    return textOf(render(component, props))
  }
  const dig = (record) => ({
    ready: true,
    audible: record.audible,
    outcome: record.outcome || '',
    elapsedMs: record.elapsedMs === undefined ? null : record.elapsedMs,
    policy: '',
    active: false,
    everActive: false,
    reason: record.reason || '',
    at: '2026-10-16T00:00:00.000Z',
  })
  const mutedDiag = await diagText(dig({ audible: false, outcome: 'muted', elapsedMs: 5000, reason: '点一下打开声音' }))
  assert.ok(mutedDiag.includes('<settings.bootVideoManager:audioStateMuted>'), '静音（设备没醒）时要说出来')
  assert.ok(mutedDiag.includes('(5.0s)'), '要带等待了多久')
  const onDiag = await diagText(dig({ audible: true, outcome: 'on', elapsedMs: 820, reason: '点一下关闭声音' }))
  assert.ok(onDiag.includes('<settings.bootVideoManager:audioStateOn>'), '出声了时要说出来')
  assert.ok(onDiag.includes('(0.8s)'), '出声时要带用了几秒')
  const lateDiag = await diagText(dig({ audible: true, outcome: 'late', elapsedMs: 6500 }))
  assert.ok(lateDiag.includes('<settings.bootVideoManager:audioStateLate>'), '重试接回声音时要说出来')
  const refusedDiag = await diagText(dig({ audible: false, outcome: 'muted', elapsedMs: 5000, reason: '浏览器拒绝了声音，点一下重试' }))
  assert.ok(refusedDiag.includes('<settings.bootVideoManager:audioStateRefused>'), '浏览器拒绝时要说出来')
  const offDiag = await diagText(dig({ audible: false, outcome: '', reason: 'no-sound-button' }))
  assert.ok(offDiag.includes('<settings.bootVideoManager:audioStateOff>'), '声音开关关掉时要说出来')
  const legacyDiag = await diagText(dig({ audible: false, outcome: '', reason: 'no-sound-marker' }))
  assert.ok(legacyDiag.includes('<settings.bootVideoManager:audioStateLegacy>'), '旧版动画插件没写标记时要说出来')
  console.log('音频自检       : 出声 / 静音 / 重试接回 / 被拒绝 / 开关关掉 / 旧版插件 六种结论都能显示')

  /* --------------------------------------------------- 音频采样（真端口） */
  // 用真的 createAudioDiag 走一遍：结论要读 .dshba[data-sound]（动画插件自己写的标记），
  // 不能只看元素当下静没静音 —— 元素在等音频管线时可能还是「未静音」。
  const diagPort = descriptor.inject().diag
  assert.ok(diagPort && typeof diagPort.start === 'function', 'slot 应该注入真的音频自检端口')
  const fakeVideo = { readyState: 3, paused: false, muted: false }
  let fakeMarker = 'on:820'
  fakeDocument.querySelector = (selector) => {
    if (selector === '.dshba-video') return fakeVideo
    if (selector === '.dshba') return { getAttribute: (name) => (name === 'data-sound' ? fakeMarker : null) }
    if (selector === '.dshba-sound') return { title: '点一下关闭声音' }
    return null
  }
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  diagPort.start()
  await new Promise((resolve) => setTimeout(resolve, 400))
  const snapped = diagPort.getSnapshot()
  assert.strictEqual(snapped.ready, true, '采样应该收下这次开屏')
  assert.strictEqual(snapped.outcome, 'on', '结论应该读 data-sound 里的 on；实际: ' + JSON.stringify(snapped))
  assert.strictEqual(snapped.elapsedMs, 820, '毫秒数要一起记下来')
  assert.strictEqual(snapped.audible, true, 'on 表示有声')
  fakeMarker = 'muted:5000'
  diagPort.start()
  await new Promise((resolve) => setTimeout(resolve, 400))
  const mutedSnap = diagPort.getSnapshot()
  assert.strictEqual(mutedSnap.outcome, 'muted', '标记换成 muted 后结论要跟着变')
  assert.strictEqual(mutedSnap.audible, false, 'muted 表示没声')
  console.log('音频采样       : 读 data-sound（on / muted）并按毫秒判有声')

  console.log('\n客户端半侧渲染测试通过。')
}

main().catch((error) => {
  console.error('失败:', error)
  process.exitCode = 1
})
