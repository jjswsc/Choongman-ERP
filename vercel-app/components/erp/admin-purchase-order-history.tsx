"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPurchaseOrders, getVendorsForPurchase, processPurchaseOrderApproval, type PurchaseOrderRow } from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import Link from "next/link"
import { Printer, FileSpreadsheet, History, RefreshCw, CheckCircle, ArrowDownToLine, Search } from "lucide-react"

export function AdminPurchaseOrderHistory() {
  const { lang } = useLang()
  const t = useT(lang)
  const [list, setList] = React.useState<PurchaseOrderRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [approvingId, setApprovingId] = React.useState<number | null>(null)
  const [vendors, setVendors] = React.useState<{ code: string; name: string; address?: string; taxId?: string; phone?: string }[]>([])
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [vendorFilter, setVendorFilter] = React.useState<string>("All")

  React.useEffect(() => {
    getVendorsForPurchase()
      .then((rows) => setVendors((rows || []).map((v) => ({ code: v.code, name: v.name, address: v.address, taxId: v.taxId, phone: v.phone }))))
      .catch(() => setVendors([]))
  }, [])

  const load = React.useCallback(() => {
    setLoading(true)
    getPurchaseOrders({
      startDate,
      endDate,
      vendorCode: vendorFilter === "All" ? undefined : vendorFilter,
    })
      .then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [startDate, endDate, vendorFilter])

  const handleApprove = React.useCallback(
    async (po: PurchaseOrderRow) => {
      const id = po.id
      if (!id) return
      setApprovingId(id)
      try {
        const res = await processPurchaseOrderApproval({ poId: id })
        if (res.success) {
          load()
        } else {
          alert(translateApiMessage(res.message || "", t) || res.message || t("processFail"))
        }
      } catch (e) {
        alert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setApprovingId(null)
      }
    },
    [load, t]
  )

  const handleSearch = React.useCallback(() => {
    setHasSearched(true)
    load()
  }, [load])

  const exportPoExcel = (po: PurchaseOrderRow) => {
    const cart = parseCart(po.cart_json)
    const poNo = po.po_no || `PO-${po.id}`
    const locale = {
      ko: "ko-KR",
      en: "en-US",
      th: "th-TH",
      mm: "my-MM",
      la: "lo-LA",
      kh: "km-KH",
      vi: "vi-VN",
      ms: "ms-MY",
    }[lang] || "en-US"
    const dateStr = po.created_at ? new Date(po.created_at).toLocaleDateString(locale) : new Date().toLocaleDateString(locale)
    const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

    const hasStore = cart.some((c) => c.store && String(c.store).trim())
    const colCount = hasStore ? 7 : 6
    const headers = hasStore
      ? [t("orderColStore"), "No", t("item"), t("orderItemSpec"), t("orderItemUnitPrice"), t("orderItemQty"), t("orderItemTotal")]
      : ["No", t("item"), t("orderItemSpec"), t("orderItemUnitPrice"), t("orderItemQty"), t("orderItemTotal")]

    let dataRows: (string | number)[][]
    if (hasStore) {
      const byStore = groupCartByStore(cart)
      dataRows = []
      for (const [storeName, items] of byStore.entries()) {
        dataRows.push([`${t("orderColStore")}: ${storeName}`, "", "", "", "", "", ""])
        items.forEach((c, i) => {
          dataRows.push([
            "",
            i + 1,
            c.name || "-",
            "-",
            c.price ?? 0,
            c.qty ?? 0,
            (c.price ?? 0) * (c.qty ?? 0),
          ])
        })
      }
    } else {
      dataRows = cart.map((c, i) => [
        i + 1,
        c.name || "-",
        "-",
        c.price ?? 0,
        c.qty ?? 0,
        (c.price ?? 0) * (c.qty ?? 0),
      ])
    }

    const pad = (r: (string | number)[], n: number) => {
      const arr = [...r]
      while (arr.length < n) arr.push("")
      return arr.slice(0, n).map((v) => String(v))
    }
    const allRows = [
      pad([t("poTitle"), poNo], colCount),
      pad([t("poDate"), dateStr], colCount),
      pad([t("poShipTo"), po.location_name || "", po.location_address || ""], colCount),
      pad([t("poVendor"), po.vendor_name || ""], colCount),
      pad([], colCount),
      pad(headers, colCount),
      ...dataRows.map((r) => pad(r.map((v) => String(v)), colCount)),
      pad([], colCount),
      pad([t("subtotal"), ...Array(colCount - 2).fill(""), String(po.subtotal ?? 0)], colCount),
      pad([t("vat"), ...Array(colCount - 2).fill(""), String(po.vat ?? 0)], colCount),
      pad([t("total"), ...Array(colCount - 2).fill(""), String(po.total ?? 0)], colCount),
    ]
    const pxPerChar = 8
    const minW = 50
    const colWidths = Array.from({ length: colCount }, (_, c) => {
      let maxLen = minW / pxPerChar
      for (const row of allRows) {
        const cell = row[c]
        const len = String(cell ?? "").length
        if (len > maxLen) maxLen = len
      }
      return Math.max(minW, Math.min(maxLen * pxPerChar + 16, 400))
    })
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse}</style></head>
<body>
<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
${allRows.map((row, ri) => {
      const cells = row.map((c) => escapeXml(c))
      const isHead = ri === 5 || ri >= allRows.length - 3
      return `<tr${isHead ? ' class="head"' : ""}>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`
    }).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `PO_${poNo}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printPo = (po: PurchaseOrderRow) => {
    const cart = parseCart(po.cart_json)
    const poNo = po.po_no || `PO-${po.id}`
    const locale = {
      ko: "ko-KR",
      en: "en-US",
      th: "th-TH",
      mm: "my-MM",
      la: "lo-LA",
      kh: "km-KH",
      vi: "vi-VN",
      ms: "ms-MY",
    }[lang] || "en-US"
    const dateStr = po.created_at
      ? new Date(po.created_at).toLocaleDateString(locale)
      : new Date().toLocaleDateString(locale)

    const vendor = vendors.find(
      (v) => v.code === po.vendor_code || v.name === po.vendor_name
    )

    const poPrintData = {
      poNo,
      createdAt: dateStr,
      vendorName: po.vendor_name || vendor?.name || "-",
      vendorAddress: vendor?.address || undefined,
      vendorTaxId: vendor?.taxId || undefined,
      vendorPhone: vendor?.phone || undefined,
      locationName: po.location_name || "-",
      locationAddress: po.location_address || "-",
      cart: cart.map((c) => ({
        name: c.name || "-",
        code: (c as { code?: string }).code,
        price: c.price ?? 0,
        qty: c.qty ?? 0,
        store: c.store,
      })),
      subtotal: po.subtotal ?? 0,
      vat: po.vat ?? 0,
      total: po.total ?? 0,
      userName: po.user_name || "-",
      status: po.status,
      withholdingTaxAmount: po.withholding_tax_amount,
    }
    sessionStorage.setItem("po-print-data", JSON.stringify(poPrintData))
    const printWindow = window.open("/admin/po-print", "_blank")
    if (printWindow) {
      printWindow.focus()
    } else {
      alert(t("outPrintPopoverBlocked") || "팝업이 차단되었을 수 있습니다. 팝업 허용 후 다시 시도해 주세요.")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-primary" />
          {t("poHistoryTitle")}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 w-[140px]"
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 w-[140px]"
          />
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder={t("poVendor") || "거래처"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t("orderFilterVendorAll") || "전체 거래처"}</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.code} value={v.code}>
                  {v.name || v.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleSearch} disabled={loading}>
            <Search className="mr-1.5 h-4 w-4" />
            {t("orderBtnSearch") || "검색"}
          </Button>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
        ) : !hasSearched ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query") || "검색 버튼을 눌러 주세요."}</p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("poHistoryEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">{t("poNo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poDate")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poVendor")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poShipTo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("status")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("total")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("poNetAmount") || "실지급액"}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poPreparedBy")}</th>
                  <th className="w-28 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((po) => {
                  const dateStr = po.created_at
                    ? new Date(po.created_at).toLocaleDateString()
                    : "-"
                  return (
                    <tr key={po.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium">{po.po_no || `#${po.id}`}</td>
                      <td className="px-3 py-2 text-muted-foreground">{dateStr}</td>
                      <td className="px-3 py-2">{po.vendor_name || "-"}</td>
                      <td className="px-3 py-2">{po.location_name || "-"}</td>
                      <td className="px-3 py-2">
                        {po.status === "Approved" ? (
                          <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{t("statusApproved")}</span>
                        ) : (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{po.status || "Draft"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-primary">
                        {po.total != null ? po.total.toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {(po.total ?? 0) - (po.withholding_tax_amount ?? 0) > 0
                          ? ((po.total ?? 0) - (po.withholding_tax_amount ?? 0)).toLocaleString()
                          : po.total != null ? po.total.toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{po.user_name || "-"}</td>
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-0.5">
                          {po.status === "Approved" && (
                            <Link href={`/admin/inbound?fromPo=${po.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                title={t("adminInboundReg") || "입고 등록"}
                              >
                                <ArrowDownToLine className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          {po.status !== "Approved" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-success hover:bg-success/10"
                              onClick={() => handleApprove(po)}
                              disabled={approvingId === po.id}
                              title={t("adminApproved")}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            onClick={() => printPo(po)}
                            title={t("purchaseOrderPrint")}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            onClick={() => exportPoExcel(po)}
                            title={t("purchaseOrderExcel")}
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type CartItem = { name?: string; price?: number; qty?: number; store?: string }

function parseCart(json: string | undefined): CartItem[] {
  if (!json || typeof json !== "string") return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function groupCartByStore(cart: CartItem[]): Map<string, CartItem[]> {
  const byStore = new Map<string, CartItem[]>()
  for (const c of cart) {
    const store = (c.store && String(c.store).trim()) || "-"
    const arr = byStore.get(store) || []
    arr.push(c)
    byStore.set(store, arr)
  }
  return byStore
}
