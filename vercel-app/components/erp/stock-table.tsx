"use client"

import * as React from "react"
import { buildErpExcelHtmlDocument, erpExcelSimpleTableStyle, triggerErpExcelHtmlDownload } from "@/lib/erp-excel-export"
import {
  Search,
  BarChart3,
  Package,
  Edit3,
  ImageIcon,
  Printer,
  FileSpreadsheet,
  PauseCircle,
  PlayCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { StockStatusItem } from "@/lib/api-client"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { LogisticsEmptyState, LogisticsTableSkeleton } from "@/components/erp/logistics-ui"
import { ADMIN_TABLE_SCROLL_VIEWPORT_CN } from "@/lib/admin-ui-standards"

function hasValidImage(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false
  const s = url.trim()
  return s.length > 10 && (s.startsWith("http") || s.startsWith("data:image"))
}

function toImageUrl(url: string): string {
  const s = String(url || "").trim()
  if (!s) return s
  if (s.startsWith("data:image")) return s
  if (s.startsWith("http")) return `/api/imageProxy?url=${encodeURIComponent(s)}`
  return s
}

export interface StockTableProps {
  list: StockStatusItem[]
  stores: string[]
  loading: boolean
  storeFilter: string
  setStoreFilter: (v: string) => void
  storeSelectDisabled?: boolean
  stockDateFilter?: string
  setStockDateFilter?: (v: string) => void
  categoryFilter?: string
  setCategoryFilter?: (v: string) => void
  categoryOptions?: string[]
  purchaseSourceFilter?: "" | "hq" | "store"
  setPurchaseSourceFilter?: (v: "" | "hq" | "store") => void
  searchTerm: string
  setSearchTerm: (v: string) => void
  onSearch: () => void
  canAdjust: boolean
  onAdjust: (item: StockStatusItem) => void
  onSaveSafeQty?: (item: StockStatusItem, newSafeQty: number) => Promise<void>
  /** 품목 일시중지(발주 중지) 토글. 메뉴 관리와 연동 */
  onToggleOrderDisabled?: (item: StockStatusItem) => void
}

export function StockTable({
  list,
  stores,
  loading,
  storeFilter,
  setStoreFilter,
  storeSelectDisabled = false,
  stockDateFilter = "",
  setStockDateFilter,
  categoryFilter = "",
  setCategoryFilter,
  categoryOptions = [],
  purchaseSourceFilter = "",
  setPurchaseSourceFilter,
  searchTerm,
  setSearchTerm,
  onSearch,
  canAdjust,
  onAdjust,
  onSaveSafeQty,
  onToggleOrderDisabled,
}: StockTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [editingSafe, setEditingSafe] = React.useState<string | null>(null)
  const [safeInput, setSafeInput] = React.useState("")
  const [savingSafe, setSavingSafe] = React.useState(false)
  const [imagePreview, setImagePreview] = React.useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = React.useState(false)
  const [itemPick, setItemPick] = React.useState("")
  const tableRef = React.useRef<HTMLTableElement>(null)

  const itemPickOptions = React.useMemo(() => {
    let rows = list
    if (categoryFilter && categoryFilter !== "__all__") {
      rows = rows.filter((r) => (r.category || "").trim() === categoryFilter)
    }
    if (purchaseSourceFilter === "hq" || purchaseSourceFilter === "store") {
      rows = rows.filter((r) => (r.purchaseSource ?? "hq") === purchaseSourceFilter)
    }
    const byCode = new Map<string, { code: string; name: string; spec: string }>()
    for (const r of rows) {
      const code = String(r.code || "").trim()
      if (!code || byCode.has(code)) continue
      byCode.set(code, {
        code,
        name: String(r.name || "").trim(),
        spec: String(r.spec || "").trim(),
      })
    }
    return Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
    )
  }, [list, categoryFilter, purchaseSourceFilter])

  const filteredList = React.useMemo(() => {
    let result = list
    if (categoryFilter && categoryFilter !== "__all__") {
      result = result.filter((r) => (r.category || "").trim() === categoryFilter)
    }
    if (purchaseSourceFilter === "hq" || purchaseSourceFilter === "store") {
      result = result.filter((r) => (r.purchaseSource ?? "hq") === purchaseSourceFilter)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q)
      )
    }
    return result
  }, [list, searchTerm, categoryFilter, purchaseSourceFilter])

  const totalAmount = React.useMemo(() => {
    return filteredList.reduce((sum, r) => {
      const cost = r.cost ?? r.price ?? 0
      return sum + cost * r.qty
    }, 0)
  }, [filteredList])

  const handleSaveSafeQty = async (row: StockStatusItem) => {
    if (!onSaveSafeQty) return
    const n = parseInt(safeInput, 10)
    if (isNaN(n) || n < 0) return
    setSavingSafe(true)
    try {
      await onSaveSafeQty(row, n)
      setEditingSafe(null)
    } finally {
      setSavingSafe(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExcel = () => {
    const dateStr = stockDateFilter || new Date().toISOString().slice(0, 10)
    const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const colWidths = [80, 180, 70, 70, 70, 100, 55]
    const headerCells = [t("stockColCode"), t("stockColName"), t("stockColSpec"), t("stockColQty"), t("stockColSafeQty"), t("stockColAmount"), t("stockColStatus")]
    const tableBody = `<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
<tr><td class="head">${escapeXml(t("stockColDate"))}</td><td colspan="6">${escapeXml(dateStr)}</td></tr>
<tr><td class="head">${escapeXml(t("stockFilterStore"))}</td><td colspan="6">${escapeXml(storeFilter || t("stockFilterStoreAll"))}</td></tr>
<tr><td class="head">${escapeXml(t("stockTotalAmount"))}</td><td colspan="6">${escapeXml(totalAmount.toLocaleString())}</td></tr>
<tr></tr>
<tr class="head">${headerCells.map((h) => `<td>${escapeXml(h)}</td>`).join("")}</tr>
${filteredList.map((r) => {
  const cost = r.cost ?? r.price ?? 0
  const amount = cost * r.qty
  const isLow = r.safeQty > 0 && r.qty < r.safeQty
  return `<tr><td>${escapeXml(r.code)}</td><td>${escapeXml(r.name)}</td><td>${escapeXml(r.spec)}</td><td>${r.qty}</td><td>${r.safeQty > 0 ? r.safeQty : ""}</td><td>${amount.toLocaleString()}</td><td>${escapeXml(isLow ? t("stockLow") : "-")}</td></tr>`
}).join("")}
</table>`
    const html = buildErpExcelHtmlDocument(tableBody, erpExcelSimpleTableStyle({ withHead: true }))
    triggerErpExcelHtmlDownload(html, `stock_${storeFilter || "all"}_${dateStr}.xls`)
  }

  const colCount = 8 + (canAdjust || onToggleOrderDisabled ? 1 : 0)

  return (
    <div id="stock-print-area" className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <BarChart3 className="h-[18px] w-[18px] text-warning" />
        </div>
        <h3 className="text-sm font-bold text-card-foreground">{t("stockListTitle")}</h3>
        <span className="ml-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {filteredList.length} {t("stockCountUnit")}
        </span>
      </div>

      {/* 인쇄 시에만 보이는 요약 */}
      <div className="hidden print:block border-b px-6 py-3 text-sm">
        <span className="font-semibold">{t("stockFilterDate")}:</span> {stockDateFilter || "-"} |{" "}
        <span className="font-semibold">{t("stockFilterStore")}:</span> {storeFilter || t("stockFilterStoreAll")} |{" "}
        <span className="font-semibold">{t("stockTotalAmount")}:</span> {totalAmount.toLocaleString()}
      </div>
      <div className="border-b bg-muted/20 px-6 py-3 print:hidden">
        <AdminFilterBar className="border-0 bg-transparent p-0 items-end">
        {setStockDateFilter && (
          <AdminFilterField label={t("stockFilterDate")}>
            <Input
              type="date"
              value={stockDateFilter}
              onChange={(e) => setStockDateFilter(e.target.value)}
              className="h-9 w-36 text-xs"
            />
          </AdminFilterField>
        )}
        {setCategoryFilter && (
          <AdminFilterField label={t("itemsCategory")}>
            <Select
              value={categoryFilter || "__all__"}
              onValueChange={(v) => {
                setCategoryFilter(v === "__all__" ? "" : v)
                setItemPick("")
              }}
              disabled={list.length === 0}
            >
              <SelectTrigger className="h-9 w-[200px] text-xs">
                <SelectValue placeholder={t("itemsCategoryAll")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">{t("itemsCategoryAll")}</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterField>
        )}
        {setCategoryFilter && (
          <AdminFilterField label={t("outSummaryItemPick")}>
            <Select
              value={itemPick || "__all__"}
              onValueChange={(v) => {
                if (v === "__all__") {
                  setItemPick("")
                  setSearchTerm("")
                  return
                }
                setItemPick(v)
                setSearchTerm(v)
              }}
              disabled={list.length === 0}
            >
              <SelectTrigger className="h-9 w-[min(100%,260px)] text-xs">
                <SelectValue placeholder={t("outSummaryItemPick")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">{t("outSummaryItemAll")}</SelectItem>
                {itemPickOptions.map((it) => (
                  <SelectItem key={it.code} value={it.code}>
                    [{it.code}] {it.name || "-"}
                    {it.spec ? ` (${it.spec})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterField>
        )}
        {setPurchaseSourceFilter && (
          <AdminFilterField label={t("itemsPurchaseSource")}>
            <Select value={purchaseSourceFilter || "__all__"} onValueChange={(v) => setPurchaseSourceFilter(v === "__all__" ? "" : (v as "hq" | "store"))}>
              <SelectTrigger className="h-9 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("stockFilterStoreAll")}</SelectItem>
                <SelectItem value="hq">{t("itemsPurchaseSourceHq")}</SelectItem>
                <SelectItem value="store">{t("itemsPurchaseSourceStore")}</SelectItem>
              </SelectContent>
            </Select>
          </AdminFilterField>
        )}
        <AdminFilterField label={t("stockFilterStore")}>
          <Select value={storeFilter || "all"} onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)} disabled={storeSelectDisabled}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("stockFilterStoreAll")}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              {stores.length === 0 && (
                <SelectItem value="none" disabled>{t("stockNoStores") || "-"}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </AdminFilterField>
        <AdminFilterField label={t("search")}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setItemPick("")
              }}
              placeholder={t("stockSearchPh")}
              className="h-9 w-44 pl-8 text-xs"
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
            />
          </div>
        </AdminFilterField>
        <Button size="sm" className="h-9 px-3 text-xs font-semibold" onClick={onSearch}>
          <Search className="mr-1 h-3 w-3" />
          {t("stockBtnSearch")}
        </Button>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-9 px-3 text-xs print:hidden" onClick={handlePrint}>
            <Printer className="mr-1 h-3.5 w-3.5" />
            {t("stockBtnPrint")}
          </Button>
          <Button size="sm" variant="outline" className="h-9 px-3 text-xs print:hidden" onClick={handleExcel}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
            {t("stockBtnExcel")}
          </Button>
        </div>
        </AdminFilterBar>
      </div>

      <div className={ADMIN_TABLE_SCROLL_VIEWPORT_CN} ref={tableRef}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockColCode")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-10 text-center">{t("itemsColImage")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground min-w-[120px] text-center">{t("stockColName")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-40 min-w-[5rem] text-center">{t("stockColSpec")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColQty")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColSafeQty")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColAmount")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockColStatus")}</th>
              {(canAdjust || onToggleOrderDisabled) && (
                <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColAction")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <LogisticsTableSkeleton rows={6} cols={5} />
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <LogisticsEmptyState
                    icon={BarChart3}
                    title={storeFilter ? t("stockNoData") : t("stockSelectStoreHint")}
                    className="border-0 bg-transparent py-10"
                  />
                </td>
              </tr>
            ) : (
              filteredList.map((row, idx) => {
                const isLow = row.safeQty > 0 && row.qty < row.safeQty
                const cost = row.cost ?? row.price ?? 0
                const amount = cost * row.qty
                const key = `${row.store}-${row.code}`
                const isEditing = editingSafe === key
                return (
                  <tr
                    key={key}
                    className={cn(
                      "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                      idx % 2 === 1 && "bg-muted/5"
                    )}
                  >
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                        {row.code}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {hasValidImage(row.image) ? (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => {
                            setImageLoadError(false)
                            setImagePreview({ url: toImageUrl(row.image || ""), name: row.name })
                          }}
                          title={t("photo")}
                        >
                          <ImageIcon className="h-3 w-3" />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 min-w-[120px]">
                      <span className="text-sm font-medium text-foreground">{row.name}</span>
                    </td>
                    <td className="px-5 py-3 w-40 min-w-[5rem]">
                      <span className="text-[11px] text-muted-foreground">{row.spec}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        row.qty < 0 ? "text-destructive" : "text-foreground"
                      )}>
                        {row.qty.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {onSaveSafeQty && (
                        isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              value={safeInput}
                              onChange={(e) => setSafeInput(e.target.value)}
                              className="h-10 w-28 text-base"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveSafeQty(row)
                                if (e.key === "Escape") setEditingSafe(null)
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-10 px-4 text-sm"
                              onClick={() => handleSaveSafeQty(row)}
                              disabled={savingSafe}
                            >
                              {t("stockBtnSave")}
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-sm py-1.5 px-2.5 rounded min-w-[2.5rem] text-muted-foreground hover:text-foreground hover:bg-muted/50 underline cursor-pointer transition-colors"
                            onClick={() => {
                              setEditingSafe(key)
                              setSafeInput(String(row.safeQty > 0 ? row.safeQty : ""))
                            }}
                          >
                            {row.safeQty > 0 ? row.safeQty.toLocaleString() : t("stockSafeQtyInput")}
                          </button>
                        )
                      )}
                      {!onSaveSafeQty && (
                        <span className="text-xs text-muted-foreground">
                          {row.safeQty > 0 ? row.safeQty.toLocaleString() : "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm tabular-nums text-foreground">
                        {amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          {t("stockLow")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </td>
                    {(canAdjust || onToggleOrderDisabled) && (
                      <td className="px-5 py-3">
                        <div className="flex justify-center items-center gap-1">
                          {onToggleOrderDisabled != null && (
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                row.orderDisabled
                                  ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                                  : "text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                              )}
                              onClick={() => onToggleOrderDisabled(row)}
                              title={row.orderDisabled ? t("itemsOrderResume") : t("itemsOrderDisabled")}
                            >
                              {row.orderDisabled ? (
                                <PlayCircle className="h-3.5 w-3.5" />
                              ) : (
                                <PauseCircle className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          {canAdjust && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px] font-semibold"
                              onClick={() => onAdjust(row)}
                            >
                              <Edit3 className="mr-1 h-2.5 w-2.5" />
                              {t("stockBtnAdjust")}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
          {!loading && filteredList.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/20 font-bold">
                <td colSpan={5} className="px-5 py-3 text-right">{t("stockTotalAmount")}</td>
                <td className="px-5 py-3"></td>
                <td className="px-5 py-3 text-right tabular-nums">{totalAmount.toLocaleString()}</td>
                <td colSpan={(canAdjust || onToggleOrderDisabled) ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setImagePreview(null); setImageLoadError(false) }}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] rounded-xl bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{imagePreview.name}</p>
            {imageLoadError ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg bg-muted/80 px-6 py-8">
                <p className="text-center text-sm text-muted-foreground">{t("imageLoadError")}</p>
              </div>
            ) : (
              <ImageViewerWithRotate
                src={imagePreview.url}
                alt={imagePreview.name}
                imgClassName="max-h-[70vh] max-w-full rounded-lg object-contain"
                referrerPolicy="no-referrer"
                onError={() => setImageLoadError(true)}
                onLoad={() => setImageLoadError(false)}
                rotateLeftLabel={t("imageRotateLeft")}
                rotateRightLabel={t("imageRotateRight")}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => { setImagePreview(null); setImageLoadError(false) }}
            >
              {t("itemsBtnClose")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t bg-muted/10 px-6 py-3">
        <span className="text-[11px] text-muted-foreground">
          {t("stockTotal")} <span className="font-bold text-foreground">{filteredList.length}</span> {t("stockCountUnit")}
          {filteredList.length > 0 && (
            <> · {t("stockTotalAmount")} <span className="font-bold text-foreground">{totalAmount.toLocaleString()}</span></>
          )}
        </span>
      </div>
    </div>
  )
}
