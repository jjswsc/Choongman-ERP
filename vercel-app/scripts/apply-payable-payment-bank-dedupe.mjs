#!/usr/bin/env node
/**
 * 동일 bank_transaction_id 에 Payment 행이 2개 이상인 미지급 중복을 일회성으로 정리.
 * (조회 API에서 DELETE 하던 방식을 제거했으므로, 남은 고아 중복은 이 스크립트로만 정리)
 *
 *   node scripts/apply-payable-payment-bank-dedupe.mjs --dry-run
 *   node scripts/apply-payable-payment-bank-dedupe.mjs --execute
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val
  }
}

loadEnvFile(resolve(root, '.env.local'))
loadEnvFile(resolve(root, '.env'))

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const execute = process.argv.includes('--execute')

/** lib/receivable-payable pickPayablePaymentKeeperId 와 동일 */
function pickPayablePaymentKeeperId(rows) {
  const normalized = (rows || [])
    .map((r) => ({
      id: Number(r.id || 0),
      accrualId: Number(r.expense_accrual_id || 0),
    }))
    .filter((r) => r.id > 0)
  if (!normalized.length) return null
  const withAccrual = normalized.filter((r) => r.accrualId > 0)
  const pool = withAccrual.length ? withAccrual : normalized
  return pool.reduce((best, r) => (r.id > best.id ? r : best)).id
}

async function fetchAllPayments() {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from('payable_transactions')
      .select('id,bank_transaction_id,expense_accrual_id,amount,vendor_code,memo')
      .eq('ref_type', 'Payment')
      .not('bank_transaction_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  console.log(execute ? 'MODE: EXECUTE' : 'MODE: DRY-RUN')
  const rows = await fetchAllPayments()
  const byBank = new Map()
  for (const r of rows) {
    const bankId = Number(r.bank_transaction_id || 0)
    if (!bankId) continue
    if (!byBank.has(bankId)) byBank.set(bankId, [])
    byBank.get(bankId).push(r)
  }

  const dups = [...byBank.entries()].filter(([, list]) => list.length >= 2)
  console.log(`Payment(with bank_id) rows: ${rows.length}`)
  console.log(`Duplicate bank_transaction_id groups: ${dups.length}`)

  let deleteCount = 0
  let sample = 0
  for (const [bankId, list] of dups) {
    const keeperId = pickPayablePaymentKeeperId(list)
    const victims = list.filter((r) => Number(r.id) !== keeperId)
    deleteCount += victims.length
    if (sample < 15) {
      sample += 1
      console.log(
        `  bank#${bankId}: keep #${keeperId}, delete [${victims.map((v) => v.id).join(', ')}] amounts=${list
          .map((r) => r.amount)
          .join('|')} vendor=${list[0]?.vendor_code || ''}`
      )
    }
    if (!execute) continue
    for (const v of victims) {
      const { error } = await supabase.from('payable_transactions').delete().eq('id', Number(v.id))
      if (error) throw error
    }
  }

  console.log(`Would/will delete Payment rows: ${deleteCount}`)
  if (!execute && deleteCount > 0) console.log('Re-run with --execute to apply.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
