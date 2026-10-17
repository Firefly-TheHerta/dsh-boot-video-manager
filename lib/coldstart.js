/**
 * 把「开机第一次播放没声音」的修复装进已安装的 dsh-boot-animation。
 *
 * 用户只装这个插件，也要一次就用上声音。上游动画插件（lxj5820/dsh-boot-animation）
 * 的 src/boot-screen.js 在 1.2 秒的窗口里把元素自己静音：开机后第一次播放时
 * 音频管线要两三秒才起来，窗口先到，于是冷启动永远无声、第二次启动永远有声。
 * 修好的版本在 f67fb4d 里，这里带着「旧 → 新」的逐字替换表
 * （lib/coldstart-patch.js，由 _probe/gen-coldstart-patch.cjs 生成并自校验）。
 *
 * 发现装的是旧版就补上，发现已经是新版就什么都不做。只在能完整匹配时替换
 * （全有或全无）：任何一个锚点对不上，就原样不动并报 'unrecognized'，
 * 绝不写半截文件。
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import PATCHES from './coldstart-patch.js'

// 修好的版本里才有这个常量；用它判断「已经是新版」。
const MARKER = 'SOUND_ARM_MS'
const SCREEN = join('src', 'boot-screen.js')
const BACKUP = SCREEN + '.bvm-orig'

/**
 * 纯函数：把修复写进一段源码。
 * @param {string} source 动画插件 src/boot-screen.js 的全文。
 * @returns {{status: 'already'|'patched'|'unrecognized', source: string}}
 */
export function applyFix(source) {
  if (source.includes(MARKER)) return { status: 'already', source }
  let out = source
  for (const patch of PATCHES) {
    const first = out.indexOf(patch.from)
    if (first < 0 || out.indexOf(patch.from, first + 1) >= 0) {
      return { status: 'unrecognized', source }
    }
    out = out.slice(0, first) + patch.to + out.slice(first + patch.from.length)
  }
  return { status: 'patched', source: out }
}

/**
 * 就地修一个装好的动画插件（幂等；第一次写前留 .bvm-orig 备份）。
 * @param {string} pluginRoot dsh-boot-animation 的根目录（含 src/boot-screen.js）。
 * @returns {{status: 'absent'|'already'|'patched'|'unrecognized'|'error', error?: string}}
 */
export function ensureColdStartFix(pluginRoot) {
  const file = join(pluginRoot, SCREEN)
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { status: 'absent' }
    return { status: 'error', error: String((error && error.message) || error) }
  }
  const result = applyFix(source)
  if (result.status !== 'patched') return { status: result.status }
  try {
    const backup = join(pluginRoot, BACKUP)
    if (!existsSync(backup)) copyFileSync(file, backup)
    writeFileSync(file, result.source, 'utf8')
  } catch (error) {
    return { status: 'error', error: String((error && error.message) || error) }
  }
  return { status: 'patched' }
}

export { MARKER }
