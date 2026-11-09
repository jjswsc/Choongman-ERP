import {
  isMenuAvailableByDeliveryPolicy,
  type PosDeliveryMenuPolicy,
} from '@/lib/pos-delivery-policy'

/** Grab Update Menu Record `availableStatus` */
export type GrabItemAvailability = 'AVAILABLE' | 'UNAVAILABLE'

export type GrabAvailabilityRecord = {
  status: GrabItemAvailability
  /** false면 마지막 PUT이 실패했다. 저장은 바로 다시 보내고, cron은 15분 뒤부터 재시도한다. */
  ok: boolean
  at?: string
}

const FAILED_RETRY_MS = 15 * 60 * 1000

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

export function hasGrabDailySellWindow(policy: {
  sellStartTime?: string | null
  sellEndTime?: string | null
} | null | undefined): boolean {
  if (!policy) return false
  const start = String(policy.sellStartTime ?? '').trim()
  const end = String(policy.sellEndTime ?? '').trim()
  return HHMM.test(start) && HHMM.test(end)
}

export function grabItemAvailabilityStatus(
  policy: PosDeliveryMenuPolicy | undefined,
  now = new Date()
): GrabItemAvailability {
  return isMenuAvailableByDeliveryPolicy(policy, now) ? 'AVAILABLE' : 'UNAVAILABLE'
}

export function parseGrabAvailabilityRecord(raw: unknown): GrabAvailabilityRecord | null {
  if (typeof raw === 'string') {
    const status = parseStatusToken(raw)
    return status ? { status, ok: true } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { status?: unknown; ok?: unknown; at?: unknown }
  const status = parseStatusToken(row.status)
  if (!status) return null
  const at = String(row.at ?? '').trim()
  return { status, ok: row.ok !== false, ...(at ? { at } : {}) }
}

function parseStatusToken(raw: unknown): GrabItemAvailability | null {
  const s = String(raw ?? '').trim().toUpperCase()
  if (s === 'AVAILABLE' || s === 'UNAVAILABLE') return s
  return null
}

/**
 * 마지막 성공 기록과 지금 원하는 상태가 같을 때만 생략한다.
 * 기록이 없고 지금 열려 있으면 Grab 기본값(주문 가능)으로 보고 PUT 하지 않는다.
 * 기록이 없고 지금 닫혀 있으면 한 번 닫아 잡는다(판매시간 지난 메뉴가 + 로 남는 경우).
 */
export function grabAvailabilityAction(params: {
  desired: GrabItemAvailability
  record: GrabAvailabilityRecord | null
  now?: Date
  /** cron은 false. 실패한 직후 15분은 건너뛰고, 저장은 기본값으로 바로 재시도한다. */
  retryFailed?: boolean
}): 'push' | 'remember-available' | 'noop' {
  const rec = params.record
  if (!rec) {
    return params.desired === 'UNAVAILABLE' ? 'push' : 'remember-available'
  }
  if (rec.ok && rec.status === params.desired) return 'noop'
  if (!rec.ok && params.retryFailed === false) {
    const at = Date.parse(String(rec.at || ''))
    if (Number.isFinite(at) && params.now && params.now.getTime() - at < FAILED_RETRY_MS) {
      return 'noop'
    }
  }
  return 'push'
}

export function selectGrabAvailabilityWork(params: {
  previous: PosDeliveryMenuPolicy[]
  next: PosDeliveryMenuPolicy[]
  records: Record<string, GrabAvailabilityRecord | null | undefined>
  now?: Date
}): {
  push: Array<{ menuId: number; desired: GrabItemAvailability }>
  remember: Array<{ menuId: number; desired: GrabItemAvailability }>
} {
  const now = params.now ?? new Date()
  const prevById = new Map<number, PosDeliveryMenuPolicy>()
  for (const row of params.previous) {
    if (row.menuId > 0) prevById.set(row.menuId, row)
  }
  const push: Array<{ menuId: number; desired: GrabItemAvailability }> = []
  const remember: Array<{ menuId: number; desired: GrabItemAvailability }> = []
  const seen = new Set<number>()

  for (const policy of params.next) {
    const menuId = Math.trunc(Number(policy.menuId) || 0)
    if (menuId <= 0 || seen.has(menuId)) continue
    seen.add(menuId)
    const desired = grabItemAvailabilityStatus(policy, now)
    const previousStatus = grabItemAvailabilityStatus(prevById.get(menuId), now)
    const record = params.records[String(menuId)] ?? null
    const relevant =
      hasGrabDailySellWindow(policy) ||
      policy.soldOut === true ||
      record != null ||
      previousStatus !== desired
    if (!relevant) continue
    const action = grabAvailabilityAction({ desired, record })
    if (previousStatus !== desired || action === 'push') {
      push.push({ menuId, desired })
      continue
    }
    if (action === 'remember-available') {
      remember.push({ menuId, desired })
    }
  }
  return { push, remember }
}

export function grabAvailabilityStateKey(storeCode: string): string {
  return `grab_item_availability_pushed:${String(storeCode || '').trim()}`
}

export function isGrabItemMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return /Grab API error:\s*404\b/.test(msg)
}
