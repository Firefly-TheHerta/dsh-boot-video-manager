/**
 * dsh-boot-video-manager —— 客户端半侧（播放列表版）。
 *
 * 在设置面板左侧导航加一条「插件管理」，里面是开屏动画的**有序播放列表**：
 *   · 添加视频（可多选）—— 第 1 个加进来的就是 1 号，排在最上面
 *   · ↑ ↓ 调整顺序
 *   · 勾选决定哪几支参与播放
 *   · 「顺序播放」按列表依次播（第一次启动播 1 号、第二次 2 号…）
 *   · 「随机播放」在参与播放的那些里随机抽
 *   · 「单次播放」每次都播同一支（用「固定播这支」选它）
 *   · 「设为下一个」把游标指到某一条
 *
 * 只用 `require("react")`（平台静态基座），其余靠客户端的 slots / locale 服务，
 * 不依赖任何可选 UI 包，因此手写即可、无需打包器。
 */

window.__ModuleLoader__.load({
  id: 'dsh-boot-video-manager',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    /** 本插件自己的翻译命名空间。 */
    var NS = 'settings.bootVideoManager'

    /** 宿主半侧的路由前缀。 */
    var API = '/plugins/dsh-boot-video-manager'

    var zh = {
      nav: '插件管理',
      title: '开屏视频播放列表',
      loading: '正在读取播放列表…',
      loadFailed: '读不到播放列表',
      retry: '重试',
      refresh: '刷新',
      reveal: '打开素材文件夹',
      add: '添加视频…',
      uploading: '正在上传',
      added: '已加入播放列表',
      addedMany: '已加入播放列表',
      mode: '播放方式',
      modeSequence: '顺序播放',
      modeRandom: '随机播放',
      modeSingle: '单次播放',
      modeSequenceHint: '按列表从上往下依次播：第一次启动播 1 号，第二次播 2 号……播完最后一支回到 1 号。',
      modeRandomHint: '在勾选参与的那些里随机抽一支，每次启动都重抽。',
      modeSingleHint: '每次都播同一支：用下面「固定播这支」选它，选了就一直播它。',
      pinIt: '固定播这支',
      pinHint: '每次启动都播它',
      pinnedBadge: '每次播',
      playlist: '播放列表',
      playable: '参与播放',
      nextUp: '下一个',
      nowInPool: '在池中',
      setNext: '设为下一个',
      setNextHint: '把它排成下一次启动要播的那支',
      up: '上移',
      down: '下移',
      participate: '参与播放',
      recycle: '回收',
      confirmRecycle: '确定把这条移出播放列表吗？文件会挪到 recycle 子目录，不会真的删掉。',
      recycled: '已挪到 recycle 子目录',
      moved: '已更新',
      reordered: '顺序已更新',
      recycledGroup: '已回收（不会参与播放）',
      empty: '播放列表是空的，开屏动画会直接跳过。先加一段视频吧。',
      emptyPlayable: '没有一支参与播放，开屏动画会直接跳过。',
      hint: '改动后刷新页面即生效，不用重启 DSH。淡入时长等更细的开关仍在「内置插件 → 插件列表 → 启动动画」里。',
      soundTitle: '启动画面声音',
      soundPlay: '播放影片声音',
      soundPlayHint: '影片会带声音播放；浏览器不允许自动出声时先静音播放，点启动画面右下角的声音按钮即可开声音。',
      soundPlayOffHint: '已彻底静音：不会尝试开声音，启动画面右下角的声音按钮也不再出现。',
      soundClick: '点鼠标直接进入',
      soundClickHint: '按一下画面就直接进界面，不再用第一下开声音。',
      soundClickOffHint: '按一下先开声音，再按一下才进入（默认）。',
      soundBoot: '开机自启时没有鼠标操作，浏览器会拦住带声音的自动播放，所以启动画面只能先静音 —— 这是浏览器策略，不是设置没生效。',
      audioDiagOn: '这次启动的音频自检：出声了（浏览器放过了自动播放）。',
      audioDiagMuted: '这次启动的音频自检：先静音了。Chromium 只允许页面在用户碰过它之后出声，冷启动一次操作都没有 —— 想让它直接出声，见 README 的「冷启动直接出声」。',
      audioDiagUnknown: '这次启动的音频自检：没采到样（启动画面没播、或已经播完了）。',
      soundMissing: '没读到「启动动画」插件的设置（要先装好 dsh-boot-animation 并刷新页面），这里暂时不能控制声音。',
      soundFailed: '声音设置没写进去，稍后再试。',
      on: '开',
      off: '关',
      missingDir: '素材目录还不存在：',
      missingBoot: '没有找到开屏动画插件（dsh-boot-animation），这个页面暂时管不了任何东西。',
      addFailed: '添加失败',
      badFile: '只支持 mp4 / webm / m4v / mov 格式。',
      lastPlayed: '上次启动播了',
      total: '总计',
      clipCount: '支',
      restartNeeded: '插件已经更新，但正在跑的 DSH 里还是旧版宿主代码 —— 请重启 DSH（关掉窗口再打开）后回到这一页。现在这些按钮点了不会生效。',
    }

    var en = {
      nav: 'Plugin manager',
      title: 'Splash video playlist',
      loading: 'Loading the playlist…',
      loadFailed: 'Cannot read the playlist',
      retry: 'Retry',
      refresh: 'Refresh',
      reveal: 'Open folder',
      add: 'Add videos…',
      uploading: 'Uploading',
      added: 'Added to the playlist',
      addedMany: 'Added to the playlist',
      mode: 'Playback',
      modeSequence: 'In order',
      modeRandom: 'At random',
      modeSingle: 'One clip',
      modeSequenceHint: 'Plays top to bottom: first launch plays #1, second plays #2, and it wraps after the last one.',
      modeRandomHint: 'Picks one of the checked clips at random on every launch.',
      modeSingleHint: 'Always the same clip: pick it with “Always play this one” below.',
      pinIt: 'Always play this one',
      pinHint: 'Play it on every launch',
      pinnedBadge: 'Always',
      playlist: 'Playlist',
      playable: 'In rotation',
      nextUp: 'Next',
      nowInPool: 'Live now',
      setNext: 'Play this next',
      setNextHint: 'Make it the clip for the next launch',
      up: 'Move up',
      down: 'Move down',
      participate: 'In rotation',
      recycle: 'Recycle',
      confirmRecycle: 'Move this clip out of the playlist? The file goes to the recycle subfolder, it is not deleted.',
      recycled: 'Moved into the recycle subfolder',
      moved: 'Updated',
      reordered: 'Order updated',
      recycledGroup: 'Recycled (never played)',
      empty: 'The playlist is empty, so the splash screen is skipped. Add a video first.',
      emptyPlayable: 'No clip is in rotation, so the splash screen is skipped.',
      hint: 'Changes apply after a page refresh; no DSH restart needed. Fade timing and other fine-grained switches still live in “Built-in plugins → plugin list → boot animation”.',
      soundTitle: 'Splash screen sound',
      soundPlay: 'Play clip audio',
      soundPlayHint: 'The clip plays with sound; when the browser refuses to start audio on its own it plays muted at first — click the sound button in the splash screen’s bottom-right corner to unmute.',
      soundPlayOffHint: 'Fully muted: audio is never attempted and the sound button does not appear at all.',
      soundClick: 'Click enters directly',
      soundClickHint: 'One click goes straight into the app; the first click no longer unmutes.',
      soundClickOffHint: 'The first click unmutes, the second one enters (default).',
      soundBoot: 'When DSH starts automatically there is no click at all, so the browser blocks autoplay with sound and the splash screen starts muted — that is the browser policy, not a broken setting.',
      audioDiagOn: 'Audio self-check for this launch: sound played (the browser allowed autoplay).',
      audioDiagMuted: 'Audio self-check for this launch: it started muted. Chromium only lets a page make sound after the user has touched it, and a cold start has no interaction at all — see “Sound on a cold start” in the README to change that.',
      audioDiagUnknown: 'Audio self-check for this launch: nothing sampled (the splash screen never played, or it had already finished).',
      soundMissing: 'The boot animation plugin’s settings are not available yet (install dsh-boot-animation and refresh the page), so sound cannot be controlled here.',
      soundFailed: 'The sound setting was not accepted; try again in a moment.',
      on: 'On',
      off: 'Off',
      missingDir: 'The clip directory does not exist yet: ',
      missingBoot: 'The boot animation plugin (dsh-boot-animation) was not found, so this page has nothing to manage.',
      addFailed: 'Upload failed',
      badFile: 'Only mp4 / webm / m4v / mov are supported.',
      lastPlayed: 'Last launch played',
      total: 'Total',
      clipCount: 'clips',
      restartNeeded: 'The plugin was updated but the running DSH still holds the old host code — restart DSH (close the window and open it again) and come back. These buttons will not work until then.',
    }

    /** 需要的客户端服务：插槽与本地化。 */
    var inject = ['slots', 'locale']

    var VIDEO_EXTENSIONS = ['.mp4', '.webm', '.m4v', '.mov']

    /**
     * 上游「启动动画」插件在 DSH 设置文档里的命名空间 —— 就是它写进
     * cordis.patch.yml 的那个 entry id。`sound` / `clickToEnter` 是它的两个开关。
     */
    var BOOT_SETTINGS_NS = 'boot-animation'

    function fmtBytes(bytes) {
      if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return '0 B'
      var units = ['B', 'KB', 'MB', 'GB']
      var value = bytes
      var unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value = value / 1024
        unit = unit + 1
      }
      return (unit === 0 ? String(value) : value.toFixed(value >= 100 ? 0 : 1)) + ' ' + units[unit]
    }

    function hasVideoExtension(name) {
      var lower = String(name).toLowerCase()
      for (var i = 0; i < VIDEO_EXTENSIONS.length; i += 1) {
        if (lower.endsWith(VIDEO_EXTENSIONS[i])) return true
      }
      return false
    }

    /** 统一的 JSON 调用；把宿主的错误消息原样抛出来。 */
    async function call(path, body) {
      var options = { method: body === undefined ? 'GET' : 'POST' }
      if (body !== undefined) {
        options.headers = { 'content-type': 'application/json' }
        options.body = JSON.stringify(body)
      }
      var response = await fetch(API + path, options)
      var text = await response.text()
      var payload = null
      try {
        payload = text === '' ? null : JSON.parse(text)
      } catch (error) {
        payload = null
      }
      if (!response.ok) {
        var message = payload && payload.error ? payload.error : 'HTTP ' + String(response.status)
        throw new Error(message)
      }
      return payload
    }

    /** 带进度的上传（fetch 拿不到上传进度）。 */
    function upload(name, file, onProgress) {
      return new Promise(function (resolve, reject) {
        var request = new XMLHttpRequest()
        request.open('POST', API + '/upload?name=' + encodeURIComponent(name))
        request.setRequestHeader('content-type', file.type || 'application/octet-stream')
        request.upload.onprogress = function (event) {
          if (event.lengthComputable) onProgress(event.loaded / event.total)
        }
        request.onerror = function () {
          reject(new Error('网络错误'))
        }
        request.onload = function () {
          var payload = null
          try {
            payload = JSON.parse(request.responseText)
          } catch (error) {
            payload = null
          }
          if (request.status >= 200 && request.status < 300) resolve(payload)
          else reject(new Error(payload && payload.error ? payload.error : 'HTTP ' + String(request.status)))
        }
        request.send(file)
      })
    }

    /* ------------------------------------------------------------------ */
    /* 样式                                                                */
    /* ------------------------------------------------------------------ */

    var CSS = [
      '.bvm-root{display:flex;flex-direction:column;gap:14px;width:100%;max-width:780px;color:var(--dsw-alias-label-primary)}',
      '.bvm-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.bvm-title{font-size:15px;font-weight:600;margin:0}',
      '.bvm-muted{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
      '.bvm-btn{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;background:0 0;padding:4px 10px;line-height:18px}',
      '.bvm-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l4)}',
      '.bvm-btn:disabled{opacity:.4;cursor:default}',
      '.bvm-btn-primary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
      '.bvm-btn-icon{padding:2px 7px;font-size:13px}',
      '.bvm-btn-on{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
      '.bvm-card{border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
      '.bvm-seg{display:inline-flex;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);overflow:hidden}',
      '.bvm-seg button{border:0;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;padding:4px 12px;cursor:pointer}',
      '.bvm-seg button + button{border-left:.5px solid var(--dsw-alias-border-l3)}',
      '.bvm-seg button.bvm-seg-on{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1)}',
      '.bvm-group{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0}',
      '.bvm-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:.5px solid var(--dsw-alias-border-l3)}',
      '.bvm-item:first-of-type{border-top:0}',
      '.bvm-item-off .bvm-name{color:var(--dsw-alias-label-tertiary)}',
      '.bvm-num{min-width:16px;text-align:right;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.bvm-name{flex:1;min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
      '.bvm-size{font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.bvm-badge{font-size:11px;line-height:16px;padding:0 6px;border-radius:8px;border:.5px solid var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
      '.bvm-badge-done{border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-tertiary)}',
      '.bvm-check{flex:0 0 auto;margin:0;cursor:pointer}',
      '.bvm-error{color:var(--dsw-alias-state-error-primary);font-size:13px}',
      '.bvm-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.bvm-bar{height:4px;border-radius:2px;background:var(--dsw-alias-border-l3);overflow:hidden}',
      '.bvm-bar > i{display:block;height:100%;background:var(--dsw-alias-state-business-primary)}',
      '.bvm-dir{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);word-break:break-all}',
    ].join('')

    function ensureStyle() {
      var tagId = 'dsh-boot-video-manager/style'
      if (document.getElementById(tagId) !== null) return
      var tag = document.createElement('style')
      tag.id = tagId
      tag.dataset.plugin = 'dsh-boot-video-manager'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /* ------------------------------------------------------------------ */
    /* 组件                                                                */
    /* ------------------------------------------------------------------ */

    function PlaylistRow(props) {
      var item = props.item
      var t = props.t
      var busy = props.busy
      var sequence = props.mode === 'sequence'
      var single = props.mode === 'single'
      var isNext = sequence && props.nextName === item.name
      var isPinned = single && props.pinned === item.name
      var played = sequence && props.cursor > item.index
      var badges = []
      if (isPinned) badges.push(h('span', { className: 'bvm-badge', key: 'b' }, t('pinnedBadge')))
      else if (isNext) badges.push(h('span', { className: 'bvm-badge', key: 'b' }, t('nextUp')))
      else if (item.inPool) badges.push(h('span', { className: 'bvm-badge', key: 'b' }, t('nowInPool')))
      if (played) badges.push(h('span', { className: 'bvm-badge bvm-badge-done', key: 'p' }, t('lastPlayed')))

      return h('div', {
        className: 'bvm-item' + (item.included ? '' : ' bvm-item-off'),
        'data-name': item.name,
      },
        h('span', { className: 'bvm-num' }, String(item.index + 1) + '.'),
        h('input', {
          type: 'checkbox',
          className: 'bvm-check',
          checked: item.included,
          disabled: busy,
          title: t('participate'),
          'aria-label': t('participate'),
          onChange: function () { props.onInclude(item.name, !item.included) },
        }),
        h('span', { className: 'bvm-name', title: item.name }, item.name),
        badges,
        h('span', { className: 'bvm-size' }, fmtBytes(item.bytes)),
        h('button', {
          type: 'button',
          className: 'bvm-btn bvm-btn-icon',
          disabled: busy || item.index === 0,
          title: t('up'),
          'aria-label': t('up'),
          onClick: function () { props.onMove(item.index, item.index - 1) },
        }, '↑'),
        h('button', {
          type: 'button',
          className: 'bvm-btn bvm-btn-icon',
          disabled: busy || item.index === props.lastIndex,
          title: t('down'),
          'aria-label': t('down'),
          onClick: function () { props.onMove(item.index, item.index + 1) },
        }, '↓'),
        sequence
          ? h('button', {
            type: 'button',
            className: 'bvm-btn' + (isNext ? ' bvm-btn-on' : ''),
            disabled: busy || isNext || !item.included,
            title: t('setNextHint'),
            onClick: function () { props.onNext(item.name) },
          }, t('setNext'))
          : null,
        single
          ? h('button', {
            type: 'button',
            className: 'bvm-btn' + (isPinned ? ' bvm-btn-on' : ''),
            disabled: busy || isPinned || !item.included,
            title: t('pinHint'),
            onClick: function () { props.onNext(item.name) },
          }, t('pinIt'))
          : null,
        h('button', {
          type: 'button',
          className: 'bvm-btn',
          disabled: busy,
          onClick: function () { props.onRecycle(item.name) },
        }, t('recycle')),
      )
    }

    function BootVideoManagerTab(props) {
      var t = props.t
      var stateBox = react.useState({ status: 'loading' })
      var state = stateBox[0]
      var setState = stateBox[1]
      var busyBox = react.useState(false)
      var busy = busyBox[0]
      var setBusy = busyBox[1]
      var noteBox = react.useState(null)
      var note = noteBox[0]
      var setNote = noteBox[1]
      var errorBox = react.useState(null)
      var error = errorBox[0]
      var setError = errorBox[1]
      var progressBox = react.useState(null)
      var progress = progressBox[0]
      var setProgress = progressBox[1]
      var inputRef = react.useRef(null)
      // 上游「启动动画」的声音开关（props.sound 由 apply() 注入；没有设置服务的部署
      // 里是 undefined，那时不渲染这张卡片）
      var soundState = useSound(props.sound)
      var audioDiag = useSound(props.diag)

      var apply = react.useCallback(function (payload) {
        setState({ status: 'ready', data: payload })
      }, [])

      var refresh = react.useCallback(function () {
        setError(null)
        return call('/state')
          .then(function (payload) { apply(payload) })
          .catch(function (failure) {
            setState({ status: 'error', error: String(failure && failure.message ? failure.message : failure) })
          })
      }, [apply])

      react.useEffect(function () {
        ensureStyle()
        refresh()
      }, [refresh])

      var run = react.useCallback(function (work) {
        setBusy(true)
        setError(null)
        setNote(null)
        return work()
          .catch(function (failure) {
            setError(String(failure && failure.message ? failure.message : failure))
          })
          .then(function () { setBusy(false) })
      }, [])

      /** 写一个上游「启动动画」的开关（sound / clickToEnter）。 */
      var onSound = react.useCallback(function (field, value) {
        var port = props.sound
        if (port === undefined || port === null) return
        setBusy(true)
        setError(null)
        setNote(null)
        port.set(field, value).then(function (accepted) {
          if (accepted !== true) setError(t('soundFailed'))
        }, function (failure) {
          setError(String(failure && failure.message ? failure.message : failure))
        }).then(function () { setBusy(false) })
      }, [props.sound, t])

      var onPick = react.useCallback(function (event) {
        var picked = event.target.files ? Array.prototype.slice.call(event.target.files) : []
        event.target.value = ''
        if (picked.length === 0) return
        var accepted = []
        for (var i = 0; i < picked.length; i += 1) {
          if (hasVideoExtension(picked[i].name)) accepted.push(picked[i])
        }
        if (accepted.length === 0) {
          setError(t('badFile'))
          return
        }
        setProgress({ index: 1, total: accepted.length, name: accepted[0].name, fraction: 0 })
        run(function () {
          var chain = Promise.resolve(null)
          accepted.forEach(function (file, position) {
            chain = chain.then(function () {
              setProgress({ index: position + 1, total: accepted.length, name: file.name, fraction: 0 })
              return upload(file.name, file, function (fraction) {
                setProgress({ index: position + 1, total: accepted.length, name: file.name, fraction: fraction })
              })
            })
          })
          return chain.then(function (payload) {
            apply(payload)
            setNote(t('added') + '：' + accepted.map(function (file) { return file.name }).join('、'))
          })
        }).then(function () { setProgress(null) })
      }, [apply, run, t])

      var onInclude = react.useCallback(function (name, included) {
        run(function () {
          return call('/include', { name: name, included: included })
            .then(function (payload) { apply(payload); setNote(t('moved')) })
        })
      }, [apply, run, t])

      var onMode = react.useCallback(function (mode) {
        run(function () {
          return call('/mode', { mode: mode })
            .then(function (payload) { apply(payload); setNote(t('moved')) })
        })
      }, [apply, run, t])

      var onNext = react.useCallback(function (name) {
        run(function () {
          return call('/next', { name: name })
            .then(function (payload) { apply(payload); setNote(t('moved')) })
        })
      }, [apply, run, t])

      /** 把 index 处的项挪到 target 处（其余顺延）。 */
      var onMove = react.useCallback(function (index, target) {
        var data = state.status === 'ready' ? state.data : null
        if (!data || !Array.isArray(data.items)) return
        if (target < 0 || target >= data.items.length) return
        var names = data.items.map(function (item) { return item.name })
        var moved = names.splice(index, 1)[0]
        names.splice(target, 0, moved)
        run(function () {
          return call('/order', { names: names })
            .then(function (payload) { apply(payload); setNote(t('reordered')) })
        })
      }, [apply, run, state, t])

      var onRecycle = react.useCallback(function (name) {
        var confirmed = true
        try {
          confirmed = window.confirm(t('confirmRecycle'))
        } catch (ignored) {
          confirmed = true
        }
        if (!confirmed) return
        run(function () {
          return call('/recycle', { name: name })
            .then(function (payload) { apply(payload); setNote(t('recycled')) })
        })
      }, [apply, run, t])

      var onReveal = react.useCallback(function () {
        run(function () {
          return call('/reveal', {})
        })
      }, [run])

      if (state.status === 'loading') {
        return h('div', { className: 'bvm-root' }, h('p', { className: 'bvm-muted' }, t('loading')))
      }

      if (state.status === 'error') {
        return h('div', { className: 'bvm-root' },
          h('p', { className: 'bvm-error' }, t('loadFailed') + '：' + state.error),
          h('div', { className: 'bvm-row' },
            h('button', { type: 'button', className: 'bvm-btn', onClick: refresh }, t('retry')),
          ),
        )
      }

      var data = state.data || {}

      /**
       * 兼容：宿主半侧是 ESM，改了代码必须重启 DSH 才会换新的。如果这里拿到的
       * 还是旧版（`enabled`/`disabled` 数组、没有 `items`）就把话说清楚，
       * 免得用户以为播放列表是空的。
       */
      if (!Array.isArray(data.items) && Array.isArray(data.enabled)) {
        var legacyNames = []
          .concat(data.enabled.map(function (clip) { return clip.name }))
          .concat((Array.isArray(data.disabled) ? data.disabled : []).map(function (clip) { return clip.name }))
        return h('div', { className: 'bvm-root' },
          h('h3', { className: 'bvm-title' }, t('title')),
          h('p', { className: 'bvm-error' }, t('restartNeeded')),
          h('div', { className: 'bvm-card' },
            h('p', { className: 'bvm-group' }, t('playlist')),
            legacyNames.map(function (name) {
              return h('div', { className: 'bvm-item', key: 'legacy:' + name },
                h('span', { className: 'bvm-name' }, name))
            }),
          ),
        )
      }

      var items = Array.isArray(data.items) ? data.items : []
      var playable = items.filter(function (item) { return item.included })
      var children = []

      // 标题行：统计 + 添加 / 刷新 / 打开文件夹
      children.push(h('div', { className: 'bvm-row', key: 'head' },
        h('h3', { className: 'bvm-title' }, t('title')),
        h('span', { className: 'bvm-muted' },
          t('total') + ' ' + fmtBytes(data.totalBytes) + ' · ' +
          String(playable.length) + ' / ' + String(items.length) + ' ' + t('clipCount')),
        h('span', { style: { flex: '1' } }),
        h('button', {
          type: 'button',
          className: 'bvm-btn bvm-btn-primary',
          disabled: busy,
          onClick: function () { inputRef.current && inputRef.current.click() },
        }, t('add')),
        h('button', { type: 'button', className: 'bvm-btn', disabled: busy, onClick: refresh }, t('refresh')),
        h('button', { type: 'button', className: 'bvm-btn', disabled: busy, onClick: onReveal }, t('reveal')),
        h('input', {
          key: 'file',
          ref: inputRef,
          type: 'file',
          multiple: true,
          accept: '.mp4,.m4v,.mov,.webm,video/mp4,video/webm,video/quicktime',
          style: { display: 'none' },
          onChange: onPick,
        }),
      ))

      if (typeof data.dir === 'string' && data.dir !== '') {
        children.push(h('div', { className: 'bvm-dir', key: 'dir' }, data.dir))
      }

      if (data.bootPluginPresent === false) {
        children.push(h('p', { className: 'bvm-note', key: 'noboot' }, t('missingBoot')))
      } else if (data.exists === false) {
        children.push(h('p', { className: 'bvm-note', key: 'nodir' }, t('missingDir') + String(data.dir)))
      }
      if (typeof data.hint === 'string' && data.hint !== '') {
        children.push(h('p', { className: 'bvm-note', key: 'hosthint' }, data.hint))
      }

      // 播放方式
      var mode = data.mode === 'random' ? 'random' : (data.mode === 'single' ? 'single' : 'sequence')
      var sequence = mode === 'sequence'
      var single = mode === 'single'
      var segButton = function (value, label) {
        var on = mode === value
        return h('button', {
          type: 'button',
          className: on ? 'bvm-seg-on' : '',
          disabled: busy,
          onClick: function () { if (!on) onMode(value) },
        }, label)
      }
      children.push(h('div', { className: 'bvm-card', key: 'mode' },
        h('div', { className: 'bvm-row' },
          h('span', { className: 'bvm-group' }, t('mode')),
          h('span', { className: 'bvm-seg' },
            segButton('sequence', t('modeSequence')),
            segButton('random', t('modeRandom')),
            segButton('single', t('modeSingle')),
          ),
          typeof data.nextName === 'string' && data.nextName !== ''
            ? h('span', { className: 'bvm-muted' },
              (single ? t('pinnedBadge') : t('nextUp')) + '：' + data.nextName)
            : null,
        ),
        h('p', { className: 'bvm-note' },
          sequence ? t('modeSequenceHint') : (single ? t('modeSingleHint') : t('modeRandomHint'))),
      ))

      if (progress !== null) {
        children.push(h('div', { key: 'progress' },
          h('div', { className: 'bvm-muted' },
            t('uploading') + ' ' + String(progress.index) + '/' + String(progress.total) + ' · ' +
            progress.name + ' · ' + String(Math.round(progress.fraction * 100)) + '%'),
          h('div', { className: 'bvm-bar' },
            h('i', { style: { width: String(Math.round(progress.fraction * 100)) + '%' } })),
        ))
      }

      if (error !== null) children.push(h('p', { className: 'bvm-error', key: 'err' }, error))
      if (note !== null) children.push(h('p', { className: 'bvm-muted', key: 'note' }, note))

      // 播放列表
      var rows = items.map(function (item) {
        return h(PlaylistRow, {
          key: 'row:' + item.name,
          item: item,
          lastIndex: items.length - 1,
          mode: mode,
          nextName: data.nextName,
          pinned: data.pinned,
          cursor: typeof data.cursor === 'number' ? data.cursor : 0,
          busy: busy,
          t: t,
          onInclude: onInclude,
          onMove: onMove,
          onNext: onNext,
          onRecycle: onRecycle,
        })
      })

      children.push(h('div', { className: 'bvm-card', key: 'list' },
        h('p', { className: 'bvm-group' }, t('playlist')),
        rows.length > 0
          ? rows
          : h('p', { className: 'bvm-muted' }, t('empty')),
        rows.length > 0 && playable.length === 0
          ? h('p', { className: 'bvm-note' }, t('emptyPlayable'))
          : null,
      ))

      // 已回收
      var recycled = Array.isArray(data.recycled) ? data.recycled : []
      if (recycled.length > 0) {
        children.push(h('div', { className: 'bvm-card', key: 'recycled' },
          h('p', { className: 'bvm-group' }, t('recycledGroup') + ' · ' + String(recycled.length)),
          recycled.map(function (name) {
            return h('div', { className: 'bvm-item', key: 'r:' + name },
              h('span', { className: 'bvm-name', title: name }, name),
            )
          }),
        ))
      }

      // 启动画面的声音开关：直接读写上游「启动动画」插件（dsh-boot-animation）的设置
      var audioDiagNote = audioDiag !== null && audioDiag !== undefined && audioDiag.ready === true
        ? (audioDiag.audible === true ? t('audioDiagOn') : t('audioDiagMuted'))
        : t('audioDiagUnknown')
      if (soundState.ready) {
        var soundOn = soundState.sound
        var clickOn = soundState.clickToEnter
        var soundSeg = function (field, current, value, label) {
          var on = current === value
          return h('button', {
            type: 'button',
            className: on ? 'bvm-seg-on' : '',
            disabled: busy,
            onClick: function () { if (!on) onSound(field, value) },
          }, label)
        }
        children.push(h('div', { className: 'bvm-card', key: 'sound' },
          h('p', { className: 'bvm-group' }, t('soundTitle')),
          h('div', { className: 'bvm-row' },
            h('span', { className: 'bvm-name' }, t('soundPlay')),
            h('span', { className: 'bvm-seg' },
              soundSeg('sound', soundOn, true, t('on')),
              soundSeg('sound', soundOn, false, t('off')),
            ),
          ),
          h('p', { className: 'bvm-note' }, soundOn ? t('soundPlayHint') : t('soundPlayOffHint')),
          h('div', { className: 'bvm-row' },
            h('span', { className: 'bvm-name' }, t('soundClick')),
            h('span', { className: 'bvm-seg' },
              soundSeg('clickToEnter', clickOn, true, t('on')),
              soundSeg('clickToEnter', clickOn, false, t('off')),
            ),
          ),
          h('p', { className: 'bvm-note' }, clickOn ? t('soundClickHint') : t('soundClickOffHint')),
          h('p', { className: 'bvm-note' }, t('soundBoot')),
          h('p', { className: 'bvm-note' }, audioDiagNote),
        ))
      } else if (props.sound !== undefined && props.sound !== null) {
        children.push(h('div', { className: 'bvm-card', key: 'sound' },
          h('p', { className: 'bvm-group' }, t('soundTitle')),
          h('p', { className: 'bvm-note' }, t('soundMissing')),
        ))
      }

      children.push(h('p', { className: 'bvm-note', key: 'hint' }, t('hint')))

      return h('div', { className: 'bvm-root' }, children)
    }

    /* ------------------------------------------------------------------ */
    /* 启动画面的声音开关（读写上游「启动动画」插件的设置）                  */
    /* ------------------------------------------------------------------ */

    /** 还没有上游设置时渲染用的空快照；引用恒定，供 useSyncExternalStore 用。 */
    var NO_SOUND = { ready: false, sound: true, clickToEnter: false, writable: false }

    /**
     * 从注入的 owner 上下文里取一个服务。
     *
     * 先 `get`（这个部署里能用的写法），再退回属性访问。
     * @param owner - inject 回调拿到的上下文。
     * @param name - 服务名。
     * @returns 服务对象，取不到时 undefined。
     */
    function serviceAt(owner, name) {
      try {
        if (owner !== null && owner !== undefined && typeof owner.get === 'function') {
          var value = owner.get(name)
          if (value !== undefined && value !== null) return value
        }
      } catch (error) {
        // 取不到是常态，继续试属性。
      }
      try {
        return owner === null || owner === undefined ? undefined : owner[name]
      } catch (error) {
        return undefined
      }
    }

    /**
     * 「启动动画」声音设置的可订阅视图。
     *
     * 值走 DSH 设置服务（configForms）里 boot-animation 那个表单：读用
     * getSnapshot / subscribe，写用 form.set(field, value)。表单的写请求由提供该
     * 服务的插件自己的上下文发出，所以这里不需要声明 remote.settings。
     *
     * 上游插件没装、或它的命名空间没被挂载时 ready() 是 false，界面只显示提示。
     * @returns 读写面。
     */
    function createSoundPort() {
      var form = null
      var listeners = []
      var off = null
      var cached = null
      var cachedKey = ''

      function emit() {
        cached = null
        var copy = listeners.slice()
        for (var i = 0; i < copy.length; i += 1) {
          try { copy[i]() } catch (error) { /* 是订阅者自己的问题 */ }
        }
      }

      function detach() {
        if (typeof off === 'function') {
          try { off() } catch (error) { /* 已经断了 */ }
        }
        off = null
        form = null
        emit()
      }

      return {
        /** @returns 是否已经接上上游表单。 */
        ready: function () { return form !== null },
        /**
         * 接上设置服务（已经接上就什么也不做）。
         * @param nextForm - configForms.get('boot-animation') 的表单。
         */
        attach: function (nextForm) {
          if (form !== null || nextForm === null || nextForm === undefined) return
          form = nextForm
          if (typeof form.subscribe === 'function') off = form.subscribe(emit)
          emit()
        },
        detach: detach,
        /** @returns 当前快照（值没变时引用不变）。 */
        getSnapshot: function () {
          if (form === null) return NO_SOUND
          var snapshot = null
          try { snapshot = form.getSnapshot() } catch (error) { snapshot = null }
          var value = snapshot !== null && snapshot.value !== null && typeof snapshot.value === 'object'
            ? snapshot.value
            : {}
          var key = (value.sound !== false ? '1' : '0') + (value.clickToEnter === true ? '1' : '0') +
            (snapshot !== null && snapshot.writable === true ? '1' : '0')
          if (cached === null || key !== cachedKey) {
            cachedKey = key
            cached = {
              ready: true,
              sound: value.sound !== false,
              clickToEnter: value.clickToEnter === true,
              writable: snapshot !== null && snapshot.writable === true,
            }
          }
          return cached
        },
        /**
         * 订阅快照变化。
         * @param listener - 变化后调用。
         * @returns 退订函数。
         */
        subscribe: function (listener) {
          listeners.push(listener)
          return function () {
            var index = listeners.indexOf(listener)
            if (index >= 0) listeners.splice(index, 1)
          }
        },
        /**
         * 写一个开关。
         * @param field - sound | clickToEnter。
         * @param value - 布尔值。
         * @returns 宿主是否接受。
         */
        set: function (field, value) {
          if (form === null || typeof form.set !== 'function') return Promise.resolve(false)
          return Promise.resolve(form.set(field, value)).then(function (accepted) {
            return accepted === true
          })
        },
      }
    }

    /** 没有 port 时给订阅用的空 store；引用恒定。 */
    var NO_PORT = {
      getSnapshot: function () { return NO_SOUND },
      subscribe: function () { return function () {} },
    }

    /** 音频自检结论在 localStorage 里的键（排查用；面板上显示的是同一份结论）。 */
    var AUDIO_DIAG_KEY = 'bvm.audioDiag'

    /**
     * 采一次「启动画面这次到底有没有出声」。
     *
     * 自动播放政策由浏览器决定，而它取决于这份文档有没有被用户碰过 —— 冷启动
     * 时一次都没有，所以启动画面只能先静音。页面自己是唯一知道结果的地方，所以
     * 这里在加载后的头十几秒里盯住上游那块 `.dshba-video`：一等到它有画面在放，
     * 就把元素的 `muted`、按钮提示、以及 `navigator.getAutoplayPolicy('mediaelement')`
     * （浏览器对这份文档的判定）记下来。采样要发生在用户碰页面之前，否则粘性激活
     * 会把判定改成「允许」，结论就不代表冷启动了。
     *
     * @returns 一个 { start, getSnapshot, subscribe } 端口，和声音端口同形。
     */
    function createAudioDiag() {
      var snapshot = { ready: false, audible: null, policy: '', active: false, everActive: false, reason: 'pending', at: '' }
      var listeners = []
      var timer = null
      var publish = function (record) {
        snapshot = record
        for (var i = 0; i < listeners.length; i += 1) {
          try { listeners[i](snapshot) } catch (error) { /* 一个订阅者出错不影响别的 */ }
        }
      }
      var finish = function (record) {
        if (timer !== null) { globalThis.clearInterval(timer); timer = null }
        try { globalThis.localStorage.setItem(AUDIO_DIAG_KEY, JSON.stringify(record)) } catch (error) { /* 存储禁用就算了 */ }
        publish(record)
      }
      var sampleOnce = function () {
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return false
        var video = document.querySelector('.dshba-video')
        if (video === null || video.readyState < 2 || video.paused) return false
        var button = document.querySelector('.dshba-sound')
        var policy = ''
        var activation = null
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.getAutoplayPolicy === 'function') {
            policy = String(navigator.getAutoplayPolicy('mediaelement'))
          }
        } catch (error) { policy = '' }
        try {
          activation = typeof navigator !== 'undefined' && navigator.userActivation ? navigator.userActivation : null
        } catch (error) { activation = null }
        finish({
          ready: true,
          audible: video.muted === false,
          policy: policy,
          active: activation === null ? false : !!activation.isActive,
          everActive: activation === null ? false : !!activation.hasBeenActive,
          reason: button === null ? 'no-sound-button' : String(button.title || ''),
          at: new Date().toISOString(),
        })
        return true
      }
      return {
        start: function () {
          if (timer !== null) return
          var tries = 0
          timer = globalThis.setInterval(function () {
            tries += 1
            if (sampleOnce()) return
            if (tries < 60) return
            finish({ ready: false, audible: null, policy: '', active: false, everActive: false, reason: 'no-splash', at: new Date().toISOString() })
          }, 200)
          // Node 里（测试脚本）别让这个定时器拖住进程退出。
          if (timer !== null && typeof timer.unref === 'function') timer.unref()
        },
        getSnapshot: function () { return snapshot },
        subscribe: function (listener) {
          listeners.push(listener)
          return function () {
            var index = listeners.indexOf(listener)
            if (index >= 0) listeners.splice(index, 1)
          }
        },
      }
    }

    var useExternalStore = typeof react.useSyncExternalStore === 'function' ? react.useSyncExternalStore : null

    /**
     * 订阅声音设置。
     * @param port - createSoundPort() 的结果（可能没有）。
     * @returns 当前快照。
     */
    function useSound(port) {
      var store = port === undefined || port === null ? NO_PORT : port
      var box = react.useState(store.getSnapshot)
      react.useEffect(function () {
        var sync = function () { box[1](store.getSnapshot()) }
        sync()
        var unsubscribe = store.subscribe(sync)
        return function () {
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [store])
      // 平台自带 React 有 useSyncExternalStore（上游插件也在用）；没有就走上面的
      // state 兜底。这个分支由模块常量决定，渲染过程中不会变，钩子顺序是稳定的。
      if (useExternalStore !== null) return useExternalStore(store.subscribe, store.getSnapshot)
      return box[0]
    }

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en })
      }, 'dsh-boot-video-manager: dictionaries')

      var t = ctx.locale.bind(NS)
      var sound = createSoundPort()
      // 每次加载都采一次「启动画面这次到底有没有出声」，结论显示在声音卡片上。
      var audioDiag = createAudioDiag()
      try { audioDiag.start() } catch (error) { /* 采样失败不影响面板 */ }

      /**
       * 声音开关读写的是上游「启动动画」插件的设置命名空间，走设置外壳提供的
       * configForms 服务。这里用动态 inject 等它到位，不写进模块的 `inject` ——
       * 那样服务一旦缺失，整个面板都注册不出来。
       */
      try {
        ctx.inject(['configForms'], function (owner) {
          var forms = serviceAt(owner, 'configForms')
          if (forms === null || forms === undefined || typeof forms.get !== 'function') return
          var namespace = BOOT_SETTINGS_NS
          var connect = function () {
            sound.attach(forms.get(namespace))
            return function () { sound.detach() }
          }
          // whileServed：上游没装 / 命名空间没挂载时，这张卡片就当不存在。
          var disconnect = typeof forms.whileServed === 'function'
            ? forms.whileServed([namespace], connect)
            : connect()
          if (typeof owner.effect === 'function') {
            owner.effect(function () { return disconnect }, 'dsh-boot-video-manager: splash sound settings')
          }
        })
      } catch (error) {
        // 这个部署里没有设置服务：面板照常，只是没有声音卡片。
      }

      /**
       * 注册成设置面板里的一级导航条目（就是「内置插件 / 插件市场 / 皮肤管理」
       * 那一列），而不是内置插件页里的一个标签。先 `inject` 等这个 slot 被
       * 外壳声明出来，再 register —— 直接 register 未声明的 slot 会在加载时抛错。
       */
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'boot-videos',
          order: 60,
          label: function () { return t('nav') },
          locale: NS,
          inject: function () { return { t: t, sound: sound, diag: audioDiag } },
        }, BootVideoManagerTab)
      })
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = inject

    return module.exports
  },
})
