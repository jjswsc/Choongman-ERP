/**
 * Capacitor sync copies webDir (.next) into android assets — including cache/dev that must not ship in APK.
 * Run after `cap sync android`, before Gradle assemble.
 */
const fs = require('fs')
const path = require('path')

const assetsPublic = path.resolve(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public')
const PRUNE_DIRS = ['cache', 'dev', 'diagnostics', 'types']

function rmPath(target) {
  if (!fs.existsSync(target)) return false
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  return true
}

let prunedDirs = 0
for (const name of PRUNE_DIRS) {
  const target = path.join(assetsPublic, name)
  if (rmPath(target)) prunedDirs++
}

console.log(
  `prune-android-cap-assets: removed ${prunedDirs} top-level dirs (${PRUNE_DIRS.join(', ')}) under assets/public`
)
