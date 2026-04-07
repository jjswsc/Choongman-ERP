"use client"

import "./invoice-print.css"
import * as React from "react"
import { Invoice, type InvoiceData } from "@/components/invoice"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "invoice-print-data"

export default function InvoicePrintPage() {
  const [datas, setDatas] = React.useState<InvoiceData[]>([])
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        setDatas(arr.filter((d): d is InvoiceData => d && typeof d === "object" && "documentNo" in d && "seller" in d && "client" in d && Array.isArray((d as InvoiceData).items)))
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  const handlePrint = () => {
    window.print()
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (datas.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">
          No invoice data. Use Print Invoice on Outbound History, or Tax Invoice on Receivables (paid orders).
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
        <Button onClick={handlePrint}>Print</Button>
        <Button variant="outline" onClick={() => window.close()}>
          Close
        </Button>
        <span className="text-xs text-muted-foreground max-w-[220px]">
          인쇄 시 브라우저 설정에서 &apos;머리글 및 바닥글&apos;을 끄면 URL·날짜가 나오지 않습니다.
        </span>
      </div>
      <div className="invoice-print-wrapper pb-24 print:pb-0 max-w-4xl mx-auto print:max-w-full print:mx-0 print:px-0">
        {datas.map((data, i) => (
          <div key={data.documentNo + "-" + i} className={`${i > 0 ? "break-before-page" : ""} pt-4`}>
            <Invoice data={data} />
          </div>
        ))}
      </div>
    </div>
  )
}
