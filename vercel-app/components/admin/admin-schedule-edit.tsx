"use client"

import * as React from "react"
import { Search, RotateCcw, Copy, Save, Calendar, ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getAdminEmployeeList, getWeeklySchedule, saveSchedule } from "@/lib/api-client"
import { cn } from "@/lib/utils"

function getMondayOfWeek(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : -(day - 1)
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function get30MinIntervals(start: string, end: string): string[] {
  const result: string[] = []
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  let cur = sh * 60 + sm
  const finish = eh * 60 + em
  while (cur < finish) {
    const h = Math.floor(cur / 60).toString().padStart(2, "0")
    const m = (cur % 60).toString().padStart(2, "0")
    result.push(`${h}:${m}`)
    cur += 30
  }
  return result
}

const AREAS = ["Service", "Kitchen", "Office"] as const
const DAY_LABELS = ["att_mon", "att_tue", "att_wed", "att_thu", "att_fri", "att_sat", "att_sun"] as const

interface StaffItem {
  name: string
  nick: string
  dept: string
}

export function AdminScheduleEdit({
  stores,
  storeFilter,
  onStoreChange,
}: {
  stores: string[]
  storeFilter: string
  onStoreChange: (v: string) => void
}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [monday, setMonday] = React.useState(getMondayOfWeek)
  const [startHour, setStartHour] = React.useState(6)
  const [endHour, setEndHour] = React.useState(23)
  const [staffList, setStaffList] = React.useState<StaffItem[]>([])
  const [selectedStaff, setSelectedStaff] = React.useState<{ name: string; nick: string } | null>(null)
  const [slotData, setSlotData] = React.useState<Record<string, string[]>>({})
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [quickStart, setQuickStart] = React.useState("09:00")
  const [quickWorkHours, setQuickWorkHours] = React.useState(8)
  const [quickBreakStart, setQuickBreakStart] = React.useState("13:00")
  const [quickBreakHours, setQuickBreakHours] = React.useState(1)
  const [quickDay, setQuickDay] = React.useState(0)
  const [zoom, setZoom] = React.useState(100)
  const [slotViewHour, setSlotViewHour] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  const store = storeFilter === "All" || !storeFilter ? "" : storeFilter
  const isOffice = store.toLowerCase().includes("office") || store.includes("오피스") || store.includes("본사")
  const areas = isOffice ? (["Office"] as const) : (["Service", "Kitchen"] as const)

  React.useEffect(() => {
    if (!store || !auth) return
    getAdminEmployeeList({ userStore: auth.store || "", userRole: auth.role || "" }).then((r) => {
      const list = (r.list || []).filter((e) => String(e.store || "").trim() === store)
      setStaffList(
        list.map((e) => ({
          name: String(e.name || "").trim(),
          nick: String(e.nick || e.name || "").trim(),
          dept: String(e.job || "").trim(),
        }))
      )
    })
  }, [store, auth?.store, auth?.role])

  const snapToMonday = (v: string) => {
    const m = getMondayOfWeek(v)
    if (m) setMonday(m)
  }

  const getSlotKey = (day: number, area: string, time: string) => `${day}-${area}-${time}`

  const getSlotNames = (day: number, area: string, time: string): string[] =>
    slotData[getSlotKey(day, area, time)] || []

  const setSlotNames = (day: number, area: string, time: string, names: string[]) => {
    const key = getSlotKey(day, area, time)
    if (names.length === 0) {
      setSlotData((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
    } else {
      setSlotData((p) => ({ ...p, [key]: names }))
    }
  }

  const toggleSlot = (day: number, area: string, time: string) => {
    if (!selectedStaff) {
      alert(t("att_staff_select") + " " + (t("scheduleStorePlaceholder") || "먼저 선택하세요"))
      return
    }
    const key = getSlotKey(day, area, time)
    const current = slotData[key] || []
    const brkName = "BRK_" + selectedStaff.name
    const idx = current.indexOf(selectedStaff.name)
    const idxBrk = current.indexOf(brkName)
    let next: string[] = []
    if (idx >= 0) {
      next = current.filter((_, i) => i !== idx)
    } else if (idxBrk >= 0) {
      next = current.filter((_, i) => i !== idxBrk)
    } else {
      const otherSlots = Object.entries(slotData).filter(
        ([k]) => k.startsWith(`${day}-`) && (slotData[k]?.includes(selectedStaff.name) || slotData[k]?.includes(brkName))
      )
      if (otherSlots.length > 0) {
        alert("해당 요일에는 이미 배정되어 있습니다.")
        return
      }
      next = [...current, selectedStaff.name]
    }
    setSlotNames(day, area, time, next)
  }

  const loadSaved = () => {
    if (!store || !monday) {
      alert("매장과 기준 월요일을 선택하세요.")
      return
    }
    setLoading(true)
    getWeeklySchedule({ store, monday })
      .then((data) => {
        const next: Record<string, string[]> = {}
        const dayStrs = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
        for (const row of data || []) {
          const dateStr = row.date?.slice(0, 10)
          const dayIdx = dayStrs.indexOf(dateStr)
          if (dayIdx < 0) continue
          const area = row.area || "Service"
          const workTimes = get30MinIntervals(row.pIn || "09:00", row.pOut || "18:00")
          const breakTimes = row.pBS && row.pBE ? get30MinIntervals(row.pBS, row.pBE) : []
          for (const t of workTimes) {
            const key = getSlotKey(dayIdx, area, t)
            const names = next[key] || []
            const val = breakTimes.includes(t) ? "BRK_" + row.name : row.name
            if (!names.includes(val)) names.push(val)
            next[key] = names
          }
        }
        setSlotData(next)
      })
      .catch(() => alert("불러오기 실패"))
      .finally(() => setLoading(false))
  }

  const resetGrid = () => {
    setSlotData({})
  }

  const applyQuick = (area: string) => {
    if (!selectedStaff) {
      alert(t("att_staff_select") + " 먼저 선택하세요")
      return
    }
    const [sh, sm] = quickStart.split(":").map(Number)
    const startMin = sh * 60 + sm
    const endMin = startMin + (quickWorkHours + quickBreakHours) * 60
    const [bsh, bsm] = quickBreakStart.split(":").map(Number)
    const bStartMin = bsh * 60 + bsm
    const bEndMin = bStartMin + quickBreakHours * 60

    setSlotData((prev) => {
      const next = { ...prev }
      for (let h = startHour; h <= endHour; h++) {
        for (const half of [0, 30]) {
          const time = `${String(h).padStart(2, "0")}:${String(half).padStart(2, "0")}`
          const currMin = h * 60 + half
          const key = getSlotKey(quickDay, area, time)
          let names = (next[key] || []).filter((n) => n !== selectedStaff.name && n !== "BRK_" + selectedStaff.name)
          if (currMin >= startMin && currMin < endMin) {
            const val = currMin >= bStartMin && currMin < bEndMin ? "BRK_" + selectedStaff.name : selectedStaff.name
            if (!names.includes(val)) names.push(val)
          }
          if (names.length) next[key] = names
          else delete next[key]
        }
      }
      return next
    })
  }

  const copyToNext = () => {
    if (!store || !monday) return
    const nextMonday = addDays(monday, 7)
    if (!confirm(`현재 스케줄을 다음 주(${nextMonday})로 복사하시겠습니까?`)) return
    setMonday(nextMonday)
  }

  const doSave = () => {
    if (!store || !monday) {
      alert("매장과 기준 월요일을 선택하세요.")
      return
    }
    const map: Record<string, { work: string[]; break: string[] }> = {}
    const dayStrs = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

    for (const [key, names] of Object.entries(slotData)) {
      if (!names.length) continue
      const [dayStr, area, time] = key.split("-")
      const day = parseInt(dayStr, 10)
      const datePart = dayStrs[day]
      for (const n of names) {
        const realName = n.startsWith("BRK_") ? n.replace("BRK_", "") : n
        const recKey = `${datePart}_${realName}_${area}`
        if (!map[recKey]) map[recKey] = { work: [], break: [] }
        if (n.startsWith("BRK_")) map[recKey].break.push(time)
        else map[recKey].work.push(time)
      }
    }

    const rows: { date: string; name: string; pIn: string; pOut: string; pBS: string; pBE: string; remark: string }[] = []
    for (const [k, v] of Object.entries(map)) {
      const parts = k.split("_")
      const date = parts[0]
      const area = parts[parts.length - 1]
      const name = parts.slice(1, -1).join("_")
      const all = [...v.work, ...v.break].sort()
      if (all.length === 0) continue
      const pIn = all[0]
      const last = all[all.length - 1]
      const [lh, lm] = last.split(":").map(Number)
      let lm2 = lm + 30
      let lh2 = lh
      if (lm2 >= 60) {
        lm2 -= 60
        lh2++
      }
      const pOut = `${String(lh2).padStart(2, "0")}:${String(lm2).padStart(2, "0")}`
      let pBS = ""
      let pBE = ""
      if (v.break.length > 0) {
        const bSorted = v.break.sort()
        pBS = bSorted[0]
        const bLast = bSorted[bSorted.length - 1]
        const [bh, bm] = bLast.split(":").map(Number)
        let bm2 = bm + 30
        let bh2 = bh
        if (bm2 >= 60) {
          bm2 -= 60
          bh2++
        }
        pBE = `${String(bh2).padStart(2, "0")}:${String(bm2).padStart(2, "0")}`
      }
      rows.push({ date, name, pIn, pOut, pBS, pBE, remark: `[${area}]` })
    }

    if (rows.length === 0) {
      alert("저장할 데이터가 없습니다.")
      return
    }
    setSaving(true)
    saveSchedule({ store, monday, rows })
      .then((r) => {
        if (r.success) alert(r.message || "저장되었습니다.")
        else alert(r.message || "저장 실패")
      })
      .catch((e) => alert("저장 실패: " + (e?.message || e)))
      .finally(() => setSaving(false))
  }

  const dayStrs = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const hours: number[] = []
  for (let h = startHour; h <= endHour; h++) hours.push(h)
  const hourOptions = Array.from({ length: 24 }, (_, i) => i)
  const timeOptions = Array.from({ length: 24 }, (_, i) =>
    ["00", "30"].map((m) => `${String(i).padStart(2, "0")}:${m}`)
  ).flat()

  if (!store) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        매장을 선택하세요.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Smart tool */}
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <h6 className="mb-3 font-bold text-primary">{t("att_smart_tool")}</h6>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("att_start_date")}</label>
            <Select value={quickStart} onValueChange={setQuickStart}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.slice(16, 48).map((tm) => (
                  <SelectItem key={tm} value={tm}>{tm}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("att_work_hours")}</label>
            <Input
              type="number"
              step={0.5}
              min={0.5}
              max={16}
              value={quickWorkHours}
              onChange={(e) => setQuickWorkHours(parseFloat(e.target.value) || 0)}
              className="h-8 w-20 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("att_break_start")}</label>
            <Select value={quickBreakStart} onValueChange={setQuickBreakStart}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.slice(24, 48).map((tm) => (
                  <SelectItem key={tm} value={tm}>{tm}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("att_break_hours")}</label>
            <Input
              type="number"
              step={0.5}
              min={0}
              max={4}
              value={quickBreakHours}
              onChange={(e) => setQuickBreakHours(parseFloat(e.target.value) || 0)}
              className="h-8 w-20 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("att_apply_day")}</label>
            <Select value={String(quickDay)} onValueChange={(v) => setQuickDay(parseInt(v, 10))}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_LABELS.map((key, i) => (
                  <SelectItem key={key} value={String(i)}>{t(key)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {!isOffice && (
              <>
                <Button size="sm" className="h-8 bg-[#E65100] hover:bg-[#E65100]/90" onClick={() => applyQuick("Service")}>
                  Service
                </Button>
                <Button size="sm" className="h-8 bg-[#2E7D32] hover:bg-[#2E7D32]/90" onClick={() => applyQuick("Kitchen")}>
                  Kitchen
                </Button>
              </>
            )}
            <Button size="sm" className="h-8 bg-[#1976D2] hover:bg-[#1976D2]/90" onClick={() => applyQuick("Office")}>
              Office
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Staff list */}
        <div className="lg:col-span-2 rounded-lg border bg-card p-3 max-h-[500px] overflow-auto">
          <h6 className="mb-2 font-bold border-b pb-2">{t("att_staff_select")}</h6>
          <div className="space-y-1">
            {staffList.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelectedStaff({ name: s.name, nick: s.nick })}
                className={cn(
                  "w-full text-left rounded px-2 py-1.5 text-xs",
                  selectedStaff?.name === s.name ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground ml-1">({s.nick})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="lg:col-span-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={monday} onChange={(e) => snapToMonday(e.target.value)} className="h-9 w-36 text-xs" />
            <Select value={String(startHour)} onValueChange={(v) => setStartHour(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map((h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>~</span>
            <Select value={String(endHour)} onValueChange={(v) => setEndHour(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map((h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9" onClick={loadSaved} disabled={loading}>
              <Calendar className="mr-1 h-3.5 w-3.5" />
              {t("att_load_saved")}
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={resetGrid}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              {t("att_reset")}
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={copyToNext}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t("att_copy_next")}
            </Button>
            <Button size="sm" className="h-9 bg-green-600 hover:bg-green-700" onClick={doSave} disabled={saving}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? t("loading") : t("att_save_schedule")}
            </Button>
            <div className="flex items-center gap-1 ml-2 border-l pl-2">
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setZoom((z) => Math.max(75, z - 25))} title={t("att_zoom_out")}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium min-w-[3rem] text-center">{zoom}%</span>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setZoom((z) => Math.min(200, z + 25))} title={t("att_zoom_in")}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={slotViewHour ? "default" : "outline"} className="h-9 px-2 text-xs" onClick={() => setSlotViewHour(!slotViewHour)} title={t("att_view_1h")}>
                1h
              </Button>
              <Button size="sm" variant={isFullscreen ? "default" : "outline"} className="h-9 w-9 p-0" onClick={() => setIsFullscreen(!isFullscreen)} title={t("att_fullscreen")}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div
            className={cn("overflow-auto rounded-xl border-2 border-border bg-card", isFullscreen ? "fixed inset-4 z-50 shadow-2xl" : "max-h-[700px]")}
            style={{ paddingBottom: 8 }}
          >
            <table
              className="w-full border-collapse"
              style={{
                fontSize: slotViewHour ? `${13 * (zoom / 100)}px` : `${11 * (zoom / 100)}px`,
                minWidth: "max-content",
              }}
            >
              <thead className="sticky top-0 bg-muted z-10 shadow-sm">
                <tr>
                  <th className="border border-border px-3 py-2 w-16 bg-muted font-semibold">Time</th>
                  {dayStrs.map((d, i) => (
                    <th key={d} colSpan={areas.length} className="border border-border px-2 py-2 text-center font-semibold">
                      {t(DAY_LABELS[i])} {d.slice(5)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border border-border px-1 py-1 bg-muted/80" />
                  {dayStrs.map(() =>
                    areas.map((ar) => (
                      <th
                        key={ar}
                        className={cn(
                          "border border-border px-2 py-1.5 min-w-[60px] font-medium",
                          ar === "Service" && "bg-orange-100 dark:bg-orange-950/30",
                          ar === "Kitchen" && "bg-green-100 dark:bg-green-950/30",
                          ar === "Office" && "bg-blue-100 dark:bg-blue-950/30"
                        )}
                      >
                        {ar}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {(slotViewHour ? hours : hours.flatMap((h) => [h, h])).map((_, rowIdx) => {
                  const hourNum = slotViewHour ? hours[rowIdx] : hours[Math.floor(rowIdx / 2)]
                  const half = slotViewHour ? 0 : (rowIdx % 2) * 30
                  const timeLabel = slotViewHour ? `${String(hourNum).padStart(2, "0")}:00` : `${String(hourNum).padStart(2, "0")}:${String(half).padStart(2, "0")}`
                  const slotMinH = slotViewHour ? Math.max(40, 28 * (zoom / 100)) : Math.max(32, 22 * (zoom / 100))
                  const timesToShow = slotViewHour ? [0, 30] : [half]
                  return (
                    <tr key={`${hourNum}-${half}`}>
                      <td className="border border-border px-2 py-1 font-bold text-center bg-muted/50 sticky left-0">{timeLabel}</td>
                      {dayStrs.map((_, day) =>
                        areas.map((area) => (
                          <td key={`${day}-${area}`} className="border border-border p-0 align-top">
                            {timesToShow.map((hx, ti) => {
                              const time = `${String(hourNum).padStart(2, "0")}:${String(hx).padStart(2, "0")}`
                              const names = getSlotNames(day, area, time)
                              const hasData = names.length > 0
                              const areaHover = area === "Service" ? "hover:bg-orange-50 dark:hover:bg-orange-950/20" : area === "Kitchen" ? "hover:bg-green-50 dark:hover:bg-green-950/20" : "hover:bg-blue-50 dark:hover:bg-blue-950/20"
                              return (
                                <div
                                  key={time}
                                  onClick={() => toggleSlot(day, area, time)}
                                  className={cn(
                                    "cursor-pointer flex flex-wrap items-center justify-center gap-1 p-1.5 transition-colors",
                                    hasData && "bg-primary/10",
                                    areaHover,
                                    slotViewHour && ti === 1 && "border-t border-dashed border-border"
                                  )}
                                  style={{ minHeight: slotMinH }}
                                >
                                  {names.map((n) => (
                                    <span
                                      key={n}
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-full",
                                        n.startsWith("BRK_") ? "bg-gray-600 text-white" : area === "Service" ? "bg-orange-500 text-white" : area === "Kitchen" ? "bg-green-600 text-white" : "bg-blue-500 text-white"
                                      )}
                                    >
                                      {n.startsWith("BRK_") ? "R" : staffList.find((s) => s.name === n)?.nick || n}
                                    </span>
                                  ))}
                                </div>
                              )
                            })}
                          </td>
                        ))
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
