"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { canWriteAccountingCompliance } from "@/lib/accounting-auth"
import {
  bulkSavePurchaseTaxInvoices,
  deletePurchaseTaxInvoice,
  extractExpenseDocument,
  getPurchaseTaxInvoices,
  savePurchaseTaxInvoice,
  type PurchaseTaxInvoiceDto,
  apiFetch,
} from "@/lib/api-client"
import {
  formatPp30Amount2,
  formatSellerBranch,
  gregorianYmdToBuddhistHint,
  isLikelyTaxInvoiceCopy,
  purchaseTaxInvoiceDedupeKey,
  SELLER_BRANCH_HQ,
} from "@/lib/purchase-tax-invoice-core"
import { fileToImageDataUrl, renderPdfPagesToJpegDataUrls } from "@/lib/purchase-tax-invoice-pdf-client"
import { cn } from "@/lib/utils"

type Props = {
  filingYearMonth: string
  filingStoreFilter: string
  filingSearchTick?: number
}

type FormState = {
  id?: number
  storeName: string
  docDate: string
  invoiceNo: string
  sellerName: string
  sellerTaxId: string
  sellerBranch: string
  netAmount: string
  vatAmount: string
}

type ReviewRow = FormState & { skip?: boolean; skipReason?: string; page?: number }

const emptyForm = (storeName: string, month: string): FormState => ({
  storeName,
  docDate: `${month}-01`,
  invoiceNo: "",
  sellerName: "",
  sellerTaxId: "",
  sellerBranch: SELLER_BRANCH_HQ,
  netAmount: "",
  vatAmount: "",
})

function defaultStoreFromFilter(storeFilter: string, fallback: string): string {
  const raw = String(storeFilter || "").trim()
  if (!raw || raw === "All" || raw === "*") return fallback
  if (raw.toLowerCase().startsWith("entity:") || raw.toLowerCase().startsWith("taxid:")) return fallback
  return raw
}

export function TaxFilingPurchaseTaxInvoicesTab({
  filingYearMonth,
  filingStoreFilter,
  filingSearchTick = 0,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const canWrite = canWriteAccountingCompliance(String(auth?.role || ""))
  const fallbackStore = String(auth?.store || "").trim()
  const [rows, setRows] = React.useState<PurchaseTaxInvoiceDto[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [tableMissing, setTableMissing] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(() =>
    emptyForm(defaultStoreFromFilter(filingStoreFilter, fallbackStore), filingYearMonth)
  )
  const [saving, setSaving] = React.useState(false)
  const [reviewRows, setReviewRows] = React.useState<ReviewRow[]>([])
  const [pdfBusy, setPdfBusy] = React.useState("")
  const fileRef = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await getPurchaseTaxInvoices({
        taxMonth: filingYearMonth,
        storeFilter: filingStoreFilter,
      })
      if (res.error) setError(res.error)
      setTableMissing(!!res.tableMissing)
      setRows(res.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTableMissing(false)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filingYearMonth, filingStoreFilter])

  React.useEffect(() => {
    void load()
  }, [load, filingSearchTick])

  React.useEffect(() => {
    setForm((prev) => ({
      ...prev,
      storeName: prev.storeName || defaultStoreFromFilter(filingStoreFilter, fallbackStore),
      docDate: prev.docDate || `${filingYearMonth}-01`,
    }))
  }, [filingStoreFilter, filingYearMonth, fallbackStore])

  const totals = React.useMemo(() => {
    let net = 0
    let vat = 0
    for (const r of rows) {
      net += Number(r.netAmount) || 0
      vat += Number(r.vatAmount) || 0
    }
    return { net, vat, count: rows.length }
  }, [rows])

  const fillFromRow = (r: PurchaseTaxInvoiceDto) => {
    setForm({
      id: r.id,
      storeName: r.storeName,
      docDate: r.docDate,
      invoiceNo: r.invoiceNo,
      sellerName: r.sellerName,
      sellerTaxId: r.sellerTaxId,
      sellerBranch: r.sellerBranch,
      netAmount: String(r.netAmount),
      vatAmount: String(r.vatAmount),
    })
  }

  const onSave = async () => {
    if (!canWrite) return
    setSaving(true)
    setError("")
    try {
      const res = await savePurchaseTaxInvoice({
        id: form.id,
        storeName: form.storeName,
        docDate: form.docDate,
        invoiceNo: form.invoiceNo,
        sellerName: form.sellerName,
        sellerTaxId: form.sellerTaxId,
        sellerBranch: formatSellerBranch(form.sellerBranch),
        netAmount: Number(form.netAmount) || 0,
        vatAmount: Number(form.vatAmount) || 0,
        source: "manual",
      })
      if (!res.success) {
        setError(
          res.error === "DUPLICATE"
            ? t("ptiDupError")
            : res.error === "SUBMITTED"
              ? t("ptiSubmittedLocked")
              : res.error || "save failed"
        )
        return
      }
      setForm(emptyForm(defaultStoreFromFilter(filingStoreFilter, fallbackStore), filingYearMonth))
      await load()
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (id: number) => {
    if (!canWrite) return
    if (!window.confirm(t("ptiDeleteConfirm"))) return
    const res = await deletePurchaseTaxInvoice(id)
    if (!res.success) {
      setError(res.error === "SUBMITTED" ? t("ptiSubmittedLocked") : res.error || "delete failed")
      return
    }
    if (form.id === id) {
      setForm(emptyForm(defaultStoreFromFilter(filingStoreFilter, fallbackStore), filingYearMonth))
    }
    await load()
  }

  const onExport = async () => {
    const q = new URLSearchParams({
      taxMonth: filingYearMonth,
      storeFilter: filingStoreFilter || "All",
      export: "xlsx",
    })
    const res = await apiFetch(`/api/purchaseTaxInvoices?${q}`)
    if (!res.ok) {
      setError(`HTTP_${res.status}`)
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `รายการใบกำกับภาษีซื้อ_${filingYearMonth.replace("-", "")}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ingestFiles = async (files: File[]) => {
    if (!files.length || !canWrite) return
    setPdfBusy(t("ptiPdfReading"))
    setError("")
    const extracted: ReviewRow[] = []
    const seen = new Set(rows.map((r) => purchaseTaxInvoiceDedupeKey(r.buyerTaxId, r.invoiceNo, r.sellerTaxId)))
    const storeName = defaultStoreFromFilter(filingStoreFilter, form.storeName || fallbackStore)
    try {
      for (const file of files) {
        const lower = file.name.toLowerCase()
        const dataUrls =
          lower.endsWith(".pdf") || file.type === "application/pdf"
            ? await renderPdfPagesToJpegDataUrls(file)
            : [await fileToImageDataUrl(file)]
        for (let i = 0; i < dataUrls.length; i += 1) {
          setPdfBusy(tr(t, "ptiPdfPage", { n: String(i + 1), total: String(dataUrls.length) }))
          const res = await extractExpenseDocument({
            dataUrl: dataUrls[i]!,
            fileName: `${file.name}-p${i + 1}.jpg`,
            schema: "purchase_tax_invoice",
          })
          const f = (res.fields || {}) as Record<string, unknown>
          const invoiceNo = String(f.invoiceNo || "").trim()
          const sellerTaxId = String(f.sellerTaxId || "").replace(/\D/g, "")
          const isCopy = f.isCopy === true || isLikelyTaxInvoiceCopy(String(f.sellerName || invoiceNo))
          const key = purchaseTaxInvoiceDedupeKey("x", invoiceNo, sellerTaxId)
          let skip = false
          let skipReason = ""
          if (isCopy) {
            skip = true
            skipReason = t("ptiPdfSkipCopy")
          } else if (invoiceNo && seen.has(purchaseTaxInvoiceDedupeKey(rows[0]?.buyerTaxId || "x", invoiceNo, sellerTaxId))) {
            skip = true
            skipReason = t("ptiDupError")
          } else if (invoiceNo && extracted.some((r) => r.invoiceNo.replace(/\s+/g, "").toUpperCase() === invoiceNo.replace(/\s+/g, "").toUpperCase() && r.sellerTaxId === sellerTaxId)) {
            skip = true
            skipReason = t("ptiPdfSkipCopy")
          }
          if (invoiceNo) seen.add(key)
          extracted.push({
            storeName,
            docDate: String(f.docDate || `${filingYearMonth}-01`).slice(0, 10),
            invoiceNo,
            sellerName: String(f.sellerName || "").trim(),
            sellerTaxId,
            sellerBranch: formatSellerBranch(f.sellerBranch),
            netAmount: f.netAmount != null ? String(f.netAmount) : "",
            vatAmount: f.vatAmount != null ? String(f.vatAmount) : "",
            skip,
            skipReason,
            page: i + 1,
          })
        }
      }
      setReviewRows(extracted)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfBusy("")
    }
  }

  const saveReview = async () => {
    const payload = reviewRows
      .filter((r) => !r.skip)
      .map((r) => ({
        storeName: r.storeName,
        docDate: r.docDate,
        invoiceNo: r.invoiceNo,
        sellerName: r.sellerName,
        sellerTaxId: r.sellerTaxId,
        sellerBranch: formatSellerBranch(r.sellerBranch),
        netAmount: Number(r.netAmount) || 0,
        vatAmount: Number(r.vatAmount) || 0,
        source: "pdf",
      }))
    if (!payload.length) return
    setSaving(true)
    try {
      const res = await bulkSavePurchaseTaxInvoices(payload)
      if (!res.success) {
        setError(res.error || "save failed")
        return
      }
      setReviewRows([])
      await load()
    } finally {
      setSaving(false)
    }
  }

  const beHint = gregorianYmdToBuddhistHint(`${filingYearMonth}-01`)

  return (
    <div className="space-y-3">
      <Card className="border-border/80">
        <CardContent className="pt-4 pb-4 space-y-2 text-sm">
          <p>{t("ptiHint")}</p>
          <p className="text-xs text-muted-foreground">{beHint}. {t("ptiDateBeHint")}</p>
          {tableMissing ? <p className="text-sm text-destructive">{t("ptiTableMissing")}</p> : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {t("search")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onExport} disabled={!rows.length}>
          {t("ptiExportExcel")}
        </Button>
        {canWrite ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                void ingestFiles(Array.from(e.target.files || []))
                e.target.value = ""
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={!!pdfBusy}>
              {t("ptiPdfUpload")}
            </Button>
          </>
        ) : null}
        {pdfBusy ? <span className="text-xs text-muted-foreground">{pdfBusy}</span> : null}
        <span className="text-xs tabular-nums text-muted-foreground ml-auto">
          {totals.count} · {t("ptiColNet")} {formatPp30Amount2(totals.net)} · {t("ptiColVat")} {formatPp30Amount2(totals.vat)}
        </span>
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {canWrite ? (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="text-sm font-medium">{form.id ? t("ptiEdit") : t("ptiAdd")}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">{t("accCompStore")}</Label>
                <Input className="h-8" value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColDate")}</Label>
                <Input className="h-8" type="date" value={form.docDate} onChange={(e) => setForm({ ...form, docDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColInvoiceNo")}</Label>
                <Input className="h-8" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColSeller")}</Label>
                <Input className="h-8" value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColSellerTaxId")}</Label>
                <Input className="h-8" value={form.sellerTaxId} onChange={(e) => setForm({ ...form, sellerTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColBranch")}</Label>
                <Input className="h-8" value={form.sellerBranch} onChange={(e) => setForm({ ...form, sellerBranch: e.target.value })} placeholder={SELLER_BRANCH_HQ} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColNet")}</Label>
                <Input className="h-8" inputMode="decimal" value={form.netAmount} onChange={(e) => setForm({ ...form, netAmount: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{t("ptiColVat")}</Label>
                <Input className="h-8" inputMode="decimal" value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void onSave()} disabled={saving}>
                {t("ptiSave")}
              </Button>
              {form.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm(emptyForm(defaultStoreFromFilter(filingStoreFilter, fallbackStore), filingYearMonth))}
                >
                  {t("ptiAdd")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {reviewRows.length ? (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-2 overflow-x-auto">
            <div className="text-sm font-medium">{t("ptiPdfReview")}</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-1">{t("ptiColDate")}</th>
                  <th className="p-1">{t("ptiColInvoiceNo")}</th>
                  <th className="p-1">{t("ptiColSeller")}</th>
                  <th className="p-1">{t("ptiColSellerTaxId")}</th>
                  <th className="p-1">{t("ptiColBranch")}</th>
                  <th className="p-1 text-right">{t("ptiColNet")}</th>
                  <th className="p-1 text-right">{t("ptiColVat")}</th>
                  <th className="p-1">{t("ptiSkip")}</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((r, idx) => (
                  <tr key={`${r.page}-${idx}`} className={cn(r.skip && "opacity-50")}>
                    <td className="p-1">
                      <Input className="h-7 w-[130px]" type="date" value={r.docDate} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, docDate: e.target.value }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[120px]" value={r.invoiceNo} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, invoiceNo: e.target.value }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 min-w-[140px]" value={r.sellerName} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, sellerName: e.target.value }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[120px]" value={r.sellerTaxId} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, sellerTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[130px]" value={r.sellerBranch} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, sellerBranch: e.target.value }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[90px] text-right" value={r.netAmount} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, netAmount: e.target.value }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[90px] text-right" value={r.vatAmount} onChange={(e) => {
                        const next = [...reviewRows]
                        next[idx] = { ...r, vatAmount: e.target.value }
                        setReviewRows(next)
                      }} />
                    </td>
                    <td className="p-1 text-[10px]">{r.skip ? r.skipReason : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button type="button" size="sm" onClick={() => void saveReview()} disabled={saving}>
              {t("ptiPdfSave")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-2 text-left">{t("ptiColSeq")}</th>
                <th className="p-2 text-left">{t("ptiColDate")}</th>
                <th className="p-2 text-left">{t("ptiColInvoiceNo")}</th>
                <th className="p-2 text-left">{t("ptiColSeller")}</th>
                <th className="p-2 text-left">{t("ptiColSellerTaxId")}</th>
                <th className="p-2 text-left">{t("ptiColBranch")}</th>
                <th className="p-2 text-right">{t("ptiColNet")}</th>
                <th className="p-2 text-right">{t("ptiColVat")}</th>
                <th className="p-2 text-left">{t("ptiSource")}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="p-2 tabular-nums">{i + 1}</td>
                  <td className="p-2 tabular-nums">{r.docDate}</td>
                  <td className="p-2">{r.invoiceNo}</td>
                  <td className="p-2">{r.sellerName}</td>
                  <td className="p-2 tabular-nums">{r.sellerTaxId}</td>
                  <td className="p-2">{r.sellerBranch}</td>
                  <td className="p-2 text-right tabular-nums">{formatPp30Amount2(r.netAmount)}</td>
                  <td className="p-2 text-right tabular-nums">{formatPp30Amount2(r.vatAmount)}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.source === "inbound_batch" ? t("ptiSourceInbound") : r.source === "pdf" ? t("ptiSourcePdf") : t("ptiSourceManual")}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {canWrite ? (
                      <>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => fillFromRow(r)}>
                          {t("ptiEdit")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => void onDelete(r.id)}>
                          {t("ptiDelete")}
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={10}>
                    {tableMissing ? t("ptiTableMissing") : t("ptiEmpty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
