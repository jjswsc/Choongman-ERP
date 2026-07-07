"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Trash2, Pencil } from "lucide-react"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { appAlert } from "@/lib/app-message"
import { registerExpenseFromBankTransaction, type AccountSubjectItem } from "@/lib/api-client"
import { filterExpenseWithdrawAccountSubjects } from "@/lib/account-subject-withdraw-options"
import { translateApiMessage } from "@/lib/translate-api-message"
import type { BankTransactionRow } from "./bank-transactions-tab-utils"

/* ------------------------------------------------------------------ */
/*  BankQuickMemoChipBar (presentational, used in multiple places)    */
/* ------------------------------------------------------------------ */

export function BankQuickMemoChipBar({
  title,
  hint,
  phrases,
  onPhrase,
  onManageClick,
  manageLabel,
  className,
}: {
  title: string
  hint: string
  phrases: string[]
  onPhrase: (phrase: string) => void
  onManageClick?: () => void
  manageLabel?: string
  className?: string
}) {
  return (
    <div
      className={`rounded-md border border-amber-200/80 dark:border-amber-800/60 bg-background/80 px-3 py-2 space-y-2 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
        </div>
        {onManageClick ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`${ADMIN_BTN_XS_CN} shrink-0`}
            onClick={onManageClick}
            title={manageLabel}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{manageLabel}</span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {phrases.map((phrase, i) => (
          <Button
            key={`${i}-${phrase.slice(0, 48)}`}
            type="button"
            size="sm"
            variant="secondary"
            className={`${ADMIN_BTN_XS_CN} font-normal`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPhrase(phrase)}
            title={phrase}
          >
            {phrase}
          </Button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  BankMiscDialogs – composite wrapper for five small dialogs        */
/* ------------------------------------------------------------------ */

export type BankMiscDialogsProps = {
  // Quick Memo Edit dialog
  bankQuickMemosEditOpen: boolean
  setBankQuickMemosEditOpen: (open: boolean) => void
  bankQuickMemosDraft: string[]
  setBankQuickMemosDraft: React.Dispatch<React.SetStateAction<string[]>>
  saveBankQuickMemosFromDialog: () => void | Promise<void>
  resetBankQuickMemosToDefault: () => void | Promise<void>

  // Memo Preview dialog
  memoPreviewText: string | null
  setMemoPreviewText: (v: string | null) => void
  getMemo: (memo: string | undefined) => string

  // Invoice Photo Preview dialog
  invoicePhotoPreviewUrl: string | null
  setInvoicePhotoPreviewUrl: (v: string | null) => void

  // Invoice Link dialog
  invoiceLinkRow: BankTransactionRow | null
  setInvoiceLinkRow: (v: BankTransactionRow | null) => void
  invoiceLinkPOList: { id?: number; po_no?: string; vendor_name?: string; total?: number; created_at?: string }[]
  invoiceLinkSelectedPO: string
  setInvoiceLinkSelectedPO: (v: string) => void
  updatingInvoiceId: number | null
  handleInvoiceLinkConfirm: () => void | Promise<void>

  // Register Expense dialog
  registerExpenseRow: BankTransactionRow | null
  setRegisterExpenseRow: (v: BankTransactionRow | null) => void
  registerEditMode: boolean
  setRegisterEditMode: (v: boolean) => void
  registerPayeeManual: boolean
  setRegisterPayeeManual: (v: boolean) => void
  registerPayeeCode: string
  setRegisterPayeeCode: (v: string) => void
  registerPayeeName: string
  setRegisterPayeeName: (v: string) => void
  registerAccountSubjectId: string
  setRegisterAccountSubjectId: (v: string) => void
  registerSaving: boolean
  setRegisterSaving: (v: boolean) => void
  vendorOptions: { code: string; name: string }[]
  accountSubjectOptions: AccountSubjectItem[]
  getAccountSubjectLabel: (a: AccountSubjectItem) => string
  auth: { user?: string; role?: string } | null | undefined
  loadData: () => void

  t: (key: string) => string
  tt: (key: string, fallback: string) => string
}

export function BankMiscDialogs(props: BankMiscDialogsProps) {
  const {
    bankQuickMemosEditOpen, setBankQuickMemosEditOpen,
    bankQuickMemosDraft, setBankQuickMemosDraft,
    saveBankQuickMemosFromDialog, resetBankQuickMemosToDefault,
    memoPreviewText, setMemoPreviewText, getMemo,
    invoicePhotoPreviewUrl, setInvoicePhotoPreviewUrl,
    invoiceLinkRow, setInvoiceLinkRow,
    invoiceLinkPOList, invoiceLinkSelectedPO, setInvoiceLinkSelectedPO,
    updatingInvoiceId, handleInvoiceLinkConfirm,
    registerExpenseRow, setRegisterExpenseRow,
    registerEditMode, setRegisterEditMode,
    registerPayeeManual, setRegisterPayeeManual,
    registerPayeeCode, setRegisterPayeeCode,
    registerPayeeName, setRegisterPayeeName,
    registerAccountSubjectId, setRegisterAccountSubjectId,
    registerSaving, setRegisterSaving,
    vendorOptions, accountSubjectOptions, getAccountSubjectLabel,
    auth, loadData,
    t, tt,
  } = props

  return (
    <>
      {/* ---- Quick Memos Edit Dialog ---- */}
      <Dialog open={bankQuickMemosEditOpen} onOpenChange={setBankQuickMemosEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("bankQuickMemosEditTitle") || "자주 쓰는 메모 편집"}</DialogTitle>
            <DialogDescription className="text-left">
              {t("bankQuickMemosEditHint") ||
                "이 브라우저에만 저장됩니다. 다른 PC나 브라우저와는 공유되지 않습니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-[min(420px,50vh)] py-1 pr-1">
            {bankQuickMemosDraft.map((line, i) => (
              <div key={`draft-${i}`} className="flex gap-2 items-center">
                <Input
                  value={line}
                  onChange={(e) => {
                    const v = e.target.value
                    setBankQuickMemosDraft((prev) => prev.map((x, j) => (j === i ? v : x)))
                  }}
                  placeholder={t("bankQuickMemosLinePlaceholder") || "문구"}
                  className="h-9 text-sm flex-1 min-w-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground"
                  onClick={() => setBankQuickMemosDraft((prev) => prev.filter((_, j) => j !== i))}
                  title={t("delete") || "삭제"}
                  aria-label={t("delete") || "삭제"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start shrink-0"
            onClick={() => setBankQuickMemosDraft((p) => [...p, ""])}
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden />
            {t("bankQuickMemosAddLine") || "항목 추가"}
          </Button>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => void resetBankQuickMemosToDefault()}>
              {t("bankQuickMemosResetDefault") || "기본값으로 되돌리기"}
            </Button>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => setBankQuickMemosEditOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={() => void saveBankQuickMemosFromDialog()}>
                {t("btn_save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Memo Preview Dialog ---- */}
      <Dialog open={!!memoPreviewText} onOpenChange={(open) => !open && setMemoPreviewText(null)}>
        <DialogContent className={`max-w-lg ${ADMIN_DIALOG_SCROLL_CN}`}>
          <DialogHeader>
            <DialogTitle>{t("bankMemoLabel") || "은행 적요"}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm py-2">{getMemo(memoPreviewText ?? undefined) || memoPreviewText || ""}</p>
        </DialogContent>
      </Dialog>

      {/* ---- Invoice Photo Preview Dialog ---- */}
      <Dialog open={!!invoicePhotoPreviewUrl} onOpenChange={(open) => !open && setInvoicePhotoPreviewUrl(null)}>
        <DialogContent className={`max-w-2xl ${ADMIN_DIALOG_SCROLL_CN}`}>
          <DialogHeader>
            <DialogTitle>{t("poInvoice") || "인보이스"}</DialogTitle>
          </DialogHeader>
          <ImageViewerWithRotate
            src={invoicePhotoPreviewUrl || ""}
            alt=""
            imgClassName="max-h-[70vh] w-full object-contain rounded"
            rotateLeftLabel={t("imageRotateLeft") || "반시계"}
            rotateRightLabel={t("imageRotateRight") || "시계"}
          />
        </DialogContent>
      </Dialog>

      {/* ---- Invoice Link Dialog ---- */}
      <Dialog open={!!invoiceLinkRow} onOpenChange={(open) => !open && setInvoiceLinkRow(null)}>
        <DialogContent className={`max-w-md ${ADMIN_DIALOG_SCROLL_CN}`}>
          <DialogHeader>
            <DialogTitle>{t("bankInvoiceCheckTitle") || "인보이스 수령 체크"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {invoiceLinkRow?.vendorCode
              ? (t("bankInvoiceLinkPrompt") || "이 건을 발주서와 연동하시겠습니까? 연동 시 발주서 인보이스 상태와 동기화됩니다.")
              : (t("bankInvoiceCheckOnly") || "인보이스 수령 체크만 합니다. (발주서 연동 없음)")}
          </p>
          {invoiceLinkRow?.vendorCode && invoiceLinkPOList.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">{t("bankLinkPO") || "발주서 연동"}</label>
              <Select value={invoiceLinkSelectedPO} onValueChange={setInvoiceLinkSelectedPO}>
                <SelectTrigger>
                  <SelectValue placeholder={t("bankLinkPOSelect") || "선택 (연동 없으면 체크만)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— {t("bankInvoiceCheckOnly") || "연동 없이 체크만"}</SelectItem>
                  {invoiceLinkPOList.map((po) => (
                    <SelectItem key={po.id} value={String(po.id)}>
                      {po.po_no || `#${po.id}`} {po.vendor_name || ""} ฿{(po.total ?? 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {invoiceLinkRow?.vendorCode && invoiceLinkPOList.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("bankNoPOForVendor") || "해당 거래처 발주서가 없습니다. 연동 없이 체크만 합니다."}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setInvoiceLinkRow(null)}>{t("cancel")}</Button>
            <Button size="sm" onClick={handleInvoiceLinkConfirm} disabled={updatingInvoiceId !== null}>
              {updatingInvoiceId !== null ? "..." : t("msg_done")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Register Expense Dialog ---- */}
      <RegisterExpenseDialog
        registerExpenseRow={registerExpenseRow}
        setRegisterExpenseRow={setRegisterExpenseRow}
        registerEditMode={registerEditMode}
        setRegisterEditMode={setRegisterEditMode}
        registerPayeeManual={registerPayeeManual}
        setRegisterPayeeManual={setRegisterPayeeManual}
        registerPayeeCode={registerPayeeCode}
        setRegisterPayeeCode={setRegisterPayeeCode}
        registerPayeeName={registerPayeeName}
        setRegisterPayeeName={setRegisterPayeeName}
        registerAccountSubjectId={registerAccountSubjectId}
        setRegisterAccountSubjectId={setRegisterAccountSubjectId}
        registerSaving={registerSaving}
        setRegisterSaving={setRegisterSaving}
        vendorOptions={vendorOptions}
        accountSubjectOptions={accountSubjectOptions}
        getAccountSubjectLabel={getAccountSubjectLabel}
        auth={auth}
        loadData={loadData}
        t={t}
        tt={tt}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  RegisterExpenseDialog (internal)                                   */
/* ------------------------------------------------------------------ */

function RegisterExpenseDialog({
  registerExpenseRow, setRegisterExpenseRow,
  registerEditMode, setRegisterEditMode,
  registerPayeeManual, setRegisterPayeeManual,
  registerPayeeCode, setRegisterPayeeCode,
  registerPayeeName, setRegisterPayeeName,
  registerAccountSubjectId, setRegisterAccountSubjectId,
  registerSaving, setRegisterSaving,
  vendorOptions, accountSubjectOptions, getAccountSubjectLabel,
  auth, loadData,
  t, tt,
}: Pick<BankMiscDialogsProps,
  | "registerExpenseRow" | "setRegisterExpenseRow"
  | "registerEditMode" | "setRegisterEditMode"
  | "registerPayeeManual" | "setRegisterPayeeManual"
  | "registerPayeeCode" | "setRegisterPayeeCode"
  | "registerPayeeName" | "setRegisterPayeeName"
  | "registerAccountSubjectId" | "setRegisterAccountSubjectId"
  | "registerSaving" | "setRegisterSaving"
  | "vendorOptions" | "accountSubjectOptions" | "getAccountSubjectLabel"
  | "auth" | "loadData" | "t" | "tt"
>) {
  return (
    <Dialog open={!!registerExpenseRow} onOpenChange={(open) => !open && (setRegisterExpenseRow(null), setRegisterEditMode(false))}>
      <DialogContent className={`max-w-md ${ADMIN_DIALOG_SCROLL_CN}`}>
        <DialogHeader>
          <DialogTitle>{t("bankRegisterExpense") || "지출 발생으로 등록"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">
          {registerExpenseRow ? `${registerExpenseRow.transDate} · ฿${Math.abs(registerExpenseRow.amount || 0).toLocaleString()}` : ""}
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("vendor") || "지급처"}</label>
            <Select value={registerPayeeManual ? "__manual__" : (registerPayeeCode || "__none__")} onValueChange={(v) => { setRegisterPayeeManual(v === "__manual__"); if (v !== "__manual__" && v !== "__none__") { setRegisterPayeeCode(v); setRegisterPayeeName(vendorOptions.find((x) => x.code === v)?.name || v) } else if (v === "__manual__") { setRegisterPayeeCode(""); setRegisterPayeeName("") } }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("vendor") || "거래처 선택 또는 직접 입력"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">{t("bankRegisterPayeeManual") || "직접 입력"}</SelectItem>
                <SelectItem value="__none__">—</SelectItem>
                {vendorOptions.map((v) => (
                  <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {registerPayeeManual ? (
              <div className="flex gap-2 mt-2">
                <Input placeholder={t("expensePayeeCode") || "지급처 코드"} value={registerPayeeCode} onChange={(e) => setRegisterPayeeCode(e.target.value)} className="flex-1" />
                <Input placeholder={t("expensePayeeName") || "지급처명"} value={registerPayeeName} onChange={(e) => setRegisterPayeeName(e.target.value)} className="flex-1" />
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("accountSubject") || "계정과목"}</label>
            <Select value={registerAccountSubjectId || "__none__"} onValueChange={(v) => setRegisterAccountSubjectId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("accountSubject") || "계정과목"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {filterExpenseWithdrawAccountSubjects(accountSubjectOptions).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.code} {getAccountSubjectLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRegisterExpenseRow(null)}>{t("cancel")}</Button>
          <Button
            disabled={registerSaving || !(registerPayeeManual ? (registerPayeeCode.trim() || registerPayeeName.trim()) : registerPayeeCode)}
            onClick={async () => {
              if (!registerExpenseRow?.id) return
              const code = (registerPayeeCode || "").trim()
              const name = (registerPayeeName || code).trim()
              if (!code && !name) return
              setRegisterSaving(true)
              try {
                const res = await registerExpenseFromBankTransaction({
                  bankTransactionId: registerExpenseRow.id,
                  payeeCode: code || name,
                  payeeName: name || code,
                  accountSubjectId: registerAccountSubjectId ? Number(registerAccountSubjectId) : null,
                  userName: auth?.user,
                  userRole: auth?.role,
                  updateExisting: registerEditMode,
                })
                if (res.success) {
                  setRegisterExpenseRow(null)
                  setRegisterEditMode(false)
                  loadData()
                  await appAlert(translateApiMessage(res.message, t) || res.message || t("success"))
                } else {
                  await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
                }
              } finally {
                setRegisterSaving(false)
              }
            }}
          >
            {registerSaving ? "..." : (t("btnSave") || "저장")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
