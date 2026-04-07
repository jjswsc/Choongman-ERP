'use strict'

const fs = require('fs')
const path = require('path')
const rcedit = require('rcedit')

/**
 * signAndEditExecutable 기본값(true)은 winCodeSign 7z 추출 시 darwin 심볼릭 링크가 필요해
 * Windows(개발자 모드/관리자 없음)에서 자주 실패한다. 해당 단계는 끄고, 패킹 직후 아이콘만 넣는다.
 */
module.exports = async function afterPackWinIcon(context) {
  if (context.electronPlatformName !== 'win32') return

  const appInfo = context.packager.appInfo
  const outDir = context.appOutDir
  const projectDir = context.projectDir || path.join(__dirname, '..')

  const candidates = [
    path.join(outDir, `${appInfo.productName}.exe`),
    path.join(outDir, `${appInfo.productFilename}.exe`),
  ]
  const exePath = candidates.find((p) => fs.existsSync(p))
  if (!exePath) {
    const exes = fs.readdirSync(outDir).filter((f) => f.toLowerCase().endsWith('.exe'))
    throw new Error(
      `afterPack win icon: exe not found. Tried: ${candidates.join(', ')}. Found .exe: ${exes.join(', ')}`,
    )
  }

  const iconPath = path.join(projectDir, 'assets', 'icon.ico')
  if (!fs.existsSync(iconPath)) {
    throw new Error(`afterPack win icon: missing ${iconPath}`)
  }

  await rcedit(exePath, { icon: iconPath })
}
