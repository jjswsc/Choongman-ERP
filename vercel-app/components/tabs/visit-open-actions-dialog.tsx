"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  updateStoreActionItem,
  uploadStoreActionPhoto,
  type StoreActionItem,
} from "@/lib/api-client"
import { storeActionLabelers } from "@/lib/store-action-i18n"

/** 방문 시작 직후 — 해당 매장 미완료 과제 + (슈퍼바이저·본사) 현장 확인 완료/반려 */
export function VisitOpenActionsDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
  items: StoreActionItem[]
  overdueCount: number
  canVerify: boolean
  t: (k: string) => string
  onChanged: () => void
}) {
  const { open, onOpenChange, store, items, overdueCount, canVerify, t, onChanged } = props
  const label = storeActionLabelers(t)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [afterPhotos, setAfterPhotos] = useState<Record<number, string[]>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<number | null>(null)

  const onPickPhoto = async (files: FileList | null) => {
    const id = uploadTarget.current
    uploadTarget.current = null
    if (!files?.length || id == null) return
    setBusyId(id)
    try {
      const urls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const res = await uploadStoreActionPhoto(store, files[i])
        if (res.success && res.url) urls.push(res.url)
        else await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
      }
      if (urls.length) setAfterPhotos((m) => ({ ...m, [id]: [...(m[id] || []), ...urls] }))
    } finally {
      setBusyId(null)
    }
  }

  const run = async (item: StoreActionItem, action: "verify_pass" | "verify_reject") => {
    setBusyId(item.id)
    try {
      const res = await updateStoreActionItem(
        item.id,
        {
          verificationNote: notes[item.id] || "",
          afterPhotoUrls: [...(item.afterPhotoUrls || []), ...(afterPhotos[item.id] || [])],
        },
        action
      )
      await appAlert(
        translateApiMessage(res.message, t) || (res.success ? t("store_check_updated") : t("msg_modify_fail"))
      )
      if (res.success) onChanged()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("action_visit_open_title")}
            {store ? ` · ${store}` : ""}
          </DialogTitle>
        </DialogHeader>
        {overdueCount > 0 ? (
          <p className="text-xs font-semibold text-red-600">
            {(t("action_visit_open_overdue") || "").replace("{n}", String(overdueCount))}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{t("action_visit_open_empty")}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const pending = afterPhotos[item.id] || []
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 text-xs space-y-1.5 ${item.overdue ? "border-red-400 bg-red-50 dark:bg-red-950/30" : item.status === "pending_verify" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""}`}
                >
                  <p className="font-semibold text-sm leading-snug">{item.title}</p>
                  <p className="text-muted-foreground">
                    {item.ownerName || "—"} · {item.dueDate || "—"} · {label.status(item.status)}
                    {item.repeatCount > 0 ? ` · ${t("action_repeat_n").replace("{n}", String(item.repeatCount))}` : ""}
                  </p>
                  {item.resolutionNote ? (
                    <p className="whitespace-pre-wrap text-muted-foreground line-clamp-3">
                      {t("action_field_resolution")}: {item.resolutionNote}
                    </p>
                  ) : item.actionPlan ? (
                    <p className="text-muted-foreground whitespace-pre-wrap line-clamp-3">{item.actionPlan}</p>
                  ) : null}
                  {canVerify ? (
                    <div className="space-y-1.5 rounded border border-dashed p-2">
                      <Input
                        value={notes[item.id] || ""}
                        onChange={(e) => setNotes((m) => ({ ...m, [item.id]: e.target.value }))}
                        placeholder={t("action_field_verify_note")}
                        className="h-8 text-xs"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          disabled={busyId === item.id}
                          onClick={() => {
                            uploadTarget.current = item.id
                            fileRef.current?.click()
                          }}
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {t("action_photo_after")}
                          {pending.length ? ` (${pending.length})` : ""}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          disabled={busyId === item.id}
                          onClick={() => void run(item, "verify_pass")}
                        >
                          {item.status === "pending_verify" ? t("action_verify_pass") : t("action_verify_field_pass")}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-8"
                          disabled={busyId === item.id}
                          onClick={() => void run(item, "verify_reject")}
                        >
                          {t("action_verify_reject")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <Button asChild variant="link" size="sm" className="h-7 px-0">
                    <Link href={`/admin/store-actions?tab=process&id=${item.id}`} onClick={() => onOpenChange(false)}>
                      {t("action_visit_open_go")}
                    </Link>
                  </Button>
                </div>
              )
            })}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void onPickPhoto(e.target.files)
            e.target.value = ""
          }}
        />
        <DialogFooter>
          <Button type="button" className="h-9" onClick={() => onOpenChange(false)}>
            {t("action_visit_open_dismiss")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
