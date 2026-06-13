/** 업무일지 UI·보내기 공통 */

export const WORK_LOG_PRIORITIES = [
  { value: "긴급", key: "workLogPriorityUrgent", tone: "urgent" as const },
  { value: "상", key: "workLogPriorityHigh", tone: "high" as const },
  { value: "중", key: "workLogPriorityMedium", tone: "medium" as const },
  { value: "하", key: "workLogPriorityLow", tone: "low" as const },
] as const

export type WorkLogPriorityTone = (typeof WORK_LOG_PRIORITIES)[number]["tone"]

export function workLogPriorityTone(priority: string | undefined): WorkLogPriorityTone {
  const row = WORK_LOG_PRIORITIES.find((p) => p.value === priority)
  return row?.tone ?? "medium"
}

export function workLogPriorityChipClass(tone: WorkLogPriorityTone): string {
  switch (tone) {
    case "urgent":
      return "bg-destructive/15 text-destructive border-destructive/25"
    case "high":
      return "bg-warning/15 text-warning border-warning/25"
    case "low":
      return "bg-muted text-muted-foreground border-border"
    default:
      return "bg-primary/10 text-primary border-primary/20"
  }
}

export function workLogProgressBarClass(progress: number): string {
  if (progress >= 100) return "bg-success"
  if (progress >= 70) return "bg-primary"
  if (progress >= 40) return "bg-warning"
  return "bg-destructive/60"
}

export function workLogWorkTypeBadgeClass(status: string): string {
  const s = (status || "").trim()
  if (s === "Finish") return "bg-success/15 text-success"
  if (s === "Continue" || s === "Carry Over") return "bg-warning/15 text-warning"
  if (s === "Today") return "bg-primary/15 text-primary"
  return "bg-muted text-muted-foreground"
}

export function workLogReviewBadgeClass(managerCheck: string, hasComment: boolean): string {
  if (managerCheck === "승인") {
    return hasComment ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
  }
  if (managerCheck === "보류") return "bg-warning/10 text-warning"
  if (managerCheck === "반려") return "bg-destructive/10 text-destructive"
  if (managerCheck === "대기") return "bg-warning/10 text-warning"
  return "bg-muted text-muted-foreground"
}

export function escapeCsvCell(v: string | number): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ]
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
