/**
 * Excel 원가 파일 → items 테이블에 코드가 없는 품목만 추가
 * 사용법: npm run dev 실행 후 다른 터미널에서
 *   node scripts/import-items-excel.cjs "C:\Users\S&J\OneDrive\Documents\ERP 원가(2).xlsx"
 */
const fs = require('fs')
const path = require('path')

const excelPath = process.argv[2]
const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

async function main() {
  if (!excelPath) {
    console.error('사용법: node scripts/import-items-excel.cjs "경로/원가(2).xlsx"')
    process.exit(1)
  }
  const resolved = path.resolve(excelPath)
  if (!fs.existsSync(resolved)) {
    console.error('파일 없음:', resolved)
    process.exit(1)
  }

  const fileBuffer = fs.readFileSync(resolved)
  const blob = new Blob([fileBuffer])
  const form = new FormData()
  const fileName = path.basename(resolved)
  form.append('file', blob, fileName)

  const res = await fetch(`${baseUrl}/api/importItemsFromExcel`, {
    method: 'POST',
    body: form,
  })
  const json = await res.json()

  if (json.success) {
    console.log('✅', json.message)
  } else {
    console.error('❌', json.message)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
