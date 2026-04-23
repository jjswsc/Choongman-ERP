"use client"

import * as React from "react"
import { ChevronDown, ClipboardList, History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import { apiFetch } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"

type HandoverNote = {
  body: string
  updatedAt: string | null
  updatedByName: string | null
}

type HandoverHistoryItem = {
  body: string
  updatedAt: string | null
  updatedByName: string | null
}

function formatHandoverTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const loc = lang === "en" ? "en-US" : lang === "th" ? "th-TH" : "ko-KR"
  try {
    return d.toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })
  } catch {
    return d.toISOString()
  }
}

function alertApiMessage(msg: string, t: (k: string) => string) {
  const m = String(msg || "").trim()
  if (/^adminHelpHandover[A-Za-z0-9_]+$/.test(m)) {
    void appAlert(t(m))
    return
  }
  void appAlert(translateApiMessage(m, t))
}

type AdminHelpHandoverPanelProps = {
  /** `matchErpNavHrefForHelp` 결과 (도움말 메뉴 단위) */
  helpHref: string
  className?: string
}

export function AdminHelpHandoverPanel({ helpHref, className }: AdminHelpHandoverPanelProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [draft, setDraft] = React.useState("")
  const [savedMeta, setSavedMeta] = React.useState<{ at: string | null; by: string | null }>({
    at: null,
    by: null,
  })
  const [history, setHistory] = React.useState<HandoverHistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const applyPayload = React.useCallback(
    (data: { note?: HandoverNote | null; history?: HandoverHistoryItem[] }) => {
      const n = data.note
      setDraft(n?.body ?? "")
      setSavedMeta({ at: n?.updatedAt ?? null, by: n?.updatedByName ?? null })
      setHistory(Array.isArray(data.history) ? data.history : [])
    },
    []
  )

  const load = React.useCallback(async () => {
    if (!helpHref) return
    setLoading(true)
    try {
      const q = new URLSearchParams({ helpHref })
      const res = await apiFetch(`/api/adminHelpHandover?${q.toString()}`)
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        note?: HandoverNote | null
        history?: HandoverHistoryItem[]
      }
      if (!res.ok || !data.success) {
        alertApiMessage(String(data.message || t("adminHelpHandoverLoadError")), t)
        applyPayload({ note: null, history: [] })
        return
      }
      applyPayload(data)
    } catch (e) {
      void appAlert(e instanceof Error ? e.message : t("adminHelpHandoverLoadError"))
      applyPayload({ note: null, history: [] })
    } finally {
      setLoading(false)
    }
  }, [helpHref, t, applyPayload])

  React.useEffect(() => {
    void load()
  }, [load, auth?.store])

  const onSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/adminHelpHandover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpHref, body: draft }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        note?: HandoverNote | null
        history?: HandoverHistoryItem[]
      }
      if (!res.ok || !data.success) {
        alertApiMessage(String(data.message || t("adminHelpHandoverSaveError")), t)
        return
      }
      applyPayload(data)
      void appAlert(t("adminHelpHandoverSaved"))
    } catch (e) {
      void appAlert(e instanceof Error ? e.message : t("adminHelpHandoverSaveError"))
    } finally {
      setSaving(false)
    }
  }

  const metaLine =
    savedMeta.at || savedMeta.by
      ? tr(t, "adminHelpHandoverUpdatedBy", {
          name: savedMeta.by || "—",
          time: formatHandoverTime(savedMeta.at, lang),
        })
      : null

  return (
    <section
      className={cn(
        "mt-8 max-w-3xl rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5",
        className
      )}
      aria-labelledby="admin-help-handover-heading"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 id="admin-help-handover-heading" className="text-sm font-semibold text-foreground">
          {t("adminHelpHandoverTitle")}
        </h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">{t("adminHelpHandoverHint")}</p>
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("adminHelpHandoverLoading")}
        </div>
      ) : (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("adminHelpHandoverPlaceholder")}
            className="min-h-[140px] resize-y text-sm"
            disabled={saving}
            maxLength={20000}
            aria-label={t("adminHelpHandoverTitle")}
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {metaLine ? (
              <p className="text-[11px] text-muted-foreground sm:text-xs">{metaLine}</p>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" className="shrink-0 self-end sm:self-auto" onClick={onSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t("adminHelpHandoverSaving")}
                </>
              ) : (
                t("adminHelpHandoverSave")
              )}
            </Button>
          </div>

          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-5 border-t border-border/40 pt-4">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left text-sm font-medium text-foreground hover:bg-muted/40"
              >
                <span className="inline-flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {t("adminHelpHandoverHistoryTitle")}
                  {history.length > 0 ? (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                      {history.length}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", historyOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-1">
              <p className="text-[11px] text-muted-foreground">{t("adminHelpHandoverHistoryCapHint")}</p>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("adminHelpHandoverHistoryEmpty")}</p>
              ) : (
                <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {history.map((h, i) => (
                    <li
                      key={`${h.updatedAt ?? ""}-${i}`}
                      className="rounded-lg border border-border/50 bg-background/80 p-3 text-sm shadow-sm"
                    >
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                        {tr(t, "adminHelpHandoverHistoryMeta", {
                          time: formatHandoverTime(h.updatedAt, lang),
                          name: h.updatedByName || "—",
                        })}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{h.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </section>
  )
}
