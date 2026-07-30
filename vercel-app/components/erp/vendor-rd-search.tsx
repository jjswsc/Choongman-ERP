"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { apiFetchWithOffline } from "@/lib/api/fetch-offline"

export type RdVatCompanyPick = {
  taxId: string
  name: string
  branchNo: string
  address: string
}

type Props = {
  /** 버튼 라벨 — 기본은 กรมสรรพากร 검색 */
  triggerLabel?: string
  triggerClassName?: string
  triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "link"
  triggerSize?: "default" | "sm" | "lg" | "icon"
  /** 메뉴/셀렉트 하단용 — 버튼 대신 텍스트 행 */
  asMenuItem?: boolean
  initialQuery?: string
  onPick: (company: RdVatCompanyPick) => void
}

export function VendorRdSearchButton({
  triggerLabel,
  triggerClassName,
  triggerVariant = "outline",
  triggerSize = "sm",
  asMenuItem = false,
  initialQuery = "",
  onPick,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState(initialQuery)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [list, setList] = React.useState<RdVatCompanyPick[]>([])

  React.useEffect(() => {
    if (open) {
      setQ(initialQuery)
      setError("")
      setList([])
    }
  }, [open, initialQuery])

  const runSearch = async () => {
    const raw = q.trim()
    if (!raw) {
      setError(t("vendorRdSearchNeedQuery") || "TIN(13) or company name required.")
      return
    }
    setLoading(true)
    setError("")
    setList([])
    try {
      const digits = raw.replace(/\D/g, "")
      const params = new URLSearchParams()
      if (digits.length === 13) params.set("tin", digits)
      else params.set("name", raw)
      const res = await apiFetchWithOffline(`/api/searchRdVatCompany?${params}`)
      const data = (await res.json()) as {
        success?: boolean
        message?: string
        list?: RdVatCompanyPick[]
      }
      if (!data.success) {
        setError(data.message || t("processFail") || "Search failed.")
        return
      }
      const rows = (data.list || []).map((r) => ({
        taxId: String(r.taxId || "").replace(/\D/g, "").slice(0, 13),
        name: String(r.name || "").trim(),
        branchNo: String(r.branchNo || "0").trim() || "0",
        address: String(r.address || "").trim(),
      }))
      setList(rows)
      if (rows.length === 0) {
        setError(t("vendorRdSearchEmpty") || "No results from Revenue Department.")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const label =
    triggerLabel ||
    t("vendorRdSearch") ||
    "ค้นหาข้อมูลจากฐานข้อมูลกรมสรรพากร"

  return (
    <>
      {asMenuItem ? (
        <button
          type="button"
          className={
            triggerClassName ||
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
          }
          onClick={() => setOpen(true)}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1">{label}</span>
        </button>
      ) : (
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          <Search className="h-3.5 w-3.5 mr-1" />
          {label}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("vendorRdSearchTitle") || "Revenue Department lookup"}</DialogTitle>
            <DialogDescription>
              {t("vendorRdSearchHint") ||
                "Search by 13-digit TIN or company name (กรมสรรพากร VAT)."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("vendorRdSearchPlaceholder") || "TIN or name"}
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void runSearch()
                }
              }}
            />
            <Button type="button" size="sm" className="h-9 shrink-0" onClick={() => void runSearch()} disabled={loading}>
              <Search className="h-4 w-4 mr-1" />
              {t("btn_query") || "Search"}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("loading")}</p>
          ) : (
            <div className="overflow-auto flex-1 min-h-0 border rounded-md divide-y max-h-[50vh]">
              {list.map((row, idx) => (
                <button
                  key={`${row.taxId}-${row.branchNo}-${idx}`}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                  onClick={() => {
                    onPick(row)
                    setOpen(false)
                  }}
                >
                  <div className="text-sm font-medium">{row.name || "—"}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {row.taxId || "—"}
                    {row.branchNo && row.branchNo !== "0" ? ` · branch ${row.branchNo}` : ""}
                  </div>
                  {row.address ? (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.address}</div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
