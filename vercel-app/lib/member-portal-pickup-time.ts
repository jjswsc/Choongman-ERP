const BANGKOK_TZ = 'Asia/Bangkok'

function bangkokParts(base: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(base)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

/** datetime-local 입력용 — 방콕 벽시계 기준 */
export function formatBangkokDateTimeLocalInput(base: Date = new Date(), addMinutes = 0): string {
  const shifted = new Date(base.getTime() + addMinutes * 60_000)
  const p = bangkokParts(shifted)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

function bangkokWallToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s = 0): number {
  return Date.UTC(y, mo - 1, d, h - 7, mi, s)
}

export function parseMemberPickupAtBangkok(value: string): Date {
  const raw = String(value || '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw)
  if (!m) throw new Error('invalid_pickup_time')
  return new Date(bangkokWallToUtcMs(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])))
}

export function assertMemberPickupTimeAllowed(pickupAtRaw: string, minLeadMinutes = 30): string {
  const pickup = parseMemberPickupAtBangkok(pickupAtRaw)
  const minMs = Date.now() + minLeadMinutes * 60_000
  if (pickup.getTime() < minMs - 60_000) {
    throw new Error('pickup_too_soon')
  }
  const p = bangkokParts(pickup)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:00`
}
