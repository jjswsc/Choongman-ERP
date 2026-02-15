/**
 * items_rows.csv → Supabase items import (기존 삭제 후 전체 교체)
 * 사용법: npm run dev 실행 후 다른 터미널에서
 *   node scripts/import-items-csv.js "C:\Users\S&J\OneDrive\Documents\items_rows(1).csv"
 */
const fs = require('fs')
const path = require('path')

const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'OneDrive',
  'Documents',
  'items_rows(1).csv'
)
const csvPath = process.argv[2] || defaultPath
const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('파일 없음:', csvPath)
    process.exit(1)
  }
  const csv = fs.readFileSync(csvPath, 'utf-8')
  const res = await fetch(`${baseUrl}/api/importItemsFromCsv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
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
