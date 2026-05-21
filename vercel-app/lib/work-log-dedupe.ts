/** 업무일지 content 정규화·중복 제거 */

export function normalizeWorkLogContent(content: string): string {
  return String(content || "")
    .trim()
    .replace(/\s+/g, " ")
}

export function workLogContentKey(content: string): string {
  return normalizeWorkLogContent(content).toLowerCase()
}

export type WorkLogItemLike = {
  id: string
  content: string
  progress: number
  status: string
  priority?: string
  managerCheck?: string
  managerComment?: string
}

function statusRank(status: string, progress: number): number {
  const p = Number(progress) || 0
  if (p >= 100 || status === "Finish") return 3
  if (status === "Today") return 2
  if (status === "Continue" || status === "Carry Over") return 1
  return 0
}

/** 같은 업무 내용이 여러 행이면 진행률·상태 기준으로 하나만 남김 */
export function dedupeWorkLogItemsByContent<T extends WorkLogItemLike>(items: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const key = workLogContentKey(item.content)
    if (!key) {
      byKey.set(`__id__${item.id}`, item)
      continue
    }
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, item)
      continue
    }
    const prevRank = statusRank(prev.status, Number(prev.progress) || 0)
    const curRank = statusRank(item.status, Number(item.progress) || 0)
    const prevP = Number(prev.progress) || 0
    const curP = Number(item.progress) || 0
    if (curRank > prevRank || (curRank === prevRank && curP >= prevP)) {
      byKey.set(key, item)
    }
  }
  return Array.from(byKey.values())
}

export function isEphemeralWorkLogId(id: string | undefined | null): boolean {
  const s = String(id || "").trim()
  return !s || s.startsWith("_temp_")
}

/** 업무 검토·리포트: 같은 날·같은 직원·같은 내용은 한 행만 */
export function dedupeWorkLogReportByDateNameContent<
  T extends {
    id: string
    date: string
    name: string
    content: string
    progress: number
    status: string
  },
>(rows: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const key = `${r.date}\0${r.name}\0${workLogContentKey(r.content)}`
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }
  const out: T[] = []
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      out.push(arr[0])
      continue
    }
    const pick = dedupeWorkLogItemsByContent(
      arr.map((r) => ({
        id: r.id,
        content: r.content,
        progress: r.progress,
        status: r.status,
      }))
    )[0]
    out.push(arr.find((r) => r.id === pick.id) ?? arr[0])
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
  )
}
