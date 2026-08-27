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
  getAdminVendors,
  getPurchaseTaxInvoices,
  getThaiTaxFilingSummary,
  savePurchaseTaxInvoice,
  type PurchaseTaxInvoiceDto,
  apiFetch,
} from "@/lib/api-client"
import {
  digitsTin13,
  formatPp30Amount2,
  formatSellerBranch,
  displaySellerBranchForUi,
  isLikelyTaxInvoiceCopy,
  purchaseTaxDocMonthMismatch,
  purchaseTaxInvoiceDedupeKey,
  purchaseTaxInvoiceHasExtractedFields,
  purchaseTaxPp30Compare,
  purchaseTaxReviewFlags,
  purchaseTaxReviewIsProblem,
  thaiTinChecksumOk,
  taxMonthFromDocDate,
  type ExtractedPurchaseTaxInvoiceFields,
  type PurchaseTaxReviewFlag,
} from "@/lib/purchase-tax-invoice-core"
import {
  imageFileToTaxInvoiceScan,
  openPdfFile,
  extractPdfPageText,
  renderTaxInvoicePageForScan,
  renderTaxInvoicePagePreview,
  TAX_INV_MAX_PAGES,
} from "@/lib/purchase-tax-invoice-pdf-client"
import {
  extractPurchaseTaxInvoiceFromScanText,
  pdfPageTextIsReliableForExtract,
  pdfPageTextLooksPrinted,
  purchaseTaxInvoiceScanFailI18nKey,
  purchaseTaxInvoiceTextExtractIsComplete,
  splitScanTextIntoInvoiceBlocks,
  wrapTaxInvoiceQrText,
  type PurchaseTaxInvoiceScanHint,
} from "@/lib/purchase-tax-invoice-scan"
import {
  fillSellerFromProfiles,
  parseRdSellerList,
  profilesFromVendors,
  readLearnedSellerProfiles,
  rememberSellerProfiles,
  type PurchaseTaxSellerProfile,
} from "@/lib/purchase-tax-invoice-seller-lookup"
import {
  createTaxInvoiceOcrSession,
  decodeTaxInvoiceQrsFromCanvas,
  prepareTaxInvoiceScanCanvas,
  type TaxInvoiceOcrSession,
} from "@/lib/purchase-tax-invoice-ocr-client"
import { startPurchaseTaxScanKeepAlive } from "@/lib/purchase-tax-invoice-scan-keepalive"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type Props = {
  filingYearMonth: string
  filingStoreFilter: string
  filingSearchTick?: number
  storeChoices?: string[]
  onFilingYearMonthChange?: (yearMonth: string) => void
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

const REVIEW_DRAFT_KEY = "cm_pti_review_draft"

function readReviewDraft(): ReviewRow[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(REVIEW_DRAFT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ReviewRow[]) : []
  } catch {
    return []
  }
}

function writeReviewDraft(rows: ReviewRow[]) {
  if (typeof window === "undefined") return
  try {
    if (!rows.length) sessionStorage.removeItem(REVIEW_DRAFT_KEY)
    else sessionStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify(rows))
  } catch {
    /* quota */
  }
}

const SCAN_CHECKPOINT_KEY = "cm_pti_scan_checkpoint"

type ScanCheckpoint = {
  fileName: string
  fileSize: number
  nextPage: number
  total: number
  rows: ReviewRow[]
}

function readScanCheckpoint(): ScanCheckpoint | null {
  if (typeof window === "undefined") return null
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SCAN_CHECKPOINT_KEY) || "null") as unknown
    if (!parsed || typeof parsed !== "object") return null
    const c = parsed as ScanCheckpoint
    if (!c.fileName || !Array.isArray(c.rows) || !(c.nextPage > 1)) return null
    return c
  } catch {
    return null
  }
}

function writeScanCheckpoint(cp: ScanCheckpoint) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SCAN_CHECKPOINT_KEY, JSON.stringify(cp))
  } catch {
    /* quota */
  }
}

function clearScanCheckpoint() {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(SCAN_CHECKPOINT_KEY)
  } catch {
    /* ignore */
  }
}

/** rAF·숨은 탭의 1초 클램프를 피함. 백그라운드는 대기 없이 다음 페이지. */
function yieldScanLoop(): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) return Promise.resolve()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function reviewWarnClass(base: string, on: boolean) {
  return cn(base, on && "ring-1 ring-amber-500 bg-amber-50 dark:bg-amber-950/40")
}

const PTI_SKIP_REASON_KEYS = new Set(["ptiPdfEmptyPage", "ptiPdfSkipCopy", "ptiDupError"])

type PdfBusyState = { key: string; vars?: Record<string, string | number> }

function ptiSkipReasonText(reason: string, t: (k: string) => string): string {
  const s = String(reason || "").trim()
  if (!s) return ""
  if (PTI_SKIP_REASON_KEYS.has(s) || /^pti[A-Z]/.test(s)) return t(s)
  return s
}

function isPtiEmptyPageSkip(reason: string, t: (k: string) => string): boolean {
  return reason === "ptiPdfEmptyPage" || reason === t("ptiPdfEmptyPage")
}

const emptyForm = (storeName: string, month: string): FormState => ({
  storeName,
  docDate: `${month}-01`,
  invoiceNo: "",
  sellerName: "",
  sellerTaxId: "",
  sellerBranch: "",
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
  storeChoices = [],
  onFilingYearMonthChange,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const canWrite = canWriteAccountingCompliance(String(auth?.role || ""))
  const fallbackStore = String(auth?.store || "").trim()
  const branchLabels = React.useMemo(
    () => ({ hq: t("ptiBranchHq"), branch: t("ptiBranchSite") }),
    [t]
  )
  const [rows, setRows] = React.useState<PurchaseTaxInvoiceDto[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [tableMissing, setTableMissing] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(() =>
    emptyForm(defaultStoreFromFilter(filingStoreFilter, fallbackStore), filingYearMonth)
  )
  const [saving, setSaving] = React.useState(false)
  const [reviewRows, setReviewRows] = React.useState<ReviewRow[]>(readReviewDraft)
  const [pdfBusy, setPdfBusy] = React.useState<PdfBusyState | null>(null)
  const [pdfProgress, setPdfProgress] = React.useState<{ n: number; total: number } | null>(null)
  const [reviewFilter, setReviewFilter] = React.useState<"all" | "problems">("all")
  const [dropHover, setDropHover] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const scanPdfRef = React.useRef<Awaited<ReturnType<typeof openPdfFile>> | null>(null)
  const scanImagePreviewRef = React.useRef("")
  const [previewPage, setPreviewPage] = React.useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState("")
  const [previewBusy, setPreviewBusy] = React.useState(false)
  const [pp30Vat, setPp30Vat] = React.useState<{ outputVat: number; inputVat: number } | null>(null)
  const [saveNotice, setSaveNotice] = React.useState("")

  const storeSelectOptions = React.useMemo(() => {
    const extra = [form.storeName, fallbackStore].map((s) => String(s || "").trim()).filter(Boolean)
    return Array.from(new Set([...storeChoices, ...extra]))
  }, [storeChoices, form.storeName, fallbackStore])

  React.useEffect(() => {
    writeReviewDraft(reviewRows)
  }, [reviewRows])

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [res, summary] = await Promise.all([
        getPurchaseTaxInvoices({
          taxMonth: filingYearMonth,
          storeFilter: filingStoreFilter,
        }),
        getThaiTaxFilingSummary({
          userRole: String(auth?.role || ""),
          yearMonth: filingYearMonth,
          storeFilter: filingStoreFilter,
        }).catch(() => null),
      ])
      if (res.error) setError("msg_load_fail")
      setTableMissing(!!res.tableMissing)
      setRows(res.rows)
      setPp30Vat(
        summary?.vat
          ? { outputVat: Number(summary.vat.outputVat) || 0, inputVat: Number(summary.vat.inputVat) || 0 }
          : null
      )
    } catch {
      setError("msg_load_fail")
      setTableMissing(false)
      setRows([])
      setPp30Vat(null)
    } finally {
      setLoading(false)
    }
  }, [filingYearMonth, filingStoreFilter, auth?.role])

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

  const reviewStats = React.useMemo(() => {
    let keep = 0
    let skip = 0
    let problems = 0
    let net = 0
    let vat = 0
    for (const r of reviewRows) {
      if (purchaseTaxReviewIsProblem(r, filingYearMonth)) problems += 1
      if (r.skip) {
        skip += 1
        continue
      }
      keep += 1
      net += Number(r.netAmount) || 0
      vat += Number(r.vatAmount) || 0
    }
    return { keep, skip, problems, net, vat }
  }, [reviewRows, filingYearMonth])

  const visibleReviewRows = React.useMemo(() => {
    if (reviewFilter !== "problems") return reviewRows.map((r, idx) => ({ r, idx }))
    return reviewRows
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => purchaseTaxReviewIsProblem(r, filingYearMonth))
  }, [reviewRows, reviewFilter, filingYearMonth])

  const flagLabel = (flag: PurchaseTaxReviewFlag) =>
    flag === "vat" ? t("ptiReviewVatWarn") : flag === "month" ? t("ptiReviewMonthWarn") : t("ptiReviewTinWarn")

  const pp30Compare = React.useMemo(
    () =>
      purchaseTaxPp30Compare({
        registerVat: totals.vat,
        reviewKeepVat: reviewStats.vat,
        pp30InputVat: pp30Vat?.inputVat || 0,
        pp30OutputVat: pp30Vat?.outputVat || 0,
      }),
    [totals.vat, reviewStats.vat, pp30Vat]
  )

  const fillFromRow = (r: PurchaseTaxInvoiceDto) => {
    setForm({
      id: r.id,
      storeName: r.storeName,
      docDate: r.docDate,
      invoiceNo: r.invoiceNo,
      sellerName: r.sellerName,
      sellerTaxId: r.sellerTaxId,
      sellerBranch: displaySellerBranchForUi(r.sellerBranch, branchLabels),
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
            ? "ptiDupError"
            : res.error === "SUBMITTED"
              ? "ptiSubmittedLocked"
              : "msg_save_fail"
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
      setError(res.error === "SUBMITTED" ? "ptiSubmittedLocked" : "msg_delete_fail")
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
      setError("msg_load_fail")
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
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPdfBusy({ key: "ptiPdfReading" })
    setPdfProgress(null)
    setError("")
    setSaveNotice("")
    const extracted: ReviewRow[] = []
    const seen = new Set(rows.map((r) => purchaseTaxInvoiceDedupeKey(r.buyerTaxId, r.invoiceNo, r.sellerTaxId)))
    const storeName = defaultStoreFromFilter(filingStoreFilter, form.storeName || fallbackStore)

    const pushFromParsed = (f: ExtractedPurchaseTaxInvoiceFields, page: number, failReason?: string) => {
      const invoiceNo = String(f.invoiceNo || "").trim()
      const sellerTaxId = String(f.sellerTaxId || "").replace(/\D/g, "")
      const isCopy = f.isCopy === true || isLikelyTaxInvoiceCopy(String(f.sellerName || invoiceNo))
      const key = purchaseTaxInvoiceDedupeKey("x", invoiceNo, sellerTaxId)
      let skip = false
      let skipReason = ""
      if (failReason || !purchaseTaxInvoiceHasExtractedFields(f)) {
        skip = true
        skipReason = failReason || "ptiPdfEmptyPage"
      } else if (isCopy) {
        skip = true
        skipReason = "ptiPdfSkipCopy"
      } else if (invoiceNo && seen.has(purchaseTaxInvoiceDedupeKey(rows[0]?.buyerTaxId || "x", invoiceNo, sellerTaxId))) {
        skip = true
        skipReason = "ptiDupError"
      } else if (
        invoiceNo &&
        extracted.some(
          (r) =>
            r.invoiceNo.replace(/\s+/g, "").toUpperCase() === invoiceNo.replace(/\s+/g, "").toUpperCase() &&
            r.sellerTaxId === sellerTaxId
        )
      ) {
        skip = true
        skipReason = "ptiPdfSkipCopy"
      }
      if (invoiceNo) seen.add(key)
      extracted.push({
        storeName,
        docDate: String(f.docDate || `${filingYearMonth}-01`).slice(0, 10),
        invoiceNo,
        sellerName: String(f.sellerName || "").trim(),
        sellerTaxId,
        sellerBranch: displaySellerBranchForUi(formatSellerBranch(f.sellerBranch), branchLabels),
        netAmount: f.netAmount != null ? String(f.netAmount) : "",
        vatAmount: f.vatAmount != null ? String(f.vatAmount) : "",
        skip,
        skipReason,
        page,
      })
    }

    const hint: PurchaseTaxInvoiceScanHint = {
      buyerTaxId: rows[0]?.buyerTaxId || "",
      buyerName: storeName,
      taxMonth: filingYearMonth,
    }

    let vendorProfiles: PurchaseTaxSellerProfile[] = []
    try {
      vendorProfiles = profilesFromVendors(await getAdminVendors())
    } catch {
      vendorProfiles = []
    }
    const learnedProfiles = readLearnedSellerProfiles()
    const sellerKnown = (): Array<{ sellerTaxId?: string; sellerName?: string; sellerBranch?: string }> => [
      ...learnedProfiles,
      ...vendorProfiles,
      ...rows,
      ...extracted,
    ]

    const ingestLocalPage = (page: number, pageText: string) => {
      const known = sellerKnown()
      const blocks = splitScanTextIntoInvoiceBlocks(pageText)
      if (blocks.length >= 2) {
        for (const block of blocks) {
          const local = fillSellerFromProfiles(extractPurchaseTaxInvoiceFromScanText(block, hint) || {}, known)
          pushFromParsed(local, page, purchaseTaxInvoiceHasExtractedFields(local) ? undefined : "ptiPdfEmptyPage")
        }
        return
      }
      const local = fillSellerFromProfiles(extractPurchaseTaxInvoiceFromScanText(pageText, hint) || {}, known)
      if (local && purchaseTaxInvoiceHasExtractedFields(local)) {
        pushFromParsed(local, page)
        return
      }
      pushFromParsed(local || {}, page, "ptiPdfEmptyPage")
    }

    const extractIsComplete = (pageText: string) =>
      purchaseTaxInvoiceTextExtractIsComplete(extractPurchaseTaxInvoiceFromScanText(pageText, hint), hint)

    let ocr: TaxInvoiceOcrSession | null = null
    const textForPage = async (canvas: HTMLCanvasElement, printedText: string) => {
      const work = pdfPageTextLooksPrinted(printedText) ? canvas : prepareTaxInvoiceScanCanvas(canvas)
      const qrs = await decodeTaxInvoiceQrsFromCanvas(work)
      const withQr = [printedText, wrapTaxInvoiceQrText(qrs)].filter((s) => String(s || "").trim()).join("\n")
      if (extractIsComplete(withQr)) return withQr
      if (!ocr) {
        setPdfBusy({ key: "ptiOcrLoading" })
        ocr = await createTaxInvoiceOcrSession()
      }
      const ocrText = await ocr.recognize(work, {
        skipQr: true,
        enough: (text) => extractIsComplete([withQr, text].filter(Boolean).join("\n")),
      })
      let pageText = [withQr, ocrText].filter((s) => String(s || "").trim()).join("\n")
      if (!extractIsComplete(pageText)) {
        const extra = await ocr.recognizeSparseCrops(work)
        pageText = [pageText, extra].filter((s) => String(s || "").trim()).join("\n")
      }
      return pageText
    }

    const yieldUi = () => yieldScanLoop()
    const pageTitleBase = typeof document !== "undefined" ? document.title.replace(/^\(\d+\/\d+\)\s*/, "") : ""
    const markScanTitle = (n: number, total: number) => {
      if (typeof document === "undefined") return
      document.title = `(${n}/${total}) ${pageTitleBase}`
    }
    const keepAlive = startPurchaseTaxScanKeepAlive()

    try {
      setReviewRows([])
      for (const file of files) {
        const lower = file.name.toLowerCase()
        const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf"
        if (isPdf) {
          const pdf = await openPdfFile(file)
          scanPdfRef.current = pdf
          scanImagePreviewRef.current = ""
          const total = Math.min(pdf.numPages, TAX_INV_MAX_PAGES)
          if (total >= 40) {
            const ok = window.confirm(tr(t, "ptiPdfManyPages", { n: String(pdf.numPages) }))
            if (!ok) {
              setPdfBusy(null)
              return
            }
          }
          let startPage = 1
          const checkpoint = readScanCheckpoint()
          if (
            checkpoint &&
            checkpoint.fileName === file.name &&
            checkpoint.fileSize === file.size &&
            checkpoint.nextPage > 1 &&
            checkpoint.nextPage <= total + 1
          ) {
            const resume = window.confirm(
              tr(t, "ptiScanResume", { n: String(checkpoint.nextPage - 1), total: String(checkpoint.total || total) })
            )
            if (resume) {
              startPage = Math.min(checkpoint.nextPage, total)
              extracted.push(...checkpoint.rows)
              for (const row of checkpoint.rows) {
                if (row.invoiceNo) {
                  seen.add(purchaseTaxInvoiceDedupeKey("x", row.invoiceNo, row.sellerTaxId))
                }
              }
              setReviewRows([...extracted])
            } else {
              clearScanCheckpoint()
            }
          }
          for (let i = startPage; i <= total; i += 1) {
            if (ac.signal.aborted) break
            setPdfProgress({ n: i, total })
            setPdfBusy({ key: "ptiPdfPage", vars: { n: String(i), total: String(total) } })
            markScanTitle(i, total)
            const printed = await extractPdfPageText(pdf, i)
            let pageText = printed
            if (pdfPageTextIsReliableForExtract(printed, hint)) {
              ingestLocalPage(i, pageText)
            } else {
              if (!pdfPageTextLooksPrinted(printed)) {
                setPdfBusy({ key: "ptiOcrPage", vars: { n: String(i), total: String(total) } })
              }
              const { canvas } = await renderTaxInvoicePageForScan(pdf, i)
              if (ac.signal.aborted) break
              try {
                pageText = await textForPage(canvas, printed)
              } catch {
                pageText = printed
                setError((prev) => prev || "ptiOcrFailed")
              }
              if (ac.signal.aborted) break
              ingestLocalPage(i, pageText)
            }
            if (i === total || i % 5 === 0 || (typeof document !== "undefined" && document.hidden)) {
              setReviewRows([...extracted])
            }
            writeReviewDraft(extracted)
            writeScanCheckpoint({
              fileName: file.name,
              fileSize: file.size,
              nextPage: i + 1,
              total,
              rows: extracted,
            })
            await yieldUi()
          }
        } else {
          scanPdfRef.current = null
          setPdfBusy({ key: "ptiPdfPage", vars: { n: "1", total: "1" } })
          const { canvas, images } = await imageFileToTaxInvoiceScan(file)
          scanImagePreviewRef.current = images[0] || ""
          setPdfBusy({ key: "ptiOcrPage", vars: { n: "1", total: "1" } })
          let pageText = ""
          try {
            pageText = await textForPage(canvas, "")
          } catch {
            pageText = ""
            setError((prev) => prev || "ptiOcrFailed")
          }
          if (ac.signal.aborted) break
          ingestLocalPage(1, pageText)
        }
      }
      if (!ac.signal.aborted) {
        const tins = [
          ...new Set(
            extracted
              .filter((r) => !String(r.sellerName || "").trim())
              .map((r) => digitsTin13(r.sellerTaxId))
              .filter((tin) => tin.length === 13 && thaiTinChecksumOk(tin))
          ),
        ].slice(0, 15)
        if (tins.length) {
          setPdfBusy({ key: "ptiRdLookup" })
          const rdProfiles: PurchaseTaxSellerProfile[] = []
          const queue = [...tins]
          const workerCount = Math.min(4, queue.length)
          await Promise.all(
            Array.from({ length: workerCount }, async () => {
              while (queue.length) {
                if (ac.signal.aborted) return
                const tin = queue.shift()
                if (!tin) return
                try {
                  const res = await apiFetch(`/api/searchRdVatCompany?tin=${encodeURIComponent(tin)}`)
                  const json: unknown = await res.json()
                  const profile = parseRdSellerList(json, tin)
                  if (profile) rdProfiles.push(profile)
                } catch {
                  /* lookup is best-effort */
                }
              }
            })
          )
          if (rdProfiles.length) {
            rememberSellerProfiles(rdProfiles)
            for (let i = 0; i < extracted.length; i += 1) {
              const row = extracted[i]
              const filled = fillSellerFromProfiles(
                {
                  sellerTaxId: row.sellerTaxId,
                  sellerName: row.sellerName,
                  sellerBranch: row.sellerBranch,
                },
                rdProfiles
              )
              extracted[i] = {
                ...row,
                sellerName: String(filled.sellerName || row.sellerName).trim(),
                sellerBranch: filled.sellerBranch
                  ? displaySellerBranchForUi(formatSellerBranch(filled.sellerBranch), branchLabels)
                  : row.sellerBranch,
              }
            }
          }
        }
      }
      setReviewRows(extracted)
      if (!ac.signal.aborted) clearScanCheckpoint()
    } catch (e) {
      if ((e instanceof DOMException && e.name === "AbortError") || (e instanceof Error && e.name === "AbortError")) {
        if (extracted.length) setReviewRows(extracted)
        return
      }
      setError(purchaseTaxInvoiceScanFailI18nKey(e instanceof Error ? e.message : String(e), "ptiOcrFailed"))
      if (extracted.length) setReviewRows(extracted)
    } finally {
      if (ocr) {
        try {
          await ocr.terminate()
        } catch {
          /* ignore */
        }
      }
      try {
        keepAlive.stop()
      } catch {
        /* ignore */
      }
      if (typeof document !== "undefined" && pageTitleBase) document.title = pageTitleBase
      if (abortRef.current === ac) abortRef.current = null
      setPdfBusy(null)
      setPdfProgress(null)
    }
  }

  const cancelScan = () => {
    abortRef.current?.abort()
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
    setSaveNotice("")
    try {
      rememberSellerProfiles(payload)
      const res = await bulkSavePurchaseTaxInvoices(payload)
      if (!res.success) {
        setError(res.error === "SUBMITTED" ? "ptiSubmittedLocked" : "msg_save_fail")
        return
      }
      const savedCount = Array.isArray(res.saved) ? res.saved.length : payload.length
      const skippedCount = Array.isArray(res.skipped) ? res.skipped.length : 0
      if (savedCount <= 0) {
        setError("ptiSaveNone")
        return
      }
      const monthCounts = new Map<string, number>()
      for (const r of payload) {
        const month = taxMonthFromDocDate(String(r.docDate || ""))
        if (!month) continue
        monthCounts.set(month, (monthCounts.get(month) || 0) + 1)
      }
      const savedMonth =
        [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || filingYearMonth
      const parts = [tr(t, "ptiSaveOk", { n: String(savedCount) })]
      if (skippedCount) parts.push(tr(t, "ptiSaveSkipped", { n: String(skippedCount) }))
      if (savedMonth && savedMonth !== filingYearMonth) {
        parts.push(tr(t, "ptiSaveSwitchedMonth", { month: savedMonth }))
        setReviewRows([])
        writeReviewDraft([])
        setSaveNotice(parts.join(" "))
        onFilingYearMonthChange?.(savedMonth)
        return
      }
      setReviewRows([])
      writeReviewDraft([])
      setSaveNotice(parts.join(" "))
      await load()
    } finally {
      setSaving(false)
    }
  }

  const patchReview = (idx: number, patch: Partial<ReviewRow>) => {
    setReviewRows((prev) => {
      const cur = prev[idx]
      if (!cur) return prev
      const next = [...prev]
      next[idx] = { ...cur, ...patch }
      return next
    })
  }

  const openPreview = async (page: number) => {
    setPreviewPage(page)
    setPreviewUrl("")
    setPreviewBusy(true)
    try {
      if (scanPdfRef.current) {
        setPreviewUrl(await renderTaxInvoicePagePreview(scanPdfRef.current, page))
      } else if (scanImagePreviewRef.current) {
        setPreviewUrl(scanImagePreviewRef.current)
      }
    } catch (e) {
      setError(purchaseTaxInvoiceScanFailI18nKey(e instanceof Error ? e.message : String(e), "ptiOcrFailed"))
    } finally {
      setPreviewBusy(false)
    }
  }

  const storeField = (value: string, onChange: (v: string) => void, className = "h-8 w-full") =>
    storeSelectOptions.length ? (
      <select
        className={cn("rounded-md border border-input bg-background px-2 text-sm", className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {storeSelectOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    ) : (
      <Input className={className} value={value} onChange={(e) => onChange(e.target.value)} />
    )

  return (
    <div
      className={cn("space-y-3 rounded-md", dropHover && "ring-2 ring-primary/40 bg-primary/5")}
      onDragOver={(e) => {
        if (!canWrite || pdfBusy) return
        e.preventDefault()
        setDropHover(true)
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        if (!canWrite || pdfBusy) return
        e.preventDefault()
        setDropHover(false)
        const dropped = Array.from(e.dataTransfer.files || []).filter(
          (f) => /pdf/i.test(f.type) || f.type.startsWith("image/") || /\.(pdf|png|jpe?g|webp)$/i.test(f.name)
        )
        if (dropped.length) void ingestFiles(dropped)
      }}
    >
      <Card className="border-border/80">
        <CardContent className="pt-4 pb-4 space-y-2 text-sm">
          <p>{t("ptiHint")}</p>
          <p className="text-xs text-muted-foreground">{t("ptiDateBeHint")}</p>
          {tableMissing ? <p className="text-sm text-destructive">{t("ptiTableMissing")}</p> : null}
        </CardContent>
      </Card>

      {pp30Vat ? (
        <Card className="border-border/80">
          <CardContent className="pt-4 pb-4 space-y-1 text-sm">
            <div className="font-medium">{t("ptiPp30Compare")}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
              <span>{t("ptiPp30OutputVat")} {formatPp30Amount2(pp30Compare.pp30OutputVat)}</span>
              <span>{t("ptiPp30InputVat")} {formatPp30Amount2(pp30Compare.pp30InputVat)}</span>
              <span>{t("ptiPp30RegisterVat")} {formatPp30Amount2(pp30Compare.registerVat)}</span>
              <span className={cn(!pp30Compare.inSync && "text-amber-700 dark:text-amber-400")}>
                {t("ptiPp30Gap")} {formatPp30Amount2(pp30Compare.ledgerGap)}
                {pp30Compare.inSync ? ` · ${t("ptiPp30Match")}` : ""}
              </span>
              <span>{t("ptiPp30Payable")} {formatPp30Amount2(pp30Compare.payableNow)}</span>
              {reviewStats.keep > 0 ? (
                <span>
                  {t("ptiPp30AfterReview")} {formatPp30Amount2(pp30Compare.afterSaveVat)} → {t("ptiPp30Payable")} {formatPp30Amount2(pp30Compare.payableAfterReview)}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
        {pdfBusy ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{tr(t, pdfBusy.key, pdfBusy.vars)}</span>
            {pdfProgress ? (
              <span className="inline-block h-1.5 w-28 overflow-hidden rounded bg-muted">
                <span
                  className="block h-full bg-primary transition-all"
                  style={{ width: `${Math.round((pdfProgress.n / Math.max(1, pdfProgress.total)) * 100)}%` }}
                />
              </span>
            ) : null}
            <span className="max-w-[14rem] text-[11px] leading-snug text-muted-foreground">{t("ptiScanBgHint")}</span>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={cancelScan}>
              {t("ptiPdfCancel")}
            </Button>
          </span>
        ) : canWrite ? (
          <span className="text-xs text-muted-foreground">{t("ptiPdfDropHint")}</span>
        ) : null}
        <span className="text-xs tabular-nums text-muted-foreground ml-auto">
          {totals.count} · {t("ptiColNet")} {formatPp30Amount2(totals.net)} · {t("ptiColVat")} {formatPp30Amount2(totals.vat)}
        </span>
      </div>
      {error ? <div className="text-sm text-destructive">{t(error)}</div> : null}
      {saveNotice ? <div className="text-sm text-emerald-700 dark:text-emerald-400">{saveNotice}</div> : null}

      {canWrite ? (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="text-sm font-medium">{form.id ? t("ptiEdit") : t("ptiAdd")}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">{t("accCompStore")}</Label>
                {storeField(form.storeName, (storeName) => setForm({ ...form, storeName }))}
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
                <Input className="h-8" value={form.sellerBranch} onChange={(e) => setForm({ ...form, sellerBranch: e.target.value })} placeholder={t("ptiBranchHq")} />
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium">{t("ptiPdfReview")}</div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {tr(t, "ptiReviewKeep", { n: String(reviewStats.keep) })} · {tr(t, "ptiReviewSkip", { n: String(reviewStats.skip) })} · {t("ptiColNet")} {formatPp30Amount2(reviewStats.net)} · {t("ptiColVat")} {formatPp30Amount2(reviewStats.vat)}
              </span>
              {reviewRows.some((r) => !r.skip && purchaseTaxDocMonthMismatch(r.docDate, filingYearMonth)) ? (
                <span className="text-xs text-amber-700 dark:text-amber-400">{t("ptiSaveSwitchedMonthHint")}</span>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {storeSelectOptions.length ? (
                  <select
                    className="h-7 min-w-[150px] rounded-md border border-input bg-background px-2 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      const storeName = e.target.value
                      if (!storeName) return
                      setReviewRows((prev) => prev.map((row) => (row.skip ? row : { ...row, storeName })))
                      e.currentTarget.value = ""
                    }}
                  >
                    <option value="">{t("ptiStoreApplyReview")}</option>
                    {storeSelectOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button type="button" size="sm" variant={reviewFilter === "all" ? "secondary" : "ghost"} className="h-7" onClick={() => setReviewFilter("all")}>
                  {t("ptiFilterAll")}
                </Button>
                <Button type="button" size="sm" variant={reviewFilter === "problems" ? "secondary" : "ghost"} className="h-7" onClick={() => setReviewFilter("problems")}>
                  {tr(t, "ptiFilterProblems", { n: String(reviewStats.problems) })}
                </Button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-1">{t("ptiColPage")}</th>
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
                {visibleReviewRows.map(({ r, idx }) => {
                  const flags = purchaseTaxReviewFlags(r, filingYearMonth)
                  return (
                  <tr key={`${r.page}-${idx}`} className={cn(r.skip && "opacity-50", !r.skip && flags.length > 0 && "bg-amber-50 dark:bg-amber-950/20")}>
                    <td className="p-1">
                      <button
                        type="button"
                        className="tabular-nums text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
                        disabled={!r.page}
                        onClick={() => r.page && void openPreview(r.page)}
                      >
                        {r.page || ""}
                      </button>
                    </td>
                    <td className="p-1">
                      <Input className={reviewWarnClass("h-7 w-[130px]", flags.includes("month"))} type="date" value={r.docDate} onChange={(e) => patchReview(idx, { docDate: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[120px]" value={r.invoiceNo} onChange={(e) => {
                        const invoiceNo = e.target.value
                        const unskipEmpty = r.skip && isPtiEmptyPageSkip(r.skipReason || "", t) && invoiceNo.trim()
                        patchReview(idx, { invoiceNo, skip: unskipEmpty ? false : r.skip, skipReason: unskipEmpty ? "" : r.skipReason })
                      }} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 min-w-[140px]" value={r.sellerName} onChange={(e) => patchReview(idx, { sellerName: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className={reviewWarnClass("h-7 w-[120px]", flags.includes("tin"))} value={r.sellerTaxId} onChange={(e) => patchReview(idx, { sellerTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-7 w-[130px]" value={r.sellerBranch} onChange={(e) => patchReview(idx, { sellerBranch: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className={reviewWarnClass("h-7 w-[90px] text-right", flags.includes("vat"))} value={r.netAmount} onChange={(e) => patchReview(idx, { netAmount: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className={reviewWarnClass("h-7 w-[90px] text-right", flags.includes("vat"))} value={r.vatAmount} onChange={(e) => patchReview(idx, { vatAmount: e.target.value })} />
                    </td>
                    <td className="p-1 text-[10px]">
                      <label className="flex items-start gap-1">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={!!r.skip}
                          onChange={(e) => patchReview(idx, { skip: e.target.checked })}
                        />
                        <span>
                          {r.skip ? ptiSkipReasonText(r.skipReason || "", t) : ""}
                          {!r.skip && flags.length ? flags.map(flagLabel).join(" · ") : ""}
                        </span>
                      </label>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            <Button type="button" size="sm" onClick={() => void saveReview()} disabled={saving || !reviewStats.keep}>
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
                  <td className="p-2">{displaySellerBranchForUi(r.sellerBranch, branchLabels)}</td>
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

      <Dialog open={previewPage != null} onOpenChange={(open) => { if (!open) setPreviewPage(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr(t, "ptiPreviewTitle", { n: String(previewPage || "") })}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("ptiPreviewHint")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-h-[200px] rounded border bg-muted/20 p-1">
              {previewBusy ? (
                <p className="p-4 text-sm text-muted-foreground">{t("ptiPdfReading")}</p>
              ) : previewUrl ? (
                <img src={previewUrl} alt="" className="w-full h-auto" />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">{t("ptiPreviewMissing")}</p>
              )}
            </div>
            <div className="space-y-2 text-xs">
              {reviewRows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.page === previewPage).map(({ r, idx }) => {
                const flags = purchaseTaxReviewFlags(r, filingYearMonth)
                return (
                <div key={`${r.page}-${idx}`} className="rounded border p-2 space-y-2">
                  <div>
                    <Label className="text-[10px]">{t("ptiColInvoiceNo")}</Label>
                    <Input className="h-7" value={r.invoiceNo} onChange={(e) => {
                      const invoiceNo = e.target.value
                      const unskipEmpty = r.skip && isPtiEmptyPageSkip(r.skipReason || "", t) && invoiceNo.trim()
                      patchReview(idx, { invoiceNo, skip: unskipEmpty ? false : r.skip, skipReason: unskipEmpty ? "" : r.skipReason })
                    }} />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("ptiColSeller")}</Label>
                    <Input className="h-7" value={r.sellerName} onChange={(e) => patchReview(idx, { sellerName: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("ptiColSellerTaxId")}</Label>
                    <Input className={reviewWarnClass("h-7", flags.includes("tin"))} value={r.sellerTaxId} onChange={(e) => patchReview(idx, { sellerTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("ptiColDate")}</Label>
                    <Input className={reviewWarnClass("h-7", flags.includes("month"))} type="date" value={r.docDate} onChange={(e) => patchReview(idx, { docDate: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">{t("ptiColNet")}</Label>
                      <Input className={reviewWarnClass("h-7", flags.includes("vat"))} value={r.netAmount} onChange={(e) => patchReview(idx, { netAmount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">{t("ptiColVat")}</Label>
                      <Input className={reviewWarnClass("h-7", flags.includes("vat"))} value={r.vatAmount} onChange={(e) => patchReview(idx, { vatAmount: e.target.value })} />
                    </div>
                  </div>
                  {r.skip ? <div className="text-muted-foreground">{ptiSkipReasonText(r.skipReason || "", t)}</div> : flags.length ? <div className="text-amber-700 dark:text-amber-400">{flags.map(flagLabel).join(" · ")}</div> : null}
                </div>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
