"use client"
import { appAlert, appConfirm } from "@/lib/app-message"
import { buildErpExcelHtmlDocument, erpExcelSimpleTableStyle, triggerErpExcelHtmlDownload } from "@/lib/erp-excel-export"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
  getVendorsForSalesFranchiseMaster,
  getHeadOfficeInfo,
  getStoreTaxFilingProfile,
  processPurchaseOrderApproval,
  processPurchaseOrderCancel,
  updatePurchaseOrderInvoice,
  type PurchaseOrderRow,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { sortVendorsByDisplayName } from "@/lib/vendor-sort"
import Link from "next/link"
import { ADMIN_TABLE_SCROLL_VIEWPORT_CN } from "@/lib/admin-ui-standards"
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
  Paperclip,
  Percent,
  Pencil,
} from "lucide-react"
import {
  isPoApprovedStatus,
  isPoAccountingTaxInvoiceMode,
} from "@/components/invoice/purchase-order-print"
import {
  computePurchaseOrderMoneyTotals,
  formatPoDisplayDate,
  isAccountingPurchaseOrderByCartJson,
  isPoDraftEditableStatus,
  parsePurchaseOrderCart,
  poQuotationFromMeta,
  resolveAccountingPoIssuerStore,
} from "@/lib/purchase-order-cart"
import { resolvePoIssuerCompany } from "@/lib/po-issuer-company"
import { vendorForSalesOutletStore } from "@/lib/po-vendor-store-match"
import { useOrderCreate } from "@/lib/order-create-context"
import { todayStrBangkok } from "@/lib/attendance-utils"
import { useErpAllowUrlSync, useErpPageActiveRef } from "@/lib/erp-page-visibility"
import {
  patchPurchaseOrderViewCache,
  readPurchaseOrderViewCache,
  type PurchaseOrderHistorySourceFilter,
} from "@/lib/purchase-order-view-cache"
import { requestPurchaseOrderEdit } from "@/lib/purchase-order-edit-request"
import { openWhtCertificatePrintWindow } from "@/lib/open-wht-certificate-print"
import {
  resolvePoWhtAgentStoreKey,
  resolveWhtWithholdingAgentCompany,
  whtCertificateFromPurchaseOrder,
} from "@/lib/wht-certificate-data"

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

export function AdminPurchaseOrderHistory({
  onEditDraft,
}: {
  onEditDraft?: (po: PurchaseOrderRow) => void
} = {}) {
  const { lang } = useLang()
  const t = useT(lang)
  const orderCreate = useOrderCreate()
  const [list, setList] = React.useState<PurchaseOrderRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [approvingId, setApprovingId] = React.useState<number | null>(null)
  const [cancellingId, setCancellingId] = React.useState<number | null>(null)
  const [taxInvoiceToggleId, setTaxInvoiceToggleId] = React.useState<number | null>(null)
  const [whtEditPo, setWhtEditPo] = React.useState<PurchaseOrderRow | null>(null)
  const [whtEditAmount, setWhtEditAmount] = React.useState("")
  const [whtEditRate, setWhtEditRate] = React.useState("")
  const [whtEditSaving, setWhtEditSaving] = React.useState(false)
  const [vendors, setVendors] = React.useState<
    { code: string; name: string; address?: string; taxId?: string; phone?: string; salesOutlet?: string | null; gpsName?: string | null }[]
  >([])
  const [startDate, setStartDate] = React.useState(() => addCalendarMonthsBangkokYmd(todayStrBangkok(), -1))
  const [endDate, setEndDate] = React.useState(() => todayStrBangkok())
  const [vendorFilter, setVendorFilter] = React.useState<string>("All")
  const [sourceFilter, setSourceFilter] = React.useState<PurchaseOrderHistorySourceFilter>("all")
  const [searchText, setSearchText] = React.useState("")
  const allowPoUrlSync = useErpAllowUrlSync(
    "/admin/accounting/purchase-order",
    "/admin/order-create"
  )
  const pageActiveRef = useErpPageActiveRef()
  const viewCacheRestoredRef = React.useRef(false)

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
    if (viewCacheRestoredRef.current) return
    if (!pageActiveRef.current || !allowPoUrlSync) return
    viewCacheRestoredRef.current = true
    const snap = readPurchaseOrderViewCache()
    if (!snap?.hasSearched) return
    if (snap.startDate) setStartDate(snap.startDate)
    if (snap.endDate) setEndDate(snap.endDate)
    setVendorFilter(snap.vendorFilter || "All")
    if (snap.sourceFilter === "logistics" || snap.sourceFilter === "accounting" || snap.sourceFilter === "all") {
      setSourceFilter(snap.sourceFilter)
    }
    setSearchText(snap.searchText || "")
    setList(Array.isArray(snap.list) ? snap.list : [])
    setHasSearched(true)
  }, [allowPoUrlSync, pageActiveRef])

  React.useEffect(() => {
    if (!hasSearched) {
      // remount 직후 초기 hasSearched=false로 clear하면 복원 스냅샷이 사라짐 — 미조회 시 저장만 생략
      return
    }
    patchPurchaseOrderViewCache({
      startDate,
      endDate,
      vendorFilter,
      sourceFilter,
      searchText,
      hasSearched: true,
      list,
    })
  }, [endDate, hasSearched, list, searchText, sourceFilter, startDate, vendorFilter])

  React.useEffect(() => {
    ;(async () => {
      try {
        const [pur, fr] = await Promise.all([getVendorsForPurchase(), getVendorsForSalesFranchiseMaster()])
        let merged = pur || []
        if (fr.length > 0) {
          const frCodes = new Set(fr.map((v) => v.code))
          merged = [...fr, ...(pur || []).filter((v) => !frCodes.has(v.code))]
        }
        setVendors(
          sortVendorsByDisplayName(
            merged.map((v) => ({
              code: v.code,
              name: v.name,
              address: v.address,
              taxId: v.taxId,
              phone: v.phone,
              salesOutlet: v.salesOutlet,
              gpsName: v.gpsName,
            }))
          )
        )
      } catch {
        setVendors([])
      }
    })()
  }, [])

  const load = React.useCallback(() => {
    setLoading(true)
    getPurchaseOrders({
      startDate,
      endDate,
      vendorCode: vendorFilter === "All" ? undefined : vendorFilter,
    })
      .then((rows) => {
        setList(Array.isArray(rows) ? rows : [])
        setHasSearched(true)
      })
      .catch(() => {
        setList([])
        setHasSearched(true)
      })
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

  const handleEditDraft = React.useCallback(
    (po: PurchaseOrderRow) => {
      if (!po.id || !isPoDraftEditableStatus(po.status)) return
      requestPurchaseOrderEdit(po)
      onEditDraft?.(po)
      orderCreate?.setActiveTab("hq")
    },
    [onEditDraft, orderCreate]
  )

  const handleSearch = React.useCallback(() => {
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

  const openWhtEdit = React.useCallback((po: PurchaseOrderRow) => {
    setWhtEditPo(po)
    const amt = Number(po.withholding_tax_amount) || 0
    const rate = Number(po.withholding_tax_rate) || 0
    setWhtEditAmount(amt > 0 ? String(amt) : "")
    setWhtEditRate(rate > 0 ? String(rate) : "3")
  }, [])

  const printPoWhtCertificate = React.useCallback(
    async (po: PurchaseOrderRow) => {
      const wht = Math.max(0, Number(po.withholding_tax_amount) || 0)
      if (wht <= 0) {
        await appAlert(t("whtCertPrintNoWht"))
        return
      }
      try {
        const ho = await getHeadOfficeInfo()
        const vendorCode = String(po.vendor_code || "").trim()
        const vendorResolved = vendors.find((v) => v.code === vendorCode)
        // 당사 법인 블록 = 발행 주체(본사 또는 issuerStore). relatedStore(청구 매장)는 쓰지 않음.
        // 회계 청구 PO는 inbound라 거래처가 상단(ผู้หักภาษี), 당사가 하단(ผู้ถูกหักภาษี).
        // 가맹 세무 프로필 TIN이 거래처와 같으면 본사로 폴백.
        const storeKey = resolvePoWhtAgentStoreKey(po)
        const profileRes = storeKey
          ? await getStoreTaxFilingProfile(storeKey).catch(() => ({ profile: null }))
          : { profile: null }
        const agent = resolveWhtWithholdingAgentCompany({
          headOffice: {
            companyName: ho.companyName || "",
            taxId: ho.taxId || "",
            address: ho.address || "",
            phone: ho.phone,
          },
          storeName: storeKey,
          profile: profileRes.profile,
          payeeTaxId: vendorResolved?.taxId,
        })
        const cert = whtCertificateFromPurchaseOrder(
          po,
          agent,
          vendorResolved?.taxId,
          vendorResolved?.address
        )
        if (!cert || !openWhtCertificatePrintWindow([cert], lang)) {
          await appAlert(t("whtCertPrintBlocked"))
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      }
    },
    [vendors, lang, t]
  )

  const handleSaveWhtEdit = React.useCallback(async () => {
    const po = whtEditPo
    if (!po?.id) return
    const amt = Math.max(0, Number(String(whtEditAmount).replace(/,/g, "")) || 0)
    const rate = Math.max(0, Number(String(whtEditRate).replace(/,/g, "")) || 0)
    setWhtEditSaving(true)
    try {
      const res = await updatePurchaseOrderInvoice({
        poId: po.id,
        withholdingTaxAmount: amt,
        withholdingTaxRate: rate > 0 ? rate : undefined,
      })
      if (res.success) {
        setWhtEditPo(null)
        load()
      } else {
        await appAlert(translateApiMessage(res.message || "", t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setWhtEditSaving(false)
    }
  }, [whtEditPo, whtEditAmount, whtEditRate, load, t])

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
    const totals = computePurchaseOrderMoneyTotals(cart)
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
      pad([t("subtotal"), ...Array(colCount - 2).fill(""), String(totals.subtotal)], colCount),
      pad([t("vat"), ...Array(colCount - 2).fill(""), String(totals.vat)], colCount),
      pad([t("total"), ...Array(colCount - 2).fill(""), String(totals.total)], colCount),
      ...(Number(po.withholding_tax_amount) > 0
        ? [
            pad(
              [
                t("poWht3LineLabel"),
                ...Array(colCount - 2).fill(""),
                String(-Math.abs(Number(po.withholding_tax_amount) || 0)),
              ],
              colCount
            ),
            pad(
              [
                t("poNetAfterWht"),
                ...Array(colCount - 2).fill(""),
                String(
                  Math.max(
                    0,
                    Math.round(((Number(totals.total) || 0) - Math.abs(Number(po.withholding_tax_amount) || 0)) * 100) /
                      100
                  )
                ),
              ],
              colCount
            ),
          ]
        : []),
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
    const footerCount = 3 + (Number(po.withholding_tax_amount) > 0 ? 2 : 0)
    const tableBody = `<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
${allRows.map((row, ri) => {
      const cells = row.map((c) => escapeXml(c))
      const isHead = ri === 0 || isHeaderDataRow(ri) || ri >= allRows.length - footerCount
      return `<tr${isHead ? ' class="head"' : ""}>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`
    }).join("")}
</table>`
    const html = buildErpExcelHtmlDocument(tableBody, erpExcelSimpleTableStyle({ withHead: true, fullWidth: false }))
    triggerErpExcelHtmlDownload(html, `PO_${poNo}.xls`)
  }

  const printPo = async (po: PurchaseOrderRow) => {
    const { items: cart, meta } = parsePurchaseOrderCart(po.cart_json)
    const totals = computePurchaseOrderMoneyTotals(cart)
    const poNo = po.po_no || `PO-${po.id}`
    const dateStr = formatPoDisplayDate(po, poDateLocale)

    const vendor = vendors.find(
      (v) => v.code === po.vendor_code || v.name === po.vendor_name
    )
    const relStore = String(meta?.relatedStore || "").trim()
    const vendorByOutlet =
      relStore && relStore !== "_none"
        ? vendorForSalesOutletStore(vendors, relStore)
        : undefined
    const vendorResolved = vendor || vendorByOutlet

    const isAcctPo = isAccountingPurchaseOrderByCartJson(po.cart_json)
    const issuerStore = resolveAccountingPoIssuerStore(po)
    let issuerCompany: { companyName: string; address: string; taxId: string; phone: string } | undefined
    if (issuerStore) {
      const ho = await getHeadOfficeInfo().catch(() => ({
        companyName: "",
        taxId: "",
        address: "",
        phone: "",
        bankInfo: "",
      }))
      const resolved = resolvePoIssuerCompany({
        issuerStore,
        vendors,
        headOffice: {
          companyName: ho.companyName || "",
          address: ho.address || "",
          taxId: ho.taxId || "",
          phone: ho.phone || "",
        },
      })
      issuerCompany = {
        companyName: resolved.companyName,
        address: resolved.address,
        taxId: resolved.taxId,
        phone: resolved.phone,
      }
    }
    const poPrintData = {
      poId: po.id,
      poNo,
      createdAt: dateStr,
      vendorName: po.vendor_name || vendorResolved?.name || "-",
      vendorAddress: vendorResolved?.address || undefined,
      vendorTaxId: vendorResolved?.taxId || undefined,
      vendorPhone: vendorResolved?.phone || undefined,
      locationName: po.location_name || "-",
      locationAddress: po.location_address || "-",
      cart: cart.map((c) => ({
        name: c.name || "-",
        code: (c as { code?: string }).code,
        price: c.price ?? 0,
        qty: c.qty ?? 0,
        store: c.store,
        taxType: c.taxType,
      })),
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      withholdingTaxAmount:
        po.withholding_tax_amount != null && Number(po.withholding_tax_amount) > 0
          ? Number(po.withholding_tax_amount)
          : undefined,
      withholdingTaxRate:
        po.withholding_tax_rate != null && Number(po.withholding_tax_rate) > 0
          ? Number(po.withholding_tax_rate)
          : undefined,
      userName: po.user_name || "-",
      status: po.status,
      relatedStore: meta?.relatedStore,
      issuerStore: meta?.issuerStore,
      issuerCompany,
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
    <>
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
          <div className={ADMIN_TABLE_SCROLL_VIEWPORT_CN}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{t("poHistoryColOrigin")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poNo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poDate")}</th>
                  <th className="min-w-[14rem] px-3 py-2 text-left font-medium">{t("poVendor")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poShipTo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("status")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("vat")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("total")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poPreparedBy")}</th>
                  <th className="w-[6.75rem] px-1 py-2" />
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={isAcct ? "default" : "secondary"}
                            className="whitespace-nowrap text-[10px] font-medium"
                          >
                            {isAcct ? t("poHistorySourceAccounting") : t("poHistorySourceLogistics")}
                          </Badge>
                          {isAcct && quotation && (
                            <a
                              href={quotation.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center rounded-md text-base leading-none text-amber-800 hover:bg-amber-500/20 dark:text-amber-400"
                              title={`${quotation.name} — ${t("poQuotationView")}`}
                              aria-label={`${t("poQuotationView")}: ${quotation.name}`}
                            >
                              <span aria-hidden>📎</span>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium">{po.po_no || `#${po.id}`}</td>
                      <td className="px-3 py-2 text-muted-foreground">{dateStr}</td>
                      <td className="min-w-[14rem] px-3 py-2">{po.vendor_name || "-"}</td>
                      <td className="px-3 py-2">{po.location_name || "-"}</td>
                      <td className="px-3 py-2">
                        {isPoApprovedStatus(po.status) ? (
                          <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{t("statusApproved")}</span>
                        ) : (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{po.status || "Draft"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatPoAmount(po.vat)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">
                        {formatPoAmount(po.total)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{po.user_name || "-"}</td>
                      <td className="min-w-[8.5rem] px-1 py-2">
                        <div className="grid grid-cols-4 gap-0.5">
                          {isAcct && quotation && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-800 ring-1 ring-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 dark:text-amber-400"
                              asChild
                            >
                              <a
                                href={quotation.url}
                                target="_blank"
                                rel="noreferrer"
                                title={`${quotation.name} — ${t("poQuotationView")}`}
                                aria-label={`${t("poQuotationView")}: ${quotation.name}`}
                              >
                                <Paperclip className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {!isAcct && quotation && (
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
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 hover:bg-primary/10 ${
                                  Number(po.withholding_tax_amount) > 0
                                    ? "text-rose-600"
                                    : "text-muted-foreground"
                                }`}
                                title={t("poWhtEditTitle")}
                                onClick={() => openWhtEdit(po)}
                              >
                                <Percent className="h-4 w-4" />
                              </Button>
                              {Number(po.withholding_tax_amount) > 0 ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  title={t("whtCertPrint")}
                                  onClick={() => void printPoWhtCertificate(po)}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              ) : null}
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
                            </>
                          )}
                          {isPoDraftEditableStatus(po.status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                              onClick={() => handleEditDraft(po)}
                              title={t("poHistoryEdit")}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {!isPoApprovedStatus(po.status) && po.status !== "Cancelled" && (
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
    <Dialog open={!!whtEditPo} onOpenChange={(open) => !open && setWhtEditPo(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("poWhtEditTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("poWhtEditHint")}</p>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("poWhtAmountLabel")}</Label>
            <Input
              value={whtEditAmount}
              onChange={(e) => setWhtEditAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("poWhtRateLabel")} (%)</Label>
            <Input
              value={whtEditRate}
              onChange={(e) => setWhtEditRate(e.target.value.replace(/[^\d.]/g, ""))}
              className="h-9 w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setWhtEditPo(null)} disabled={whtEditSaving}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void handleSaveWhtEdit()} disabled={whtEditSaving}>
            {whtEditSaving ? t("loading") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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

function formatPoAmount(n: number | null | undefined): string {
  if (n == null) return "-"
  const x = Number(n)
  if (!Number.isFinite(x)) return "-"
  return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
