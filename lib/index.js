/**
 * dsh-boot-video-manager —— 宿主半侧。
 *
 * 给 dsh-boot-animation 配的「开屏视频播放列表」管理端：
 *   GET  /state            读播放列表、模式、下一个播哪支
 *   POST /upload?name=     上传一支视频进播放列表（原始字节体）
 *   POST /order            重排播放列表 { names: [...] }
 *   POST /include          勾选 / 取消参与 { name, included }
 *   POST /mode             切换 顺序 / 随机 / 单次 { mode }
 *   POST /next             指定下一次播哪支（不传 name 就是往后挪一位）
 *   POST /recycle          把某支移出播放列表（挪进 recycle/）
 *   POST /reveal           在资源管理器里打开素材目录
 *
 * 状态存在插件目录的 state/playlist.json（可用 DSH_BOOT_VIDEO_STATE 覆盖）。
 *
 * 「顺序」模式怎么实现的：池目录里只留「下一次要播的那一支」，其余挪进 disabled/。
 * 上游插件每次请求都重扫池目录、在池内随机抽 —— 池里只剩一支，抽出来必然是它。
 * 启动时把这一支摆好、然后把游标推进到下一支，于是「第一次启动播 1、第二次播 2」成立。
 * 「单次」模式用同一套机制，只是不推进游标 —— 每次都摆同一支（pinned），永远播它。
 * 全程不需要改上游插件一个字节。
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

export const name = 'dsh-boot-video-manager'
export const inject = ['webServer']

const ROUTE = '/plugins/dsh-boot-video-manager'
const DEFAULT_ASSET_DIR = 'D:\\dsh-boot-animation\\assets\\videos'
const DEFAULT_STATE_FILE = 'D:\\dsh-boot-video-manager\\state\\playlist.json'
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.m4v', '.mov'])
const MODES = new Set(['sequence', 'random', 'single'])
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

/** 可预期的业务失败：带 E_REFUSED 的消息会原样回给用户，映射成 4xx。 */
function refuse(message, status = 400) {
  const error = new Error(message)
  error.code = 'E_REFUSED'
  error.status = status
  return error
}

export function apply(ctx) {
  const assetDir = (process.env.DSH_BOOT_VIDEO_DIR ?? '').trim() || DEFAULT_ASSET_DIR
  const stateFile = (process.env.DSH_BOOT_VIDEO_STATE ?? '').trim() || DEFAULT_STATE_FILE
  const disabledDir = join(assetDir, 'disabled')
  const recycleDir = join(assetDir, 'recycle')
  const state = loadState(stateFile)

  // ---------------------------------------------------------------- 文件系统
  const listNames = (dir) => {
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
  }
  const describe = (dir, fileName) => {
    const file = join(dir, fileName)
    if (!existsSync(file)) return null
    const stats = statSync(file)
    return { bytes: stats.size, mtime: stats.mtimeMs }
  }
  /** 把 from 挪到 to。来源不存在返回 false；目标已有同名文件按大小去重或报错。 */
  const moveFile = (from, to) => {
    if (!existsSync(from)) return false
    if (existsSync(to)) {
      if (statSync(to).size === statSync(from).size) {
        rmSync(from)
        return true
      }
      throw refuse(`目标位置已有同名文件：${basename(to)}`, 409)
    }
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
    return true
  }

  // ------------------------------------------------------------ 播放列表状态
  const includedNames = () => state.order.filter((entry) => !state.excluded.includes(entry))
  /**
   * 下一次加载页面会播的那一支：
   *   顺序 → 游标指的那支；单次 → 固定那支；随机 → null（池里全放，交给上游抽）。
   */
  const currentTarget = () => {
    const playable = includedNames()
    if (playable.length === 0) return null
    if (state.mode === 'single') {
      return state.pinned && playable.includes(state.pinned) ? state.pinned : null
    }
    if (state.mode !== 'sequence') return null
    return playable[Math.min(Math.max(state.cursor, 0), playable.length - 1)]
  }
  /** 单次模式下保证「固定那支」始终有效（被移走/取消参与/回收后自动落到第一支）。 */
  const ensurePin = () => {
    if (state.mode !== 'single') return
    const playable = includedNames()
    if (state.pinned && playable.includes(state.pinned)) return
    state.pinned = playable[0] ?? null
  }
  /** 池目录里新出现的文件收进播放列表末尾；已经不在的文件剔出去。 */
  const reconcile = () => {
    for (const poolName of listNames(assetDir)) {
      if (!state.order.includes(poolName)) state.order.push(poolName)
    }
    state.order = state.order.filter(
      (entry) => existsSync(join(assetDir, entry)) || existsSync(join(disabledDir, entry)),
    )
    state.excluded = state.excluded.filter((entry) => state.order.includes(entry))
    if (!Number.isInteger(state.cursor) || state.cursor < 0) state.cursor = 0
  }
  /** 改动列表后用名字把游标重新钉住，免得排序把「下一个播哪支」挪跑。 */
  const reanchor = (name) => {
    const playable = includedNames()
    if (playable.length === 0) {
      state.cursor = 0
      return
    }
    const position = name === null ? -1 : playable.indexOf(name)
    state.cursor = position === -1 ? 0 : position
  }
  /** 按当前模式 + 游标，把每一支摆到该在的位置（池目录 / disabled）。 */
  const place = () => {
    ensurePin()
    const target = currentTarget()
    // 随机模式：参与播放的全部留在池里，让上游自己抽；顺序/单次：池里只留该播的那一支。
    const wanted = new Set(state.mode === 'random' ? includedNames() : target ? [target] : [])
    for (const entry of state.order) {
      const inPool = existsSync(join(assetDir, entry))
      const inDisabled = existsSync(join(disabledDir, entry))
      if (!inPool && !inDisabled) continue
      if (wanted.has(entry) === inPool) continue
      if (wanted.has(entry)) {
        moveFile(join(disabledDir, entry), join(assetDir, entry))
      } else {
        moveFile(join(assetDir, entry), join(disabledDir, entry))
      }
    }
  }
  /**
   * 启动时：把这次该播的那支摆进池目录；顺序模式再把游标推进到下一支。
   * 注意推进之后**不**再 place()，否则会把马上就要播的那支换掉。
   */
  const enforceAtStartup = () => {
    reconcile()
    ensurePin()
    if (state.mode === 'random') {
      place()
      return null
    }
    const target = currentTarget()
    if (target === null) {
      place()
      return null
    }
    place()
    state.lastPlayed = target
    if (state.mode === 'sequence') {
      const playable = includedNames()
      state.cursor = (playable.indexOf(target) + 1) % playable.length
    }
    return target
  }
  const persist = () => {
    try {
      mkdirSync(dirname(stateFile), { recursive: true })
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    } catch (error) {
      ctx.logger?.error?.(error)
    }
  }
  const snapshot = () => {
    const inPool = new Set(listNames(assetDir))
    const items = state.order.map((entry, index) => {
      const info = describe(assetDir, entry) ?? describe(disabledDir, entry) ?? { bytes: 0, mtime: 0 }
      return {
        index,
        name: entry,
        bytes: info.bytes,
        mtime: info.mtime,
        included: !state.excluded.includes(entry),
        inPool: inPool.has(entry),
      }
    })
    const recycled = listNames(recycleDir)
    return {
      ok: true,
      dir: assetDir,
      exists: existsSync(assetDir),
      bootPluginPresent: existsSync(join(assetDir, '..', '..', 'entry.js')),
      mode: state.mode,
      cursor: state.cursor,
      pinned: state.pinned,
      nextName: currentTarget(),
      lastPlayed: state.lastPlayed,
      playableCount: includedNames().length,
      items,
      recycled,
      recycledCount: recycled.length,
      totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
    }
  }

  // ------------------------------------------------------- 启动时的落位 + 落盘
  const played = enforceAtStartup()
  persist()
  ctx.logger?.info?.(
    `dsh-boot-video-manager: mode=${state.mode} played=${played ?? '(none)'} next=${currentTarget() ?? '(none)'} list=${state.order.length}`,
  )
  // ------------------------------------------------------------------ HTTP
  const json = (res, status, value) => {
    const body = Buffer.from(JSON.stringify(value), 'utf8')
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.byteLength),
      'cache-control': 'no-store',
    })
    res.end(body)
  }
  const route = (handler) => (req, res) => {
    void (async () => {
      // 必须 await：异步处理函数抛出的业务错误要靠这里的 catch 收拾，
      // 否则会变成未处理的 rejection（甚至把宿主进程带走）。
      await handler(req, res)
    })().catch((error) => {
      if (res.headersSent) {
        res.end()
        return
      }
      const status = error?.code === 'E_REFUSED' ? error.status ?? 400 : 500
      ctx.logger?.error?.(error)
      json(res, status, {
        error: status === 500 ? 'internal error' : String(error?.message ?? error),
      })
    })
  }
  const readJson = async (req) => {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 1024 * 1024) throw refuse('请求体太大', 413)
      chunks.push(chunk)
    }
    if (size === 0) return {}
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw refuse('请求体不是合法 JSON', 400)
    }
  }
  const requirePost = (req) => {
    if (req.method !== 'POST') throw refuse('只接受 POST', 405)
  }
  const safeName = (raw) => {
    if (typeof raw !== 'string' || raw.length === 0) throw refuse('缺少文件名')
    if (raw.length > 200) throw refuse('文件名过长')
    if (basename(raw) !== raw) throw refuse('文件名里不能带路径')
    if (raw.startsWith('.')) throw refuse('文件名不能以点开头')
    return raw
  }
  const videoName = (raw) => {
    const safe = safeName(raw)
    if (!VIDEO_EXTENSIONS.has(extname(safe).toLowerCase())) {
      throw refuse(`只支持 ${[...VIDEO_EXTENSIONS].join(' / ')}`)
    }
    return safe
  }
  /** 每次改动都：钉住游标 → 重新摆位 → 落盘 → 回状态。 */
  const commit = (res, anchor, extra = {}) => {
    reconcile()
    if (anchor !== undefined) reanchor(anchor)
    place()
    persist()
    json(res, 200, { ...extra, ...snapshot() })
  }

  const server = ctx.webServer
  const register = (spec, label) =>
    ctx.effect(() => server.register(spec), `dsh-boot-video-manager: ${label}`)

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/state`,
      handler: route((_req, res) => {
        reconcile()
        json(res, 200, snapshot())
      }),
    },
    'state',
  )

  register(
    {
      kind: 'prefix',
      path: `${ROUTE}/upload`,
      handler: route(async (req, res) => {
        requirePost(req)
        const fileName = videoName(
          new URL(req.url ?? '/', 'http://localhost').searchParams.get('name'),
        )
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > MAX_UPLOAD_BYTES) throw refuse('文件超过 512 MB 上限', 413)
          chunks.push(chunk)
        }
        if (size === 0) throw refuse('收到的文件是空的')
        mkdirSync(assetDir, { recursive: true })
        writeFileSync(join(assetDir, fileName), Buffer.concat(chunks))
        const anchor = currentTarget()
        if (!state.order.includes(fileName)) state.order.push(fileName)
        state.excluded = state.excluded.filter((entry) => entry !== fileName)
        commit(res, anchor, { added: fileName })
      }),
    },
    'upload',
  )

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/order`,
      handler: route(async (req, res) => {
        requirePost(req)
        const body = await readJson(req)
        if (!Array.isArray(body.names)) throw refuse('缺少 names 数组')
        const wanted = body.names.map(safeName)
        reconcile()
        const known = new Set(state.order)
        if (wanted.length !== known.size || wanted.some((entry) => !known.has(entry))) {
          throw refuse('names 必须正好是当前播放列表里的每一项')
        }
        const anchor = currentTarget()
        state.order = wanted
        commit(res, anchor)
      }),
    },
    'order',
  )

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/include`,
      handler: route(async (req, res) => {
        requirePost(req)
        const body = await readJson(req)
        const fileName = safeName(body.name)
        reconcile()
        if (!state.order.includes(fileName)) throw refuse('播放列表里没有这一支', 404)
        const anchor = currentTarget()
        const included = body.included !== false
        // 先把候选状态算出来、校验通过再落回 state，这样抛错时内存状态也是干净的。
        const next = state.excluded.filter((entry) => entry !== fileName)
        if (!included) {
          if (fileName === anchor) {
            throw refuse('下一支就是它，先换一个「下一个播」再取消参与')
          }
          const stillPlayable = state.order.filter(
            (entry) => entry !== fileName && !next.includes(entry),
          )
          if (stillPlayable.length === 0) throw refuse('至少要留一支参与播放')
          next.push(fileName)
        }
        state.excluded = next
        commit(res, anchor)
      }),
    },
    'include',
  )

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/mode`,
      handler: route(async (req, res) => {
        requirePost(req)
        const body = await readJson(req)
        if (typeof body.mode !== 'string' || !MODES.has(body.mode)) {
          throw refuse(`mode 只能是 ${[...MODES].join(' / ')}`)
        }
        const anchor = currentTarget()
        // 切到单次模式时可以顺手指定固定哪一支。
        if (body.name !== undefined) {
          const fileName = safeName(body.name)
          if (!includedNames().includes(fileName)) throw refuse('这一支没有参与播放', 404)
          state.pinned = fileName
        }
        state.mode = body.mode
        commit(res, anchor)
      }),
    },
    'mode',
  )

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/next`,
      handler: route(async (req, res) => {
        requirePost(req)
        const body = await readJson(req)
        const playable = includedNames()
        if (playable.length === 0) throw refuse('播放列表是空的')
        let anchor
        if (body.name === undefined) {
          const current = currentTarget()
          const from = current === null ? -1 : playable.indexOf(current)
          anchor = playable[(from + 1) % playable.length]
        } else {
          const fileName = safeName(body.name)
          if (playable.indexOf(fileName) === -1) throw refuse('这一支没有参与播放', 404)
          anchor = fileName
        }
        if (state.mode === 'single') {
          // 单次模式：改的是「固定哪一支」，游标不参与。
          state.pinned = anchor
        } else {
          state.cursor = playable.indexOf(anchor)
        }
        commit(res, anchor)
      }),
    },
    'next',
  )

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/recycle`,
      handler: route(async (req, res) => {
        requirePost(req)
        const body = await readJson(req)
        const fileName = safeName(body.name)
        reconcile()
        if (!state.order.includes(fileName)) throw refuse('播放列表里没有这一支', 404)
        const anchor = currentTarget()
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')
        const parked =
          moveFile(join(assetDir, fileName), join(recycleDir, `${stamp}-${fileName}`)) ||
          moveFile(join(disabledDir, fileName), join(recycleDir, `${stamp}-${fileName}`))
        if (!parked) throw refuse('找不到这个文件', 404)
        state.order = state.order.filter((entry) => entry !== fileName)
        state.excluded = state.excluded.filter((entry) => entry !== fileName)
        if (state.cursor >= state.order.length) state.cursor = 0
        commit(res, anchor === fileName ? null : anchor, { recycled: `${stamp}-${fileName}` })
      }),
    },
    'recycle',
  )

  register(
    {
      kind: 'exact',
      path: `${ROUTE}/reveal`,
      handler: route((_req, res) => {
        mkdirSync(assetDir, { recursive: true })
        const child = spawn('explorer.exe', [assetDir], { detached: true, stdio: 'ignore' })
        child.unref()
        json(res, 200, { ok: true, dir: assetDir })
      }),
    },
    'reveal',
  )
}

/** 读播放列表状态文件；不存在或读坏了就给一份默认值。 */
function loadState(stateFile) {
  const fallback = {
    version: 2,
    mode: 'sequence',
    order: [],
    excluded: [],
    cursor: 0,
    pinned: null,
    lastPlayed: null,
  }
  try {
    if (!existsSync(stateFile)) return fallback
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
    return {
      version: 2,
      mode: MODES.has(parsed?.mode) ? parsed.mode : 'sequence',
      order: Array.isArray(parsed?.order)
        ? parsed.order.filter((entry) => typeof entry === 'string')
        : [],
      excluded: Array.isArray(parsed?.excluded)
        ? parsed.excluded.filter((entry) => typeof entry === 'string')
        : [],
      cursor: Number.isInteger(parsed?.cursor) ? parsed.cursor : 0,
      pinned: typeof parsed?.pinned === 'string' ? parsed.pinned : null,
      lastPlayed: typeof parsed?.lastPlayed === 'string' ? parsed.lastPlayed : null,
    }
  } catch {
    return fallback
  }
}
