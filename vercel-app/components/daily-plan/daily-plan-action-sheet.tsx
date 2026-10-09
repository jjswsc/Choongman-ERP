"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, ExternalLink, Send, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { appAlert, appPrompt } from "@/lib/app-message"
import { useAuth } from "@/lib/auth-context"
import { hasOfficeStaffScope, isSupervisorRole } from "@/lib/permissions"
import {
  getStoreActionItems,
  updateStoreActionItem,
  uploadStoreActionPhoto,
  type StoreActionItem,
} from "@/lib/api-client"
import { storeActionLabelers } from "@/lib/store-action-i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"

type T = (k: string) => string

/** 일정표 안에서 개선 과제 처리 — 개선 후 사진·재확인 요청, 재확인 권한자는 완료·반려 */
export function DailyPlanActionSheet(props: {
  actionId: number | null
  t: T
  onClose: () => void
  onChanged: () => void
}) {
  const { actionId, t, onClose, onChanged } = props
  const { auth } = useAuth()
  const label = storeActionLabelers(t)
  const fileRef = useRef<HTMLInputElement>(null)
  const [item, setItem] = useState<StoreActionItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [afterUrls, setAfterUrls] = useState<string[]>([])

  const canVerify =
    hasOfficeStaffScope(auth?.role || "", auth?.store || "") || isSupervisorRole(auth?.role || "")
  const me = String(auth?.user || "").trim().toLowerCase()

  useEffect(() => {
    if (actionId == null) {
      setItem(null)
      return
    }
    setLoading(true)
    void getStoreActionItems({ id: actionId })
      .then((rows) => {
        const a = rows[0] || null
        setItem(a)
        setNote(a?.resolutionNote || "")
        setAfterUrls(a?.afterPhotoUrls || [])
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false))
  }, [actionId])

  const open = item != null && (item.status === "open" || item.status === "in_progress")
  const pending = item?.status === "pending_verify"
  const isOwner = !!item && !!me && item.ownerName.trim().toLowerCase() === me
  const canJudge = !!item && canVerify && !isOwner && (open || pending)

  const onPhoto = async (file: File | undefined) => {
    if (!file || !item) return
    setBusy(true)
    try {
      const up = await uploadStoreActionPhoto(item.store, file)
      if (!up.success || !up.url) {
        await appAlert(translateApiMessage(up.message, t) || t("dp_save_fail"))
        return
      }
      setAfterUrls((prev) => [...prev, up.url as string])
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const run = async (action: "request_verify" | "verify_pass" | "verify_reject") => {
    if (!item) return
    let verificationNote = ""
    if (action === "request_verify" && afterUrls.length === 0) {
      await appAlert(t("dp_act_need_after_photo"))
      return
    }
    if (action === "verify_reject") {
      const why = await appPrompt(t("dp_act_reject_prompt"))
      if (why == null) return
      if (!why.trim()) {
        await appAlert(t("dp_err_reason_required"))
        return
      }
      verificationNote = why.trim()
    }
    setBusy(true)
    try {
      const res = await updateStoreActionItem(
        item.id,
        { resolutionNote: note, afterPhotoUrls: afterUrls, verificationNote },
        action
      )
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      await appAlert(t("dp_act_done_msg"))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={actionId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={ADMIN_DIALOG_SCROLL_CN}>
        <DialogHeader>
          <DialogTitle>{item ? `${item.store} · ${item.title}` : t("dp_src_action")}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : !item ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t("dp_act_not_found")}</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={cn("font-semibold", item.overdue && "text-red-600")}>
                {t("dp_act_due")} {item.dueDate || "—"}
              </span>
              <span>{label.status(item.status)}</span>
              <span>
                {t("dp_act_owner")} {item.ownerName || "—"}
              </span>
              <span>
                {t("dp_act_verifier")} {item.verifierName || "—"}
              </span>
            </div>
            {item.description ? <p className="whitespace-pre-wrap text-xs">{item.description}</p> : null}
            {item.actionPlan ? (
              <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{item.actionPlan}</p>
            ) : null}
            {item.photoUrls.length > 0 ? (
              <div>
                <p className="text-[11px] text-muted-foreground">{t("dp_act_before")}</p>
                <div className="mt-1 flex gap-1 overflow-x-auto">
                  {item.photoUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" className="h-16 w-16 rounded object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {open || pending ? (
              <div className="space-y-2 rounded border p-2">
                <p className="text-[11px] text-muted-foreground">{t("dp_act_after")}</p>
                <div className="flex flex-wrap gap-1">
                  {afterUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" className="h-16 w-16 rounded object-cover" />
                    </a>
                  ))}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void onPhoto(e.target.files?.[0])}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-16 w-16"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                </div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t("dp_act_resolution_ph")}
                />
                <div className="flex flex-wrap gap-2">
                  {open ? (
                    <Button size="sm" disabled={busy} onClick={() => void run("request_verify")}>
                      <Send className="mr-1 h-4 w-4" />
                      {t("dp_act_request_verify")}
                    </Button>
                  ) : null}
                  {canJudge ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void run("verify_pass")}
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        {t("dp_act_verify_pass")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run("verify_reject")}>
                        <Undo2 className="mr-1 h-4 w-4" />
                        {t("dp_act_verify_reject")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <a
              href={`/admin/store-actions?id=${item.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t("dp_act_open_full")}
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
