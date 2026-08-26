"use client"

import "../invoice-print/invoice-print.css"
import * as React from "react"
import {
  PurchaseOrderPrint,
  type PoPrintData,
  type PoPrintCompany,
  isPoApprovedStatus,
  isPoAccountingTaxInvoiceMode,
} from "@/components/invoice/purchase-order-print"
import { Button } from "@/components/ui/button"
import { getInvoiceData, processPurchaseOrderApproval } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  SALES_OUTBOUND_INVOICE_TITLE,
  SALES_TAX_INVOICE_TITLE,
} from "@/lib/sales-tax-document-title"
import { CheckCircle } from "lucide-react"

const STORAGE_KEY = "po-print-data"

export default function PoPrintPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [data, setData] = React.useState<PoPrintData | null>(null)
  const [company, setCompany] = React.useState<PoPrintCompany | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [stampImageUrl, setStampImageUrl] = React.useState<string | undefined>(undefined)
  const [approving, setApproving] = React.useState(false)

  const canApprove = Boolean(
    data?.poId &&
      !isPoApprovedStatus(data.status) &&
      String(data.status ?? "").trim().toLowerCase() !== "cancelled"
  )

  const persistData = React.useCallback((next: PoPrintData) => {
    setData(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore session storage failures
    }
  }, [])

  const handleApprove = React.useCallback(async () => {
    if (!data?.poId || approving) return
    setApproving(true)
    try {
      const res = await processPurchaseOrderApproval({ poId: data.poId })
      if (res.success) {
        persistData({ ...data, status: "Approved" })
      } else {
        await appAlert(
          translateApiMessage(res.message || "", t) || res.message || t("processFail")
        )
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setApproving(false)
    }
  }, [approving, data, persistData, t])

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setStampImageUrl(`${window.location.origin}/company-stamp.png`)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const raw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null
        if (!raw) {
          setLoaded(true)
          return
        }
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== "object" || !("poNo" in parsed) || !("cart" in parsed)) {
          setLoaded(true)
          return
        }
        const poData = parsed as PoPrintData
        setData(poData)

        const invRes = await getInvoiceData()
        if (cancelled) return
        if (invRes?.company) {
          setCompany({
            companyName: invRes.company.companyName,
            address: invRes.company.address,
            taxId: invRes.company.taxId,
            phone: invRes.company.phone,
          })
        } else {
          setCompany({
            companyName: "S&J GLOBAL",
            address: "-",
            taxId: "-",
            phone: "-",
          })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const labels = React.useMemo(() => {
    const acct = Boolean(data?.accountingBillToStyle)
    const taxMode = isPoAccountingTaxInvoiceMode(
      data?.accountingBillToStyle,
      data?.status,
      data?.invoiceReceived
    )
    const approved = data ? isPoApprovedStatus(data.status) : false
    return {
      poTitle: acct
        ? taxMode
          ? t("poAccountingPrintTitleTaxInvoice") || SALES_TAX_INVOICE_TITLE
          : t("poAccountingPrintTitleInvoice") || SALES_OUTBOUND_INVOICE_TITLE
        : t("poTitle") || "PURCHASE ORDER",
      poNo: acct ? t("poAccountingInvoiceNoLabel") || "Invoice No." : t("poNo") || "PO No",
      poDate: t("poDate") || "Date",
      from: "FROM",
      supplier: acct ? t("poPrintBillTo") || "BILL TO (FRANCHISE)" : "SUPPLIER",
      shipTo: t("poShipTo") || "SHIP TO",
      no: "No",
      item: t("item") || "Item",
      spec: t("orderItemSpec") || "Spec",
      unitPrice: t("orderItemUnitPrice") || "Unit Price",
      qty: t("orderItemQty") || "Qty",
      total: t("orderItemTotal") || "Amount",
      subtotal: t("subtotal") || "Subtotal",
      vat: t("vat") || "VAT",
      invoiceTotal: t("poPrintInvoiceTotal") || "Total (incl. tax)",
      grandTotal: t("total") || "Grand Total",
      preparedBy: t("poPreparedBy") || "Prepared by",
      store: t("orderColStore") || "Store",
      receivedBy: t("inv_received_by") || "Received by",
      signatureDate: t("inv_date") || "Date",
      authorizedSignatureStamp:
        t("poAuthorizedSignatureStamp") || "Authorized Signature & Company Stamp",
      poMetaStore: t("poMetaStore") || "Store",
      poMetaStoreVendor: t("poMetaStoreVendor") || "Store vendor",
      poPrintLegalEntity: t("poPrintLegalEntity") || "Legal entity",
      poFormatBadgeExternal: t("poFormatBadgeExternal") || "External format",
      poHeaderBadge: acct
        ? taxMode
          ? t("poAccountingPrintBadgeTaxInvoice") || SALES_TAX_INVOICE_TITLE
          : approved
            ? t("poAccountingPrintBadgeApproved") || "Approved"
            : t("poAccountingPrintBadgeDraft") || "Draft"
        : undefined,
      poWht3LineLabel: t("poWht3LineLabel") || "Withholding tax (3%)",
      poNetAfterWht: t("poNetAfterWht") || "Net after withholding",
      poPrintVatLineLeft: (() => {
        const v = Number(data?.vat ?? 0)
        const s = Number(data?.subtotal ?? 0)
        if (v >= 0.005) return `${t("vat") || "VAT"} (7%)`
        if (s >= 0.005) return t("poCartVatLabelNone")
        return `${t("vat") || "VAT"} (7%)`
      })(),
    }
  }, [t, data])

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground">{t("loadingItems") || "Loading..."}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.close()}>
          Close
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">
          {t("poHistoryEmpty") || "No PO data. Use Print from Purchase Order History."}
        </p>
        <Button variant="outline" onClick={() => window.close()}>
          Close
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="no-print fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-3 z-[9999] max-w-[min(100vw-2rem,42rem)]">
        {canApprove ? (
          <Button
            className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
            onClick={() => void handleApprove()}
            disabled={approving}
          >
            <CheckCircle className="h-4 w-4" />
            {approving ? t("loading") : t("poPrintApprove") || t("adminApproved") || "PO Approve"}
          </Button>
        ) : null}
        <Button onClick={handlePrint}>{t("purchaseOrderPrint") || "Print"}</Button>
        <Button variant="outline" onClick={() => window.close()}>
          Close
        </Button>
        <span className="text-xs text-muted-foreground max-w-[220px]">
          {canApprove
            ? t("poPrintApproveHint") ||
              "승인 후 회사 인·서명란이 인쇄에 포함됩니다."
            : t("outPrintHint") ||
              "인쇄 시 브라우저 설정에서 '머리글 및 바닥글'을 끄면 URL·날짜가 나오지 않습니다."}
        </span>
      </div>
      <div className="invoice-print-wrapper pb-24 print:pb-0 max-w-4xl mx-auto print:max-w-full print:mx-0 print:px-0 pt-4">
        <PurchaseOrderPrint
          data={data}
          company={company!}
          labels={labels}
          stampImageUrl={stampImageUrl}
          onApprove={canApprove ? () => void handleApprove() : undefined}
          approveBusy={approving}
          approveLabel={t("poPrintApprove") || t("adminApproved") || "PO Approve"}
        />
      </div>
    </div>
  )
}
