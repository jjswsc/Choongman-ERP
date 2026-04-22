"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

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
import {
  getPurchaseOrders,
  getVendorsForPurchase,
  processPurchaseOrderApproval,
  processPurchaseOrderCancel,
  updatePurchaseOrderInvoice,
  type PurchaseOrderRow,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Printer,
  FileSpreadsheet,
  History,
  RefreshCw,
  CheckCircle,
  ArrowDownToLine,
  Search,
  XCircle,
  FileCheck,
  FileText,
} from "lucide-react"
import {
  isPoApprovedStatus,
  isPoAccountingTaxInvoiceMode,
} from "@/components/invoice/purchase-order-print"
import {
  formatPoDisplayDate,
  isAccountingPurchaseOrderByCartJson,
  parsePurchaseOrderCart,
  poQuotationFromMeta,
} from "@/lib/purchase-order-cart"
import { todayStrBangkok } from "@/lib/attendance-utils"

/** 방콕 달력 YYYY-MM-DD에 달 수만큼 더함(일은 월 말에 맞춤) */
function addCalendarMonthsBangkokYmd(ymd: string, deltaMonth: number): string {
  const [ys, ms, ds] = ymd.split("-").map((x) => parseInt(x, 10))
  let y = ys
  let m = ms + deltaMonth
  const d = ds
  while (m < 1) {
    m += 12
    y -= 1
  }
  while (m > 12) {
    m -= 12
    y += 1
  }
  const lastDay = new Date(y, m, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function AdminPurchaseOrderHistory() {
  const { lang } = useLang()
  const t = useT(lang)
  const [list, setList] = React.useState<PurchaseOrderRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [approvingId, setApprovingId] = React.useState<number | null>(null)
  const [cancellingId, setCancellingId] = React.useState<number | null>(null)
  const [taxInvoiceToggleId, setTaxInvoiceToggleId] = React.useState<number | null>(null)
  const [vendors, setVendors] = React.useState<{ code: string; name: string; address?: string; taxId?: string; phone?: string }[]>([])
  const [startDate, setStartDate] = React.useState(() => addCalendarMonthsBangkokYmd(todayStrBangkok(), -1))
  const [endDate, setEndDate] = React.useState(() => todayStrBangkok())
  const [vendorFilter, setVendorFilter] = React.useState<string>("All")
  const [sourceFilter, setSourceFilter] = React.useState<"all" | "logistics" | "accounting">("all")
  const [searchText, setSearchText] = React.useState("")
  const initialFetchDone = React.useRef(false)

  const poDateLocale = React.useMemo(
    () =>
      ({
        ko: "ko-KR",
        en: "en-US",
        th: "th-TH",
        mm: "my-MM",
        la: "lo-LA",
        kh: "km-KH",
        vi: "vi-VN",
        ms: "ms-MY",
      }[lang] || "en-US"),
    [lang]
  )

  React.useEffect(() => {
    getVendorsForPurchase()
      .then((rows) => setVendors((rows || []).map((v) => ({ code: v.code, name: v.name, address: v.address, taxId: v.taxId, phone: v.phone }))))
      .catch(() => setVendors([]))
  }, [])

  /** 탭 진입 시 한 번 자동 조회(검색 버튼을 누르지 않아도 최근 발주 표시) */
  React.useEffect(() => {
    if (initialFetchDone.current) return
    initialFetchDone.current = true
    setHasSearched(true)
    setLoading(true)
    getPurchaseOrders({
      startDate,
      endDate,
      vendorCode: vendorFilter === "All" ? undefined : vendorFilter,
    })
      .then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
     
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

  const filteredList = React.useMemo(() => {
    let rows = list
    if (sourceFilter === "accounting") {
      rows = rows.filter((po) => isAccountingPurchaseOrderByCartJson(po.cart_json))
    } else if (sourceFilter === "logistics") {
      rows = rows.filter((po) => !isAccountingPurchaseOrderByCartJson(po.cart_json))
    }
    const q = searchText.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((po) => {
      const blob = [
        po.po_no,
        po.vendor_name,
        po.vendor_code,
        po.location_name,
        po.location_code,
        po.user_name,
        po.id != null ? String(po.id) : "",
      ]
        .map((s) => String(s ?? "").toLowerCase())
        .join(" ")
      return blob.includes(q)
    })
  }, [list, sourceFilter, searchText])

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
          await appAlert(translateApiMessage(res.message || "", t) || res.message || t("processFail"))
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
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

  const handleCancel = React.useCallback(
    async (po: PurchaseOrderRow) => {
      const id = po.id
      if (!id) return
      const confirmMsg = isPoApprovedStatus(po.status)
        ? t("poCancelApprovedConfirm") ||
          "승인된 발주를 취소하면 미수·미지급 연동이 해제됩니다. 계속하시겠습니까?"
        : t("posCancelConfirm") || t("cancel") || "취소하시겠습니까?"
      const ok = await appConfirm(confirmMsg)
      if (!ok) return

      setCancellingId(id)
      try {
        const res = await processPurchaseOrderCancel({ poId: id })
        if (res.success) {
          load()
        } else {
          await appAlert(translateApiMessage(res.message || "", t) || res.message || t("processFail"))
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setCancellingId(null)
      }
    },
    [load, t]
  )

  const handleToggleAccountingTaxInvoice = React.useCallback(
    async (po: PurchaseOrderRow) => {
      const id = po.id
      if (!id || !isAccountingPurchaseOrderByCartJson(po.cart_json) || !isPoApprovedStatus(po.status)) return
      setTaxInvoiceToggleId(id)
      try {
        const res = await updatePurchaseOrderInvoice({
          poId: id,
          invoiceReceived: !po.invoice_received,
        })
        if (res.success) {
          load()
        } else {
          await appAlert(translateApiMessage(res.message || "", t) || res.message || t("processFail"))
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setTaxInvoiceToggleId(null)
      }
    },
    [load, t]
  )

  const exportPoExcel = (po: PurchaseOrderRow) => {
    const { items: cart, meta } = parsePurchaseOrderCart(po.cart_json)
    const isAcctPo = isAccountingPurchaseOrderByCartJson(po.cart_json)
    const poNo = po.po_no || `PO-${po.id}`
    const dateStr = formatPoDisplayDate(po, poDateLocale)
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
    const excelDocTitle = isAcctPo
      ? isPoAccountingTaxInvoiceMode(isAcctPo, po.status, po.invoice_received)
        ? t("poAccountingPrintTitleTaxInvoice")
        : t("poAccountingPrintTitleInvoice")
      : t("poTitle")
    const allRows = [
      pad([excelDocTitle, poNo], colCount),
      pad([t("poDate"), dateStr], colCount),
      pad([t("poShipTo"), po.location_name || "", po.location_address || ""], colCount),
      pad(
        [
          isAcctPo ? t("poPrintBillTo") : t("poVendor"),
          isAcctPo && meta?.relatedStore
            ? `${meta.relatedStore} / ${(po.vendor_name || "").trim()}`.replace(/\s*\/\s*$/, "").trim()
            : po.vendor_name || "",
        ],
        colCount
      ),
      ...(meta?.relatedStore || meta?.storeVendorName
        ? isAcctPo && meta?.relatedStore
          ? meta?.storeVendorName &&
            String(meta.storeVendorName).trim() &&
            String(meta.storeVendorName).trim() !== String(po.vendor_name || "").trim()
            ? [pad([t("poMetaStoreVendor"), String(meta.storeVendorName).trim(), ""], colCount)]
            : []
          : [
              pad(
                [
                  t("poMetaStore"),
                  meta?.relatedStore || "",
                  meta?.storeVendorName ? `${t("poMetaStoreVendor")}: ${meta.storeVendorName}` : "",
                ],
                colCount
              ),
            ]
        : []),
      ...(meta?.poFormatLabel ? [pad([t("poFormPresetLabel"), meta.poFormatLabel], colCount)] : []),
      pad([], colCount),
      pad(headers, colCount),
      ...dataRows.map((r) => pad(r.map((v) => String(v)), colCount)),
      pad([], colCount),
      pad([t("subtotal"), ...Array(colCount - 2).fill(""), String(po.subtotal ?? 0)], colCount),
      pad([t("vat"), ...Array(colCount - 2).fill(""), String(po.vat ?? 0)], colCount),
      pad([t("total"), ...Array(colCount - 2).fill(""), String(po.total ?? 0)], colCount),
      pad(
        [t("poWithholdingTax") || "WHT", ...Array(colCount - 2).fill(""), String(po.withholding_tax_amount ?? 0)],
        colCount
      ),
      pad(
        [
          t("poNetAmount") || "Net",
          ...Array(colCount - 2).fill(""),
          String((po.total ?? 0) - (po.withholding_tax_amount ?? 0)),
        ],
        colCount
      ),
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
    const headerPadded = pad(headers, colCount)
    const isHeaderDataRow = (ri: number) =>
      headerPadded.length > 0 &&
      headerPadded.every((cell, i) => String(allRows[ri][i] ?? "") === String(cell))
    const footerCount = 5
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse}</style></head>
<body>
<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
${allRows.map((row, ri) => {
      const cells = row.map((c) => escapeXml(c))
      const isHead = ri === 0 || isHeaderDataRow(ri) || ri >= allRows.length - footerCount
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

  const printPo = async (po: PurchaseOrderRow) => {
    const { items: cart, meta } = parsePurchaseOrderCart(po.cart_json)
    const poNo = po.po_no || `PO-${po.id}`
    const dateStr = formatPoDisplayDate(po, poDateLocale)

    const vendor = vendors.find(
      (v) => v.code === po.vendor_code || v.name === po.vendor_name
    )

    const isAcctPo = isAccountingPurchaseOrderByCartJson(po.cart_json)
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
      relatedStore: meta?.relatedStore,
      storeVendorName: meta?.storeVendorName,
      poFormatLabel: meta?.poFormatLabel,
      accountingBillToStyle: isAcctPo,
      invoiceReceived: Boolean(po.invoice_received),
    }
    sessionStorage.setItem("po-print-data", JSON.stringify(poPrintData))
    const printWindow = window.open("/admin/po-print", "_blank")
    if (printWindow) {
      printWindow.focus()
    } else {
      await appAlert(t("outPrintPopoverBlocked") || "팝업이 차단되었을 수 있습니다. 팝업 허용 후 다시 시도해 주세요.")
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
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "all" | "logistics" | "accounting")}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder={t("poHistorySourceFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("poHistorySourceAll")}</SelectItem>
              <SelectItem value="logistics">{t("poHistorySourceLogistics")}</SelectItem>
              <SelectItem value="accounting">{t("poHistorySourceAccounting")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("poHistorySearchPlaceholder")}
            className="h-9 min-w-[10rem] flex-1 sm:max-w-xs"
          />
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
        ) : filteredList.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("poHistoryNoMatch")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{t("poHistoryColOrigin")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poNo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poDate")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poVendor")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poShipTo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("status")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("vat")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("total")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("poWithholdingTax") || "WHT"}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("poNetAmount") || "실지급액"}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poPreparedBy")}</th>
                  <th className="w-28 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredList.map((po) => {
                  const dateStr = formatPoDisplayDate(po, poDateLocale)
                  const isAcct = isAccountingPurchaseOrderByCartJson(po.cart_json)
                  const quotation = poQuotationFromMeta(po.cart_json)
                  return (
                    <tr key={po.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <Badge
                          variant={isAcct ? "default" : "secondary"}
                          className="whitespace-nowrap text-[10px] font-medium"
                        >
                          {isAcct ? t("poHistorySourceAccounting") : t("poHistorySourceLogistics")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium">{po.po_no || `#${po.id}`}</td>
                      <td className="px-3 py-2 text-muted-foreground">{dateStr}</td>
                      <td className="px-3 py-2">{po.vendor_name || "-"}</td>
                      <td className="px-3 py-2">{po.location_name || "-"}</td>
                      <td className="px-3 py-2">
                        {isPoApprovedStatus(po.status) ? (
                          <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{t("statusApproved")}</span>
                        ) : (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{po.status || "Draft"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {po.vat != null ? po.vat.toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">
                        {po.total != null ? po.total.toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {(po.withholding_tax_amount ?? 0) > 0
                          ? (po.withholding_tax_amount ?? 0).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {po.total != null
                          ? ((po.total ?? 0) - (po.withholding_tax_amount ?? 0)).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{po.user_name || "-"}</td>
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-0.5">
                          {quotation && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" asChild>
                              <a
                                href={quotation.url}
                                target="_blank"
                                rel="noreferrer"
                                title={t("poQuotationView")}
                              >
                                <FileText className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {isPoApprovedStatus(po.status) && !isAcct && (
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
                          {isAcct && isPoApprovedStatus(po.status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 hover:bg-primary/10 ${
                                po.invoice_received ? "text-green-600" : "text-muted-foreground"
                              }`}
                              title={t("poAccountingTaxInvoiceToggleTitle")}
                              aria-pressed={po.invoice_received === true}
                              onClick={() => void handleToggleAccountingTaxInvoice(po)}
                              disabled={taxInvoiceToggleId === po.id}
                            >
                              <FileCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {!isPoApprovedStatus(po.status) && (
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
                          {po.status !== "Cancelled" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => handleCancel(po)}
                              disabled={cancellingId === po.id}
                              title={t("cancel") || "취소"}
                            >
                              <XCircle className="h-4 w-4" />
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
