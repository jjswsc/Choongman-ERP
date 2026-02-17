"use client"

import * as React from "react"
import {
  Send,
  Paperclip,
  X,
  ChevronDown,
  ChevronUp,
  Store,
  Briefcase,
  FileText,
  Image as ImageIcon,
  File,
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

interface AttachedFile {
  id: string
  name: string
  size: string
  type: "image" | "pdf" | "doc"
  dataUrl: string
  mime: string
}

const MAX_FILE_SIZE = 1024 * 1024
const MAX_FILES = 3

export function NoticeCompose() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [stores, setStores] = React.useState<string[]>([])
  const [positions, setPositions] = React.useState<string[]>([])
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [selectedPositions, setSelectedPositions] = React.useState<string[]>([])
  const [storesOpen, setStoresOpen] = React.useState(false)
  const [positionsOpen, setPositionsOpen] = React.useState(false)
  const [files, setFiles] = React.useState<AttachedFile[]>([])
  const [sending, setSending] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === "director" || auth.role === "officer"
    getNoticeOptions().then((r) => {
      const storeList = isOffice ? (r.stores || []) : [auth.store!]
      const allStores = [t("noticeFilterAll"), ...storeList]
      setStores(allStores)
      setPositions([t("noticeFilterAll"), ...(r.roles || [])])
    })
  }, [auth?.store, auth?.role, t])

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

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const selected = input.files
    if (!selected || selected.length === 0) return
    const remaining = MAX_FILES - files.length
    if (remaining <= 0) {
      alert(t("noticeFileLimit") || "파일당 5MB, 최대 10개")
      input.value = ""
      return
    }
    const newFiles: AttachedFile[] = []
    const processNext = (idx: number) => {
      if (idx >= selected.length || newFiles.length >= remaining) {
        if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles])
        input.value = ""
        return
      }
      const file = selected[idx]
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name}: ` + (t("noticeFileLimit") || "파일당 1MB, 최대 3개"))
        processNext(idx + 1)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const mime = file.type || "application/octet-stream"
        let typ: "image" | "pdf" | "doc" = "doc"
        if (mime.startsWith("image/")) typ = "image"
        else if (mime.includes("pdf")) typ = "pdf"
        newFiles.push({
          id: `f-${Date.now()}-${idx}`,
          name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          type: typ,
          dataUrl,
          mime,
        })
        processNext(idx + 1)
      }
      reader.readAsDataURL(file)
    }
    processNext(0)
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

  const handleSend = async () => {
    if (!title.trim()) {
      alert(t("adminNoticeSubjectRequired"))
      return
    }
    if (!auth?.store || !auth?.user) return
    const allStores = selectedStores.length === stores.length - 1
    const allPos = selectedPositions.length === positions.length - 1
    const targetStore =
      selectedStores.length === 0 || allStores ? "전체" : selectedStores.join(",")
    const targetRole =
      selectedPositions.length === 0 || allPos ? "전체" : selectedPositions.join(",")
    setSending(true)
    try {
      const attachments = files.map((f) => ({ name: f.name, mime: f.mime, url: f.dataUrl }))
      const res = await sendNotice({
        title: title.trim(),
        content: content.trim(),
        targetStore,
        targetRole,
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
        setFiles([])
        window.dispatchEvent(new CustomEvent("notice-sent"))
        alert(translateApiMessage(res.message, t) || t("noticeSentSuccess"))
      } else {
        alert(translateApiMessage(res.message, t) || t("noticeSendFail"))
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

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setStoresOpen(!storesOpen)}
            className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 transition-colors active:bg-muted/30"
          >
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[hsl(215,80%,50%)]" />
              <span className="text-xs font-semibold text-card-foreground">
                {t("adminTargetStores").split(" ")[0] || t("store")}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold",
                  selectedStores.length > 0
                    ? "bg-[hsl(215,80%,50%)]/10 text-[hsl(215,80%,50%)]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {storeLabel}
              </span>
            </div>
            {storesOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {storesOpen && (
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/20 p-3">
              {stores.map((store) => {
                const isAll = store === t("noticeFilterAll")
                const checked = isAll
                  ? selectedStores.length === stores.length - 1
                  : selectedStores.includes(store)
                return (
                  <label
                    key={store}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer",
                      checked
                        ? "bg-[hsl(215,80%,50%)]/10 font-semibold text-[hsl(215,80%,50%)]"
                        : "bg-card text-card-foreground hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStore(store)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span>{store}</span>
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
            className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 transition-colors active:bg-muted/30"
          >
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[hsl(152,60%,42%)]" />
              <span className="text-xs font-semibold text-card-foreground">
                {t("adminTargetRoles").split("/")[0]?.trim() || t("leaveType")}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold",
                  selectedPositions.length > 0
                    ? "bg-[hsl(152,60%,42%)]/10 text-[hsl(152,60%,42%)]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {positionLabel}
              </span>
            </div>
            {positionsOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {positionsOpen && (
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/20 p-3">
              {positions.map((pos) => {
                const isAll = pos === t("noticeFilterAll")
                const checked = isAll
                  ? selectedPositions.length === positions.length - 1
                  : selectedPositions.includes(pos)
                return (
                  <label
                    key={pos}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer",
                      checked
                        ? "bg-[hsl(152,60%,42%)]/10 font-semibold text-[hsl(152,60%,42%)]"
                        : "bg-card text-card-foreground hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePosition(pos)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span>{pos}</span>
                  </label>
                )
              })}
            </div>
          )}
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
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-4 text-xs font-semibold text-muted-foreground transition-colors active:bg-muted/30"
          >
            <Paperclip className="h-4 w-4" />
            <span>{t("noticeFileAdd")}</span>
          </button>
          <p className="text-[10px] text-muted-foreground/60">{t("noticeFileLimit")}</p>
        </div>

        <Button
          className="h-12 rounded-xl text-sm font-bold mt-1"
          onClick={handleSend}
          disabled={sending}
        >
          <Send className="mr-2 h-4 w-4" />
          {sending ? t("loading") : t("adminSendNoticeBtn")}
        </Button>
      </div>
    </div>
  )
}
