import { qrGuestLangs, qrGuestT } from '@/lib/i18n-qr-table-guest'

export const QR_STAFF_CALL_BILL = 'bill'
export const QR_STAFF_CALL_HELP = 'help'
export const QR_STAFF_CALL_WATER = 'water'

export type QrStaffCallKind = 'bill' | 'help' | 'water' | 'other'

const CODE_ALIASES: Record<string, QrStaffCallKind> = {
  bill: 'bill',
  check: 'bill',
  cheque: 'bill',
  checkout: 'bill',
  help: 'help',
  water: 'water',
}

let labelMap: Map<string, QrStaffCallKind> | null = null

function guestLabelMap(): Map<string, QrStaffCallKind> {
  if (labelMap) return labelMap
  const next = new Map<string, QrStaffCallKind>()
  const put = (value: string, kind: QrStaffCallKind) => {
    const key = String(value || '').trim().toLowerCase()
    if (key) next.set(key, kind)
  }
  for (const lang of qrGuestLangs()) {
    put(qrGuestT(lang, 'callBill'), 'bill')
    put(qrGuestT(lang, 'callHelp'), 'help')
    put(qrGuestT(lang, 'callWater'), 'water')
  }
  labelMap = next
  return next
}

/** Guest → POS: stable codes, plus leftover localized notes from older clients. */
export function normalizeQrStaffCallKind(note?: string | null): QrStaffCallKind {
  const raw = String(note || '').trim()
  if (!raw) return 'other'
  const lower = raw.toLowerCase()
  if (CODE_ALIASES[lower]) return CODE_ALIASES[lower]
  return guestLabelMap().get(lower) || 'other'
}

export function qrStaffCallKindLabel(
  kind: QrStaffCallKind,
  t: (key: string, fallback: string) => string
): string {
  if (kind === 'bill') return t('qrTableSessionCallBill', '계산 요청')
  if (kind === 'help') return t('qrTableSessionCallHelp', '도움 요청')
  if (kind === 'water') return t('qrTableSessionCallWater', '물 요청')
  return t('qrTableSessionStaffCall', '손님 호출')
}

export function qrStaffCallKindShortLabel(
  kind: QrStaffCallKind,
  t: (key: string, fallback: string) => string
): string {
  if (kind === 'bill') return t('qrTableSessionCallBillShort', '계산')
  if (kind === 'help') return t('qrTableSessionCallHelpShort', '도움')
  if (kind === 'water') return t('qrTableSessionCallWaterShort', '물')
  return t('qrTableSessionStaffCallShort', '호출')
}
