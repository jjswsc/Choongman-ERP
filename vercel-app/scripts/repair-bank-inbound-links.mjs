#!/usr/bin/env node
/**
 * 통장 매입대금(purchase_payment) ↔ 입고 배치 자동 연결
 * — 입고는 이미 등록됐는데 통장 지급만 미연동인 건을 bank_transaction_inbound_links에 FIFO 배분
 *
 *   cd vercel-app
 *   node scripts/repair-bank-inbound-links.mjs --dry-run
 *   node scripts/repair-bank-inbound-links.mjs --execute
 *   node scripts/repair-bank-inbound-links.mjs --dry-run --start=2026-02-01 --end=2026-06-30
 *   node scripts/repair-bank-inbound-links.mjs --dry-run --vendor=KLEVER_CODE
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const REMAIN_EPS = 0.01

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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
)

const execute = process.argv.includes('--execute')
const startArg = process.argv.find((a) => a.startsWith('--start='))?.split('=')[1]
const endArg = process.argv.find((a) => a.startsWith('--end='))?.split('=')[1]
const vendorArg = process.argv.find((a) => a.startsWith('--vendor='))?.split('=')[1]

const startDate = startArg || '2026-02-01'
const endDate = endArg || '2026-06-30'

function norm(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function expandStoreVariants(store) {
  const t = String(store || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!t) return []
  const out = new Set([t, t.toLowerCase()])
  const tl = t.toLowerCase()
  if (tl.startsWith('cm ')) {
    const rest = t.slice(3).trim()
    if (rest) {
      out.add(rest)
      out.add(rest.toLowerCase())
    }
  } else {
    out.add(`CM ${t}`)
    out.add(`cm ${t}`.toLowerCase())
  }
  return [...out].map((x) => norm(x))
}

function storesMatch(a, b) {
  const va = new Set(expandStoreVariants(a))
  const vb = new Set(expandStoreVariants(b))
  for (const x of va) {
    if (vb.has(x)) return true
  }
  return false
}

function isOfficeStore(s) {
  const x = String(s || '').trim()
  const xl = x.toLowerCase()
  return (
    x === '본사' ||
    x === 'Office' ||
    x === '오피스' ||
    x === '본점' ||
    xl === 'hq' ||
    xl.includes('office')
  )
}

function isOfficeInboundLocation(loc) {
  const x = String(loc || '').trim()
  const xl = x.toLowerCase()
  return x === '입고등록' || x === '본사' || x === 'Office' || x === '오피스' || x === '본점' || xl.includes('office')
}

function storeMatchesForInboundLink(storeHint, batchLocation) {
  if (!storeHint || !batchLocation) return false
  if (storesMatch(storeHint, batchLocation)) return true
  if (isOfficeStore(storeHint) && isOfficeInboundLocation(batchLocation)) return true
  return false
}

function isHqVendor(v) {
  const code = norm(v?.code)
  const type = norm(v?.type)
  const name = `${v?.name || ''} ${v?.gps_name || ''}`.toLowerCase()
  if (code === 'hq') return true
  if (['본사', 'head office', 'hq'].includes(type)) return true
  if (type.includes('본사') || type.includes('head office')) return true
  if (/\(head office\)|\(본사\)/i.test(name)) return true
  return false
}

function vendorMatchesBatch(batch, matchValues) {
  const code = norm(batch.vendor_code)
  const name = norm(batch.vendor_name)
  for (const mv of matchValues) {
    const m = norm(mv)
    if (!m) continue
    if (code && code === m) return true
    if (name && name === m) return true
  }
  return false
}

function batchRemaining(total, linked) {
  return Math.max(0, Math.round((total - linked) * 100) / 100)
}

function sortBatchesForLink(rows, linkedByBatchId) {
  return [...rows].sort((a, b) => {
    const remA = batchRemaining(Number(a.total_amount) || 0, linkedByBatchId.get(a.id) || 0)
    const remB = batchRemaining(Number(b.total_amount) || 0, linkedByBatchId.get(b.id) || 0)
    const unpaidA = remA > REMAIN_EPS
    const unpaidB = remB > REMAIN_EPS
    if (unpaidA !== unpaidB) return unpaidA ? -1 : 1
    const dateCmp = String(b.batch_date || '').localeCompare(String(a.batch_date || ''))
    if (dateCmp !== 0) return dateCmp
    return remB - remA
  })
}

async function fetchAllRows(table, filter, select, order) {
  const pageSize = 1000
  let offset = 0
  const out = []
  for (;;) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1)
    if (filter) {
      for (const part of filter.split('&')) {
        const [col, op, ...rest] = part.split(/\.(.+)/)
        if (!col || !op) continue
        const val = rest.join('.')
        if (op === 'eq') q = q.eq(col, decodeURIComponent(val))
        else if (op === 'gte') q = q.gte(col, decodeURIComponent(val))
        else if (op === 'lte') q = q.lte(col, decodeURIComponent(val))
        else if (op === 'in') {
          const inner = val.replace(/^\(|\)$/g, '')
          q = q.in(col, inner.split(',').map((x) => decodeURIComponent(x)))
        }
      }
    }
    if (order) {
      const [col, dir] = order.split('.')
      q = q.order(col, { ascending: dir !== 'desc' })
    }
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return out
}

async function resolveVendorMatchValues(vendorCode, vendorName, vendorByCode) {
  const matchValues = []
  if (vendorCode) {
    matchValues.push(vendorCode)
    const v = vendorByCode.get(norm(vendorCode))
    if (v?.name) matchValues.push(v.name)
    if (v?.gps_name) matchValues.push(v.gps_name)
  } else if (vendorName) {
    matchValues.push(vendorName)
  }
  return [...new Set(matchValues.map((x) => String(x || '').trim()).filter(Boolean))]
}

async function main() {
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('SUPABASE_URL 이 필요합니다 (.env.local)')
    process.exit(1)
  }

  console.log(`기간: ${startDate} ~ ${endDate}`)
  console.log(execute ? '【실행 모드】' : '【dry-run】')

  const vendors = await fetchAllRows('vendors', null, 'code,name,gps_name,type', 'id.asc')
  const vendorByCode = new Map()
  const hqCodes = new Set()
  for (const v of vendors) {
    const c = String(v.code || '').trim()
    if (!c) continue
    vendorByCode.set(norm(c), v)
    if (isHqVendor(v)) hqCodes.add(norm(c))
  }

  const accounts = await fetchAllRows('bank_accounts', null, 'id,store', 'id.asc')
  const accountStoreById = new Map(accounts.map((a) => [Number(a.id), String(a.store || '').trim()]))

  const bankRows = await fetchAllRows(
    'bank_transactions',
    `trans_type.eq.withdraw&category.eq.purchase_payment&trans_date.gte.${startDate}&trans_date.lte.${endDate}`,
    'id,account_id,trans_date,amount,category,vendor_code,store_name,store,memo',
    'trans_date.asc'
  )

  const existingLinks = await fetchAllRows(
    'bank_transaction_inbound_links',
    null,
    'bank_transaction_id,inbound_batch_id,amount',
    'id.asc'
  )

  const linkedByBankId = new Map()
  const linkedByBatchId = new Map()
  for (const row of existingLinks) {
    const bankId = Number(row.bank_transaction_id || 0)
    const batchId = Number(row.inbound_batch_id || 0)
    const amt = Math.abs(Number(row.amount || 0))
    if (bankId && amt > 0) linkedByBankId.set(bankId, (linkedByBankId.get(bankId) || 0) + amt)
    if (batchId && amt > 0) linkedByBatchId.set(batchId, (linkedByBatchId.get(batchId) || 0) + amt)
  }

  const batches = await fetchAllRows(
    'inbound_batches',
    null,
    'id,batch_date,vendor_code,vendor_name,location,total_amount',
    'batch_date.asc'
  )

  const uncoupledBanks = bankRows.filter((bt) => {
    const id = Number(bt.id)
    const vc = String(bt.vendor_code || '').trim()
    if (!id || !vc) return false
    if (linkedByBankId.has(id)) return false
    if (hqCodes.has(norm(vc))) return false
    if (vendorArg && norm(vc) !== norm(vendorArg)) return false
    return true
  })

  console.log(`미연동 매입대금 출금: ${uncoupledBanks.length}건`)

  const plannedLinks = []
  let skippedNoBatch = 0
  let skippedNoStore = 0

  for (const bt of uncoupledBanks) {
    const bankId = Number(bt.id)
    let payRemain = Math.abs(Number(bt.amount) || 0)
    if (payRemain <= REMAIN_EPS) continue

    const storeHint =
      String(accountStoreById.get(Number(bt.account_id)) || '').trim() ||
      String(bt.store_name || bt.store || '').trim()
    const transDate = String(bt.trans_date || '').slice(0, 10)
    const vendorCode = String(bt.vendor_code || '').trim()
    const v = vendorByCode.get(norm(vendorCode))
    const matchValues = await resolveVendorMatchValues(vendorCode, v?.name, vendorByCode)

    const candidates = batches.filter((ib) => {
      if (!vendorMatchesBatch(ib, matchValues)) return false
      const batchDate = String(ib.batch_date || '').slice(0, 10)
      if (batchDate && transDate && batchDate > transDate) return false
      const loc = String(ib.location || '').trim()
      if (!storeHint || !loc) return false
      return storeMatchesForInboundLink(storeHint, loc)
    })

    if (!candidates.length) {
      if (!storeHint) skippedNoStore++
      else skippedNoBatch++
      continue
    }

    const sorted = sortBatchesForLink(candidates, linkedByBatchId)
    for (const ib of sorted) {
      if (payRemain <= REMAIN_EPS) break
      const batchId = Number(ib.id)
      const total = Math.abs(Number(ib.total_amount) || 0)
      const already = linkedByBatchId.get(batchId) || 0
      const batchRemain = batchRemaining(total, already)
      if (batchRemain <= REMAIN_EPS) continue

      const alloc = Math.min(payRemain, batchRemain)
      const rounded = Math.round(alloc * 100) / 100
      if (rounded <= REMAIN_EPS) continue

      plannedLinks.push({
        bank_transaction_id: bankId,
        inbound_batch_id: batchId,
        amount: rounded,
        trans_date: transDate,
        vendor: v?.name || vendorCode,
        store: storeHint,
        batch_date: String(ib.batch_date || '').slice(0, 10),
      })

      linkedByBatchId.set(batchId, already + rounded)
      payRemain = Math.round((payRemain - rounded) * 100) / 100
    }

    if (payRemain > REMAIN_EPS) {
      console.warn(
        `  ⚠ bank #${bankId} (${transDate} ${vendorCode}): 입고 잔액 부족 — 미배분 ฿${payRemain}`
      )
    }
  }

  console.log(`연결 예정: ${plannedLinks.length}행`)
  console.log(`매칭 입고 없음: ${skippedNoBatch}건, 매장 불명: ${skippedNoStore}건`)

  for (const row of plannedLinks.slice(0, 40)) {
    console.log(
      `  bank #${row.bank_transaction_id} → batch #${row.inbound_batch_id} ฿${row.amount}  (${row.vendor} / ${row.store} / 입고 ${row.batch_date})`
    )
  }
  if (plannedLinks.length > 40) {
    console.log(`  ... 외 ${plannedLinks.length - 40}행`)
  }

  if (!execute) {
    console.log('\n실제 반영: node scripts/repair-bank-inbound-links.mjs --execute')
    return
  }

  if (!plannedLinks.length) {
    console.log('반영할 연결이 없습니다.')
    return
  }

  const bankIds = [...new Set(plannedLinks.map((r) => r.bank_transaction_id))]
  for (const bankId of bankIds) {
    const { error: delErr } = await supabase
      .from('bank_transaction_inbound_links')
      .delete()
      .eq('bank_transaction_id', bankId)
    if (delErr) throw new Error(`delete links bank ${bankId}: ${delErr.message}`)
  }

  const chunk = 100
  for (let i = 0; i < plannedLinks.length; i += chunk) {
    const slice = plannedLinks.slice(i, i + chunk).map((r) => ({
      bank_transaction_id: r.bank_transaction_id,
      inbound_batch_id: r.inbound_batch_id,
      amount: r.amount,
    }))
    const { error } = await supabase.from('bank_transaction_inbound_links').insert(slice)
    if (error) throw new Error(`insert: ${error.message}`)
  }

  console.log(`\n완료: ${plannedLinks.length}행 저장 (${bankIds.length}건 출금)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
