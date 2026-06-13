import {
  addBangkokCalendarDays,
  getBangkokMonthRangeWithOffset,
  getBangkokTodayDateString,
} from "@/lib/bangkok-time"

export type AiDatePresetId = "today" | "last7" | "last30" | "thisMonth" | "lastMonth"

export function resolveAiDatePreset(id: AiDatePresetId): { start: string; end: string } {
  const today = getBangkokTodayDateString()
  if (id === "today") return { start: today, end: today }
  if (id === "last7") return { start: addBangkokCalendarDays(today, -6), end: today }
  if (id === "last30") return { start: addBangkokCalendarDays(today, -29), end: today }
  if (id === "thisMonth") {
    const m = getBangkokMonthRangeWithOffset(0)
    return { start: m.start, end: m.end }
  }
  const m = getBangkokMonthRangeWithOffset(-1)
  return { start: m.start, end: m.end }
}
