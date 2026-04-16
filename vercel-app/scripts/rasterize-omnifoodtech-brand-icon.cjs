/**
 * 판매용(omnifoodtech) Windows 하이브리드 ICO용 — public/omnifoodtech-icon.svg → assets/brand/omnifoodtech-logo.png
 * generate-windows-brand-ico.ps1 이 PNG를 받아 icon.ico 생성.
 */
const fs = require("fs")
const path = require("path")

async function main() {
  const sharp = require("sharp")
  const root = path.join(__dirname, "..")
  const svgPath = path.join(root, "public", "omnifoodtech-icon.svg")
  const outDir = path.join(root, "assets", "brand")
  const outPath = path.join(outDir, "omnifoodtech-logo.png")

  if (!fs.existsSync(svgPath)) {
    throw new Error(`Missing SVG: ${svgPath}`)
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  await sharp(svgPath).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outPath)

  console.log(`rasterize-omnifoodtech-brand-icon: wrote ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
