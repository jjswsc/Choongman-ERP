"use client"

import * as React from "react"
import {
  Send,
  Paperclip,
  X,
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
import { ScrollArea } from "@/components/ui/scroll-area"
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
}

export function AdminNoticeCompose() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [stores, setStores] = React.useState<string[]>([])
  const [positions, setPositions] = React.useState<string[]>([])
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [selectedPositions, setSelectedPositions] = React.useState<string[]>([])
  const [files, setFiles] = React.useState<AttachedFile[]>([])
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === "director" || auth.role === "officer"
    getNoticeOptions().then((r) => {
      const storeList = isOffice ? (r.stores || []) : [auth.store!]
      setStores([t("noticeFilterAll"), ...storeList])
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
      const res = await sendNotice({
        title: title.trim(),
        content: content.trim(),
        targetStore,
        targetRole,
        sender: auth.user,
        userStore: auth.store,
        userRole: auth.role,
      })
      if (res.success) {
        setTitle("")
        setContent("")
        setSelectedStores([])
        setSelectedPositions([])
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
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Send className="h-[18px] w-[18px] text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-card-foreground">
            {t("noticeNewTitle")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("noticeNewSub")}
          </p>
        </div>
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

        {/* Store & Position side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Store list */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Store className="h-3.5 w-3.5 text-primary" />
              {t("adminTargetStores").split(" ")[0] || t("store")}
              {selectedStores.length > 0 && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {selectedStores.length === stores.length - 1
                    ? t("noticeFilterAll")
                    : `${selectedStores.length}${t("noticeStoreCountSuffix")}`}
                </span>
              )}
            </label>
            <ScrollArea className="h-[180px] rounded-lg border bg-muted/20 p-1">
              <div className="flex flex-col gap-0.5">
                {stores.map((store) => {
                  const isAll = store === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedStores.length === stores.length - 1
                    : selectedStores.includes(store)
                  return (
                    <label
                      key={store}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs cursor-pointer transition-colors",
                        checked
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-card-foreground hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStore(store)}
                        className="h-4 w-4"
                      />
                      <span>{store}</span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Position list */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Briefcase className="h-3.5 w-3.5 text-success" />
              {t("adminTargetRoles").split("/")[0]?.trim() || t("leaveType")}
              {selectedPositions.length > 0 && (
                <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                  {selectedPositions.length === positions.length - 1
                    ? t("noticeFilterAll")
                    : `${selectedPositions.length}${t("noticePositionCountSuffix")}`}
                </span>
              )}
            </label>
            <ScrollArea className="h-[180px] rounded-lg border bg-muted/20 p-1">
              <div className="flex flex-col gap-0.5">
                {positions.map((pos) => {
                  const isAll = pos === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedPositions.length === positions.length - 1
                    : selectedPositions.includes(pos)
                  return (
                    <label
                      key={pos}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs cursor-pointer transition-colors",
                        checked
                          ? "bg-success/10 font-semibold text-success"
                          : "text-card-foreground hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePosition(pos)}
                        className="h-4 w-4"
                      />
                      <span>{pos}</span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
            {t("labelContent")}
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("noticeContentPlaceholder")}
            className="min-h-[160px] text-sm resize-none"
          />
        </div>

        {/* File attachment */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
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
                    <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/30 hover:border-muted-foreground/30"
            >
              <Paperclip className="h-4 w-4" />
              <span>{t("noticeFileAdd").split("(")[0]?.trim() || t("noticeFileAdd")}</span>
            </button>
            <p className="text-[11px] text-muted-foreground">{t("noticeFileLimit")}</p>
          </div>
        </div>

        {/* Submit */}
        <Button
          className="h-11 text-sm font-bold"
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
