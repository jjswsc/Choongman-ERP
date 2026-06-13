"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  Send,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  File,
  Video,
  RotateCcw,
  Bookmark,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  sendNotice,
  estimateNoticeRecipients,
  getNoticeTemplates,
  saveNoticeTemplate,
  type NoticeTemplateItem,
} from "@/lib/api-client"
import {
  MAX_NOTICE_FILES,
  type NoticeAttachedFile,
} from "@/lib/notice-attachments"
import { uploadAndBuildNoticeAttachment } from "@/lib/notice-attachment-client"
import {
  buildBroadcastTargetPayload,
  emptyBroadcastTargetSelection,
  type BroadcastTargetSelectionState,
} from "@/lib/broadcast-target-selection"
import {
  BroadcastTargetPicker,
  type BroadcastTargetOptionCounts,
} from "@/components/erp/broadcast-target-picker"
import { NoticeSendPreviewDialog } from "@/components/erp/notice-send-preview-dialog"
import { bangkokTodayYmd } from "@/lib/bangkok-date"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Props = {
  compact?: boolean
}

export function AdminNoticeCompose({ compact = false }: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const aiPrefillApplied = React.useRef(false)
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [targetSelection, setTargetSelection] = React.useState<BroadcastTargetSelectionState>(
    emptyBroadcastTargetSelection()
  )
  const [optionCounts, setOptionCounts] = React.useState<BroadcastTargetOptionCounts>({
    storeOptionCount: 0,
    positionOptionCount: 0,
    permissionOptionCount: 0,
  })
  const [files, setFiles] = React.useState<NoticeAttachedFile[]>([])
  const [sending, setSending] = React.useState(false)
  const [fileUploading, setFileUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isUrgent, setIsUrgent] = React.useState(false)
  const [expiresAt, setExpiresAt] = React.useState("")
  const [scheduledAt, setScheduledAt] = React.useState("")
  const [recipientCount, setRecipientCount] = React.useState<number | null>(null)
  const [estimating, setEstimating] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [lastFcmSent, setLastFcmSent] = React.useState<number | null>(null)
  const [lastFcmFailed, setLastFcmFailed] = React.useState<number | null>(null)
  const [lastRecipientTotal, setLastRecipientTotal] = React.useState<number | null>(null)
  const [templates, setTemplates] = React.useState<NoticeTemplateItem[]>([])
  const [templateLoading, setTemplateLoading] = React.useState(false)

  const payload = React.useMemo(
    () =>
      buildBroadcastTargetPayload(targetSelection, {
        storeOptions: optionCounts.storeOptionCount,
        positionOptions: optionCounts.positionOptionCount,
        permissionOptions: optionCounts.permissionOptionCount,
      }),
    [targetSelection, optionCounts]
  )

  const loadTemplates = React.useCallback(() => {
    setTemplateLoading(true)
    getNoticeTemplates()
      .then((r) => setTemplates(r.items))
      .catch(() => setTemplates([]))
      .finally(() => setTemplateLoading(false))
  }, [])

  React.useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  React.useEffect(() => {
    if (aiPrefillApplied.current) return
    const prefillTitle = searchParams.get("prefillTitle")
    const prefillContent = searchParams.get("prefillContent")
    const prefillStore = searchParams.get("prefillStore")
    if (!prefillTitle && !prefillContent) return
    aiPrefillApplied.current = true
    if (prefillTitle) setTitle(prefillTitle)
    if (prefillContent) setContent(prefillContent)
    if (prefillStore?.trim()) {
      setTargetSelection({
        ...emptyBroadcastTargetSelection(),
        selectedStores: [prefillStore.trim()],
      })
    }
  }, [searchParams])

  const runEstimate = React.useCallback(() => {
    setEstimating(true)
    estimateNoticeRecipients({
      targetStore: payload.targetStore,
      targetRole: payload.targetRole,
      targetPermissionGroup: payload.targetPermissionGroup,
      targetRecipients: payload.targetRecipients,
    })
      .then((r) => setRecipientCount(r.count))
      .catch(() => setRecipientCount(null))
      .finally(() => setEstimating(false))
  }, [payload])

  React.useEffect(() => {
    const timer = window.setTimeout(runEstimate, 400)
    return () => window.clearTimeout(timer)
  }, [runEstimate])

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

  const resetForm = () => {
    setTitle("")
    setContent("")
    setTargetSelection(emptyBroadcastTargetSelection())
    setFiles([])
    setIsUrgent(false)
    setExpiresAt("")
    setScheduledAt("")
  }

  const handleSend = async () => {
    if (!title.trim()) {
      await appAlert(t("adminNoticeSubjectRequired"))
      return
    }
    if (!auth?.store || !auth?.user) return
    setSending(true)
    try {
      const attachments = files.map((f) => ({ name: f.name, mime: f.mime, url: f.url }))
      const res = await sendNotice({
        title: title.trim(),
        content: content.trim(),
        targetStore: payload.targetStore,
        targetRole: payload.targetRole,
        targetPermissionGroup: payload.targetPermissionGroup || undefined,
        sender: auth.user,
        userStore: auth.store,
        userRole: auth.role,
        attachments,
        targetRecipients: payload.targetRecipients,
        isUrgent,
        expiresAt: expiresAt.trim() || undefined,
        scheduledAt: scheduledAt.trim() || undefined,
      })
      if (res.success) {
        setLastFcmSent(res.fcmSent ?? 0)
        setLastFcmFailed(res.fcmFailed ?? 0)
        setLastRecipientTotal(recipientCount ?? 0)
        resetForm()
        setPreviewOpen(false)
        window.dispatchEvent(new CustomEvent("notice-sent"))
        await appAlert(translateApiMessage(res.message, t) || t("noticeSentSuccess"))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("noticeSendFail"))
      }
    } finally {
      setSending(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!title.trim()) {
      await appAlert(t("adminNoticeSubjectRequired"))
      return
    }
    const res = await saveNoticeTemplate({ title: title.trim(), content: content.trim() })
    if (res.success) {
      loadTemplates()
      await appAlert(t("noticeTemplateSaved"))
    } else {
      await appAlert(translateApiMessage(res.message, t) || t("noticeSendFail"))
    }
  }

  const applyTemplate = (tpl: NoticeTemplateItem) => {
    setTitle(tpl.title)
    setContent(tpl.content)
  }

  if (!auth?.store || !auth?.user) return null

  const targetRow = {
    target_store: payload.targetStore,
    target_role: payload.targetRole,
    target_permission_group: payload.targetPermissionGroup || null,
    target_recipients: payload.targetRecipients
      ? JSON.stringify(payload.targetRecipients.map((r) => `${r.store}|${r.name}`))
      : null,
  }

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm", compact && "rounded-2xl")}>
      <div className="flex items-center justify-between gap-3 border-b px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Send className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground">{t("noticeNewTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("noticeNewSub")}</p>
          </div>
        </div>
        {recipientCount != null && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">{t("noticePreviewRecipientCount")}</p>
            <p className="text-lg font-bold tabular-nums text-primary">
              {estimating ? "…" : recipientCount}
            </p>
          </div>
        )}
      </div>

      {lastRecipientTotal != null && (
        <div className="border-b bg-muted/30 px-4 sm:px-6 py-3 text-xs space-y-1">
          <p className="font-semibold text-foreground">{t("noticeLastSendResultTitle")}</p>
          <p className="text-muted-foreground">
            {t("noticeLastSendRecipients")}: {lastRecipientTotal} · {t("noticeLastSendPushOk")}:{" "}
            {lastFcmSent ?? 0} · {t("noticeLastSendPushFail")}: {lastFcmFailed ?? 0}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold">{t("labelSubject")}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("noticeTitlePlaceholder")}
            className="h-10 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <label className="text-[10px] font-medium text-muted-foreground block mb-1">
              {t("noticeTemplateLabel")}
            </label>
            <Select
              value=""
              onValueChange={(v) => {
                const tpl = templates.find((x) => String(x.id) === v)
                if (tpl) applyTemplate(tpl)
              }}
              disabled={templateLoading || templates.length === 0}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={t("noticeTemplatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={String(tpl.id)}>
                    {tpl.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={handleSaveTemplate}
          >
            <Bookmark className="mr-1.5 h-3.5 w-3.5" />
            {t("noticeTemplateSave")}
          </Button>
        </div>

        <BroadcastTargetPicker
          value={targetSelection}
          onChange={setTargetSelection}
          onOptionCountsChange={setOptionCounts}
          employeeListHeight={compact ? 80 : 120}
        />

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold">{t("labelContent")}</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("noticeContentPlaceholder")}
            className="min-h-[120px] text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={isUrgent} onCheckedChange={(v) => setIsUrgent(Boolean(v))} />
            {t("noticeUrgentLabel")}
          </label>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              {t("noticeScheduledAtLabel")}
            </label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              {t("noticeExpiresAtLabel")}
            </label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-9 text-xs date-input-compact"
              min={bangkokTodayYmd()}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold">{t("noticeFileLabel")}</label>
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2"
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
                    <p className="truncate text-xs font-semibold">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{file.size}</p>
                  </div>
                  <button type="button" onClick={() => removeFile(file.id)} className="p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
              multiple
              className="hidden"
              disabled={fileUploading}
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs font-semibold text-muted-foreground hover:bg-muted/30"
            >
              <Paperclip className="h-4 w-4" />
              {fileUploading ? t("loading") : t("noticeFileAdd")}
            </button>
            <p className="text-[11px] text-muted-foreground">{t("noticeFileLimit")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 text-xs"
            onClick={resetForm}
            disabled={sending}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t("noticeFormReset")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-xs"
            onClick={() => setPreviewOpen(true)}
            disabled={sending || fileUploading || !title.trim()}
          >
            {t("noticePreviewBeforeSend")}
          </Button>
          <Button
            className="h-10 text-sm font-bold flex-1 sm:flex-none"
            onClick={() => setPreviewOpen(true)}
            disabled={sending || fileUploading || !title.trim()}
          >
            <Send className="mr-2 h-4 w-4" />
            {sending ? t("loading") : t("adminSendNoticeBtn")}
          </Button>
        </div>
      </div>

      <NoticeSendPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={title}
        content={content}
        recipientCount={recipientCount ?? 0}
        targetSummary={targetRow}
        files={files}
        isUrgent={isUrgent}
        scheduledAt={scheduledAt}
        expiresAt={expiresAt}
        onConfirm={handleSend}
        confirming={sending}
      />
    </div>
  )
}
