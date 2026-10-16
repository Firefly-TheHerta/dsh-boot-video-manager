# dsh-boot-video-manager

给 **DSH 开屏动画插件**（[`dsh-boot-animation`](https://github.com/lxj5820/dsh-boot-animation)）配的
**开屏视频播放列表面板**：装在 **设置 → 插件管理** 里，不用离开 app 就能排片。

> 上游插件自己的设置卡片只能开关、调淡入时长、勾选素材池，
> **没法把新视频放进去、也没法决定先后**。这个插件补的就是这两块。

---

## 前置要求

- 装好 DSH（DeepSeek Harness），并已安装上游开屏插件 **`dsh-boot-animation`**。
- 本插件是它的「管理端」：自己不播视频，而是替你维护上游的素材池目录和播放顺序。
  没装上游的话，页面会提示「没有找到开屏动画插件」，此时什么都管不了。

## 功能

- **添加视频**：从文件选择框多选，直接传进素材池（`.mp4` `.webm` `.m4v` `.mov`，单支上限 512 MB）。
- **排序**：拖不动就用每行的 `↑` `↓`，或整列重排。
- **三种播放方式**：`顺序播放` / `随机播放` / `单次播放`（见下）。
- **勾选参与**：不想让它出现就取消勾选，不用删文件。
- **回收**：把某支移出播放列表（挪进 `recycle\`，可随时找回）。
- **打开素材文件夹**：一键在资源管理器里定位。

---

## 安装

三种方式，按需选一种。

### 方式 A —— npm（推荐，发布后可用）

```bash
dsh plugin add dsh-boot-video-manager
```

包名是 `dsh-boot-video-manager`，通过 `dsh.bundle.patch`（`cordis.patch.yml`）自动挂载宿主入口，
装完刷新页面即可。发布到 npm registry 之前，这条命令会提示找不到包，届时先走方式 B / C。

### 方式 B —— 直接从 GitHub 仓库装

```bash
dsh plugin --profile <你的 profile 名> add github:Firefly-TheHerta/dsh-boot-video-manager
```

同样由 `cordis.patch.yml` 自动挂载，不需要手改配置文件。

### 方式 C —— 桌面版（`desktop` profile）junction 脚本

桌面版 profile 被 Electron 独占，`dsh plugin add` 不允许直接改它，所以走脚本：

```powershell
# 安装（profile 默认 desktop）
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install.ps1 -ProfileName desktop

# 卸载（只摘插件，不动视频文件）
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\uninstall.ps1 -ProfileName desktop
```

`install.ps1` 只做三件事：在 profile 的 `node_modules` 里建一个指向本目录的
**junction**、备份 `cordis.patch.yml`、往里追加一段 `- insert:` 挂载项（`id: boot-video-manager`）。
不改 `package.json`、不跑 pnpm。

---

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

---

## 数据放哪

| 内容 | 位置 |
| --- | --- |
| 视频文件（池） | `<dsh-boot-animation>\assets\videos\` |
| 排队中的（顺序模式） | `…\videos\disabled\` |
| 回收的 | `…\videos\recycle\<时间戳>-原文件名` |
| 播放列表状态 | `%USERPROFILE%\.dsh\boot-video-manager\playlist.json`（顺序、勾选、游标、单次固定哪支） |

### 素材目录怎么找到的（运行时探测）

启动时按这个顺序找上游的素材池，找到了就用：

1. 环境变量 **`DSH_BOOT_VIDEO_DIR`**（显式指定，最优先）
2. 与本插件同级的 `node_modules\dsh-boot-animation\assets\videos`（npm 布局，也覆盖
   「junction 到 `D:\dsh-boot-animation`」的桌面版旧装法）
3. 老位置 `D:\dsh-boot-animation\assets\videos`

全都没有就在页面里提示，并附上当前探测到的目录和修复建议（装上游 / 设环境变量）。

### 状态文件放哪

1. 环境变量 **`DSH_BOOT_VIDEO_STATE`**（显式指定，最优先）
2. 插件目录下旧的 `state\playlist.json`（老版本升级自动沿用，不用重新配）
3. 否则新建到 `%USERPROFILE%\.dsh\boot-video-manager\playlist.json`

支持格式：`.mp4` `.webm` `.m4v` `.mov`（上游不认 `.mkv`）。上传上限 512 MB。
文件名支持中文等非 ASCII 字符（走 URL 百分号编码）。

---

## 宿主路由

`/plugins/dsh-boot-video-manager` 下：

```
GET  /state             读播放列表、播放方式、下一个播哪支
POST /upload?name=      上传一支（原始字节体）
POST /order             { names: [...] }  重排（必须正好是当前所有项）
POST /include           { name, included } 勾选 / 取消参与
POST /mode              { mode: 'sequence' | 'random' | 'single' }  切播放方式
POST /next              { name? }  指定下一次播哪支（顺序改游标 / 单次改固定，不传 name 就往后挪一位）
POST /recycle           { name }   移出播放列表（挪进 recycle/）
POST /reveal            打开素材目录
```

文件名一律走白名单校验（不能带路径分隔符、不能以点开头、扩展名必须在支持列表里），
所有业务错误回 4xx 并把中文原因原样放在 `error` 字段里。

---

## 结构

```
lib/index.js          宿主半侧：8 条路由 + 播放列表状态机（place / enforceAtStartup / 目录探测）
lib/client.js         客户端半侧：注册 settings.section 导航条目「插件管理」（手写，无需构建）
cordis.patch.yml      bundle 层补丁：`dsh plugin add` 时自动挂载宿主入口
tools/install.ps1     桌面版（desktop profile）junction 安装脚本
tools/uninstall.ps1   对应卸载脚本
```

客户端半侧没有任何构建步骤——`lib/client.js` 就是手写的、可直接被
`window.__ModuleLoader__` 加载的产物，只 `require("react")`（平台静态基座）。

---

## 测试

```powershell
# 宿主半侧：临时目录里跑完整播放列表状态机（含 3 次「启动」验证顺序推进）
& 'D:\nodejs\node.exe' .\_probe\test-bvm-host.cjs
# 客户端半侧：假 __ModuleLoader__ + 假 react，渲染并检查 UI 结构
& 'D:\nodejs\node.exe' .\_probe\test-bvm-client.cjs
```

（测试脚本在 `_probe\` 里，不在 npm 包里；用任意 Node ≥ 20 即可。）

---

## 排障

- **导航里没有「插件管理」** → 先 F5；还不行就重启 DSH。
- **改了 `lib/index.js` 后新功能报 405 / 404** → **必须重启 DSH**。宿主半侧是 ESM，
  已经在跑的进程握着旧模块（改 `cordis.patch.yml` 触发的热加载只会重建入口，不会重新 import
  同一路径的模块）。客户端 `lib/client.js` 相反，是每次请求从磁盘读的，刷新页面即可。
- **`disabled\` 里堆了一堆视频** → 顺序模式的正常排队，见上文。
- **页面报「没有找到开屏动画插件」** → 没探测到上游 `dsh-boot-animation`；
  按上面的探测顺序检查，或直接设 `DSH_BOOT_VIDEO_DIR` 指向它的 `assets\videos`。
  页面会显示当前探测到的目录，照着它找。
- **取消不了勾选** → 「下一个」（顺序模式）或「固定那支」（单次模式）不能取消参与（先换一个再取消）；
  也不允许一个都不留。
- **中文文件名在面板里显示乱码** → 这是 PowerShell 5.1 把 UTF-8 当 ANSI 读导致的**显示问题**，
  磁盘上的文件和状态文件本身是好的，刷新页面、用 node 读回都正常。

---

## 发布到 npm（给维护者）

```bash
npm login
npm publish --access public
```

发布后 `dsh plugin add dsh-boot-video-manager` 即可用（方式 A）。`package.json` 里已经
去掉了 `private`、带了 `repository` / `engines.node` / `dsh.bundle.patch`，`files` 白名单
只发 `lib`、`tools`、`cordis.patch.yml` 和 `README.md`。
