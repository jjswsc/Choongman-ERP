import type { LangCode } from '@/lib/lang-context'
import type { PosPrinterSettings } from '@/lib/api-client'
import type { KitchenSlipGroupLabels } from '@/lib/pos-kitchen-slip-routing'
import { resolvePosPrintLang } from '@/lib/pos-print-lang'
import { getRuntimeUiString } from '@/lib/runtime-ui-strings'

/** 주방 슬립 문구·날짜 로케일: `kitchenSlipPrintLang` 미설정 시 POS 화면 언어 */
export function kitchenSlipPrintI18n(
  settings: Pick<PosPrinterSettings, 'kitchenSlipPrintLang'>,
  uiLang: LangCode
) {
  const lang = resolvePosPrintLang(settings.kitchenSlipPrintLang, uiLang)
  const t = (k: string) => getRuntimeUiString(lang, k)
  const kLabels: KitchenSlipGroupLabels = {
    unified: t('posKitchenOrder') || '주방 주문서',
    kitchen1: t('posKitchen1') || '주방 1',
    kitchen2: t('posKitchen2') || '주방 2',
    kitchen3: t('posKitchen3') || '주방 3',
  }
  const orderTypeLabels: Record<string, string> = {
    dine_in: t('posOrderTypeDineIn') ?? '매장',
    takeout: t('posOrderTypeTakeout') ?? '포장',
    delivery: t('posOrderTypeDelivery') ?? '배달',
  }
  return { lang, t, kLabels, orderTypeLabels }
}
