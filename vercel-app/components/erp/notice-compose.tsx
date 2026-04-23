"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import {
  Send,
  Paperclip,
  X,
  ChevronDown,
  ChevronUp,
  Store,
  Briefcase,
  Shield,
  FileText,
  Image as ImageIcon,
  File,
  Video,
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
import { getNoticeOptions, sendNotice } from "@/lib/api-client"
import {
  MAX_NOTICE_FILES,
  type NoticeAttachedFile,
} from "@/lib/notice-attachments"
import { uploadAndBuildNoticeAttachment } from "@/lib/notice-attachment-client"

export function NoticeCompose() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [stores, setStores] = React.useState<string[]>([])
  const [positions, setPositions] = React.useState<string[]>([])
  const [permissionGroups, setPermissionGroups] = React.useState<string[]>([])
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [selectedPositions, setSelectedPositions] = React.useState<string[]>([])
  const [selectedPermissionGroups, setSelectedPermissionGroups] = React.useState<string[]>([])
  const [storesOpen, setStoresOpen] = React.useState(false)
  const [positionsOpen, setPositionsOpen] = React.useState(false)
  const [permissionGroupsOpen, setPermissionGroupsOpen] = React.useState(false)
  const [files, setFiles] = React.useState<NoticeAttachedFile[]>([])
  const [sending, setSending] = React.useState(false)
  const [fileUploading, setFileUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === "director" || auth.role === "officer"
    getNoticeOptions().then((r) => {
      const allLabel = t("noticeFilterAll")
      const storeList = isOffice ? (r.stores || []) : [auth.store!]
      setStores([allLabel, ...storeList])
      setPositions([allLabel, ...(r.roles || [])])
      setPermissionGroups([allLabel, ...(r.permissionGroups || [])])
    })
  }, [auth?.store, auth?.role, lang])

  const toggleStore = (store: string) => {
    const allLabel = t("noticeFilterAll")
    if (store === allLabel) {
      setSelectedStores(
        selectedStores.length === stores.length - 1
          ? []
          : stores.filter((s) => s !== allLabel)
      )
      return
    }
    setSelectedStores((prev) =>
      prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]
    )
  }

  const togglePosition = (position: string) => {
    const allLabel = t("noticeFilterAll")
    if (position === allLabel) {
      setSelectedPositions(
        selectedPositions.length === positions.length - 1
          ? []
          : positions.filter((p) => p !== allLabel)
      )
      return
    }
    setSelectedPositions((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position]
    )
  }

  const togglePermissionGroup = (perm: string) => {
    const allLabel = t("noticeFilterAll")
    if (perm === allLabel) {
      setSelectedPermissionGroups(
        selectedPermissionGroups.length === permissionGroups.length - 1
          ? []
          : permissionGroups.filter((p) => p !== allLabel)
      )
      return
    }
    setSelectedPermissionGroups((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

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

  const storeLabel =
    selectedStores.length === 0
      ? t("noticeStorePlaceholder")
      : selectedStores.length === stores.length - 1
      ? t("scheduleStoreAll")
      : `${selectedStores.length}${t("noticeStoreCountSuffix")}`

  const positionLabel =
    selectedPositions.length === 0
      ? t("noticePositionSelect")
      : selectedPositions.length === positions.length - 1
      ? t("noticePositionAll")
      : `${selectedPositions.length}${t("noticePositionCountSuffix")}`

  const permissionGroupLabel =
    selectedPermissionGroups.length === 0
      ? t("noticePermissionGroupSelect")
      : selectedPermissionGroups.length === permissionGroups.length - 1
      ? t("noticePermissionGroupAll")
      : `${selectedPermissionGroups.length}${t("noticePermissionGroupCountSuffix")}`

  const handleSend = async () => {
    if (!title.trim()) {
      await appAlert(t("adminNoticeSubjectRequired"))
      return
    }
    if (!auth?.store || !auth?.user) return
    const allStores = selectedStores.length === stores.length - 1
    const allPos = selectedPositions.length === positions.length - 1
    const allPerm = selectedPermissionGroups.length === permissionGroups.length - 1
    const targetStore =
      selectedStores.length === 0 || allStores ? "전체" : selectedStores.join(",")
    const targetRole =
      selectedPositions.length === 0 || allPos ? "전체" : selectedPositions.join(",")
    const targetPermissionGroup =
      selectedPermissionGroups.length === 0 || allPerm ? "" : selectedPermissionGroups.join(",")
    setSending(true)
    try {
      const attachments = files.map((f) => ({ name: f.name, mime: f.mime, url: f.url }))
      const res = await sendNotice({
        title: title.trim(),
        content: content.trim(),
        targetStore,
        targetRole,
        targetPermissionGroup: targetPermissionGroup || undefined,
        sender: auth.user,
        userStore: auth.store,
        userRole: auth.role,
        attachments,
      })
      if (res.success) {
        setTitle("")
        setContent("")
        setSelectedStores([])
        setSelectedPositions([])
        setSelectedPermissionGroups([])
        setFiles([])
        window.dispatchEvent(new CustomEvent("notice-sent"))
        await appAlert(translateApiMessage(res.message, t) || t("noticeSentSuccess"))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("noticeSendFail"))
      }
    } finally {
      setSending(false)
    }
  }

  if (!auth?.store || !auth?.user) return null

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(215,80%,50%)]/10">
          <Send className="h-[18px] w-[18px] text-[hsl(215,80%,50%)]" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-card-foreground">
            {t("noticeNewTitle")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("noticeNewSub")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("labelSubject")}
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("noticeTitlePlaceholder")}
            className="h-10 rounded-lg text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* 매장 */}
          <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setStoresOpen(!storesOpen)}
            className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-2 transition-colors active:bg-muted/30 min-h-10"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Store className="h-3.5 w-3.5 shrink-0 text-[hsl(215,80%,50%)]" />
              <span className="text-[11px] font-semibold text-card-foreground truncate">
                {t("store")}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0",
                  selectedStores.length > 0
                    ? "bg-[hsl(215,80%,50%)]/10 text-[hsl(215,80%,50%)]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {storeLabel}
              </span>
            </div>
            {storesOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
          {storesOpen && (
            <div className="grid grid-cols-1 gap-1 rounded-lg border bg-muted/20 p-2">
              {stores.map((store) => {
                const isAll = store === t("noticeFilterAll")
                const checked = isAll
                  ? selectedStores.length === stores.length - 1
                  : selectedStores.includes(store)
                return (
                  <label
                    key={store}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors cursor-pointer",
                      checked
                        ? "bg-[hsl(215,80%,50%)]/10 font-semibold text-[hsl(215,80%,50%)]"
                        : "bg-card text-card-foreground hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStore(store)}
                      className="h-3 w-3 rounded"
                    />
                    <span className="truncate">{store}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setPermissionGroupsOpen(!permissionGroupsOpen)}
            className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-2 transition-colors active:bg-muted/30 min-h-10"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Shield className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="text-[11px] font-semibold text-card-foreground truncate">
                {t("adminTargetPermissionGroups")}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0",
                  selectedPermissionGroups.length > 0
                    ? "bg-amber-500/10 text-amber-700"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {permissionGroupLabel}
              </span>
            </div>
            {permissionGroupsOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
          {permissionGroupsOpen && (
            <div className="grid grid-cols-1 gap-1 rounded-lg border bg-muted/20 p-2">
              {permissionGroups.map((perm) => {
                const isAll = perm === t("noticeFilterAll")
                const checked = isAll
                  ? selectedPermissionGroups.length === permissionGroups.length - 1
                  : selectedPermissionGroups.includes(perm)
                return (
                  <label
                    key={perm}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors cursor-pointer",
                      checked
                        ? "bg-amber-500/10 font-semibold text-amber-700"
                        : "bg-card text-card-foreground hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePermissionGroup(perm)}
                      className="h-3 w-3 rounded"
                    />
                    <span className="truncate">{perm}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setPositionsOpen(!positionsOpen)}
            className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-2 transition-colors active:bg-muted/30 min-h-10"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-[hsl(152,60%,42%)]" />
              <span className="text-[11px] font-semibold text-card-foreground truncate">
                {t("noticeTargetDept") || "대상 부서"}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0",
                  selectedPositions.length > 0
                    ? "bg-[hsl(152,60%,42%)]/10 text-[hsl(152,60%,42%)]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {positionLabel}
              </span>
            </div>
            {positionsOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
          {positionsOpen && (
            <div className="grid grid-cols-1 gap-1 rounded-lg border bg-muted/20 p-2">
              {positions.map((pos) => {
                const isAll = pos === t("noticeFilterAll")
                const checked = isAll
                  ? selectedPositions.length === positions.length - 1
                  : selectedPositions.includes(pos)
                return (
                  <label
                    key={pos}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors cursor-pointer",
                      checked
                        ? "bg-[hsl(152,60%,42%)]/10 font-semibold text-[hsl(152,60%,42%)]"
                        : "bg-card text-card-foreground hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePosition(pos)}
                      className="h-3 w-3 rounded"
                    />
                    <span className="truncate">{pos}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("labelContent")}
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("noticeContentPlaceholder")}
            className="min-h-[120px] rounded-lg text-sm resize-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("noticeFileLabel")}
          </label>
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2"
                >
                  {file.type === "image" ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-[hsl(215,80%,50%)]" />
                  ) : file.type === "video" ? (
                    <Video className="h-4 w-4 shrink-0 text-violet-500" />
                  ) : file.type === "pdf" ? (
                    <FileText className="h-4 w-4 shrink-0 text-[hsl(0,72%,51%)]" />
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
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-card-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
            className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-4 text-xs font-semibold text-muted-foreground transition-colors active:bg-muted/30 disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
            <span>{fileUploading ? t("loading") : t("noticeFileAdd")}</span>
          </button>
          <p className="text-[10px] text-muted-foreground/60">{t("noticeFileLimit")}</p>
        </div>

        <Button
          className="h-12 rounded-xl text-sm font-bold mt-1"
          onClick={handleSend}
          disabled={sending || fileUploading}
        >
          <Send className="mr-2 h-4 w-4" />
          {sending ? t("loading") : t("adminSendNoticeBtn")}
        </Button>
      </div>
    </div>
  )
}
