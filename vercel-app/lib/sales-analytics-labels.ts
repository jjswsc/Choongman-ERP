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
  groupBy: "month" | "week" | "day" | "dow" | "hour",
  tr: (key: string, fallback: string) => string
): string {
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
  const c = String(code ?? "").trim().toLowerCase()
  if (!c || c === "_unspecified") {
    return tr("salesDeliveryPlatformUnspecified", "앱 미지정")
  }
  const map: Record<string, string> = {
    grab: "posDeliveryAppGrab",
    lineman: "posDeliveryAppLineMan",
    "line man": "posDeliveryAppLineMan",
    shopee: "posDeliveryAppShopee",
    foodpanda: "salesDeliveryAppFoodpanda",
  }
  const i18nKey = map[c]
  if (i18nKey) return tr(i18nKey, KO[i18nKey] ?? c)
  return c.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())
}

export function translatePaymentKey(
  paymentKey: string,
  tr: (key: string, fallback: string) => string
): string {
  const map: Record<string, string> = {
    cash: "salesPayCash",
    card: "salesPayCard",
    qr: "salesPayQr",
    other: "salesPayOther",
  }
  const i18nKey = map[paymentKey] ?? "salesPayOther"
  return tr(i18nKey, KO[i18nKey] ?? paymentKey)
}
