/**
 * Grab POS 주문 store_code 보정 (파트너 ID → ERP store_code).
 * Usage:
 *   node scripts/repair-grab-pos-store-codes.mjs          # dry-run
 *   node scripts/repair-grab-pos-store-codes.mjs --apply # DB 반영
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

function parseGrabStoreMap() {
  const out = {}
  const raw = String(process.env.GRAB_STORE_MAP_JSON ?? '').trim()
  if (raw) {
    try {
      Object.assign(out, JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }
  const portal = String(process.env.GRAB_PORTAL_MERCHANT_MAP ?? '').trim()
  for (const part of portal.split(/[,;\n]+/)) {
    const piece = part.trim()
    const eq = piece.indexOf('=')
    if (eq <= 0) continue
    const k = piece.slice(0, eq).trim()
    const v = piece.slice(eq + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}

function resolveErpStoreCodeFromGrabMap(seed, map) {
  const start = String(seed || '').trim()
  if (!start) return ''
  const chain = []
  const seen = new Set()
  let cur = start
  for (let guard = 0; guard < 16; guard++) {
    const nk = cur.trim().toLowerCase()
    if (!nk || seen.has(nk)) break
    seen.add(nk)
    chain.push(cur)
    const next = String(map[cur] ?? '').trim()
    if (!next || next.trim().toLowerCase() === nk) break
    cur = next
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const code = chain[i].trim()
    if (code && !/^\d{3,6}$/.test(code)) return code
  }
  return chain[chain.length - 1] || start
}

function listRepairs(map) {
  const repairs = new Map()
  const seeds = new Set(Object.keys(map).concat(Object.values(map)).map((s) => String(s || '').trim()).filter(Boolean))
  for (const code of seeds) {
    if (!/^\d{3,6}$/.test(code)) continue
    const erp = resolveErpStoreCodeFromGrabMap(code, map)
    if (erp && erp !== code && !/^\d{3,6}$/.test(erp)) repairs.set(code, erp)
  }
  return Array.from(repairs.entries()).map(([from, to]) => ({ from, to }))
}

function isGrabRow(row) {
  const memo = String(row.memo ?? '')
  if (/grab_order:/i.test(memo)) return true
  return String(row.delivery_app_code ?? '').trim().toLowerCase() === 'grab'
}

async function main() {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
    process.exit(1)
  }

  const map = parseGrabStoreMap()
  let repairs = listRepairs(map)
  const fromArg = process.argv.find((a) => a.startsWith('--from='))?.slice('--from='.length)
  const toArg = process.argv.find((a) => a.startsWith('--to='))?.slice('--to='.length)
  if (fromArg && toArg) {
    repairs = [{ from: fromArg.trim(), to: toArg.trim() }]
  }
  if (!repairs.length) {
    console.log('No partner→ERP repairs in GRAB_STORE_MAP_JSON / GRAB_PORTAL_MERCHANT_MAP (use --from=1042 --to="CM Silom")')
    process.exit(0)
  }
  console.log('Repairs from env:', repairs)

  const sb = createClient(url, key)
  const since = new Date(Date.now() - 3 * 86400_000).toISOString()
  let totalUpdated = 0

  for (const pair of repairs) {
    const { data, error } = await sb
      .from('pos_orders')
      .select('id,order_no,store_code,status,memo,delivery_app_code')
      .eq('store_code', pair.from)
      .gte('created_at', since)
      .in('status', ['pending', 'cooking', 'preparing', 'ready', 'paid', 'completed'])
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('query error:', error.message)
      process.exit(1)
    }

    for (const row of data || []) {
      if (!isGrabRow(row)) continue
      console.log(
        `${apply ? 'UPDATE' : 'WOULD'} #${row.id} ${row.order_no} ${row.store_code} -> ${pair.to} (${row.status})`
      )
      if (apply) {
        const stamp = `[GRAB_STORE_REPAIR ${new Date().toISOString()} script] ${pair.from} -> ${pair.to}`
        const nextMemo = row.memo ? `${row.memo}\n${stamp}` : stamp
        const { error: upErr } = await sb
          .from('pos_orders')
          .update({ store_code: pair.to, memo: nextMemo })
          .eq('id', row.id)
        if (upErr) {
          console.error(`fail #${row.id}:`, upErr.message)
        } else {
          totalUpdated += 1
        }
      } else {
        totalUpdated += 1
      }
    }
  }

  console.log(apply ? `Applied ${totalUpdated} update(s).` : `Dry-run: ${totalUpdated} row(s) would update. Pass --apply to commit.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
