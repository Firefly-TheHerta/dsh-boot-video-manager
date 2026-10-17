# 更新记录

## 1.2.2

**把「开机第一次开屏没声音」的真因查清并修掉了 —— 不是浏览器的 autoplay 规矩。**

- 真因在上游 `dsh-boot-animation` 的开屏逻辑里：它「先带声音播、播不动就退回静音」，但那个
  「播不动」只给了 **1.2 秒**窗口。开机后**第一次**播放时音频管线还是冷的，常常要两三秒才响应，
  窗口先到，它就自己把画面静音了；第二次启动管线已经热了，所以从此都有声音 —— 这正是
  「启动一次、退出、再启动才有声」的原因，也解释了为什么给快捷方式加启动参数没有用。
- 修复已提交到 `dsh-boot-animation`（`src/boot-screen.js`）：1.2 秒只用来架起「点一下重试」、
  不再静音元素；真正静音推迟到 5 秒兜底；已在放静音片子时最多再要三次声音，把声音中途接回来；
  每次结论写进 `.dshba` 根元素的 `data-sound`（`on:` / `late:` / `muted:` + 毫秒）。
- 因此 README 里「开机没声音是浏览器的规矩」那段改成了真因说明；「冷启动直接出声（启动参数）」
  降级为**兜底的保险**（万一某台机器上策略真的是拦路的那一道）。
- `tools/autoplay-on.ps1` 改用系统给出的桌面路径（`[Environment]::GetFolderPath('Desktop')` /
  `CommonDesktopDirectory`），桌面被重定向到别处（例如 `D:\我的桌面`）时也能正确找到快捷方式。

## 1.2.1 / 1.2.0

- 面板新增**音频自检**：记录每次开屏的真实结果（当时的采样会写进 localStorage 的 `bvm.audioDiag`），
  「这次到底有没有出声、为什么没出声」从此有据可查。
- 新增 `tools/autoplay-on.ps1`：给指向 `DeepSeek Harness.exe` 的快捷方式加
  `--autoplay-policy=no-user-gesture-required`，支持 `-DryRun` 预览与 `-Revert` 还原。
  `tools/uninstall.ps1` 会在卸载时顺手还原。
