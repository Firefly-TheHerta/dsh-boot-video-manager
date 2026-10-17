import assert from 'node:assert/strict'
import { applyFix } from '../lib/coldstart.js'
import PATCHES from '../lib/coldstart-patch.js'

// 旧版 = 把替换表里的 from 串起来；新版 = 把 to 串起来。补丁只管这两段，
// 所以用它们拼出来的文本足以验证「补得上、补完不重复、认不出不碰」。
const oldSource = PATCHES.map((patch) => patch.from).join('\n\n')
const newSource = PATCHES.map((patch) => patch.to).join('\n\n')

const patched = applyFix(oldSource)
assert.equal(patched.status, 'patched', '旧版应当被补上')
assert.equal(patched.source, newSource, '补完应当和新版逐字一致')

const again = applyFix(patched.source)
assert.equal(again.status, 'already', '补过之后再跑应当判为已是新版')
assert.equal(again.source, patched.source, '已是新版时不能改动文件')

const stranger = oldSource.replace('var SOUND_TEXT_OFF', 'var SOUND_TEXT_OFF_X')
const untouched = applyFix(stranger)
assert.equal(untouched.status, 'unrecognized', '认不出来的版本不能被改动')
assert.equal(untouched.source, stranger, '认不出来时必须原样返回')

console.log('冷启动修复测试通过：旧版可补、新版不动、陌生版本不碰。')
