import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  posPricingAdjustmentsFromPrinterSettingsDbRow,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'

const PRINTER_PRICING_SELECT =
  'vat_rate,vat_mode,service_rate,service_mode,card_rate,card_mode,card_base_mode,other_rate,other_mode,fee_stack_mode,fee_stack_order,payment_total_rounding_mode,round_payment_total_to_whole_baht'

/**
 * 매장 POS 프린터 설정의 VAT·봉사료·반올림 → 합석 total / Omni settleFast 재계산용.
 */
export async function loadPosPricingAdjustmentsForStore(
  storeCode: string
): Promise<PosPricingAdjustments> {
  const code = String(storeCode ?? '').trim()
  if (!code) return posPricingAdjustmentsFromPrinterSettingsDbRow(null)
  try {
    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(code)}`,
      { limit: 1, select: PRINTER_PRICING_SELECT }
    )) as Record<string, unknown>[] | null
    return posPricingAdjustmentsFromPrinterSettingsDbRow(
      (rows?.[0] as Parameters<typeof posPricingAdjustmentsFromPrinterSettingsDbRow>[0]) ?? null
    )
  } catch (e) {
    console.warn('loadPosPricingAdjustmentsForStore:', e)
    return posPricingAdjustmentsFromPrinterSettingsDbRow(null)
  }
}
