/**
 * 세무 프로필 TIN 조회 (비밀 출력 없음)
 * npx tsx scripts/list-store-tax-tins.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('missing env')
  process.exit(1)
}

async function main() {
  const res = await fetch(
    `${url}/rest/v1/store_tax_filing_profiles?select=store_code,tax_id,taxpayer_name,branch_no&order=store_code`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`)
  const rows = JSON.parse(text) as {
    store_code?: string
    tax_id?: string
    taxpayer_name?: string
    branch_no?: string | null
  }[]
  for (const r of rows) {
    console.log(
      [r.store_code, r.tax_id, r.branch_no || '', r.taxpayer_name || ''].join(' | ')
    )
  }
  console.log('count', rows.length)

  const openings = await fetch(
    `${url}/rest/v1/journal_entries?select=id,tax_entity_code,accounting_date,memo,source_id&source_type=eq.tax_opening&book=eq.tax&order=tax_entity_code`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  const ot = await openings.text()
  if (!openings.ok) throw new Error(ot.slice(0, 300))
  console.log('--- existing tax_opening ---')
  console.log(ot)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
