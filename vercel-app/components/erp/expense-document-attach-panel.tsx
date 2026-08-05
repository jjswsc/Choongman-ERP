"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Camera, FileText, Receipt, ScanLine, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { extractExpenseDocument } from "@/lib/api-client"
import { fileToExpenseAttachmentDataUrl } from "@/lib/expense-document-upload"
import { isScannableImageFile } from "@/lib/document-scanner-client"
import {
  readExpenseDocOcrAutoFill,
  readExpenseDocScanSkip,
  writeExpenseDocOcrAutoFill,
  writeExpenseDocScanSkip,
} from "@/lib/expense-doc-prefs"
import {
  type ExpenseDocumentType,
  invoiceReceivedFromDocumentType,
  normalizeExpenseDocumentType,
} from "@/lib/expense-document-type"
import { cn } from "@/lib/utils"

const ExpenseDocumentScanDialog = dynamic(
  () =>
    import("@/components/erp/expense-document-scan-dialog").then((m) => m.ExpenseDocumentScanDialog),
  { ssr: false }
)

export type ExpenseOcrFieldPayload = {
  amount?: number
  vatAmount?: number
  withholdingTaxAmount?: number
  expenseDate?: string
  invoiceNo?: string
  vendorNameHint?: string
}

/** force=true: 「지금 인식」— 기존 값 덮어쓰기 허용. 업로드 자동기입은 force=false(빈 칸만). */
export type ExpenseOcrApplyMeta = { force?: boolean }

export type ExpenseDocumentAttachPanelProps = {
  files: File[]
  onFilesChange: (files: File[]) => void
  maxFiles?: number
  /** @deprecated Prefer documentType — kept for petty/card callers */
  invoiceReceived: boolean
  onInvoiceReceivedChange: (v: boolean) => void
  /** Invoice | Tax Invoice | Receipt — Tax Invoice만 PP.30 연동 */
  documentType?: ExpenseDocumentType | ""
  onDocumentTypeChange?: (v: ExpenseDocumentType | "") => void
  invoiceNo: string
  onInvoiceNoChange: (v: string) => void
  onOcrFields?: (fields: ExpenseOcrFieldPayload, meta?: ExpenseOcrApplyMeta) => void
  disabled?: boolean
  variant?: "full" | "receiptOnly"
  className?: string
}

const DOC_TYPE_OPTIONS: {
  value: ExpenseDocumentType
  icon: typeof FileText
  labelKey: string
  labelFb: string
  descKey: string
  descFb: string
  accent: string
  selected: string
}[] = [
  {
    value: "invoice",
    icon: FileText,
    labelKey: "expenseDocTypeInvoice",
    labelFb: "Invoice",
    descKey: "expenseDocTypeInvoiceDesc",
    descFb: "일반 청구서",
    accent: "text-slate-600",
    selected: "border-slate-400 bg-slate-50 ring-1 ring-slate-300/80 shadow-sm",
  },
  {
    value: "tax_invoice",
    icon: ShieldCheck,
    labelKey: "expenseDocTypeTaxInvoice",
    labelFb: "Tax Invoice",
    descKey: "expenseDocTypeTaxInvoiceDesc",
    descFb: "ใบกำกับภาษี · PP.30",
    accent: "text-emerald-700",
    selected: "border-emerald-500 bg-emerald-50/90 ring-1 ring-emerald-400/70 shadow-sm",
  },
  {
    value: "receipt",
    icon: Receipt,
    labelKey: "expenseDocTypeReceipt",
    labelFb: "Receipt",
    descKey: "expenseDocTypeReceiptDesc",
    descFb: "영수증·ใบเสร็จ",
    accent: "text-amber-700",
    selected: "border-amber-400 bg-amber-50/90 ring-1 ring-amber-300/80 shadow-sm",
  },
]

export function ExpenseDocumentAttachPanel({
  files,
  onFilesChange,
  maxFiles = 3,
  invoiceReceived,
  onInvoiceReceivedChange,
  documentType: documentTypeProp,
  onDocumentTypeChange,
  invoiceNo,
  onInvoiceNoChange,
  onOcrFields,
  disabled,
  variant = "full",
  className,
}: ExpenseDocumentAttachPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      return !v || v === key ? fallback : v
    },
    [t]
  )

  const cameraRef = React.useRef<HTMLInputElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const scanQueueRef = React.useRef<File[]>([])
  const [scanFile, setScanFile] = React.useState<File | null>(null)
  const [scanOpen, setScanOpen] = React.useState(false)
  const [ocrLoading, setOcrLoading] = React.useState(false)
  const [ocrAutoFill, setOcrAutoFill] = React.useState(true)
  const [scanSkip, setScanSkip] = React.useState(false)
  const [ocrHint, setOcrHint] = React.useState<string | null>(null)
  const [thumbUrls, setThumbUrls] = React.useState<string[]>([])

  const controlledType = onDocumentTypeChange != null
  const resolvedType: ExpenseDocumentType | "" = controlledType
    ? normalizeExpenseDocumentType(documentTypeProp) ?? ""
    : invoiceReceived
      ? "tax_invoice"
      : ""

  const setDocumentType = React.useCallback(
    (next: ExpenseDocumentType | "") => {
      if (onDocumentTypeChange) onDocumentTypeChange(next)
      onInvoiceReceivedChange(invoiceReceivedFromDocumentType(next || null))
    },
    [onDocumentTypeChange, onInvoiceReceivedChange]
  )

  React.useEffect(() => {
    setOcrAutoFill(readExpenseDocOcrAutoFill())
    setScanSkip(readExpenseDocScanSkip())
  }, [])

  React.useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setThumbUrls(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  const runOcr = React.useCallback(
    async (file: File, opts?: { silent?: boolean; force?: boolean }) => {
      if (!onOcrFields) return false
      setOcrLoading(true)
      setOcrHint(null)
      try {
        const dataUrl = await fileToExpenseAttachmentDataUrl(file)
        const res = await extractExpenseDocument({ dataUrl, fileName: file.name })
        if (!res.success || !res.fields) {
          if (!opts?.silent) {
            setOcrHint(tt("expenseDocOcrNoFields", "인식된 항목이 없습니다. 직접 입력해 주세요."))
          }
          return false
        }
        // 업로드 자동기입: 빈 칸만. 「지금 인식」: 기존 금액·일자도 덮어쓸 수 있음.
        const force = opts?.force === true
        onOcrFields(res.fields, { force })
        setOcrHint(
          force
            ? tt("expenseDocOcrApplied", "문서에서 항목을 채웠습니다. 확인 후 수정하세요.")
            : tt(
                "expenseDocOcrAppliedEmptyOnly",
                "비어 있던 항목만 문서에서 채웠습니다. 이미 입력한 금액·일자는 유지됩니다."
              )
        )
        return true
      } catch {
        if (!opts?.silent) {
          setOcrHint(tt("expenseDocOcrFail", "문서 인식에 실패했습니다."))
        }
        return false
      } finally {
        setOcrLoading(false)
      }
    },
    [onOcrFields, tt]
  )

  const commitFile = React.useCallback(
    async (file: File) => {
      if (files.length >= maxFiles) return
      onFilesChange([...files, file].slice(0, maxFiles))
      if (ocrAutoFill && onOcrFields) await runOcr(file, { silent: true, force: false })
    },
    [files, maxFiles, ocrAutoFill, onFilesChange, onOcrFields, runOcr]
  )

  const startNextScan = React.useCallback(() => {
    const next = scanQueueRef.current.shift()
    if (next) {
      setScanFile(next)
      setScanOpen(true)
    } else {
      setScanFile(null)
      setScanOpen(false)
    }
  }, [])

  const ingestPicked = React.useCallback(
    (picked: File[]) => {
      if (!picked.length || disabled) return
      const room = Math.max(0, maxFiles - files.length)
      if (room <= 0) return
      const batch = picked.slice(0, room)
      const images: File[] = []
      const others: File[] = []
      for (const f of batch) {
        if (isScannableImageFile(f)) images.push(f)
        else others.push(f)
      }
      for (const f of others) void commitFile(f)
      if (!images.length) return
      if (scanSkip) {
        for (const f of images) void commitFile(f)
        return
      }
      if (scanOpen || scanFile) {
        scanQueueRef.current.push(...images)
        return
      }
      scanQueueRef.current.push(...images.slice(1))
      setScanFile(images[0])
      setScanOpen(true)
    },
    [commitFile, disabled, files.length, maxFiles, scanFile, scanOpen, scanSkip]
  )

  const showInvoice = variant === "full"
  const showDocNo = showInvoice && resolvedType !== "receipt"

  return (
    <div
      className={
        className ??
        "max-w-2xl space-y-3.5 rounded-xl border border-border/70 bg-gradient-to-b from-muted/25 to-background p-3.5 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-semibold tracking-tight">
          {tt("expenseAccrualAttachLabel", "Attach Invoice/Receipt")}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {ocrLoading ? (
            <span className="text-xs text-muted-foreground">{tt("expenseDocOcrRunning", "문서 인식 중…")}</span>
          ) : null}
          {onOcrFields ? (
            <>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-border/60 bg-background/90 px-2 py-1 shadow-sm">
                <Checkbox
                  checked={ocrAutoFill}
                  onCheckedChange={(c) => {
                    const on = c === true
                    setOcrAutoFill(on)
                    writeExpenseDocOcrAutoFill(on)
                  }}
                  disabled={disabled}
                />
                <span className="text-xs whitespace-nowrap">{tt("expenseDocOcrAutoFill", "업로드 시 자동 입력")}</span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled || ocrLoading || files.length === 0}
                onClick={() => {
                  const last = files[files.length - 1]
                  if (last) void runOcr(last, { force: true })
                }}
              >
                <ScanLine className="h-3.5 w-3.5 mr-1" />
                {tt("expenseDocOcrRunNow", "지금 인식")}
              </Button>
            </>
          ) : null}
          <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-border/60 bg-background/90 px-2 py-1 shadow-sm">
            <Checkbox
              checked={scanSkip}
              onCheckedChange={(c) => {
                const on = c === true
                setScanSkip(on)
                writeExpenseDocScanSkip(on)
              }}
              disabled={disabled}
            />
            <span className="text-xs whitespace-nowrap">{tt("expenseDocScanSkip", "스캔 보정 건너뛰기")}</span>
          </label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {ocrAutoFill && onOcrFields
          ? tt(
              "expenseDocAttachUnifiedHint",
              "이미지·PDF 최대 3개. 사진은 스캔 보정 후 첨부되며, 비어 있는 금액·일자 등만 자동 채웁니다(이미 입력한 값은 유지). 「지금 인식」은 덮어씁니다."
            )
          : tt(
              "expenseDocAttachUnifiedHintManualOcr",
              "이미지·PDF 최대 3개. 사진은 스캔 보정 후 첨부됩니다. 자동 입력이 꺼져 있으면 「지금 인식」을 누르세요."
            )}
      </p>
      {ocrHint ? <p className="text-xs text-primary/90">{ocrHint}</p> : null}

      {showInvoice ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Label className="text-xs font-medium text-foreground/80">
                {tt("expenseDocTypeLabel", "문서 유형")}
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {tt(
                  "expenseDocTypeHint",
                  "Tax Invoice만 Tax Filing P.P.30 매입 VAT에 반영됩니다."
                )}
              </p>
            </div>
            {resolvedType === "tax_invoice" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                <ShieldCheck className="h-3 w-3" />
                PP.30
              </span>
            ) : null}
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            role="radiogroup"
            aria-label={tt("expenseDocTypeLabel", "문서 유형")}
          >
            {DOC_TYPE_OPTIONS.map((opt) => {
              const selected = resolvedType === opt.value
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => setDocumentType(selected ? "" : opt.value)}
                  className={cn(
                    "group relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all",
                    "hover:border-foreground/25 hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed",
                    selected ? opt.selected : "border-border/70 bg-background/70"
                  )}
                >
                  <span className={cn("flex items-center gap-1.5 text-sm font-semibold", selected ? opt.accent : "text-foreground")}>
                    <Icon className="h-4 w-4 shrink-0 opacity-90" />
                    {tt(opt.labelKey, opt.labelFb)}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-snug">
                    {tt(opt.descKey, opt.descFb)}
                  </span>
                </button>
              )
            })}
          </div>

          {showDocNo ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/60 px-2.5 py-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                {tt("wm_invoiceNoLabel", "Invoice Number")}
              </Label>
              <Input
                value={invoiceNo}
                onChange={(e) => onInvoiceNoChange(e.target.value)}
                placeholder={t("wm_invoiceNoPlaceholder") || "IV-xxx"}
                className="w-[160px] h-8 text-sm"
                disabled={disabled}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            ingestPicked(Array.from(e.target.files || []))
            e.target.value = ""
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple={maxFiles > 1}
          className="sr-only"
          onChange={(e) => {
            ingestPicked(Array.from(e.target.files || []))
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={disabled || files.length >= maxFiles || ocrLoading || scanOpen}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-4 w-4 mr-1" />
          {tt("expenseDocTakePhoto", "사진 촬영")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={disabled || files.length >= maxFiles || ocrLoading || scanOpen}
          onClick={() => fileRef.current?.click()}
        >
          {tt("chooseFile", "파일 선택")}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {files.length}/{maxFiles}
        </span>
      </div>

      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-lg border bg-background/90 px-2 py-1.5 text-xs max-w-full shadow-sm"
            >
              {thumbUrls[i] && f.type.startsWith("image/") ? (
                <img src={thumbUrls[i]} alt="" className="h-10 w-10 rounded-md object-cover border shrink-0" />
              ) : null}
              <span className="truncate max-w-[120px]">{f.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] shrink-0"
                disabled={disabled}
                onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
              >
                {tt("btnDelete", "삭제")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <ExpenseDocumentScanDialog
        open={scanOpen}
        file={scanFile}
        onOpenChange={(open) => {
          if (!open) {
            setScanOpen(false)
            setScanFile(null)
            scanQueueRef.current = []
          } else setScanOpen(true)
        }}
        onConfirm={(file) => {
          void commitFile(file).finally(() => startNextScan())
        }}
        onUseOriginal={(file) => {
          void commitFile(file).finally(() => startNextScan())
        }}
      />
    </div>
  )
}
