/**
 * 문제가 된 거래 데이터 전체 삭제
 * 사용법: npm run dev 실행 후
 *   node scripts/cleanup-transactional-data.js
 */
const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

async function main() {
  const res = await fetch(`${baseUrl}/api/cleanupTransactionalData`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'yes' }),
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
