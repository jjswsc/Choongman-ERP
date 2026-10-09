"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { addVisitToDailyPlan, getDailyPlanBoard, type DailyPlanCandidate } from "@/lib/api-client"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"

type T = (k: string) => string

/** 개선 과제 → 슈퍼바이저 일정표에 방문 매장 추가 */
export function StoreActionVisitAddDialog({
  store,
  onClose,
  onAdded,
  t,
}: {
  store: string | null
  onClose: () => void
  onAdded: () => void
  t: T
}) {
  const { auth } = useAuth()
  const today = getBangkokTodayDateString()
  const [date, setDate] = useState(() => addBangkokCalendarDays(today, 1))
  const [svs, setSvs] = useState<DailyPlanCandidate[]>([])
  const [empId, setEmpId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!store) return
    let alive = true
    void getDailyPlanBoard(date, { candidates: true })
      .then((res) => {
        if (!alive) return
        const list = (res.candidates || []).filter((c) => c.planRole === "supervisor")
        setSvs(list)
        setEmpId((cur) => {
          if (cur != null && list.some((c) => c.id === cur)) return cur
          const me = list.find((c) => c.id === auth?.employeeId)
          return me?.id ?? list[0]?.id ?? null
        })
      })
      .catch(() => {
        if (alive) setSvs([])
      })
    return () => {
      alive = false
    }
  }, [store, date, auth?.employeeId])

  const submit = async () => {
    if (!store || empId == null) return
    setBusy(true)
    try {
      const res = await addVisitToDailyPlan({ store, date, employeeId: empId })
      if (!res.success) {
        await appAlert(res.messageKey ? t(res.messageKey) : translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      await appAlert(
        (res.added ? t("dp_visit_added") : t("dp_visit_already"))
          .replace("{name}", res.employeeName || "")
          .replace("{date}", res.date || date)
          .replace("{store}", store)
      )
      onAdded()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!store} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {t("dp_visit_add_title")} · {store}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <p className="text-muted-foreground">{t("dp_date")}</p>
            <Input
              type="date"
              value={date}
              min={today}
              max={addBangkokCalendarDays(today, 7)}
              onChange={(e) => setDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">{t("dp_role_supervisor")}</p>
            {svs.length === 0 ? (
              <p className="text-muted-foreground">{t("dp_visit_no_sv")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {svs.map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant={empId === c.id ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setEmpId(c.id)}
                  >
                    {c.nick || c.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Button className="w-full" size="sm" disabled={busy || empId == null} onClick={() => void submit()}>
            {t("dp_visit_add_btn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
