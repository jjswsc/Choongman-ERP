/** server-only 우회 후 merge 스크립트 실행 (일회성 운영용) */
const Module = require('module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return origLoad.apply(this, arguments)
}

require('tsx/cjs/api').register()
require('./merge-member-phone-duplicates.ts')
