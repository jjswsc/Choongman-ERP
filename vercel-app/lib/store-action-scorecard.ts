import { isStoreActionOpenStatus } from "@/lib/store-action-items"

export type StoreActionScoreInput = {
  store: string
  ownerName: string
  verifierName: string
  status: string
  dueDate: string
  createdAt: string
  completedAt: string
  repeatCount: number
}

export type StoreActionScoreRow = {
  key: string
  total: number
  completed: number
  onTime: number
  overdueOpen: number
  open: number
  repeat: number
  /** 기한 내 완료율(%) — 대상 = 취소 제외 전체 */
  onTimeRate: number
  /** 등록→완료 평균 일수 (소수 1자리) */
  avgCloseDays: number | null
}

export type StoreActionScorecard = {
  byStore: StoreActionScoreRow[]
  byOwner: StoreActionScoreRow[]
  byVerifier: StoreActionScoreRow[]
  total: StoreActionScoreRow
}

export function bangkokYmdFromIso(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

type Acc = {
  total: number
  completed: number
  onTime: number
  overdueOpen: number
  open: number
  repeat: number
  closeDaysSum: number
  closeDaysN: number
}

function emptyAcc(): Acc {
  return { total: 0, completed: 0, onTime: 0, overdueOpen: 0, open: 0, repeat: 0, closeDaysSum: 0, closeDaysN: 0 }
}

function addTo(acc: Acc, it: StoreActionScoreInput, todayYmd: string) {
  acc.total += 1
  if (it.repeatCount > 0) acc.repeat += 1
  if (it.status === "completed") {
    acc.completed += 1
    const doneYmd = bangkokYmdFromIso(it.completedAt)
    if (doneYmd && it.dueDate && doneYmd <= it.dueDate) acc.onTime += 1
    const c = new Date(it.createdAt).getTime()
    const f = new Date(it.completedAt).getTime()
    if (Number.isFinite(c) && Number.isFinite(f) && f >= c) {
      acc.closeDaysSum += (f - c) / 86400000
      acc.closeDaysN += 1
    }
  } else if (isStoreActionOpenStatus(it.status)) {
    acc.open += 1
    if (it.dueDate && it.dueDate < todayYmd) acc.overdueOpen += 1
  }
}

function finish(key: string, acc: Acc): StoreActionScoreRow {
  return {
    key,
    total: acc.total,
    completed: acc.completed,
    onTime: acc.onTime,
    overdueOpen: acc.overdueOpen,
    open: acc.open,
    repeat: acc.repeat,
    onTimeRate: acc.total > 0 ? Math.round((acc.onTime / acc.total) * 1000) / 10 : 0,
    avgCloseDays: acc.closeDaysN > 0 ? Math.round((acc.closeDaysSum / acc.closeDaysN) * 10) / 10 : null,
  }
}

function groupBy(
  items: StoreActionScoreInput[],
  keyOf: (it: StoreActionScoreInput) => string,
  todayYmd: string
): StoreActionScoreRow[] {
  const map = new Map<string, Acc>()
  for (const it of items) {
    const key = keyOf(it).trim() || "-"
    const acc = map.get(key) || emptyAcc()
    addTo(acc, it, todayYmd)
    map.set(key, acc)
  }
  return [...map.entries()]
    .map(([k, acc]) => finish(k, acc))
    .sort((a, b) => b.overdueOpen - a.overdueOpen || a.onTimeRate - b.onTimeRate || b.total - a.total)
}

/** 월간 성과표 — 기한(due_date)이 해당 월에 속한 과제 기준. 취소 건 제외. */
export function buildStoreActionScorecard(
  items: StoreActionScoreInput[],
  todayYmd: string
): StoreActionScorecard {
  const valid = items.filter((it) => it.status !== "cancelled")
  const totalAcc = emptyAcc()
  for (const it of valid) addTo(totalAcc, it, todayYmd)
  return {
    byStore: groupBy(valid, (it) => it.store, todayYmd),
    byOwner: groupBy(valid, (it) => it.ownerName, todayYmd),
    byVerifier: groupBy(valid, (it) => it.verifierName, todayYmd),
    total: finish("total", totalAcc),
  }
}
