import type { RefObject } from 'react'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import type {
  CartOrderType,
  CartDeliveryApp,
  CartPanelPaymentPayload,
} from '@/components/pos/cart-panel-types'
import type { OrderItem } from '@/lib/pos-types'
import { parseBahtAmount } from '@/lib/baht-input-format'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import type { PosPaymentMethodItem } from '@/lib/api-client'
import { cartPanelDeliveryChannelContext } from '@/components/pos/cart-panel-delivery-brand'
import { resolveDeliveryPaymentChannelForSave } from '@/lib/pos-delivery-platform'

export interface BuildCartPanelOrderItemPayloadInput {
  orderType: CartOrderType
  i: OrderItem
  quantityOverride: number | undefined
  lineDiscountAmtOverride: number | undefined
  lineIdx: number | undefined
  lineDiscountSnapshot: number[]
  deliveryAppProp: CartDeliveryApp | undefined
}

export function buildCartPanelOrderItemPayload({
  orderType,
  i,
  quantityOverride,
  lineDiscountAmtOverride,
  lineIdx,
  lineDiscountSnapshot,
  deliveryAppProp,
}: BuildCartPanelOrderItemPayloadInput) {
  const orderTypeNorm = orderType === 'dine-in' ? 'dine_in' : orderType
  const lineNote = String(i.note ?? '').trim()
  const quantity =
    quantityOverride != null
      ? resolveCartLineQuantityForSave({ quantity: quantityOverride })
      : resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown })
  const menuIdLine = String(i.menuId ?? '').trim()
  const menuId1Line = String(i.menuId1 ?? '').trim()
  const menuId2Line = String(i.menuId2 ?? '').trim()
  const optionIdLine = String(i.optionId ?? '').trim()
  const optionCodeLine = String(i.optionCode ?? '').trim()
  const lineDiscountAmt =
    lineDiscountAmtOverride != null
      ? Math.max(0, Number(lineDiscountAmtOverride) || 0)
      : lineIdx != null && lineIdx >= 0
        ? Math.max(0, Number(lineDiscountSnapshot[lineIdx] ?? 0) || 0)
        : 0
  return {
    id: i.id,
    name: i.name,
    price: i.price,
    quantity,
    orderType: orderTypeNorm,
    ...(lineDiscountAmt > 0.0001 ? { lineDiscountAmt } : {}),
    ...(lineNote ? { note: lineNote } : {}),
    ...(menuIdLine ? { menuId: menuIdLine } : {}),
    ...(menuId1Line ? { menuId1: menuId1Line } : {}),
    ...(menuId2Line ? { menuId2: menuId2Line } : {}),
    ...(optionIdLine ? { optionId: optionIdLine } : {}),
    ...(optionCodeLine ? { optionCode: optionCodeLine } : {}),
    ...(orderType === 'delivery' && deliveryAppProp ? { deliveryAppCode: String(deliveryAppProp) } : {}),
    ...(i.promoId
      ? {
          promoId: i.promoId,
          ...(i.promoCode ? { promoCode: i.promoCode } : {}),
          ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
        }
      : {}),
  }
}

export interface BuildCartPanelPaymentOtherBreakdownInput {
  useAdminPaymentLines: boolean
  adminPaymentLines: PosPaymentMethodItem[]
  payAdminLineAmounts: Record<string, string>
  payTrueMoney: string
  payWeChat: string
  payAlipay: string
  payUnionPay: string
  payLinePay: string
  payShopeePay: string
  payOther: string
}

export function buildCartPanelPaymentOtherBreakdown({
  useAdminPaymentLines,
  adminPaymentLines,
  payAdminLineAmounts,
  payTrueMoney,
  payWeChat,
  payAlipay,
  payUnionPay,
  payLinePay,
  payShopeePay,
  payOther,
}: BuildCartPanelPaymentOtherBreakdownInput): PosPaymentOtherBreakdown | undefined {
  const r2 = (n: number) => Math.round(Math.max(0, n) * 100) / 100
  if (useAdminPaymentLines) {
    const admin: Record<string, number> = {}
    const adminLabels: Record<string, string> = {}
    for (const line of adminPaymentLines) {
      const v = r2(parseBahtAmount(payAdminLineAmounts[line.id] || '0') || 0)
      if (v <= 0.005) continue
      const id = String(line.id)
      admin[id] = v
      const name = String(line.name || '').trim()
      if (name) adminLabels[id] = name
    }
    if (Object.keys(admin).length === 0) return undefined
    return Object.keys(adminLabels).length > 0 ? { admin, adminLabels } : { admin }
  }
  const out: PosPaymentOtherBreakdown = {}
  const tm = r2(parseBahtAmount(payTrueMoney) || 0)
  const wc = r2(parseBahtAmount(payWeChat) || 0)
  const ap = r2(parseBahtAmount(payAlipay) || 0)
  const up = r2(parseBahtAmount(payUnionPay) || 0)
  const lp = r2(parseBahtAmount(payLinePay) || 0)
  const sp = r2(parseBahtAmount(payShopeePay) || 0)
  const misc = r2(parseBahtAmount(payOther) || 0)
  if (tm > 0.005) out.trueMoney = tm
  if (wc > 0.005) out.weChat = wc
  if (ap > 0.005) out.alipay = ap
  if (up > 0.005) out.unionPay = up
  if (lp > 0.005) out.linePay = lp
  if (sp > 0.005) out.shopeePay = sp
  if (misc > 0.005) out.misc = misc
  if (
    !out.trueMoney &&
    !out.weChat &&
    !out.alipay &&
    !out.unionPay &&
    !out.linePay &&
    !out.shopeePay &&
    !out.misc
  ) {
    return undefined
  }
  return out
}

export interface BuildCartPanelPaymentSnapshotInput {
  payDeliveryApp: string
  deliveryAppProp: CartDeliveryApp | undefined
  deliveryOrderNoProp: string | undefined
  paymentTableNameOverride: string | null
  customerMemo: string
  deliveryPaymentChannel: "grab" | "lineman" | "shopee"
  useAdminPaymentLines: boolean
  adminConfiguredWalletSum: number
  legacyWalletPaymentSum: number
  buildPaymentOtherBreakdownSnapshot: () => PosPaymentOtherBreakdown | undefined
  payCash: string
  cashTenderedRef: RefObject<string>
  cashTendered: string
  payCard: string
  payPromptPay: string
  payCrypto: string
  payQrType: "THAI_QR" | "EDC" | "CREDIT_CARD"
  cryptoMeta: Record<string, unknown> | null
}

export function buildCartPanelPaymentSnapshot({
  payDeliveryApp,
  deliveryAppProp,
  deliveryOrderNoProp,
  paymentTableNameOverride,
  customerMemo,
  deliveryPaymentChannel,
  useAdminPaymentLines,
  adminConfiguredWalletSum,
  legacyWalletPaymentSum,
  buildPaymentOtherBreakdownSnapshot,
  payCash,
  cashTenderedRef,
  cashTendered,
  payCard,
  payPromptPay,
  payCrypto,
  payQrType,
  cryptoMeta,
}: BuildCartPanelPaymentSnapshotInput): CartPanelPaymentPayload {
  const payDel = parseBahtAmount(payDeliveryApp) || 0
  const channelCtx = cartPanelDeliveryChannelContext({
    deliveryAppProp,
    deliveryOrderNoProp,
    paymentTableNameOverride,
    customerMemo,
    deliveryPaymentChannel,
  })
  const deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'> =
    payDel > 0
      ? {
          paymentDeliveryApp: payDel,
          deliveryPaymentChannel: resolveDeliveryPaymentChannelForSave({
            ...channelCtx,
            paymentDeliveryApp: payDel,
          }),
        }
      : { paymentDeliveryApp: 0, deliveryPaymentChannel: null }
  const paymentOtherSum = useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum
  const ob = buildPaymentOtherBreakdownSnapshot()
  const cashPay = parseBahtAmount(payCash) || 0
  const tenderedRaw =
    parseBahtAmount(cashTenderedRef.current) || parseBahtAmount(cashTendered)
  const nonCashPay =
    (parseBahtAmount(payCard) || 0) +
    (parseBahtAmount(payPromptPay) || 0) +
    (useAdminPaymentLines ? adminConfiguredWalletSum : legacyWalletPaymentSum) +
    (parseBahtAmount(payDeliveryApp) || 0) +
    (parseBahtAmount(payCrypto) || 0)
  const cashOnlyPay = nonCashPay <= 0.005 && cashPay > 0.005
  const effectiveTendered = tenderedRaw > 0.005 ? tenderedRaw : cashOnlyPay ? cashPay : 0
  return {
    paymentCash: cashPay,
    paymentCard: parseBahtAmount(payCard) || 0,
    paymentQr: parseBahtAmount(payPromptPay) || 0,
    paymentQrType: payQrType === 'EDC' ? 'THAI_QR' : payQrType,
    paymentQrShowOnEdc: payQrType === 'EDC',
    paymentOther: paymentOtherSum,
    ...(ob ? { paymentOtherBreakdown: ob } : {}),
    ...deliveryPayPart,
    paymentCrypto: parseBahtAmount(payCrypto) || 0,
    ...(cryptoMeta ? { paymentCryptoMeta: cryptoMeta } : {}),
    ...(effectiveTendered > 0.005 ? { paymentCashTendered: effectiveTendered } : {}),
  }
}
