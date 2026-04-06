/**
 * Choongman Thailand Store Sales 엑셀 → pos_orders (매출 관리 집계용)
 *
 * 대상: 시트 2024, 2025, 2026 (기본). A열 거래처 코드 ≥ minCode(기본 1000)인 매장만 처리.
 * 매장 블록의 "Store" 행 → order_type dine_in, "Delivery" 행 → order_type delivery.
 * 월말(방콕 23:59:59) created_at, 동일 키는 idempotency_key_hash 로 재실행 시 스킵.
 *
 * 사용 (vercel-app 디렉터리에서):
 *   set SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/import-choongman-thailand-sales-xlsx.cjs "C:\path\file.xlsx" --dry-run
 *   node scripts/import-choongman-thailand-sales-xlsx.cjs "C:\path\file.xlsx" --apply
 *
 * 옵션:
 *   --years=2024,2025,2026
 *   --min-code=1000
 *   --dry-run | --apply  (--apply 없으면 dry-run)
 *
 * 엑셀 임포트로 넣은 행만 삭제 (order_no 가 XLS-…-YYYYMM-H|D 형태 — 다른 주문과 겹치지 않음):
 *   node scripts/import-choongman-thailand-sales-xlsx.cjs --delete-months=2025-03,2026-03
 *   node scripts/import-choongman-thailand-sales-xlsx.cjs --delete-months=2025-03,2026-03 --apply-delete
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const MONTH_MAP = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  const txt = fs.readFileSync(p, 'utf8')
  for (const line of txt.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    const k = m[1]
    if (process.env[k]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[k] = v
  }
}

function parseArgs(argv) {
  const files = []
  let years = ['2024', '2025', '2026']
  let minCode = 1000
  let apply = false
  let deleteMonths = []
  let applyDelete = false
  for (const a of argv) {
    if (a.startsWith('--years=')) {
      years = a.slice('--years='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a.startsWith('--min-code=')) {
      minCode = Math.max(0, parseInt(a.slice('--min-code='.length), 10) || 1000)
    } else if (a.startsWith('--delete-months=')) {
      deleteMonths = a
        .slice('--delete-months='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (a === '--apply-delete') applyDelete = true
    else if (a === '--apply') apply = true
    else if (a === '--dry-run') apply = false
    else if (!a.startsWith('--')) files.push(a)
  }
  return { filePath: files[0] || '', years, minCode, dryRun: !apply, deleteMonths, applyDelete }
}

function ymToOrderNoFragment(ym) {
  const m = String(ym).trim().match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  return `${m[1]}${m[2]}`
}

function createSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    process.exit(1)
  }
  return createClient(url, key)
}

/** 엑셀 임포트 행만: order_no 가 XLS- 로 시작하고 -YYYYMM- 포함 (DB에 created_by 없을 수 있음) */
async function runDeleteImportedMonths(supabase, months, applyDelete) {
  const bad = months.filter((ym) => !ymToOrderNoFragment(ym))
  if (bad.length) {
    console.error('--delete-months 는 YYYY-MM 형식만 허용:', bad.join(', '))
    process.exit(1)
  }

  for (const ym of months) {
    const frag = ymToOrderNoFragment(ym)
    const pattern = `XLS%-${frag}-%`
    const { data: rows, error: selErr } = await supabase
      .from('pos_orders')
      .select('id,order_no,store_code,total,memo,created_at')
      .ilike('order_no', pattern)

    if (selErr) {
      console.error(`${ym} 조회 오류:`, selErr.message)
      continue
    }
    const list = rows || []
    console.log(`--- ${ym} (order_no ilike ${pattern}) --- 건수: ${list.length}`)
    for (const r of list.slice(0, 8)) {
      console.log(' ', r.id, r.order_no, r.store_code, r.total, r.memo?.slice(0, 60))
    }
    if (list.length > 8) console.log(`  ... 외 ${list.length - 8}건`)

    if (!applyDelete || list.length === 0) continue

    const ids = list.map((r) => r.id).filter(Boolean)
    const { error: delErr } = await supabase.from('pos_orders').delete().in('id', ids)
    if (delErr) {
      console.error(`${ym} 삭제 오류:`, delErr.message)
    } else {
      console.log(`${ym} 삭제 완료: ${ids.length}건`)
    }
  }
}

function parseMonthLabel(cell) {
  const s = String(cell ?? '').trim()
  const m = s.match(/^([A-Za-z]+)\.?(\d{4})$/i)
  if (!m) return null
  const key = m[1].toLowerCase()
  const mo = MONTH_MAP[key] ?? MONTH_MAP[key.slice(0, 3)]
  const y = parseInt(m[2], 10)
  if (!mo || !y) return null
  return `${y}-${String(mo).padStart(2, '0')}`
}

function buildMonthColumns(headerRow) {
  const out = []
  for (let c = 4; c < headerRow.length; c += 2) {
    const lab = headerRow[c]
    const s = String(lab ?? '').trim()
    if (!s || /^total$/i.test(s)) break
    const ym = parseMonthLabel(lab)
    if (!ym) break
    out.push({ col: c, ym })
  }
  return out
}

function numAt(row, col) {
  const v = row[col]
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/** 부가세 7% 포함 금액 → 공급가액·세액 (POS와 동일한 단순 역산) */
function vatFromInclusive7(total) {
  const t = round2(Number(total) || 0)
  const subtotal = round2(t / 1.07)
  const vat = round2(t - subtotal)
  return { subtotal, vat, total: t }
}

function endOfMonthBangkokIso(ym) {
  const [y, mo] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, mo, 0))
  const d = last.getUTCDate()
  const ds = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return new Date(`${ds}T23:59:59+07:00`).toISOString()
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

function isStoreHeaderRow(row, minCode) {
  const b = String(row[1] ?? '').trim()
  if (!b) return false
  const a = row[0]
  if (typeof a === 'string' && /^total$/i.test(a.trim())) return false
  const code = typeof a === 'number' ? a : parseInt(String(a ?? '').trim(), 10)
  if (!Number.isFinite(code) || code < minCode) return false
  return true
}

function rowKind(row) {
  const c2 = String(row[2] ?? '').trim()
  const c3 = String(row[3] ?? '').trim()
  if (c2 === 'Store' && !c3) return 'store'
  if (c2 === 'Delivery' && !c3) return 'delivery'
  return null
}

/**
 * 시트 데이터에서 매장 블록 파싱 → { storeCode, storeName, storeRow, children }
 */
function parseBlocks(data, minCode) {
  const headerRow = data[3] || []
  const monthCols = buildMonthColumns(headerRow)
  const blocks = []
  let i = 4
  while (i < data.length) {
    const row = data[i]
    if (isStoreHeaderRow(row, minCode)) {
      const storeCode = String(typeof row[0] === 'number' ? row[0] : parseInt(String(row[0]).trim(), 10))
      const storeName = String(row[1] ?? '').trim()
      const children = []
      i++
      while (i < data.length) {
        const r = data[i]
        if (isStoreHeaderRow(r, minCode)) break
        const s0 = String(r[0] ?? '').trim().toLowerCase()
        if (s0 === 'total') break
        children.push(r)
        i++
      }
      blocks.push({ storeCode, storeName, children, monthCols })
      continue
    }
    i++
  }
  return blocks
}

function amountsForKind(children, kind, monthCols) {
  const target = children.find((r) => rowKind(r) === kind)
  if (!target) return {}
  const byYm = {}
  for (const { col, ym } of monthCols) {
    const n = numAt(target, col)
    if (n != null) byYm[ym] = n
  }
  return byYm
}

function buildInsertRows({ sheetYear, storeCode, storeName, monthCols, children }) {
  const hallByYm = amountsForKind(children, 'store', monthCols)
  const delByYm = amountsForKind(children, 'delivery', monthCols)
  const rows = []
  const yms = new Set([...Object.keys(hallByYm), ...Object.keys(delByYm)])
  for (const ym of [...yms].sort()) {
    const sheetY = String(sheetYear)
    if (!ym.startsWith(sheetY)) continue
    for (const kind of ['dine_in', 'delivery']) {
      const raw = kind === 'dine_in' ? hallByYm[ym] : delByYm[ym]
      if (raw == null) continue
      const { subtotal, vat, total } = vatFromInclusive7(raw)
      const idem = `choongman-xls|${sheetY}|${storeCode}|${ym}|${kind}`
      const idempotency_key_hash = sha256Hex(idem)
      const slug = storeCode.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'ST'
      const ymdCompact = ym.replace('-', '')
      const order_no = `XLS-${slug}-${ymdCompact}-${kind === 'dine_in' ? 'H' : 'D'}`
      const itemLabel = kind === 'dine_in' ? `엑셀집계(홀) ${storeName}` : `엑셀집계(배달) ${storeName}`
      const items_json = JSON.stringify([{ name: itemLabel, price: subtotal, qty: 1 }])
      rows.push({
        order_no,
        store_code: storeCode,
        order_type: kind,
        table_name: '',
        memo: `Choongman Thailand Sales xlsx ${sheetY} ${ym} (${kind})`,
        discount_amt: 0,
        discount_reason: '',
        delivery_fee: 0,
        packaging_fee: 0,
        items_json,
        subtotal,
        vat,
        total,
        status: 'completed',
        payment_cash: total,
        payment_card: 0,
        payment_qr: 0,
        payment_other: 0,
        payment_delivery_app: 0,
        delivery_payment_channel: null,
        member_id: null,
        member_no: null,
        coupon_code: null,
        coupon_discount_amt: 0,
        point_used: 0,
        point_earned: 0,
        guest_count: 0,
        delivery_app_code: null,
        created_at: endOfMonthBangkokIso(ym),
        idempotency_key_hash,
      })
    }
  }
  return rows
}

async function main() {
  loadEnvLocal()
  const { filePath, years, minCode, dryRun, deleteMonths, applyDelete } = parseArgs(process.argv.slice(2))

  if (deleteMonths.length > 0) {
    const supabase = createSupabase()
    console.log(applyDelete ? '삭제 실행 (--apply-delete)' : '미리보기만 (삭제하려면 --apply-delete)')
    await runDeleteImportedMonths(supabase, deleteMonths, applyDelete)
    process.exit(0)
  }

  if (!filePath) {
    console.error(
      '사용법: node scripts/import-choongman-thailand-sales-xlsx.cjs "<xlsx경로>" [--apply] [--years=2024,2025,2026]'
    )
    console.error('  또는: node scripts/import-choongman-thailand-sales-xlsx.cjs --delete-months=2025-03 [--apply-delete]')
    process.exit(1)
  }
  if (!fs.existsSync(filePath)) {
    console.error('파일 없음:', filePath)
    process.exit(1)
  }

  const wb = XLSX.readFile(filePath)
  let allRows = []
  const summary = []

  for (const sheetYear of years) {
    if (!wb.SheetNames.includes(sheetYear)) {
      console.warn('시트 없음, 스킵:', sheetYear)
      continue
    }
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetYear], { header: 1, defval: '' })
    const blocks = parseBlocks(data, minCode)
    for (const b of blocks) {
      const rows = buildInsertRows({ sheetYear, ...b })
      allRows = allRows.concat(rows)
      summary.push({ sheet: sheetYear, code: b.storeCode, name: b.storeName, n: rows.length })
    }
  }

  console.log('=== 요약 (매장별 삽입 행 수: 홀+배달 월별) ===')
  for (const s of summary) {
    console.log(`${s.sheet}\t${s.code}\t${s.name}\t${s.n} rows`)
  }
  console.log('총 행:', allRows.length, dryRun ? '(dry-run, DB 미기록)' : '(apply)')

  if (dryRun || allRows.length === 0) {
    if (allRows.length > 0) {
      console.log('샘플 1건:', JSON.stringify(allRows[0], null, 2))
    }
    process.exit(0)
  }

  const supabase = createSupabase()
  let ok = 0
  let skip = 0
  let err = 0

  for (const row of allRows) {
    const hash = row.idempotency_key_hash
    const { data: exist, error: e1 } = await supabase
      .from('pos_orders')
      .select('id')
      .eq('idempotency_key_hash', hash)
      .limit(1)
    if (e1) {
      console.error('조회 오류:', e1.message)
      err++
      continue
    }
    if (exist?.length) {
      skip++
      continue
    }
    const { error: e2 } = await supabase.from('pos_orders').insert(row)
    if (e2) {
      console.error('삽입 실패', row.order_no, e2.message)
      err++
    } else {
      ok++
    }
  }

  console.log('완료: 삽입', ok, '스킵(중복)', skip, '오류', err)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
