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
loadEnvLocal()
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
const sb = createClient(url, key)

const targets = process.argv.slice(2)
if (targets.length === 0) targets.push('SP-656', 'SP-657', 'GF-551')

if (targets[0] === '__cols') {
  const { data } = await sb.from('pos_orders').select('*').order('created_at', { ascending: false }).limit(1)
  console.log('COLUMNS:', Object.keys(data?.[0] || {}).join(', '))
  process.exit(0)
}

if (targets[0] === '__recent') {
  const term = targets[1] || 'PEPSI'
  const { data, error } = await sb
    .from('pos_orders')
    .select('id, order_no, store_code, table_name, delivery_app_code, status, items_json, created_at')
    .ilike('items_json', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(20)
  console.log('error', error?.message, 'rows', data?.length)
  for (const row of data || []) {
    let items = row.items_json
    if (typeof items === 'string') { try { items = JSON.parse(items) } catch {} }
    items = Array.isArray(items) ? items : []
    for (const it of items) {
      if (!String(it.name || '').toUpperCase().includes(term.toUpperCase())) continue
      const pi = it.promoItems ?? it.promo_items
      console.log(`#${row.id} ${row.created_at} ${row.store_code} app=${row.delivery_app_code} name="${it.name}" promoId=${it.promoId} promoItems=${Array.isArray(pi) ? pi.length : 'NONE'} note="${it.note ?? ''}"`)
    }
  }
  process.exit(0)
}

if (targets[0] === '__menus') {
  const ids = targets.slice(1).map(Number).filter((n) => n > 0)
  const { data } = await sb.from('pos_menus').select('id,name,code,category,category_main').in('id', ids)
  console.log(JSON.stringify(data, null, 2))
  process.exit(0)
}

if (targets[0] === '__promoitems') {
  const ids = targets.slice(1).map(Number).filter((n) => n > 0)
  if (!ids.length) ids.push(32, 52, 53)
  for (const pid of ids) {
    const { data: items } = await sb.from('pos_promo_items').select('*').eq('promo_id', pid).order('sort_order')
    const { data: promo } = await sb.from('pos_promos').select('id,code,name').eq('id', pid).maybeSingle()
    console.log('=== promo', pid, promo?.name, promo?.code, 'items', items?.length)
    for (const it of items || []) {
      const { data: menu } = await sb.from('pos_menus').select('name,code').eq('id', it.menu_id).maybeSingle()
      const optId = it.option_id
      let optName = ''
      if (optId) {
        const { data: opt } = await sb.from('pos_menu_options').select('name,option_code').eq('id', optId).maybeSingle()
        optName = opt ? `${opt.name} (${opt.option_code})` : String(optId)
      }
      console.log(`  menu=${menu?.name} opt=${optName || '-'} qty=${it.quantity} choice_group=${JSON.stringify(it.choice_group)} pick=${it.choice_pick_count}`)
    }
  }
  process.exit(0)
}

if (targets[0] === '__promo') {
  const term = targets[1] || 'PEPSI'
  const { data: promos, error: e1 } = await sb
    .from('pos_promos')
    .select('*')
    .ilike('name', `%${term}%`)
    .limit(20)
  console.log('pos_promos error', e1?.message)
  for (const p of promos || []) {
    console.log('PROMO id=', p.id, 'code=', p.code, 'name=', p.name, 'active=', p.is_active ?? p.active, 'cols=', Object.keys(p).join(','))
  }
  // also try a promo items table
  for (const tbl of ['pos_promo_items', 'pos_promotion_items', 'promo_items']) {
    if (!promos?.length) break
    for (const p of promos) {
      const { data: items, error } = await sb.from(tbl).select('*').eq('promo_id', p.id).limit(50)
      if (error) { console.log(`  (${tbl} err ${error.message})`); break }
      console.log(`  ${tbl} for promo ${p.id} (${p.name}): ${items?.length ?? 0} rows`)
      for (const it of items || []) console.log('    ', JSON.stringify(it))
    }
  }
  process.exit(0)
}

for (const t of targets) {
  const { data, error } = await sb
    .from('pos_orders')
    .select('*')
    .or(`order_no.ilike.%${t}%,table_name.ilike.%${t}%`)
    .order('created_at', { ascending: false })
    .limit(2)
  console.log('==== target', t, 'error', error?.message)
  for (const row of data || []) {
    if (targets[0] === '__cols') {
      console.log('COLUMNS:', Object.keys(row).join(', '))
      break
    }
    console.log('  id', row.id, 'order_no', row.order_no, 'store', row.store_code, 'table', row.table_name, 'app', row.delivery_app_code, 'status', row.status)
    console.log('    MEMO:', JSON.stringify(row.memo))
    let items = row.items_json
    if (typeof items === 'string') { try { items = JSON.parse(items) } catch {} }
    items = Array.isArray(items) ? items : []
    for (const it of items) {
      console.log('    ITEM', JSON.stringify(it))
    }
  }
}
process.exit(0)
