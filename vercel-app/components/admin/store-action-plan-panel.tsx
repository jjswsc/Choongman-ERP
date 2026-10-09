"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarPlus, CalendarRange } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { appAlert } from "@/lib/app-message"
import { cn } from "@/lib/utils"
import {
  addStoreActionToDailyPlan,
  getStoreActionPlanLinks,
  type StoreActionPlanLink,
} from "@/lib/api-client"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"

type T = (k: string) => string
type Who = "owner" | "verifier" | "me"

/** 개선 과제 처리 화면 — 이 과제가 누구 일정표에 들어가 있는지 + 일정에 넣기 */
export function StoreActionPlanPanel({
  actionId,
  open,
  canVerify,
  t,
}: {
  actionId: number
  open: boolean
  canVerify: boolean
  t: T
}) {
  const today = getBangkokTodayDateString()
  const tomorrow = addBangkokCalendarDays(today, 1)
  const [links, setLinks] = useState<StoreActionPlanLink[]>([])
  const [date, setDate] = useState(today)
  const [who, setWho] = useState<Who>("owner")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const m = await getStoreActionPlanLinks([actionId])
    setLinks(m[String(actionId)] || [])
  }, [actionId])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    setBusy(true)
    try {
      const res = await addStoreActionToDailyPlan({ actionId, date, who })
      if (!res.success) {
        await appAlert(res.messageKey ? t(res.messageKey) : res.message || t("dp_save_fail"))
        return
      }
      await appAlert(
        (res.added ? t("dp_action_added") : t("dp_action_already"))
          .replace("{name}", res.employeeName || "")
          .replace("{date}", res.date || date)
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  const whoOptions: Who[] = canVerify ? ["owner", "verifier", "me"] : ["owner", "me"]

  return (
    <Card>
      <CardContent className="space-y-2 p-3 text-xs">
        <p className="flex items-center gap-1 font-semibold">
          <CalendarRange className="h-3.5 w-3.5" />
          {t("dp_action_in_schedule")}
        </p>
        {links.length === 0 ? (
          <p className="text-muted-foreground">{t("dp_action_not_scheduled")}</p>
        ) : (
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={`${l.planId}`} className="flex items-center justify-between gap-2">
                <span>
                  {l.date} · {l.employeeName}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    l.itemStatus === "done"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
                      : "bg-muted"
                  )}
                >
                  {t(`dp_item_${l.itemStatus}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <div className="space-y-1.5 border-t pt-2">
            <div className="flex flex-wrap gap-1">
              {[today, tomorrow].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={date === d ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => setDate(d)}
                >
                  {d === today ? t("dp_today") : t("dp_tomorrow")}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {whoOptions.map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={who === w ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => setWho(w)}
                >
                  {t(`dp_action_who_${w}`)}
                </Button>
              ))}
            </div>
            <Button size="sm" className="h-8 w-full text-xs" disabled={busy} onClick={() => void add()}>
              <CalendarPlus className="mr-1 h-3.5 w-3.5" />
              {t("dp_action_add_to_schedule")}
            </Button>
          </div>
        ) : null}
        <Link href="/admin/daily-plans" className="block text-[11px] text-blue-600 underline">
          {t("dp_open_schedule")}
        </Link>
      </CardContent>
    </Card>
  )
}
