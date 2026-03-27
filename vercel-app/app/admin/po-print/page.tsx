"use client"

import "../invoice-print/invoice-print.css"
import * as React from "react"
import {
  PurchaseOrderPrint,
  type PoPrintData,
  type PoPrintCompany,
} from "@/components/invoice/purchase-order-print"
import { Button } from "@/components/ui/button"
import { getInvoiceData } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

const STORAGE_KEY = "po-print-data"

export default function PoPrintPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [data, setData] = React.useState<PoPrintData | null>(null)
  const [company, setCompany] = React.useState<PoPrintCompany | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [stampImageUrl, setStampImageUrl] = React.useState<string | undefined>(undefined)

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

  const labels = React.useMemo(
    () => ({
      poTitle: t("poTitle") || "PURCHASE ORDER",
      poNo: t("poNo") || "PO No",
      poDate: t("poDate") || "Date",
      from: "FROM",
      supplier: "SUPPLIER",
      shipTo: t("poShipTo") || "SHIP TO",
      no: "No",
      item: t("item") || "Item",
      spec: t("orderItemSpec") || "Spec",
      unitPrice: t("orderItemUnitPrice") || "Unit Price",
      qty: t("orderItemQty") || "Qty",
      total: t("orderItemTotal") || "Amount",
      subtotal: t("subtotal") || "Subtotal",
      vat: t("vat") || "VAT",
      grandTotal: t("total") || "Grand Total",
      preparedBy: t("poPreparedBy") || "Prepared by",
      store: t("orderColStore") || "Store",
      receivedBy: t("inv_received_by") || "Received by",
      signatureDate: t("inv_date") || "Date",
      authorizedSignatureStamp:
        t("poAuthorizedSignatureStamp") || "Authorized Signature & Company Stamp",
      poMetaStore: t("poMetaStore") || "Store",
      poMetaStoreVendor: t("poMetaStoreVendor") || "Store vendor",
      poFormatBadgeExternal: t("poFormatBadgeExternal") || "External format",
    }),
    [t]
  )

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
      <div className="no-print fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-[9999]">
        <Button onClick={handlePrint}>{t("purchaseOrderPrint") || "Print"}</Button>
        <Button variant="outline" onClick={() => window.close()}>
          Close
        </Button>
        <span className="text-xs text-muted-foreground max-w-[220px]">
          {t("outPrintHint") || "인쇄 시 브라우저 설정에서 '머리글 및 바닥글'을 끄면 URL·날짜가 나오지 않습니다."}
        </span>
      </div>
      <div className="invoice-print-wrapper pb-24 print:pb-0 max-w-4xl mx-auto print:max-w-full print:mx-0 print:px-0 pt-4">
        <PurchaseOrderPrint
          data={data}
          company={company!}
          labels={labels}
          stampImageUrl={stampImageUrl}
        />
      </div>
    </div>
  )
}
