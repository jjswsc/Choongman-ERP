/** server-only 우회 — LINE import 생년월일 중복 병합 스크립트 */
const Module = require('module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return origLoad.apply(this, arguments)
}

require('tsx/cjs/api').register()
require('./merge-line-import-birth-duplicates.ts')
