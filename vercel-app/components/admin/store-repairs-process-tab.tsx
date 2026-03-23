"use client"
import { appAlert } from "@/lib/app-message"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageIcon, X, ClipboardList, Save } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getStoreRepairProgressLogs,
  addStoreRepairProgressLog,
  updateStoreRepairTicket,
  uploadStoreRepairPhoto,
  type StoreRepairTicketItem,
  type StoreRepairProgressLog,
} from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { cn } from "@/lib/utils"
import { useTranslatedTextMap, useDebouncedTranslatedText } from "@/lib/use-ui-translate"

const OPEN_STATUSES = new Set(["접수", "진행중", "보류"])

const STATUSES: { v: string; k: string }[] = [
  { v: "접수", k: "repair_st_recv" },
  { v: "진행중", k: "repair_st_prog" },
  { v: "완료", k: "repair_st_done" },
  { v: "보류", k: "repair_st_hold" },
  { v: "취소", k: "repair_st_cancel" },
]

type Props = {
  tickets: StoreRepairTicketItem[]
  ticketsLoading: boolean
  onRefreshTickets: () => void
  writerName: string
  /** 목록에서 행 클릭 시 선택할 티켓 id (소비 후 onFocusTicketConsumed 호출) */
  focusTicketId?: number | null
  onFocusTicketConsumed?: () => void
}

export function StoreRepairsProcessTab({
  tickets,
  ticketsLoading,
  onRefreshTickets,
  writerName,
  focusTicketId = null,
  onFocusTicketConsumed,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const fileRef = useRef<HTMLInputElement>(null)

  const [openOnly, setOpenOnly] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [logs, setLogs] = useState<StoreRepairProgressLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [progressNote, setProgressNote] = useState("")
  const [progressPhotoUrls, setProgressPhotoUrls] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [draftStatus, setDraftStatus] = useState("")
  const [draftHandler, setDraftHandler] = useState("")
  const [draftResolution, setDraftResolution] = useState("")
  const [draftVendor, setDraftVendor] = useState("")
  const [draftActualCost, setDraftActualCost] = useState("")

  const ticketTitles = useMemo(() => tickets.map((x) => x.title || ""), [tickets])
  const translateTitle = useTranslatedTextMap(ticketTitles, lang)
  const progressTrans = useDebouncedTranslatedText(progressNote, lang)

  const filteredTickets = useMemo(() => {
    if (!openOnly) return tickets
    return tickets.filter((x) => OPEN_STATUSES.has(x.status))
  }, [tickets, openOnly])

  const selected = useMemo(
    () => (selectedId != null ? tickets.find((x) => x.id === selectedId) : null),
    [tickets, selectedId]
  )

  const loadLogs = useCallback(async (ticketId: number) => {
    setLogsLoading(true)
    try {
      const list = await getStoreRepairProgressLogs(ticketId)
      setLogs(Array.isArray(list) ? list : [])
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId == null) {
      setLogs([])
      return
    }
    void loadLogs(selectedId)
  }, [selectedId, loadLogs])

  useEffect(() => {
    if (!selected) return
    setDraftStatus(selected.status || "접수")
    setDraftHandler(selected.handler || "")
    setDraftResolution(selected.resolutionNote || "")
    setDraftVendor(selected.vendorName || "")
    setDraftActualCost(selected.actualCost != null ? String(selected.actualCost) : "")
    setProgressNote("")
    setProgressPhotoUrls([])
  }, [selected?.id])

  useEffect(() => {
    if (focusTicketId != null) {
      const tix = tickets.find((x) => x.id === focusTicketId)
      if (tix && !OPEN_STATUSES.has(tix.status)) setOpenOnly(false)
      if (tix) setSelectedId(focusTicketId)
      onFocusTicketConsumed?.()
      return
    }
    if (filteredTickets.length === 0) {
      setSelectedId(null)
      return
    }
    if (selectedId == null || !filteredTickets.some((x) => x.id === selectedId)) {
      setSelectedId(filteredTickets[0].id ?? null)
    }
  }, [focusTicketId, tickets, filteredTickets, selectedId, onFocusTicketConsumed])

  const labelSt = (v: string) => STATUSES.find((c) => c.v === v)?.k || "repair_st_recv"

  const onPickProgressPhotos = async (files: FileList | null) => {
    if (!files?.length || !selected?.store) return
    const next: string[] = []
    for (let i = 0; i < files.length; i++) {
      const res = await uploadStoreRepairPhoto(selected.store, files[i])
      if (res.success && res.url) next.push(res.url)
      else await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
    }
    if (next.length) setProgressPhotoUrls((u) => [...u, ...next])
  }

  const saveTicketMeta = async () => {
    if (!selected?.id) return
    setSaving(true)
    try {
      const res = await updateStoreRepairTicket(selected.id, {
        store: selected.store,
        reporter: selected.reporter,
        category: selected.category,
        priority: selected.priority,
        area: selected.area,
        title: selected.title,
        description: selected.description,
        photoUrls: selected.photoUrls,
        status: draftStatus,
        handler: draftHandler,
        resolutionNote: draftResolution,
        vendorName: draftVendor,
        estimatedCost: selected.estimatedCost,
        actualCost: draftActualCost.trim() === "" ? null : Number(draftActualCost),
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_updated"))
        onRefreshTickets()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const saveProgressLog = async () => {
    if (!selected?.id) return
    const note = progressNote.trim()
    if (!note) {
      await appAlert(t("repair_progress_note_required"))
      return
    }
    setSaving(true)
    try {
      const res = await addStoreRepairProgressLog({
        ticketId: selected.id,
        author: writerName,
        note,
        photoUrls: progressPhotoUrls,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_saved"))
        setProgressNote("")
        setProgressPhotoUrls([])
        await loadLogs(selected.id)
        onRefreshTickets()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const saveAll = async () => {
    if (!selected?.id) return
    const note = progressNote.trim()
    setSaving(true)
    try {
      if (note) {
        const r1 = await addStoreRepairProgressLog({
          ticketId: selected.id,
          author: writerName,
          note,
          photoUrls: progressPhotoUrls,
        })
        if (!r1.success) {
          await appAlert(translateApiMessage(r1.message, t) || t("msg_save_fail"))
          return
        }
        setProgressNote("")
        setProgressPhotoUrls([])
      }
      const r2 = await updateStoreRepairTicket(selected.id, {
        store: selected.store,
        reporter: selected.reporter,
        category: selected.category,
        priority: selected.priority,
        area: selected.area,
        title: selected.title,
        description: selected.description,
        photoUrls: selected.photoUrls,
        status: draftStatus,
        handler: draftHandler,
        resolutionNote: draftResolution,
        vendorName: draftVendor,
        estimatedCost: selected.estimatedCost,
        actualCost: draftActualCost.trim() === "" ? null : Number(draftActualCost),
      })
      if (r2.success) {
        await appAlert(translateApiMessage(r2.message, t) || t("store_check_updated"))
        await loadLogs(selected.id)
        onRefreshTickets()
      } else {
        await appAlert(translateApiMessage(r2.message, t) || t("msg_modify_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const formatWhen = (iso: string) => {
    if (!iso) return "—"
    try {
      return new Date(iso).toLocaleString(lang === "ko" ? "ko-KR" : lang === "th" ? "th-TH" : "en-GB", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return iso.slice(0, 16).replace("T", " ")
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("repair_process_sub")}</p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox checked={openOnly} onCheckedChange={(c) => setOpenOnly(c === true)} />
          {t("repair_process_open_only")}
        </label>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onRefreshTickets()} disabled={ticketsLoading}>
          {t("repair_btn_load")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardContent className="p-3 space-y-1 max-h-[70vh] overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              {t("repair_process_pick")}
            </p>
            {ticketsLoading ? (
              <p className="text-xs text-muted-foreground">{t("loading")}</p>
            ) : filteredTickets.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              filteredTickets.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id ?? null)}
                  className={cn(
                    "w-full text-left rounded-md border px-2 py-2 text-xs transition-colors",
                    selectedId === row.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="font-mono text-[10px] text-muted-foreground">{row.ticketNumber}</div>
                  <div className="font-medium line-clamp-2" title={row.title || undefined}>
                    {translateTitle(row.title || "")}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {row.store} · {t(labelSt(row.status))}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-8 space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">{t("repair_process_pick")}</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <span className="font-mono text-muted-foreground">{selected.ticketNumber}</span>
                      <h3 className="text-sm font-semibold mt-1" title={selected.title || undefined}>
                        {translateTitle(selected.title || "")}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                        {selected.store} · {t("repair_field_category")}: {selected.category}
                      </p>
                    </div>
                  </div>
                  {selected.description ? (
                    <p className="text-muted-foreground border-l-2 border-border pl-2 whitespace-pre-wrap">{selected.description}</p>
                  ) : null}

                  <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
                    <div>
                      <label className="font-semibold block mb-1">{t("repair_field_status")}</label>
                      <Select value={draftStatus} onValueChange={setDraftStatus}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.v} value={s.v}>
                              {t(s.k)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">{t("repair_field_handler")}</label>
                      <Input className="h-8" value={draftHandler} onChange={(e) => setDraftHandler(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-semibold block mb-1">{t("repair_process_resolution_summary")}</label>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("repair_process_resolution_hint")}</p>
                      <Textarea rows={3} value={draftResolution} onChange={(e) => setDraftResolution(e.target.value)} />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">{t("repair_field_vendor")}</label>
                      <Input className="h-8" value={draftVendor} onChange={(e) => setDraftVendor(e.target.value)} />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">{t("repair_process_actual_cost")}</label>
                      <Input
                        className="h-8"
                        type="number"
                        inputMode="decimal"
                        value={draftActualCost}
                        onChange={(e) => setDraftActualCost(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void saveTicketMeta()} disabled={saving}>
                      {t("repair_process_save_ticket_only")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <h4 className="text-sm font-semibold">{t("repair_process_timeline")}</h4>
                  {logsLoading ? (
                    <p className="text-xs text-muted-foreground">{t("loading")}</p>
                  ) : logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("repair_no_progress_yet")}</p>
                  ) : (
                    <ul className="space-y-3 border-l-2 border-primary/30 pl-3 ml-1">
                      {logs.map((log) => (
                        <li key={log.id} className="relative text-xs">
                          <div className="text-[10px] text-muted-foreground">{formatWhen(log.createdAt)}</div>
                          <div className="text-[10px] text-muted-foreground">{log.author || "—"}</div>
                          <p className="mt-1 whitespace-pre-wrap">{log.note}</p>
                          {log.photoUrls?.length ? (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {log.photoUrls.map((url) => (
                                <button
                                  key={url}
                                  type="button"
                                  onClick={() => setPhotoPreview(url)}
                                  className="h-12 w-12 rounded border overflow-hidden"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <h4 className="text-sm font-semibold">{t("repair_process_new_entry")}</h4>
                  <p className="text-[11px] text-muted-foreground">{t("repair_progress_note_ph")}</p>
                  <Textarea
                    rows={5}
                    className="text-xs"
                    placeholder={t("repair_progress_note_ph")}
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                  />
                  {progressNote.trim() ? (
                    <div className="rounded-md border border-dashed border-border/80 bg-muted/25 px-2 py-1.5 text-[11px]">
                      <div className="font-medium text-muted-foreground">{t("repair_translate_preview")}</div>
                      {progressTrans.pending ? (
                        <p className="mt-1 text-muted-foreground">{t("repair_translate_loading")}</p>
                      ) : progressTrans.translated && progressTrans.translated !== progressNote.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-foreground/90">{progressTrans.translated}</p>
                      ) : (
                        <p className="mt-1 text-muted-foreground">—</p>
                      )}
                    </div>
                  ) : null}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void onPickProgressPhotos(e.target.files)
                      e.target.value = ""
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                    {t("repair_photo_add")}
                  </Button>
                  {progressPhotoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {progressPhotoUrls.map((url) => (
                        <div key={url} className="relative h-14 w-14 rounded border overflow-hidden">
                          <button
                            type="button"
                            className="absolute top-0 right-0 z-10 bg-background/90 p-0.5"
                            onClick={() => setProgressPhotoUrls((u) => u.filter((x) => x !== url))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => setPhotoPreview(url)} className="block h-full w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button type="button" size="sm" onClick={() => void saveProgressLog()} disabled={saving || !progressNote.trim()}>
                      {t("repair_process_save_log_only")}
                    </Button>
                    <Button type="button" size="sm" variant="default" onClick={() => void saveAll()} disabled={saving}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {t("repair_process_save_all")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={!!photoPreview} onOpenChange={() => setPhotoPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("photo")}</DialogTitle>
          </DialogHeader>
          {photoPreview && <ImageViewerWithRotate src={photoPreview} alt="" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
