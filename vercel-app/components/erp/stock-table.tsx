"use client"

import * as React from "react"
import {
  Search,
  BarChart3,
  Package,
  Edit3,
  Printer,
  FileSpreadsheet,
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

export interface StockTableProps {
  list: StockStatusItem[]
  stores: string[]
  loading: boolean
  storeFilter: string
  setStoreFilter: (v: string) => void
  stockDateFilter?: string
  setStockDateFilter?: (v: string) => void
  searchTerm: string
  setSearchTerm: (v: string) => void
  onSearch: () => void
  canAdjust: boolean
  onAdjust: (item: StockStatusItem) => void
  onSaveSafeQty?: (item: StockStatusItem, newSafeQty: number) => Promise<void>
}

export function StockTable({
  list,
  stores,
  loading,
  storeFilter,
  setStoreFilter,
  stockDateFilter = "",
  setStockDateFilter,
  searchTerm,
  setSearchTerm,
  onSearch,
  canAdjust,
  onAdjust,
  onSaveSafeQty,
}: StockTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [editingSafe, setEditingSafe] = React.useState<string | null>(null)
  const [safeInput, setSafeInput] = React.useState("")
  const [savingSafe, setSavingSafe] = React.useState(false)
  const tableRef = React.useRef<HTMLTableElement>(null)

  const filteredList = React.useMemo(() => {
    if (!searchTerm.trim()) return list
    const q = searchTerm.toLowerCase()
    return list.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    )
  }, [list, searchTerm])

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
    let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{width:100%;border-collapse:collapse}</style></head>
<body>
<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
<tr><td class="head">${escapeXml(t("stockColDate") || "날짜")}</td><td colspan="6">${escapeXml(dateStr)}</td></tr>
<tr><td class="head">${escapeXml(t("stockFilterStore") || "매장")}</td><td colspan="6">${escapeXml(storeFilter || t("stockFilterStoreAll") || "전체")}</td></tr>
<tr><td class="head">${escapeXml(t("stockTotalAmount") || "총 재고금액")}</td><td colspan="6">${escapeXml(totalAmount.toLocaleString())}</td></tr>
<tr></tr>
<tr class="head">${headerCells.map((h) => `<td>${escapeXml(h)}</td>`).join("")}</tr>
${filteredList.map((r) => {
  const cost = r.cost ?? r.price ?? 0
  const amount = cost * r.qty
  const isLow = r.safeQty > 0 && r.qty < r.safeQty
  return `<tr><td>${escapeXml(r.code)}</td><td>${escapeXml(r.name)}</td><td>${escapeXml(r.spec)}</td><td>${r.qty}</td><td>${r.safeQty > 0 ? r.safeQty : ""}</td><td>${amount.toLocaleString()}</td><td>${escapeXml(isLow ? t("stockLow") : "-")}</td></tr>`
}).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `stock_${storeFilter || "all"}_${dateStr}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const colCount = 7 + (canAdjust ? 1 : 0)

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
      {/* 일렬 배치: 날짜 + 매장 Select + 검색 Input + 조회 + 인쇄 + 엑셀 */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-6 py-3 print:hidden">
        {setStockDateFilter && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold whitespace-nowrap">{t("stockFilterDate")}</label>
            <Input
              type="date"
              value={stockDateFilter}
              onChange={(e) => setStockDateFilter(e.target.value)}
              className="h-9 w-36 text-xs"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground whitespace-nowrap">
            <Package className="h-3.5 w-3.5 text-primary" />
            {t("stockFilterStore")}
          </label>
          <Select value={storeFilter || "all"} onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)}>
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
        </div>
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("stockSearchPh")}
            className="h-9 w-44 pl-8 text-xs"
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
        </div>
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
      </div>

      <div className="overflow-x-auto" ref={tableRef}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockColCode")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground min-w-[120px] text-center">{t("stockColName")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockColSpec")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColQty")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColSafeQty")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColAmount")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockColStatus")}</th>
              {canAdjust && (
                <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColAction")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("stockNoData")}
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
                    <td className="px-5 py-3 min-w-[120px]">
                      <span className="text-sm font-medium text-foreground">{row.name}</span>
                    </td>
                    <td className="px-5 py-3">
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
                    {canAdjust && (
                      <td className="px-5 py-3">
                        <div className="flex justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] font-semibold"
                            onClick={() => onAdjust(row)}
                          >
                            <Edit3 className="mr-1 h-2.5 w-2.5" />
                            {t("stockBtnAdjust")}
                          </Button>
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
                <td colSpan={4} className="px-5 py-3 text-right">{t("stockTotalAmount")}</td>
                <td className="px-5 py-3"></td>
                <td className="px-5 py-3 text-right tabular-nums">{totalAmount.toLocaleString()}</td>
                <td colSpan={canAdjust ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

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
