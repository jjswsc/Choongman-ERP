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
  markOutboundInvoicesPrinted,
  updateInvoicePrintOverrides,
  getTaxInvoiceDepositSeq,
  type InvoicePrintOverridePayload,
} from "@/lib/api-client"
import { buildTaxInvoiceDocNo, isOutboundReceivableInvoiceNo, isTaxInvoiceDocumentNo } from "@/lib/tax-invoice-doc-no"

const STORAGE_KEY = "invoice-print-data"

function taxInvoiceDocNoMatchesIssueDate(documentNo: string, issueDate: string): boolean {
  const digits = String(issueDate || "").replace(/\D/g, "").slice(0, 8)
  if (digits.length < 8) return false
  const raw = String(documentNo || "").trim()
  if (!isTaxInvoiceDocumentNo(raw) || isOutboundReceivableInvoiceNo(raw)) return false
  return new RegExp(`^IV\\.${digits}-\\d+$`, "i").test(raw)
}

async function resolveTaxInvoiceDocNo(
  issueDate: string,
  data: InvoiceData
): Promise<string> {
  const refType = String(data.sourceRefType || "").trim()
  const refId = Number(data.sourceRefId || 0)
  const existingDocumentNo = String(data.documentNo || "").trim()

  if (refType && refId > 0) {
    const res = await getTaxInvoiceDepositSeq({
      issueDate,
      refType,
      refId,
      existingDocumentNo,
    })
    if (res?.success && Number(res.seq) > 0) {
      return buildTaxInvoiceDocNo(issueDate, Number(res.seq))
    }
  }

  // API 실패 시 -001로 몰지 않음: 같은 날짜 번호면 유지, 아니면 기존값 유지
  if (taxInvoiceDocNoMatchesIssueDate(existingDocumentNo, issueDate)) {
    return existingDocumentNo
  }
  return existingDocumentNo || buildTaxInvoiceDocNo(issueDate, 1)
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
            .then(async (res) => {
              if (!res?.success || !res.map) return
              const merged = valid.map((d) => {
                const refType = String(d.sourceRefType || "").trim()
                const refId = Number(d.sourceRefId || 0)
                if (!refType || !Number.isFinite(refId) || refId <= 0) return d
                const key = buildOverrideCode(refType, refId, normalizeDocKind(d))
                const ov = res.map[key]
                if (!ov) return d
                const taxDoc = isTaxInvoiceDoc(d)
                const ovDocNo = String(ov.documentNo || "").trim()
                let documentNo = d.documentNo
                if (ovDocNo) {
                  if (taxDoc) {
                    if (isTaxInvoiceDocumentNo(ovDocNo) && !isOutboundReceivableInvoiceNo(ovDocNo)) {
                      documentNo = ovDocNo
                    }
                  } else {
                    documentNo = ovDocNo
                  }
                }
                return {
                  ...d,
                  issueDate: ov.issueDate || d.issueDate,
                  dueDate: ov.dueDate || d.dueDate,
                  referenceNo: ov.referenceNo || d.referenceNo,
                  documentNo,
                  shipTo: ov.shipTo ?? d.shipTo,
                }
              })
              // 순차 재할당 + 즉시 예약 — Promise.all 병렬 시 같은 순번 중복 방지
              const fixed: InvoiceData[] = []
              for (const d of merged) {
                if (!isTaxInvoiceDoc(d)) {
                  fixed.push(d)
                  continue
                }
                const issueDate = String(d.issueDate || "").trim().slice(0, 10)
                if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
                  fixed.push(d)
                  continue
                }
                const documentNo = await resolveTaxInvoiceDocNo(issueDate, d)
                const next = documentNo === d.documentNo ? d : { ...d, documentNo }
                fixed.push(next)
                if (documentNo !== d.documentNo) {
                  try {
                    const refType = String(next.sourceRefType || "").trim()
                    const refId = Number(next.sourceRefId || 0)
                    if (refType && Number.isFinite(refId) && refId > 0) {
                      await updateInvoicePrintOverrides([
                        {
                          refType,
                          refId,
                          docKind: "tax",
                          issueDate: next.issueDate || undefined,
                          dueDate: next.dueDate || undefined,
                          referenceNo: next.referenceNo || undefined,
                          documentNo: next.documentNo || undefined,
                          shipTo: next.shipTo || undefined,
                        },
                      ])
                    }
                  } catch {
                    // ignore reserve errors on load
                  }
                }
              }
              setEditDatas(fixed)
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

  const buildOverridePayload = React.useCallback((datas: InvoiceData[]): InvoicePrintOverridePayload[] => {
    return datas.flatMap((d) => {
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
  }, [])

  const handlePrint = async () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(editDatas))
    } catch {
      // ignore session storage failures
    }
    // 인쇄 시에도 문서번호 저장 — 다음 건이 같은 -001을 받지 않도록 순번 예약
    try {
      const payload = buildOverridePayload(editDatas.filter(isTaxInvoiceDoc))
      if (payload.length > 0) {
        await updateInvoicePrintOverrides(payload)
      }
    } catch (e) {
      console.error("persist tax invoice doc no on print failed:", e)
    }
    try {
      const invoiceNos = [...new Set(
        editDatas
          .map((d) => String(d.referenceNo || '').trim())
          .filter((s) => /^IVF?\d{8}-/i.test(s))
      )]
      if (invoiceNos.length > 0) {
        await markOutboundInvoicesPrinted({ invoiceNos })
      }
    } catch (e) {
      console.error('markOutboundInvoicesPrinted failed:', e)
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
    const payload = buildOverridePayload(editDatas)

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
                          void resolveTaxInvoiceDocNo(nextIssueDate, data).then(async (documentNo) => {
                            const next = { ...data, ...patch, documentNo }
                            updateField(i, { ...patch, documentNo })
                            // Issue Date 변경 직후 순번 예약(다른 창에서 같은 -001 받지 않도록)
                            try {
                              const payload = buildOverridePayload([next])
                              if (payload.length > 0) await updateInvoicePrintOverrides(payload)
                            } catch (err) {
                              console.error("reserve tax invoice seq failed:", err)
                            }
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
