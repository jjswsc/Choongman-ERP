"use client"

import "./invoice-print.css"
import * as React from "react"
import { Invoice, type InvoiceData } from "@/components/invoice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import {
  getInvoicePrintOverrides,
  updateInvoicePrintOverrides,
  type InvoicePrintOverridePayload,
} from "@/lib/api-client"

const STORAGE_KEY = "invoice-print-data"

function extractDigits(value: string): string {
  return String(value || "").replace(/\D/g, "")
}

function makeTaxInvoiceDocNo(issueDate: string, refText: string): string {
  const dateDigits = extractDigits(issueDate)
  const yyyymmdd = dateDigits.length >= 8 ? dateDigits.slice(0, 8) : new Date().toISOString().slice(0, 10).replace(/\D/g, "")
  const yyyymm = yyyymmdd.slice(0, 6)
  const refDigits = extractDigits(refText)
  const suffix = (refDigits.slice(-3) || "1").padStart(3, "0")
  return `IV.${yyyymm}XX-${suffix}`
}

function isTaxInvoiceDoc(data: InvoiceData): boolean {
  return /tax\s*invoice/i.test(data.documentType || "")
}

function normalizeDocKind(data: InvoiceData): "invoice" | "tax" {
  return isTaxInvoiceDoc(data) ? "tax" : "invoice"
}

function buildOverrideCode(refType: string, refId: number, docKind: "invoice" | "tax"): string {
  return `invoice_print_override:${docKind}:${String(refType || "").trim()}:${refId}`
}

export default function InvoicePrintPage() {
  const [editDatas, setEditDatas] = React.useState<InvoiceData[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [updating, setUpdating] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        const valid = arr.filter((d): d is InvoiceData => d && typeof d === "object" && "documentNo" in d && "seller" in d && "client" in d && Array.isArray((d as InvoiceData).items))
        setEditDatas(valid)
        const refs = valid
          .map((d) => ({
            refType: String(d.sourceRefType || "").trim(),
            refId: Number(d.sourceRefId || 0),
            docKind: normalizeDocKind(d),
          }))
          .filter((r) => r.refType && Number.isFinite(r.refId) && r.refId > 0) as {
            refType: string
            refId: number
            docKind: "invoice" | "tax"
          }[]
        if (refs.length > 0) {
          getInvoicePrintOverrides(refs)
            .then((res) => {
              if (!res?.success || !res.map) return
              setEditDatas((prev) =>
                prev.map((d) => {
                  const refType = String(d.sourceRefType || "").trim()
                  const refId = Number(d.sourceRefId || 0)
                  if (!refType || !Number.isFinite(refId) || refId <= 0) return d
                  const key = buildOverrideCode(refType, refId, normalizeDocKind(d))
                  const ov = res.map[key]
                  if (!ov) return d
                  return {
                    ...d,
                    issueDate: ov.issueDate || d.issueDate,
                    dueDate: ov.dueDate || d.dueDate,
                    referenceNo: ov.referenceNo || d.referenceNo,
                    documentNo: ov.documentNo || d.documentNo,
                    shipTo: ov.shipTo ?? d.shipTo,
                  }
                })
              )
            })
            .catch(() => {
              // ignore override fetch errors
            })
        }
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  const handlePrint = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(editDatas))
    } catch {
      // ignore session storage failures
    }
    window.print()
  }

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(editDatas))
    } catch {
      // ignore session storage failures
    }
    const payload: InvoicePrintOverridePayload[] = editDatas.flatMap((d) => {
      const refType = String(d.sourceRefType || "").trim()
      const refId = Number(d.sourceRefId || 0)
      if (!refType || !Number.isFinite(refId) || refId <= 0) return []
      return [
        {
          refType,
          refId,
          docKind: normalizeDocKind(d),
          issueDate: d.issueDate || undefined,
          dueDate: d.dueDate || undefined,
          referenceNo: d.referenceNo || undefined,
          documentNo: d.documentNo || undefined,
          shipTo: d.shipTo || undefined,
        } satisfies InvoicePrintOverridePayload,
      ]
    })

    if (payload.length === 0) {
      await appAlert("저장할 주문 기준 정보가 없어 현재 화면 값만 유지됩니다.")
      setUpdating(false)
      return
    }

    const res = await updateInvoicePrintOverrides(payload)
    if (!res?.success) {
      await appAlert(res?.message || "Update 저장에 실패했습니다.")
      setUpdating(false)
      return
    }
    await appAlert("Update 저장이 완료되었습니다. 다음에 열어도 수정값이 유지됩니다.")
    setUpdating(false)
  }

  const updateField = (index: number, patch: Partial<InvoiceData>) => {
    setEditDatas((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (editDatas.length === 0) {
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
      <div className="no-print fixed inset-x-0 bottom-0 z-[9999] border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl p-3 space-y-3">
          <div className="flex items-center gap-3">
            <Button onClick={handlePrint}>Print</Button>
            <Button type="button" onClick={handleUpdate} disabled={updating}>
              {updating ? "Updating..." : "Update"}
            </Button>
            <Button variant="outline" onClick={() => window.close()}>
              Close
            </Button>
            <span className="text-xs text-muted-foreground">
              인쇄 전 수정 후 Update를 누르면 다음에도 반영됩니다.
            </span>
          </div>
          <div className="max-h-[35vh] overflow-auto space-y-2 pr-1">
            {editDatas.map((data, i) => {
              const taxDoc = isTaxInvoiceDoc(data)
              return (
                <div key={`${data.documentNo}-${i}`} className="rounded-md border p-2">
                  <div className="text-xs font-semibold mb-2">
                    {data.documentType} #{i + 1}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <Input
                      value={data.issueDate || ""}
                      type="date"
                      onChange={(e) => {
                        const nextIssueDate = e.target.value
                        const patch: Partial<InvoiceData> = { issueDate: nextIssueDate }
                        if (taxDoc) {
                          patch.documentNo = makeTaxInvoiceDocNo(nextIssueDate, data.referenceNo || data.documentNo)
                        }
                        updateField(i, patch)
                      }}
                    />
                    <Input
                      value={data.dueDate || ""}
                      type="date"
                      onChange={(e) => updateField(i, { dueDate: e.target.value })}
                    />
                    <Input
                      value={data.referenceNo || ""}
                      placeholder="Reference"
                      onChange={(e) => {
                        const nextRef = e.target.value
                        const patch: Partial<InvoiceData> = { referenceNo: nextRef }
                        if (taxDoc) {
                          patch.documentNo = makeTaxInvoiceDocNo(data.issueDate, nextRef || data.documentNo)
                        }
                        updateField(i, patch)
                      }}
                    />
                    <Input
                      value={data.documentNo || ""}
                      placeholder="Document No."
                      onChange={(e) => updateField(i, { documentNo: e.target.value })}
                    />
                    <Input
                      value={data.shipTo || "-"}
                      placeholder="Ship To"
                      onChange={(e) => updateField(i, { shipTo: e.target.value })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="invoice-print-wrapper pb-[40vh] print:pb-0 max-w-4xl mx-auto print:max-w-full print:mx-0 print:px-0">
        {editDatas.map((data, i) => (
          <div key={data.documentNo + "-" + i} className={`${i > 0 ? "break-before-page" : ""} pt-4`}>
            <Invoice data={data} />
          </div>
        ))}
      </div>
    </div>
  )
}
