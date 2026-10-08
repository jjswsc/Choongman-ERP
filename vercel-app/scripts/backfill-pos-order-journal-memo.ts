/**
 * 기존 pos_order 분개 적요에 매장·주문번호·결제·채널을 채워 일별장부에서 구분 가능하게 한다.
 * npx tsx scripts/backfill-pos-order-journal-memo.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { buildPosOrderCompletedJournalMemo, POS_ORDER_COMPLETED_MEMO_PREFIX } from '../lib/pos-order-journal-memo'

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('missing env')
  process.exit(1)
}

const headers: Record<string, string> = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

async function page<T>(path: string, offset: number, limit: number): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { ...headers, Range: `${offset}-${offset + limit - 1}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text.slice(0, 300))
  return text ? (JSON.parse(text) as T[]) : []
}

async function main() {
  let updated = 0
  let skipped = 0
  let offset = 0
  for (;;) {
    const heads = await page<{
      id?: number
      source_id?: number
      memo?: string | null
      book?: string | null
    }>(
      `journal_entries?select=id,source_id,memo,book&source_type=eq.pos_order&accounting_date=gte.2026-07-01&order=id.asc`,
      offset,
      100
    )
    if (!heads.length) break
    for (const h of heads) {
      const jid = Number(h.id || 0)
      const oid = Number(h.source_id || 0)
      const cur = String(h.memo || '').trim()
      if (!jid || !oid) continue
      if (cur.includes('|')) {
        skipped += 1
        continue
      }
      const orders = (await rest(
        `pos_orders?id=eq.${oid}&select=id,order_no,store_code,order_type,delivery_app_code,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app&limit=1`
      )) as {
        order_no?: string
        store_code?: string
        order_type?: string
        delivery_app_code?: string
        payment_cash?: number
        payment_card?: number
        payment_qr?: number
        payment_other?: number
        payment_delivery_app?: number
      }[]
      const o = orders?.[0]
      if (!o) {
        skipped += 1
        continue
      }
      const prefix =
        cur.startsWith('POS') || cur.includes('자동분개') || cur.includes('백필')
          ? cur || POS_ORDER_COMPLETED_MEMO_PREFIX
          : POS_ORDER_COMPLETED_MEMO_PREFIX
      const next = buildPosOrderCompletedJournalMemo(
        {
          storeName: o.store_code,
          orderNo: o.order_no,
          orderType: o.order_type,
          deliveryAppCode: o.delivery_app_code,
          paymentCash: o.payment_cash,
          paymentCard: o.payment_card,
          paymentQr: o.payment_qr,
          paymentOther: o.payment_other,
          paymentDeliveryApp: o.payment_delivery_app,
        },
        prefix
      )
      if (next === cur) {
        skipped += 1
        continue
      }
      await rest(`journal_entries?id=eq.${jid}`, {
        method: 'PATCH',
        body: JSON.stringify({ memo: next }),
      })
      updated += 1
    }
    console.log('offset', offset, { updated, skipped })
    if (heads.length < 100) break
    offset += 100
  }
  console.log({ updated, skipped })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
