# dsh-boot-video-manager

给 **DSH 开屏动画插件**（[`dsh-boot-animation`](https://github.com/lxj5820/dsh-boot-animation)）配的
**开屏视频播放列表面板**：装在 **设置 → 插件管理** 里，不用离开 app 就能排片。

> 上游插件自己的设置卡片只能开关、调淡入时长、勾选素材池，
> **没法把新视频放进去、也没法决定先后**。这个插件补的就是这两块。

## 装好之后长什么样

设置（齿轮）→ 左侧导航多出一条 **「插件管理」**：

| 区域 | 说明 |
| --- | --- |
| 顶部一行 | 素材总体积、参与播放条数 / 总条数 |
| **添加视频…** | 打开系统文件选择框，**可多选**；第 1 个加进来的就是 1 号，排在最上面（有进度条） |
| **刷新** | 重新读一遍磁盘与播放列表 |
| **打开素材文件夹** | 在资源管理器里打开素材目录 |
| **播放方式** | `顺序播放` / `随机播放` / `单次播放` 三选一 |
| 播放列表每一行 | `1.` 编号 · 勾选框（是否参与播放）· 文件名 · 体积 · `↑` `↓`（调顺序）· **设为下一个**（顺序模式）/ **固定播这支**（单次模式）· **回收** |
| 徽章 | **下一个** = 下次启动播它；**每次播** = 单次模式下固定播它；**在池中** = 此刻就在素材池里；**上次启动播了** = 已经播过 |
| **已回收** | 回收掉的素材（只列出来，不参与播放） |
| 底部说明 | 提醒改动刷新页面即生效 |

### 三种播放方式

| 方式 | 行为 | 池目录里留什么 |
| --- | --- | --- |
| **顺序播放** | 第一次启动播 1 号、第二次 2 号……播完最后一支回到 1 号 | 只留「下一个」那支 |
| **随机播放** | 每次启动在勾选参与的那些里随机抽一支 | 参与播放的全部留着 |
| **单次播放** | 每次都播同一支（用「固定播这支」选它），永远不换 | 只留固定那支 |

### 顺序播放 = 「第一次启动播 1 号，第二次播 2 号」

上游插件每次启动都会在素材池里**随机抽**一支。为了不改上游一个字节还能做到确定性播放，
本插件用的是「**池目录里只留该播的那一支**」：

- 顺序模式下，**只有「下一个」那一支待在 `assets\videos\`，其余参与播放的都停在 `assets\videos\disabled\`**
  （这不是被停用，是在排队 —— 轮到自己时会被自动搬回池目录）
- 每次 DSH 启动（插件 `apply()` 跑的时候）把游标往前推一格，于是下次启动就是下一支；播完最后一支回到 1 号
- **单次播放**用同一套机制，只是**不推进游标**，所以每次都是它
- 因此：**在资源管理器里看到 `disabled\` 里堆着视频是正常现象**，别手动去搬
- 随机模式则相反：所有勾选参与的视频都待在池目录里，由上游随机抽

## 数据放哪

| 内容 | 位置 |
| --- | --- |
| 视频文件（池） | `D:\dsh-boot-animation\assets\videos\` |
| 排队中的（顺序模式） | `…\videos\disabled\` |
| 回收的 | `…\videos\recycle\<时间戳>-原文件名` |
| 播放列表状态 | `D:\dsh-boot-video-manager\state\playlist.json`（顺序、勾选、游标、单次模式固定哪支） |

可用环境变量覆盖：`DSH_BOOT_VIDEO_DIR`（素材目录）、`DSH_BOOT_VIDEO_STATE`（状态文件）。
支持格式：`.mp4` `.webm` `.m4v` `.mov`（上游不认 `.mkv`）。上传上限 512 MB。

## 宿主路由

`/plugins/dsh-boot-video-manager` 下：

```
GET  /state             读播放列表、播放方式、下一个播哪支
POST /upload?name=      上传一支（原始字节体）
POST /order             { names: [...] }  重排（必须正好是当前所有项）
POST /include           { name, included } 勾选 / 取消参与
POST /mode              { mode: 'sequence' | 'random' | 'single', name? }  切播放方式
POST /next              { name? }  指定下一次播哪支（顺序改游标 / 单次改固定，不传 name 就往后挪一位）
POST /recycle           { name }   移出播放列表（挪进 recycle/）
POST /reveal            打开素材目录
```

文件名一律走白名单校验（不能带路径分隔符、不能以点开头、扩展名必须在支持列表里），
所有业务错误回 4xx 并把中文原因原样放在 `error` 字段里。

## 安装 / 卸载

```powershell
# 安装（profile 默认 desktop）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\dsh-boot-video-manager\tools\install.ps1 -ProfileName desktop

# 卸载（只摘插件，不动视频文件）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\dsh-boot-video-manager\tools\uninstall.ps1 -ProfileName desktop
```

`install.ps1` 只做三件事：在 profile 的 `node_modules` 里建一个指向本目录的
**junction**、备份 `cordis.patch.yml`、往里追加一段 `- insert:` 挂载项。
不改 `package.json`、不跑 pnpm。桌面版（`desktop` profile）由 Electron 独占，
`dsh plugin add` 不允许直接改它，所以走脚本这条路。

## 结构

```
lib/index.js      宿主半侧：上面那 8 条路由 + 播放列表状态机（place / enforceAtStartup）
lib/client.js     客户端半侧：注册 settings.section 导航条目「插件管理」（手写，无需构建）
tools/install.ps1, tools/uninstall.ps1
```

客户端半侧没有任何构建步骤——`lib/client.js` 就是手写的、可直接被
`window.__ModuleLoader__` 加载的产物，只 `require("react")`（平台静态基座）。

## 测试

```powershell
# 宿主半侧：临时目录里跑完整播放列表状态机（含 3 次「启动」验证顺序推进）
& 'D:\dshdeepseek\DeepSeek Harness.exe' D:\dsh工作区D盘\_probe\test-bvm-host.cjs
# 客户端半侧：假 __ModuleLoader__ + 假 react，渲染并检查 UI 结构
& 'D:\dshdeepseek\DeepSeek Harness.exe' D:\dsh工作区D盘\_probe\test-bvm-client.cjs
```
（需要先设 `$env:ELECTRON_RUN_AS_NODE='1'`；本机没把 node 装进 PATH。）

## 排障

- **导航里没有「插件管理」** → 先 F5；还不行就重启 DSH。
- **改了 `lib/index.js` 后新功能报 405 / 404** → **必须重启 DSH**。宿主半侧是 ESM，
  已经在跑的进程握着旧模块（改 `cordis.patch.yml` 触发的热加载只会重建入口，不会重新 import
  同一路径的模块）。客户端 `lib/client.js` 相反，是每次请求从磁盘读的，刷新页面即可。
- **`disabled\` 里堆了一堆视频** → 顺序模式的正常排队，见上文。
- **页面报「没有找到开屏动画插件」** → `D:\dsh-boot-animation\entry.js` 不在；
  换位置的话设 `DSH_BOOT_VIDEO_DIR` 指向它的 `assets\videos`。
- **取消不了勾选** → 「下一个」（顺序模式）或「固定那支」（单次模式）不能取消参与（先换一个再取消）；
  也不允许一个都不留。
