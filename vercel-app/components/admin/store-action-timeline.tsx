"use client"

import { useEffect, useState } from "react"
import { getStoreActionLogs, type StoreActionLog } from "@/lib/api-client"
import { storeActionLabelers } from "@/lib/store-action-i18n"

function fmtBangkok(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** 과제 변경 이력 — 누가·언제·무엇을 */
export function StoreActionTimeline(props: { actionId: number; refreshKey?: number; t: (k: string) => string }) {
  const { actionId, refreshKey, t } = props
  const [logs, setLogs] = useState<StoreActionLog[]>([])
  const [loading, setLoading] = useState(false)
  const label = storeActionLabelers(t)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void getStoreActionLogs(actionId)
      .then((rows) => {
        if (alive) setLogs(rows)
      })
      .catch(() => {
        if (alive) setLogs([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [actionId, refreshKey])

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-semibold">{t("action_timeline_title")}</p>
      {loading ? (
        <p className="text-[11px] text-muted-foreground">{t("loading")}</p>
      ) : logs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("action_timeline_empty")}</p>
      ) : (
        <ol className="space-y-1.5 border-l pl-3">
          {logs.map((l) => (
            <li key={l.id} className="text-[11px] leading-snug">
              <span className="tabular-nums text-muted-foreground">{fmtBangkok(l.createdAt)}</span>{" "}
              <span className="font-medium">{l.actor || "-"}</span> · {label.event(l.event)}
              {l.fromStatus && l.toStatus && l.fromStatus !== l.toStatus ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({label.status(l.fromStatus)} → {label.status(l.toStatus)})
                </span>
              ) : null}
              {l.note ? <div className="whitespace-pre-wrap text-muted-foreground">{l.note}</div> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
