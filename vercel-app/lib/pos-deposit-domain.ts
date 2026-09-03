import { canonicalMemberPhoneForStorage } from '@/lib/member-phone-lookup'
import { getBangkokDateTimeString, parseBangkokWallClockToMs } from '@/lib/bangkok-time'

export const POS_DEPOSIT_LIABILITY_ACCOUNT = '2160'
export const POS_DEPOSIT_FORFEIT_INCOME_ACCOUNT = '4191'

export const POS_DEPOSIT_TENDERS = ['cash', 'qr', 'transfer'] as const
export type PosDepositTender = (typeof POS_DEPOSIT_TENDERS)[number]

export const POS_DEPOSIT_POLICIES = ['refundable', 'non_refundable', 'staff_choice'] as const
export type PosDepositPolicy = (typeof POS_DEPOSIT_POLICIES)[number]

export const POS_DEPOSIT_LEDGER_KINDS = ['receive', 'apply', 'refund', 'forfeit'] as const
export type PosDepositLedgerKind = (typeof POS_DEPOSIT_LEDGER_KINDS)[number]

export const POS_DEPOSIT_DEFAULT_CANCEL_HOURS = 24

const MONEY_EPS = 0.02

function round2(n: unknown): number {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100
}

export function coercePosDepositTender(raw: unknown): PosDepositTender {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'qr' || v === 'promptpay' || v === 'thai_qr') return 'qr'
  if (v === 'transfer' || v === 'bank' || v === 'wire') return 'transfer'
  return 'cash'
}

export function coercePosDepositPolicy(raw: unknown): PosDepositPolicy {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'refundable') return 'refundable'
  if (v === 'non_refundable' || v === 'non-refundable' || v === 'forfeit') return 'non_refundable'
  return 'staff_choice'
}

export function coercePosDepositLedgerKind(raw: unknown): PosDepositLedgerKind | null {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'receive' || v === 'apply' || v === 'refund' || v === 'forfeit') return v
  return null
}

export function posDepositLedgerSignedDelta(kind: PosDepositLedgerKind, amount: number): number {
  const amt = round2(amount)
  if (kind === 'receive') return amt
  return -amt
}

export function posDepositBalanceFromLedger(
  rows: Array<{ kind?: unknown; amount?: unknown }>
): number {
  let sum = 0
  for (const row of rows) {
    const kind = coercePosDepositLedgerKind(row.kind)
    if (!kind) continue
    sum += posDepositLedgerSignedDelta(kind, Number(row.amount) || 0)
  }
  return round2(sum)
}

/** 방문 시 받을 잔금 = 음식 합계 − 보유 선수금 */
export function posOrderCollectableDue(total: number, depositAmt: number): number {
  return round2(Math.max(0, round2(total) - round2(depositAmt)))
}

export function isPosOrderCollectableSettled(collectableDue: number, paymentSum: number): boolean {
  const due = round2(collectableDue)
  const pay = round2(paymentSum)
  if (due <= MONEY_EPS) return true
  return pay + MONEY_EPS >= due
}

export function isPosAdvanceOrder(row: {
  isAdvance?: unknown
  is_advance?: unknown
  scheduledAt?: unknown
  scheduled_at?: unknown
}): boolean {
  if (row.isAdvance === true || row.is_advance === true) return true
  const scheduled = String(row.scheduledAt ?? row.scheduled_at ?? '').trim()
  return Boolean(scheduled)
}

export function isUnfulfilledAdvanceOrder(row: {
  isAdvance?: unknown
  is_advance?: unknown
  scheduledAt?: unknown
  scheduled_at?: unknown
  advanceCheckedInAt?: unknown
  advance_checked_in_at?: unknown
  status?: unknown
}): boolean {
  if (!isPosAdvanceOrder(row)) return false
  const checked = String(row.advanceCheckedInAt ?? row.advance_checked_in_at ?? '').trim()
  if (checked) return false
  const st = String(row.status ?? '').trim().toLowerCase()
  if (st === 'cancelled' || st === 'canceled' || st === 'refunded' || st === 'completed' || st === 'paid') {
    return false
  }
  return true
}

/** 홀 바닥도 점유·즉시 포장 대기열에서 빼기 */
export function shouldExcludeAdvanceFromLiveFloor(row: {
  isAdvance?: unknown
  is_advance?: unknown
  scheduledAt?: unknown
  scheduled_at?: unknown
  advanceCheckedInAt?: unknown
  advance_checked_in_at?: unknown
  status?: unknown
}): boolean {
  return isUnfulfilledAdvanceOrder(row)
}

/** 매출·마감 집계 — 완납(paid/completed) 전 선주문은 매출이 아님. ready만으로 올리지 않음. */
export function shouldExcludeAdvanceFromSalesAggregate(row: {
  isAdvance?: unknown
  is_advance?: unknown
  scheduledAt?: unknown
  scheduled_at?: unknown
  status?: unknown
}): boolean {
  if (!isPosAdvanceOrder(row)) return false
  const st = String(row.status ?? '').trim().toLowerCase()
  return st !== 'paid' && st !== 'completed'
}

/** 시재: 현금 선수금 수령 − 현금 환불. apply/forfeit·QR/이체는 시재 현금이 아님. */
export function posDepositCashDrawerDelta(
  rows: Array<{ kind?: unknown; amount?: unknown; tender?: unknown }>
): number {
  let sum = 0
  for (const row of rows) {
    if (coercePosDepositTender(row.tender) !== 'cash') continue
    const kind = coercePosDepositLedgerKind(row.kind)
    if (!kind) continue
    const amt = round2(row.amount)
    if (kind === 'receive') sum += amt
    else if (kind === 'refund') sum -= amt
  }
  return round2(sum)
}

function paymentSumFromOrderLike(row: {
  paymentCash?: unknown
  payment_cash?: unknown
  paymentCard?: unknown
  payment_card?: unknown
  paymentQr?: unknown
  payment_qr?: unknown
  paymentOther?: unknown
  payment_other?: unknown
  paymentDeliveryApp?: unknown
  payment_delivery_app?: unknown
  paymentCrypto?: unknown
  payment_crypto?: unknown
}): number {
  return round2(
    (Number(row.paymentCash ?? row.payment_cash ?? 0) || 0) +
      (Number(row.paymentCard ?? row.payment_card ?? 0) || 0) +
      (Number(row.paymentQr ?? row.payment_qr ?? 0) || 0) +
      (Number(row.paymentOther ?? row.payment_other ?? 0) || 0) +
      (Number(row.paymentDeliveryApp ?? row.payment_delivery_app ?? 0) || 0) +
      (Number(row.paymentCrypto ?? row.payment_crypto ?? 0) || 0)
  )
}

/** 결제 영수증 มัดจำ 차감액. 적용 후 스냅샷이 0이면 total − payment로 추정. */
export function posOrderDepositAppliedForReceipt(row: {
  isAdvance?: unknown
  is_advance?: unknown
  scheduledAt?: unknown
  scheduled_at?: unknown
  depositAmt?: unknown
  deposit_amt?: unknown
  total?: unknown
  paymentCash?: unknown
  payment_cash?: unknown
  paymentCard?: unknown
  payment_card?: unknown
  paymentQr?: unknown
  payment_qr?: unknown
  paymentOther?: unknown
  payment_other?: unknown
  paymentDeliveryApp?: unknown
  payment_delivery_app?: unknown
  paymentCrypto?: unknown
  payment_crypto?: unknown
}): number {
  const held = round2(row.depositAmt ?? row.deposit_amt)
  if (held > MONEY_EPS) return held
  if (!isPosAdvanceOrder(row)) return 0
  const total = round2(row.total)
  const pay = paymentSumFromOrderLike(row)
  return round2(Math.max(0, total - pay))
}

export function shouldEnqueueKitchenPrintForAdvance(input: {
  isAdvance?: boolean
  advanceCheckedInAt?: string | null
}): boolean {
  if (!input.isAdvance) return true
  return Boolean(String(input.advanceCheckedInAt ?? '').trim())
}

export type PosDepositCancelDisposition = 'refund' | 'forfeit'

export function resolveDefaultDepositDisposition(params: {
  policy: PosDepositPolicy | string | null | undefined
  scheduledAt?: string | null
  cancelHours?: number | null
  nowMs?: number
}): PosDepositCancelDisposition {
  const policy = coercePosDepositPolicy(params.policy)
  if (policy === 'non_refundable') return 'forfeit'
  if (policy === 'refundable') return 'refund'
  const hours = Math.max(0, Math.trunc(Number(params.cancelHours ?? POS_DEPOSIT_DEFAULT_CANCEL_HOURS) || 0))
  const scheduledMs = parseBangkokWallClockToMs(params.scheduledAt)
  if (scheduledMs == null) return 'refund'
  const now = Number.isFinite(params.nowMs) ? Number(params.nowMs) : Date.now()
  const cutoff = scheduledMs - hours * 60 * 60 * 1000
  return now >= cutoff ? 'forfeit' : 'refund'
}

export function normalizePosGuestPhone(raw: unknown): string {
  return canonicalMemberPhoneForStorage(String(raw ?? ''))
}

export function isValidPosGuestPhone(raw: unknown): boolean {
  const phone = normalizePosGuestPhone(raw)
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8
}

export function parseAdvanceScheduledAtIso(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const ms = parseBangkokWallClockToMs(s)
  if (ms == null) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function formatAdvanceScheduledAtBangkok(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const ms = parseBangkokWallClockToMs(s)
  if (ms == null) return s
  return getBangkokDateTimeString(new Date(ms)).slice(0, 16)
}

export type PosAdvanceDepositBody = {
  isAdvance: boolean
  depositAmt: number
  depositTender: PosDepositTender
  depositPolicy: PosDepositPolicy
  depositCancelHours: number
  scheduledAtIso: string
  guestPhone: string
  guestName: string
}

export type PosDepositReceiveBody = {
  depositAmt: number
  depositTender: PosDepositTender
  memberId: number | null
  guestPhone: string
  guestName: string
}

/** 메뉴·주문 없이 예약금만 수령. 회원 또는 (이름+전화). */
export function parsePosDepositReceiveFromBody(
  body: Record<string, unknown>
): { ok: true; value: PosDepositReceiveBody } | { ok: false; message: string } {
  const depositAmt = round2(body.depositAmt ?? body.deposit_amt ?? body.amount)
  if (depositAmt <= MONEY_EPS) {
    return { ok: false, message: 'deposit_amount_required' }
  }
  const memberIdRaw = Math.trunc(Number(body.memberId ?? body.member_id ?? 0) || 0)
  const memberId = memberIdRaw > 0 ? memberIdRaw : null
  const guestPhone = normalizePosGuestPhone(body.guestPhone ?? body.guest_phone ?? body.phone)
  const guestName = String(body.guestName ?? body.guest_name ?? body.name ?? '')
    .trim()
    .slice(0, 120)
  if (!memberId) {
    if (!isValidPosGuestPhone(guestPhone)) {
      return { ok: false, message: 'deposit_phone_required' }
    }
    if (!guestName) {
      return { ok: false, message: 'deposit_name_required' }
    }
  }
  return {
    ok: true,
    value: {
      depositAmt,
      depositTender: coercePosDepositTender(body.depositTender ?? body.deposit_tender ?? body.tender),
      memberId,
      guestPhone,
      guestName,
    },
  }
}

export function parsePosAdvanceDepositFromBody(
  body: Record<string, unknown>,
  orderTotal: number
): { ok: true; value: PosAdvanceDepositBody } | { ok: false; message: string } {
  const flag =
    body.isAdvance === true ||
    body.is_advance === true ||
    String(body.isAdvance ?? body.is_advance ?? '').trim() === '1'
  if (!flag) {
    return {
      ok: true,
      value: {
        isAdvance: false,
        depositAmt: 0,
        depositTender: 'cash',
        depositPolicy: 'staff_choice',
        depositCancelHours: POS_DEPOSIT_DEFAULT_CANCEL_HOURS,
        scheduledAtIso: '',
        guestPhone: '',
        guestName: '',
      },
    }
  }

  const depositAmt = round2(body.depositAmt ?? body.deposit_amt)
  const total = round2(orderTotal)
  if (depositAmt <= MONEY_EPS) {
    return { ok: false, message: 'deposit_amount_required' }
  }
  if (total > MONEY_EPS && depositAmt > total + MONEY_EPS) {
    return { ok: false, message: 'deposit_exceeds_total' }
  }

  const scheduledAtIso = parseAdvanceScheduledAtIso(body.scheduledAt ?? body.scheduled_at)
  if (!scheduledAtIso) {
    return { ok: false, message: 'deposit_scheduled_at_required' }
  }
  const scheduledMs = new Date(scheduledAtIso).getTime()
  const maxMs = Date.now() + 366 * 24 * 60 * 60 * 1000
  if (scheduledMs > maxMs) {
    return { ok: false, message: 'deposit_scheduled_at_too_far' }
  }

  const guestPhone = normalizePosGuestPhone(body.guestPhone ?? body.guest_phone)
  if (!isValidPosGuestPhone(guestPhone)) {
    return { ok: false, message: 'deposit_phone_required' }
  }

  const guestName = String(body.guestName ?? body.guest_name ?? '').trim().slice(0, 120)
  const cancelHoursRaw = Number(body.depositCancelHours ?? body.deposit_cancel_hours)
  const depositCancelHours = Number.isFinite(cancelHoursRaw)
    ? Math.max(0, Math.min(168, Math.trunc(cancelHoursRaw)))
    : POS_DEPOSIT_DEFAULT_CANCEL_HOURS

  return {
    ok: true,
    value: {
      isAdvance: true,
      depositAmt,
      depositTender: coercePosDepositTender(body.depositTender ?? body.deposit_tender),
      depositPolicy: coercePosDepositPolicy(body.depositPolicy ?? body.deposit_policy),
      depositCancelHours,
      scheduledAtIso,
      guestPhone,
      guestName,
    },
  }
}

export function mapPosOrderAdvanceFieldsFromRow(row: Record<string, unknown>): {
  scheduledAt?: string
  isAdvance?: boolean
  guestPhone?: string
  guestName?: string
  depositAmt?: number
  depositTender?: PosDepositTender
  depositPolicy?: PosDepositPolicy
  depositCancelHours?: number
  advanceCheckedInAt?: string
} {
  const scheduledAt = String(row.scheduled_at ?? row.scheduledAt ?? '').trim()
  const isAdvance = row.is_advance === true || row.isAdvance === true || Boolean(scheduledAt)
  const guestPhone = String(row.guest_phone ?? row.guestPhone ?? '').trim()
  const guestName = String(row.guest_name ?? row.guestName ?? '').trim()
  const depositAmt = round2(row.deposit_amt ?? row.depositAmt)
  const tenderRaw = String(row.deposit_tender ?? row.depositTender ?? '').trim()
  const policyRaw = String(row.deposit_policy ?? row.depositPolicy ?? '').trim()
  const cancelHours = Math.trunc(Number(row.deposit_cancel_hours ?? row.depositCancelHours) || 0)
  const checkedIn = String(row.advance_checked_in_at ?? row.advanceCheckedInAt ?? '').trim()
  return {
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(isAdvance ? { isAdvance: true } : {}),
    ...(guestPhone ? { guestPhone } : {}),
    ...(guestName ? { guestName } : {}),
    ...(depositAmt > 0.005 ? { depositAmt } : {}),
    ...(tenderRaw ? { depositTender: coercePosDepositTender(tenderRaw) } : {}),
    ...(policyRaw ? { depositPolicy: coercePosDepositPolicy(policyRaw) } : {}),
    ...(cancelHours > 0 ? { depositCancelHours: cancelHours } : {}),
    ...(checkedIn ? { advanceCheckedInAt: checkedIn } : {}),
  }
}
