"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StoreActionPersonSelect } from "@/components/admin/store-action-person-select"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { saveStoreActionItem, uploadStoreActionPhoto } from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { STORE_ACTION_CATEGORIES, storeActionDefaultDueDays } from "@/lib/store-action-items"
import { STORE_ACTION_CAT_TEMPLATE_I18N, addDaysYmd, storeActionLabelers } from "@/lib/store-action-i18n"

/** 방문 종료 직후 — 이번 방문에서 발견한 문제를 개선 과제로 바로 등록 */
export function VisitNewActionsDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
  verifierName: string
  verifierUserId: string
  t: (k: string) => string
}) {
  const { open, onOpenChange, store, verifierName, verifierUserId, t } = props
  const label = storeActionLabelers(t)
  const today = getBangkokTodayDateString()
  const fileRef = useRef<HTMLInputElement>(null)

  const blank = () => ({
    title: "",
    category: "기타",
    ownerName: "",
    ownerUserId: "",
    dueDate: addDaysYmd(today, storeActionDefaultDueDays("기타")),
    actionPlan: t(STORE_ACTION_CAT_TEMPLATE_I18N["기타"]),
    photoUrls: [] as string[],
  })
  const [form, setForm] = useState(blank)
  const [saved, setSaved] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(blank())
      setSaved([])
    }
  }, [open, store])

  const onCategory = (category: string) => {
    setForm((f) => {
      const prevTpl = t(STORE_ACTION_CAT_TEMPLATE_I18N[f.category] || "action_tpl_etc")
      const keepPlan = f.actionPlan.trim() && f.actionPlan !== prevTpl
      return {
        ...f,
        category,
        dueDate: addDaysYmd(today, storeActionDefaultDueDays(category)),
        actionPlan: keepPlan ? f.actionPlan : t(STORE_ACTION_CAT_TEMPLATE_I18N[category] || "action_tpl_etc"),
      }
    })
  }

  const onPhoto = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const res = await uploadStoreActionPhoto(store, files[i])
        if (res.success && res.url) {
          const url = res.url
          setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, url] }))
        } else {
          await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!form.title.trim() || !form.ownerName.trim() || !form.dueDate || !verifierName) {
      await appAlert(t("action_required_fields"))
      return
    }
    setBusy(true)
    try {
      const res = await saveStoreActionItem({
        store,
        title: form.title,
        category: form.category,
        priority: "보통",
        ownerName: form.ownerName,
        ownerUserId: form.ownerUserId,
        dueDate: form.dueDate,
        verifierName,
        verifierUserId,
        actionPlan: form.actionPlan,
        photoUrls: form.photoUrls,
        sourceType: "visit",
        sourceRef: `${store}|${today}|${verifierName}`,
        createdBy: verifierName,
      })
      if (res.success) {
        setSaved((s) => [...s, form.title.trim()])
        setForm((f) => ({ ...blank(), ownerName: f.ownerName, ownerUserId: f.ownerUserId }))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("action_visit_new_title")}
            {store ? ` · ${store}` : ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("action_visit_new_hint")}</p>
        {saved.length > 0 ? (
          <div className="rounded border border-emerald-500/40 bg-emerald-50 p-2 text-[11px] dark:bg-emerald-950/20">
            <p className="font-semibold">{t("action_visit_new_saved").replace("{n}", String(saved.length))}</p>
            {saved.map((s, i) => (
              <p key={`${s}-${i}`}>- {s}</p>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t("action_field_title")}
            className="h-9 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.category} onValueChange={onCategory}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORE_ACTION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {label.category(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">{t("action_field_owner")}</label>
            <StoreActionPersonSelect
              store={store}
              name={form.ownerName}
              userId={form.ownerUserId}
              t={t}
              onChange={(p) => setForm((f) => ({ ...f, ownerName: p.name, ownerUserId: p.userId }))}
            />
          </div>
          <Textarea
            value={form.actionPlan}
            onChange={(e) => setForm((f) => ({ ...f, actionPlan: e.target.value }))}
            placeholder={t("action_field_plan")}
            className="min-h-[56px] text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            {form.photoUrls.map((u) => (
              <div key={u} className="relative h-12 w-12">
                <img src={u} alt="" className="h-full w-full rounded border object-cover" />
                <button
                  type="button"
                  className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5"
                  onClick={() => setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((x) => x !== u) }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Camera className="h-3.5 w-3.5" />
              {t("action_photo_before")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                void onPhoto(e.target.files)
                e.target.value = ""
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("action_field_verifier")}: {verifierName || "—"}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
            {saved.length > 0 ? t("action_visit_open_dismiss") : t("action_visit_new_skip")}
          </Button>
          <Button type="button" className="h-9" disabled={busy} onClick={() => void save()}>
            {t("action_visit_new_add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
