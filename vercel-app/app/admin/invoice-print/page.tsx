"use client"

import "./invoice-print.css"
import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Invoice, type InvoiceData } from "@/components/invoice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getInvoicePrintOverrides,
  updateInvoicePrintOverrides,
  getTaxInvoiceDepositSeq,
  type InvoicePrintOverridePayload,
} from "@/lib/api-client"
import { buildTaxInvoiceDocNo, parseTaxInvoiceDocNoSuffix } from "@/lib/tax-invoice-doc-no"

const STORAGE_KEY = "invoice-print-data"

async function resolveTaxInvoiceDocNo(
  issueDate: string,
  data: InvoiceData
): Promise<string> {
  const accrualId = Number(data.sourceRefId || 0)
  if (accrualId > 0) {
    const res = await getTaxInvoiceDepositSeq({ accrualId, issueDate })
    if (res?.success && Number(res.seq) > 0) {
      return buildTaxInvoiceDocNo(issueDate, Number(res.seq))
    }
  }
  const preserved = parseTaxInvoiceDocNoSuffix(data.documentNo)
  return buildTaxInvoiceDocNo(issueDate, preserved ?? 1)
}

function InvoicePrintLoadingLine() {
  const t = useT(useLang().lang)
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <p className="text-muted-foreground">{t("adminInvoicePrintLoading")}</p>
    </div>
  )
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

function InvoicePrintPageInner() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const embed = searchParams.get("embed") === "1"
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
      await appAlert(t("adminInvoicePrintNoRefToSave"))
      setUpdating(false)
      return
    }

    const res = await updateInvoicePrintOverrides(payload)
    if (!res?.success) {
      await appAlert(res?.message || t("adminInvoicePrintUpdateFail"))
      setUpdating(false)
      return
    }
    await appAlert(t("adminInvoicePrintUpdateOk"))
    setUpdating(false)
  }

  const updateField = (index: number, patch: Partial<InvoiceData>) => {
    setEditDatas((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground">{t("adminInvoicePrintLoading")}</p>
      </div>
    )
  }

  if (editDatas.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">
          {t("adminInvoicePrintEmpty")}
        </p>
        <Button variant="outline" onClick={() => window.close()}>
          {t("adminInvoicePrintClose")}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {!embed && (
      <div className="no-print fixed inset-x-0 bottom-0 z-[9999] border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl p-3 space-y-3">
          <div className="flex items-center gap-3">
            <Button onClick={handlePrint}>{t("adminInvoicePrintPrint")}</Button>
            <Button type="button" onClick={handleUpdate} disabled={updating}>
              {updating ? t("adminInvoicePrintUpdating") : t("adminInvoicePrintUpdate")}
            </Button>
            <Button variant="outline" onClick={() => window.close()}>
              {t("adminInvoicePrintClose")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("adminInvoicePrintHintSaveNote")}
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
                          void resolveTaxInvoiceDocNo(nextIssueDate, data).then((documentNo) => {
                            updateField(i, { ...patch, documentNo })
                          })
                          return
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
                      onChange={(e) => updateField(i, { referenceNo: e.target.value })}
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
      )}
      <div className={`invoice-print-wrapper ${embed ? "pb-4" : "pb-[40vh] print:pb-0"} max-w-4xl mx-auto print:max-w-full print:mx-0 print:px-0`}>
        {editDatas.map((data, i) => (
          <div key={data.documentNo + "-" + i} className={`${i > 0 ? "break-before-page" : ""} pt-4`}>
            <Invoice data={data} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InvoicePrintPage() {
  return (
    <Suspense
      fallback={<InvoicePrintLoadingLine />}
    >
      <InvoicePrintPageInner />
    </Suspense>
  )
}
