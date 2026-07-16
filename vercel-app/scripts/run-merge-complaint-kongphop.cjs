/** server-only 우회 후 컴플레인 회원 병합 스크립트 */
const Module = require('module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return origLoad.apply(this, arguments)
}

require('tsx/cjs/api').register()
require('./merge-complaint-kongphop.ts')
