/** server-only 우회 후 I'm ICE 회원 병합 */
const Module = require('module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return origLoad.apply(this, arguments)
}

require('tsx/cjs/api').register()
require('./merge-im-ice.ts')
