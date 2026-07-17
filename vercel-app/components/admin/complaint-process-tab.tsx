"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Save } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"
import { updateComplaintLog, type ComplaintLogItem } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const STATUSES = ["접수", "조사중", "처리완료", "보류", "종료"] as const
const statusToKey: Record<string, string> = {
  접수: "complaint_status_recv",
  조사중: "complaint_status_inv",
  처리완료: "complaint_status_done",
  보류: "complaint_status_hold",
  종료: "complaint_status_closed",
}
const severityToKey: Record<string, string> = {
  경미: "complaint_sev_low",
  보통: "complaint_sev_mid",
  심각: "complaint_sev_high",
}

type Props = {
  items: ComplaintLogItem[]
  loading: boolean
  writerName: string
  getTrans: (text: string) => string
  openOnly: boolean
  onOpenOnlyChange: (v: boolean) => void
  onSaved: () => void
}

export function ComplaintProcessTab({
  items,
  loading,
  writerName,
  getTrans,
  openOnly,
  onOpenOnlyChange,
  onSaved,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [selectedKey, setSelectedKey] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [draftStatus, setDraftStatus] = useState("")
  const [draftHandler, setDraftHandler] = useState("")
  const [draftAction, setDraftAction] = useState("")
  const [draftCustomerReply, setDraftCustomerReply] = useState("")
  const [draftDoneDate, setDraftDoneDate] = useState("")

  const selected = useMemo(
    () => items.find((x) => String(x.row ?? x.id ?? "") === selectedKey) ?? null,
    [items, selectedKey]
  )

  const selectItem = (item: ComplaintLogItem) => {
    const id = String(item.row ?? item.id ?? "")
    setSelectedKey(id)
    setDraftStatus(item.status || "접수")
    setDraftHandler(item.handler || writerName)
    setDraftAction(item.action || "")
    setDraftCustomerReply(item.customerReply || "")
    setDraftDoneDate(item.doneDate || "")
  }

  const handleSave = async () => {
    if (!selected) return
    const id = String(selected.row ?? selected.id ?? "")
    if (!id) return
    setSaving(true)
    try {
      const res = await updateComplaintLog(id, {
        date: selected.date,
        time: selected.time,
        store: selected.store,
        writer: selected.writer,
        customer: selected.customer,
        contact: selected.contact,
        visitPath: selected.visitPath,
        platform: selected.platform,
        type: selected.type,
        menu: selected.menu,
        title: selected.title,
        content: selected.content,
        severity: selected.severity,
        status: draftStatus,
        handler: draftHandler,
        doneDate: draftDoneDate,
        action: draftAction,
        customerReply: draftCustomerReply,
        photoUrl: selected.photoUrl,
        remark: selected.remark,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_updated"))
        onSaved()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const statusLabel = (s: string) => (statusToKey[s] ? t(statusToKey[s] as never) : s)
  const severityVariant = (s: string) => (s === "심각" ? "destructive" : s === "보통" ? "secondary" : "outline")

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(e) => onOpenOnlyChange(e.target.checked)}
                className="rounded"
              />
              {t("complaint_kpi_open")}
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {loading ? (
              <p className="p-6 text-center text-xs text-muted-foreground">{t("loading")}</p>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">{t("complaint_no_results")}</p>
            ) : (
              items.map((item) => {
                const id = String(item.row ?? item.id ?? "")
                const active = id === selectedKey
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className={cn(
                      "w-full border-b px-3 py-2.5 text-left text-xs hover:bg-muted/40",
                      active && "bg-muted/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{getTrans(item.title || "") || "—"}</span>
                      <Badge variant={severityVariant(String(item.severity || ""))} className="shrink-0 text-[10px]">
                        {severityToKey[item.severity || ""] ? t(severityToKey[item.severity || ""] as never) : item.severity}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate">
                      {item.store} · {item.date} · {statusLabel(String(item.status || ""))}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3 text-xs">
          {!selected ? (
            <p className="text-muted-foreground py-8 text-center">{t("complaint_process_select")}</p>
          ) : (
            <>
              <div>
                <p className="font-semibold">{getTrans(selected.title || "")}</p>
                <p className="text-muted-foreground mt-1">{selected.store} · {selected.number || selected.date}</p>
              </div>
              <p className="whitespace-pre-wrap rounded border bg-muted/20 p-2">{getTrans(selected.content || "") || "—"}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">{t("complaint_status")}</label>
                  <Select value={draftStatus} onValueChange={setDraftStatus}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">{t("complaint_handler")}</label>
                  <Input value={draftHandler} onChange={(e) => setDraftHandler(e.target.value)} className="h-8" />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("complaint_done_date")}</label>
                <Input type="date" value={draftDoneDate} onChange={(e) => setDraftDoneDate(e.target.value)} className="h-8" />
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("complaint_customer_reply")}</label>
                <p className="text-[11px] text-muted-foreground mb-1">{t("complaint_customer_reply_hint")}</p>
                <Textarea
                  value={draftCustomerReply}
                  onChange={(e) => setDraftCustomerReply(e.target.value)}
                  rows={3}
                  placeholder={t("complaint_ph_customer_reply")}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("complaint_action")}</label>
                <p className="text-[11px] text-muted-foreground mb-1">{t("complaint_action_hint")}</p>
                <Textarea
                  value={draftAction}
                  onChange={(e) => setDraftAction(e.target.value)}
                  rows={2}
                  placeholder={t("complaint_ph_action")}
                />
              </div>
              <Button type="button" className="w-full" onClick={() => void handleSave()} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? t("loading") : t("complaint_process_save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
