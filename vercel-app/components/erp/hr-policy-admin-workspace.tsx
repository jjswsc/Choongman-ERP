"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  Save,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  File,
  Video,
  Eye,
  Pencil,
  BarChart2,
  Megaphone,
  FileInput,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { saveHrPolicy, getHrPolicies, getHrPolicyReadDetail, type HrPolicyRow } from "@/lib/api-client"
import { buildHrPolicyContent, parseHrPolicyContent } from "@/lib/hr-policy-doc-format"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HrPolicyReaderStatsDialog } from "@/components/erp/hr-policy-reader-stats-dialog"
import { HrPolicySendDialog } from "@/components/erp/hr-policy-send-dialog"
import {
  MAX_NOTICE_FILES,
  type NoticeAttachedFile,
} from "@/lib/notice-attachments"
import { uploadAndBuildNoticeAttachment } from "@/lib/notice-attachment-client"

function hrPolicyAttachmentCount(raw: unknown): number {
  if (raw == null || raw === "") return 0
  try {
    const a = JSON.parse(String(raw)) as unknown
    return Array.isArray(a) ? a.length : 0
  } catch {
    return 0
  }
}

export function HrPolicyAdminWorkspace() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [title, setTitle] = React.useState("")
  const [docRef, setDocRef] = React.useState("")
  const [docTo, setDocTo] = React.useState("전 직원")
  const [contentBody, setContentBody] = React.useState("")
  const [editingIsActive, setEditingIsActive] = React.useState(false)
  const [effectiveAt, setEffectiveAt] = React.useState("")
  const [editingId, setEditingId] = React.useState(0)
  const [policies, setPolicies] = React.useState<HrPolicyRow[]>([])
  const [listLoading, setListLoading] = React.useState(false)
  const [readOpen, setReadOpen] = React.useState(false)
  const [readTitle, setReadTitle] = React.useState("")
  const [readItems, setReadItems] = React.useState<{ store: string; name: string; read_at: string; status: string }[]>([])
  const [readLoading, setReadLoading] = React.useState(false)
  const [statsOpen, setStatsOpen] = React.useState(false)
  const [sendOpen, setSendOpen] = React.useState(false)
  const [sendPolicy, setSendPolicy] = React.useState<HrPolicyRow | null>(null)
  const [files, setFiles] = React.useState<NoticeAttachedFile[]>([])
  const [saving, setSaving] = React.useState(false)
  const [fileUploading, setFileUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const loadPolicyList = React.useCallback(() => {
    setListLoading(true)
    getHrPolicies()
      .then((r) => {
        if (r.success) setPolicies(r.items || [])
        else setPolicies([])
      })
      .catch(() => setPolicies([]))
      .finally(() => setListLoading(false))
  }, [])

  React.useEffect(() => {
    loadPolicyList()
  }, [loadPolicyList])

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const selected = input.files
    if (!selected || selected.length === 0) return
    const remaining = MAX_NOTICE_FILES - files.length
    if (remaining <= 0) {
      await appAlert(t("noticeFileLimit"))
      input.value = ""
      return
    }
    const fileArray = Array.from(selected)
    setFileUploading(true)
    const newFiles: NoticeAttachedFile[] = []
    try {
      for (let i = 0; i < fileArray.length; i++) {
        if (newFiles.length >= remaining) {
          await appAlert(t("noticeFileLimit"))
          break
        }
        const file = fileArray[i]
        try {
          const id = `f-${Date.now()}-${i}-${newFiles.length}`
          newFiles.push(await uploadAndBuildNoticeAttachment(file, id))
        } catch (err) {
          await appAlert(
            `${file.name}: ` + (err instanceof Error ? err.message : String(err))
          )
        }
      }
      if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles])
    } finally {
      setFileUploading(false)
      input.value = ""
    }
  }

  const fillFormFromRow = (row: HrPolicyRow) => {
    setEditingId(row.id)
    setTitle(row.title || "")
    const parts = parseHrPolicyContent(String(row.content || ""))
    setDocRef(parts.docRef)
    setDocTo(parts.recipientTo || "전 직원")
    setContentBody(parts.body)
    setEditingIsActive(row.is_active !== false)
    setEffectiveAt(
      row.effective_at ? String(row.effective_at).slice(0, 10) : ""
    )
    const att: NoticeAttachedFile[] = []
    if (row.attachments) {
      try {
        const raw = JSON.parse(String(row.attachments)) as { name?: string; mime?: string; url?: string }[]
        if (Array.isArray(raw)) {
          raw.forEach((a, i) => {
            if (!a?.url) return
            const mime = String(a.mime || "application/octet-stream")
            const type = mime.startsWith("image/")
              ? "image"
              : mime.startsWith("video/")
                ? "video"
                : mime.includes("pdf")
                  ? "pdf"
                  : "doc"
            att.push({
              id: `a-${i}-${a.url.slice(-20)}`,
              name: a.name || "file",
              size: "",
              type,
              url: a.url,
              mime,
            })
          })
        }
      } catch {
        /* */
      }
    }
    setFiles(att)
  }

  const clearForm = () => {
    setEditingId(0)
    setTitle("")
    setDocRef("")
    setDocTo("전 직원")
    setContentBody("")
    setEditingIsActive(false)
    setEffectiveAt("")
    setFiles([])
  }

  const handleSave = async () => {
    if (!title.trim()) {
      await appAlert(t("adminNoticeSubjectRequired"))
      return
    }
    const hasFile = files.length > 0
    const hasBody = Boolean(contentBody.trim())
    if (!hasFile && !hasBody) {
      await appAlert(t("hrPolicyBodyOrFileRequired"))
      return
    }
    if (!auth?.store || !auth?.user) return
    const bodyText = hasBody ? contentBody.trim() : t("hrPolicyDefaultBodyWhenFileOnly")
    const fullContent = buildHrPolicyContent({
      docRef: docRef.trim(),
      recipientTo: docTo.trim() || "전 직원",
      body: bodyText,
    })
    const isNew = editingId === 0
    setSaving(true)
    try {
      const attachments = files.map((f) => ({ name: f.name, mime: f.mime, url: f.url }))
      const res = await saveHrPolicy({
        id: isNew ? undefined : editingId,
        title: title.trim(),
        content: fullContent,
        targetStore: "전체",
        targetRole: "전체",
        effectiveAt: effectiveAt.trim() || null,
        is_active: isNew ? false : editingIsActive,
        attachments,
      })
      if (res.success) {
        clearForm()
        loadPolicyList()
        window.dispatchEvent(new CustomEvent("hr-policy-saved"))
        await appAlert(translateApiMessage(res.message, t) || t("inv_settings_saved"))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("noticeSendFail"))
      }
    } finally {
      setSaving(false)
    }
  }

  const openReadDetail = (row: HrPolicyRow) => {
    setReadTitle(row.title || "")
    setReadOpen(true)
    setReadLoading(true)
    setReadItems([])
    getHrPolicyReadDetail({ policyId: row.id })
      .then((d) => {
        setReadItems(
          d.items.map((i) => ({
            store: i.store,
            name: i.name,
            read_at: i.read_at,
            status: i.status,
          }))
        )
      })
      .catch(() => setReadItems([]))
      .finally(() => setReadLoading(false))
  }

  if (!auth?.store || !auth?.user) return null

  const handleDeactivate = async (row: HrPolicyRow) => {
    const r = await appConfirm(t("hrPolicyConfirmDeactivate") || "이 규정을 비활성화할까요?")
    if (!r) return
    setSaving(true)
    try {
      const res = await saveHrPolicy({
        id: row.id,
        title: String(row.title || ""),
        content: String(row.content || ""),
        targetStore: String(row.target_store || "전체"),
        targetRole: String(row.target_role || "전체"),
        targetPermissionGroup: row.target_permission_group || undefined,
        effectiveAt: row.effective_at ? String(row.effective_at).slice(0, 10) : null,
        is_active: false,
        targetRecipients: (() => {
          try {
            if (!row.target_recipients) return undefined
            const p = JSON.parse(String(row.target_recipients)) as string[]
            if (!Array.isArray(p)) return undefined
            return p.map((line) => {
              const [a, b] = String(line).split("|")
              return { store: a || "", name: b || "" }
            })
          } catch {
            return undefined
          }
        })(),
        attachments: (() => {
          try {
            if (!row.attachments) return undefined
            const a = JSON.parse(String(row.attachments)) as { name?: string; mime?: string; url?: string }[]
            return Array.isArray(a) ? a.map((x) => ({ name: x.name || "f", mime: x.mime || "", url: x.url || "" })) : undefined
          } catch {
            return undefined
          }
        })(),
      })
      if (res.success) {
        loadPolicyList()
        await appAlert(t("inv_settings_saved"))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("noticeSendFail"))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground">
              {editingId > 0 ? t("hrPolicyEditMode") : t("hrPolicyNewBlockTitle")}
            </h3>
            <p className="text-[11px] text-muted-foreground max-w-prose">
              {t("hrPolicyNewBlockSub")}
            </p>
          </div>
        </div>
        {editingId > 0 ? (
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clearForm}>
            {t("emp_new")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-5 p-6">
        {/* Title */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
            {t("labelSubject")}
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("noticeTitlePlaceholder")}
            className="h-10 text-sm"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-2xl">
          <div className="flex flex-col gap-2 max-w-xs">
            <label className="text-xs font-semibold text-foreground">
              {t("hrPolicyEffectiveAt")}
            </label>
            <Input
              type="date"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              className="h-10 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-3xl">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("hrPolicyDocRef")}</label>
            <Input
              value={docRef}
              onChange={(e) => setDocRef(e.target.value)}
              placeholder="HR-2025-001"
              className="h-9 text-sm font-mono"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("hrPolicyDocRecipientLine")}</label>
            <Input
              value={docTo}
              onChange={(e) => setDocTo(e.target.value)}
              placeholder={t("hrPolicyDocRecipientPlaceholder")}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div
          className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-primary/25 bg-primary/[0.03] p-4"
        >
          <label className="text-xs font-bold text-foreground">
            {t("hrPolicyUploadPrimaryLabel")}
          </label>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{t("hrPolicyUploadPrimaryHint")}</p>
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2"
                >
                  {file.type === "image" ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                  ) : file.type === "video" ? (
                    <Video className="h-4 w-4 shrink-0 text-violet-500" />
                  ) : file.type === "pdf" ? (
                    <FileText className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-card-foreground">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{file.size}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.hwp,.ppt,.pptx,.xls,.xlsx"
              multiple
              className="hidden"
              disabled={fileUploading}
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
            >
              <Paperclip className="mr-2 h-3.5 w-3.5" />
              {fileUploading ? t("loading") : t("hrPolicyUploadPickFiles")}
            </Button>
            <p className="text-[11px] text-muted-foreground">{t("hrPolicyUploadFileTypesHint")}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="text-xs font-semibold text-foreground">{t("hrPolicyBodyOptionalLabel")}</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={async () => {
                const template = t("hrPolicyTemplateBody")
                if (!contentBody.trim()) {
                  setContentBody(template)
                  return
                }
                if (await appConfirm(t("hrPolicyTemplateReplaceConfirm"))) {
                  setContentBody(template)
                }
              }}
            >
              <FileInput className="h-3.5 w-3.5" />
              {t("hrPolicyInsertTemplate")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("hrPolicyBodyOptionalHint")}</p>
          <div className="rounded-lg border border-border/80 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
            <div className="border-b bg-muted/40 px-4 py-2">
              <p className="text-center text-xs font-bold tracking-tight text-foreground/90">
                {t("hrPolicyDocPageTitle")}
              </p>
            </div>
            <Textarea
              value={contentBody}
              onChange={(e) => setContentBody(e.target.value)}
              placeholder={t("hrPolicyDocBodyPlaceholder")}
              spellCheck
              className="min-h-[12rem] w-full resize-y border-0 bg-transparent p-4 text-sm leading-7 text-foreground shadow-none focus-visible:ring-0 sm:min-h-[16rem] font-serif"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("noticeFileLimit")}</p>
        </div>

        {/* Submit */}
        <div className="flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("hrPolicySaveDraftHint")}</p>
        </div>
        <Button
          className="h-11 text-sm font-bold"
          type="button"
          onClick={handleSave}
          disabled={saving || fileUploading}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? t("loading") : t("hrPolicySaveDocument")}
        </Button>
      </div>
    </div>

    <div className="rounded-xl border bg-card shadow-sm flex flex-col min-h-[320px]">
      <div className="flex items-center justify-between border-b px-4 py-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold">{t("hrPolicyListTitle")}</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => loadPolicyList()}
            disabled={listLoading}
          >
            {t("search")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setStatsOpen(true)}
          >
            <BarChart2 className="mr-1.5 h-3.5 w-3.5" />
            {t("hrPolicyReadStatsOpen")}
          </Button>
        </div>
      </div>
      <div className="flex-1 p-3 overflow-auto max-h-[70vh] text-xs">
        {listLoading ? (
          <div className="py-8 text-center text-muted-foreground">{t("loading")}</div>
        ) : policies.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">{t("noNotices")}</div>
        ) : (
          <ul className="space-y-1">
            {policies.map((p) => {
              const ca = p.created_at ? String(p.created_at).slice(0, 10) : ""
              const v = p.content_version ?? 1
              const attN = hrPolicyAttachmentCount(p.attachments)
              return (
                <li
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded border border-border/50 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{p.title || "—"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {ca} · v{v}
                      {p.is_active === false
                        ? " · " + t("hrPolicyDraftBadge")
                        : " · " + t("hrPolicyListPublished")}
                      {attN > 0 && (
                        <span className="inline-flex items-center gap-0.5 pl-0.5">
                          ·
                          <Paperclip className="h-2.5 w-2.5 opacity-80" aria-hidden />
                          {t("hrPolicyListNFiles").replace(/\{n\}/g, String(attN))}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 flex-wrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      title={t("hrPolicyReadDetailTitle")}
                      onClick={() => openReadDetail(p)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      title={t("hrPolicyEditMode")}
                      onClick={() => fillFormFromRow(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-0.5 px-1.5 text-[10px]"
                      title={t("hrPolicyOpenDeploy")}
                      onClick={() => {
                        setSendPolicy(p)
                        setSendOpen(true)
                      }}
                    >
                      <Megaphone className="h-3.5 w-3.5" />
                      {t("hrPolicyOpenDeploy")}
                    </Button>
                    {p.is_active !== false && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => void handleDeactivate(p)}
                      >
                        {t("hrPolicyListDeactivate")}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>

    <Dialog open={readOpen} onOpenChange={setReadOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{readTitle || t("hrPolicyReadDetailTitle")}</DialogTitle>
        </DialogHeader>
        {readLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : (
          <div className="max-h-56 overflow-auto border rounded text-xs">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="p-2">{t("store")}</th>
                  <th className="p-2">{t("emp_label_name")}</th>
                  <th className="p-2">{t("hrPolicyReadAt")}</th>
                  <th className="p-2">{t("hrPolicyReadStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {readItems.map((r) => (
                  <tr key={`${r.store}|${r.name}`} className="border-t">
                    <td className="p-1.5">{r.store}</td>
                    <td className="p-1.5">{r.name}</td>
                    <td className="p-1.5 text-muted-foreground">{r.read_at || "—"}</td>
                    <td className="p-1.5">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <HrPolicyReaderStatsDialog open={statsOpen} onOpenChange={setStatsOpen} />

    <HrPolicySendDialog
      open={sendOpen}
      onOpenChange={setSendOpen}
      policy={sendPolicy}
      onDeployed={() => {
        loadPolicyList()
        setSendPolicy(null)
        window.dispatchEvent(new CustomEvent("hr-policy-saved"))
      }}
    />
    </div>
  )
}
