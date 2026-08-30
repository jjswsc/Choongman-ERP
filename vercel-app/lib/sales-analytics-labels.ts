/**
 * 매출 관리 차트·표 — API 고정 키 → 현재 언어 라벨
 */
import { i18n } from "@/lib/i18n"

const KO = i18n.ko as Record<string, string>

const DOW_KEYS = [
  "salesWeekdaySun",
  "salesWeekdayMon",
  "salesWeekdayTue",
  "salesWeekdayWed",
  "salesWeekdayThu",
  "salesWeekdayFri",
  "salesWeekdaySat",
] as const

export function translatePeriodAxisLabel(
  row: { key: string; label: string },
  groupBy: "year" | "month" | "week" | "day" | "dow" | "hour",
  tr: (key: string, fallback: string) => string
): string {
  if (groupBy === "year") {
    const y = row.key
    if (/^\d{4}$/.test(y)) return y
  }
  if (groupBy === "dow") {
    const i = Number(row.key)
    if (i >= 0 && i <= 6) {
      const k = DOW_KEYS[i]
      return tr(k, KO[k] ?? row.label)
    }
  }
  if (groupBy === "hour") {
    const h = parseInt(row.key, 10)
    if (!Number.isNaN(h) && h >= 0 && h <= 23) {
      const start = String(h).padStart(2, "0")
      return `${start}:00–${start}:59`
    }
  }
  return row.label
}

export function translateChannelKey(
  channelKey: string,
  tr: (key: string, fallback: string) => string
): string {
  const map: Record<string, string> = {
    dine_in: "salesChannelTypeDineIn",
    takeout: "salesChannelTypeTakeout",
    delivery: "salesChannelTypeDelivery",
    unknown: "salesChannelTypeUnknown",
  }
  const i18nKey = map[channelKey] ?? "salesChannelTypeUnknown"
  return tr(i18nKey, KO[i18nKey] ?? channelKey)
}

/** 배달앱 코드(pos_delivery_apps.code) → i18n */
export function translateDeliveryAppCode(
  code: string,
  tr: (key: string, fallback: string) => string
): string {
  return translateDeliveryPaymentChannelKey(code, tr)
}

/** Payment/Card — 배달 결제 채널 (Flowaccount Delivery 표) */
export function translateDeliveryPaymentChannelKey(
  channelKey: string,
  tr: (key: string, fallback: string) => string
): string {
  const c = String(channelKey ?? "").trim().toLowerCase().replace(/\s+/g, "_")
  if (!c || c === "_unspecified") {
    return tr("salesDeliveryPlatformUnspecified", "앱 미지정")
  }
  const map: Record<string, string> = {
    foodpanda: "salesDeliveryAppFoodpanda",
    grab: "posDeliveryAppGrab",
    lineman: "posDeliveryAppLineMan",
    line_man: "posDeliveryAppLineMan",
    robinhood: "salesDeliveryAppRobinhood",
    shopee: "posDeliveryAppShopee",
    shopee_pay: "posPaymentShopeePay",
    shopeepay: "posPaymentShopeePay",
    other: "salesPayOther",
    dine_in: "salesChannelTypeDineIn",
  }
  const i18nKey = map[c]
  if (i18nKey) return tr(i18nKey, KO[i18nKey] ?? c)
  return c.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())
}

/** Payment/Card — 카드·지갑·QR (Flowaccount Credit Card 표 + Kasikorn LINKPOS) */
export function translateCreditPaymentChannelKey(
  channelKey: string,
  tr: (key: string, fallback: string) => string
): string {
  const c = String(channelKey ?? "").trim().toLowerCase().replace(/\s+/g, "_")
  const map: Record<string, string> = {
    alipay: "posPaymentAlipay",
    gift_voucher: "salesCreditGiftVoucher",
    jcb: "salesCreditJcb",
    master_card: "salesCreditMasterCard",
    master: "salesCreditMasterCard",
    mastercard: "salesCreditMasterCard",
    online_banking: "salesCreditOnlineBanking",
    promptpay: "salesCreditPromptpay",
    unionpay: "posPaymentUnionPay",
    visa: "salesCreditVisa",
    wechat: "posPaymentWeChat",
    true_money_wallet: "posPaymentTrueMoney",
    truemoney: "posPaymentTrueMoney",
    line_pay: "posPaymentLinePay",
    shopee_pay: "posPaymentShopeePay",
    card_other: "salesPayCard",
    cash: "salesPayCash",
    card: "salesPayCard",
    qr: "salesPayQr",
    other: "salesPayOther",
    delivery_app: "salesPayDeliveryApp",
    crypto: "posPaymentCrypto",
    delivery_grab: "posDeliveryAppGrab",
    delivery_lineman: "posDeliveryAppLineMan",
    delivery_shopee: "posDeliveryAppShopee",
    delivery_dine_in: "salesChannelTypeDineIn",
    delivery_unknown: "salesDeliveryPlatformUnspecified",
    other_truemoney: "posPaymentTrueMoney",
    other_wechat: "posPaymentWeChat",
    other_alipay: "posPaymentAlipay",
    other_unionpay: "posPaymentUnionPay",
    other_linepay: "posPaymentLinePay",
    other_shopeepay: "posPaymentShopeePay",
    other_misc: "salesPayOther",
  }
  const i18nKey = map[c]
  if (i18nKey) return tr(i18nKey, KO[i18nKey] ?? c)
  if (c.startsWith("other_wallet_")) return tr("salesPayOther", "기타")
  return c.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())
}

export function translatePaymentKey(
  paymentKey: string,
  tr: (key: string, fallback: string) => string
): string {
  if (paymentKey.startsWith("delivery_")) {
    return translateCreditPaymentChannelKey(paymentKey, tr)
  }
  if (paymentKey.startsWith("other_")) {
    return translateCreditPaymentChannelKey(paymentKey, tr)
  }
  return translateCreditPaymentChannelKey(paymentKey, tr)
}
