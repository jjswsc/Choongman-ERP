import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import {
  posPricingAdjustmentsFromPrinterSettingsDbRow,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'
import { resolvePosStoreFilterCandidates } from '@/lib/pos-store-filter-candidates'

const PRINTER_PRICING_SELECT =
  'vat_rate,vat_mode,service_rate,service_mode,card_rate,card_mode,card_base_mode,other_rate,other_mode,fee_stack_mode,fee_stack_order,payment_total_rounding_mode,round_payment_total_to_whole_baht'

function adjustmentsLookConfigured(adj: PosPricingAdjustments): boolean {
  return (
    Math.max(0, Number(adj.serviceRate) || 0) > 0.0001 ||
    Math.max(0, Number(adj.vatRate) || 0) > 0.0001 ||
    Math.max(0, Number(adj.cardRate) || 0) > 0.0001 ||
    Math.max(0, Number(adj.otherRate) || 0) > 0.0001
  )
}

/**
 * 매장 POS 프린터 설정의 VAT·봉사료·반올림 → 합석 total / Omni settleFast 재계산용.
 * 없는 컬럼(반올림 등 미배포)은 빼고 재시도 — 컬럼 하나 때문에 VAT/봉사료가 통째로 기본값 되면
 * QR·합석 후 결제액(704)이 DB 합계(598)를 넘는 `payment_exceeds_total`이 난다.
 * 매장코드 별칭(숫자↔표시명)도 순회해 요율 행을 찾는다.
 */
export async function loadPosPricingAdjustmentsForStore(
  storeCode: string
): Promise<PosPricingAdjustments> {
  const code = String(storeCode ?? '').trim()
  if (!code) return posPricingAdjustmentsFromPrinterSettingsDbRow(null)
  try {
    const candidates = await resolvePosStoreFilterCandidates(code).catch(() => [] as string[])
    const codes = [
      ...new Set(
        [code, ...candidates]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      ),
    ]
    let fallback = posPricingAdjustmentsFromPrinterSettingsDbRow(null)
    for (const c of codes) {
      const rows = (await supabaseSelectFilterStrippingUnknownColumns(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(c)}`,
        { limit: 1, select: PRINTER_PRICING_SELECT },
        'loadPosPricingAdjustmentsForStore'
      )) as Record<string, unknown>[] | null
      const row = rows?.[0]
      if (!row) continue
      const adj = posPricingAdjustmentsFromPrinterSettingsDbRow(
        row as Parameters<typeof posPricingAdjustmentsFromPrinterSettingsDbRow>[0]
      )
      if (adjustmentsLookConfigured(adj)) return adj
      fallback = adj
    }
    return fallback
  } catch (e) {
    console.warn('loadPosPricingAdjustmentsForStore:', e)
    return posPricingAdjustmentsFromPrinterSettingsDbRow(null)
  }
}
