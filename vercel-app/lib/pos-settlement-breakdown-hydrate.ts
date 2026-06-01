import { LEGACY_QR_BREAKDOWN_KEYS_AS_OTHER } from '@/lib/pos-payment-default-keys'

const legacyOtherInQr = new Set<string>(
  (LEGACY_QR_BREAKDOWN_KEYS_AS_OTHER as readonly string[]).map((k) =>
    String(k).toLowerCase().replace(/\s+/g, '')
  )
)

function normKey(k: string): string {
  return String(k || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

/**
 * 저장된 결산 + 현재 매장의 QR/기타 키 목록으로 폼 state용 breakdown 생성.
 * 예전에 qr_breakdown에만 있던 지갑 금액은 기타 쪽으로 옮깁니다.
 */
export function hydrateSettlementQrOtherBreakdowns(
  single: {
    qrBreakdown?: Record<string, number>
    otherBreakdown?: Record<string, number>
  },
  qrKeys: string[],
  otherKeys: string[]
): { qrBreakdown: Record<string, string>; otherBreakdown: Record<string, string> } {
  const qrSet = new Set(qrKeys)
  const otherSet = new Set(otherKeys)
  const fallbackOther =
    otherKeys.find((k) => k === 'Other') ?? otherKeys[0] ?? 'Other'

  const qb: Record<string, string> = Object.fromEntries(qrKeys.map((k) => [k, '']))
  const ob: Record<string, string> = Object.fromEntries(otherKeys.map((k) => [k, '']))

  const addOb = (key: string, n: number) => {
    if (otherSet.has(key)) {
      ob[key] = String((parseFloat(ob[key] || '0') || 0) + n)
      return
    }
    if (otherSet.has(fallbackOther)) {
      ob[fallbackOther] = String((parseFloat(ob[fallbackOther] || '0') || 0) + n)
    }
  }

  const rawO = single.otherBreakdown ?? {}
  for (const [k, v] of Object.entries(rawO)) {
    const n = Number(v) || 0
    if (n === 0) continue
    if (otherSet.has(k)) {
      ob[k] = String((parseFloat(ob[k] || '0') || 0) + n)
    } else {
      addOb(fallbackOther, n)
    }
  }

  const rawQ = single.qrBreakdown ?? {}
  for (const [k, v] of Object.entries(rawQ)) {
    const n = Number(v) || 0
    if (n === 0) continue

    if (otherSet.has(k)) {
      addOb(k, n)
      continue
    }
    if (qrSet.has(k)) {
      qb[k] = String((parseFloat(qb[k] || '0') || 0) + n)
      continue
    }
    if (k === 'QR' && qrSet.has('PromptPay')) {
      qb.PromptPay = String((parseFloat(qb.PromptPay || '0') || 0) + n)
      continue
    }
    if (legacyOtherInQr.has(normKey(k))) {
      const tgt = otherSet.has(k) ? k : fallbackOther
      if (otherSet.has(tgt)) {
        ob[tgt] = String((parseFloat(ob[tgt] || '0') || 0) + n)
      } else {
        addOb(fallbackOther, n)
      }
      continue
    }

    if (!(k in qb)) qb[k] = ''
    qb[k] = String((parseFloat(qb[k] || '0') || 0) + n)
  }

  return { qrBreakdown: qb, otherBreakdown: ob }
}
