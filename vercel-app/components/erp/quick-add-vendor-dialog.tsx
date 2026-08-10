"use client"

import * as React from "react"
import {
  Building2,
  Landmark,
  FileText,
  MapPin,
  Plus,
  Save,
  Tag,
  Loader2,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { saveVendor } from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { VendorRdSearchButton } from "@/components/erp/vendor-rd-search"
import { cn } from "@/lib/utils"

export type QuickAddVendorResult = {
  code: string
  name: string
  bankName?: string
  bankAccountNo?: string
  taxId?: string
  address?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 기존 코드 목록 — 중복 검사 */
  existingCodes: string[]
  initialName?: string
  initialTaxId?: string
  initialBankName?: string
  initialBankAccountNo?: string
  onSaved: (vendor: QuickAddVendorResult) => void
}

function suggestVendorCode(name: string, existing: Set<string>): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 6)
    .toUpperCase()
  const base = cleaned || "V"
  const stamp = String(Date.now()).slice(-4)
  let code = `${base}-${stamp}`.slice(0, 20)
  if (!existing.has(code.toLowerCase())) return code
  for (let i = 1; i < 50; i++) {
    code = `${base}-${stamp}${i}`.slice(0, 20)
    if (!existing.has(code.toLowerCase())) return code
  }
  return `V-${Date.now().toString(36).toUpperCase()}`.slice(0, 20)
}

export function QuickAddVendorTriggerButton({
  onClick,
  className,
  label,
}: {
  onClick: () => void
  className?: string
  label?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-9 gap-1.5 border-dashed border-primary/40 bg-primary/[0.04] text-primary hover:bg-primary/10 hover:text-primary",
        className
      )}
      onClick={onClick}
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">{label || t("vendorQuickAdd") || "Add vendor"}</span>
    </Button>
  )
}

export function QuickAddVendorDialog({
  open,
  onOpenChange,
  existingCodes,
  initialName = "",
  initialTaxId = "",
  initialBankName = "",
  initialBankAccountNo = "",
  onSaved,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [taxNo, setTaxNo] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [bankName, setBankName] = React.useState("")
  const [bankAccountNo, setBankAccountNo] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const existingLower = React.useMemo(
    () => new Set(existingCodes.map((c) => c.trim().toLowerCase()).filter(Boolean)),
    [existingCodes]
  )

  React.useEffect(() => {
    if (!open) return
    const seedName = initialName.trim()
    setName(seedName)
    setTaxNo(initialTaxId.trim())
    setAddress("")
    setBankName(initialBankName.trim())
    setBankAccountNo(initialBankAccountNo.trim())
    setCode(seedName ? suggestVendorCode(seedName, existingLower) : "")
    setError("")
    setSaving(false)
  }, [open, initialName, initialTaxId, initialBankName, initialBankAccountNo, existingLower])

  const handleSave = async () => {
    const c = code.trim()
    const n = name.trim()
    if (!c || !n) {
      setError(t("vendorAlertCodeName") || "Code and vendor name are required.")
      return
    }
    if (existingLower.has(c.toLowerCase())) {
      setError(t("vendorAlertCodeExists") || "This vendor code already exists.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await saveVendor({
        code: c,
        name: n,
        tax_no: taxNo.trim() || undefined,
        address: address.trim(),
        bank_name: bankName.trim() || undefined,
        bank_account_no: bankAccountNo.trim() || undefined,
        type: "purchase",
      })
      if (!res.success) {
        setError(translateApiMessage(res.message, t) || res.message || t("msg_save_fail_detail") || "Save failed")
        return
      }
      onSaved({
        code: c,
        name: n,
        bankName: bankName.trim() || undefined,
        bankAccountNo: bankAccountNo.trim() || undefined,
        taxId: taxNo.trim() || undefined,
        address: address.trim() || undefined,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <div className="relative overflow-hidden border-b bg-gradient-to-br from-emerald-50 via-background to-sky-50 px-6 pb-5 pt-6 dark:from-emerald-950/40 dark:via-background dark:to-sky-950/30">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-emerald-400/15 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-sky-400/15 blur-2xl"
          />
          <DialogHeader className="relative space-y-3 text-left">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle className="text-base font-bold tracking-tight">
                  {t("vendorQuickAddTitle") || "Add vendor"}
                </DialogTitle>
                <DialogDescription className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t("vendorQuickAddDesc") ||
                    "Register once here — no need to open Logistics. Bank details auto-fill on the expense form."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <section className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("vendorQuickAddSectionBasic") || "Basic"}
              </p>
              <VendorRdSearchButton
                triggerSize="sm"
                triggerVariant="ghost"
                triggerClassName="h-7 px-2 text-[11px] text-primary"
                initialQuery={name || taxNo}
                onPick={(c) => {
                  setName(c.name || name)
                  setTaxNo(c.taxId || taxNo)
                  if (c.address) setAddress(c.address)
                  if (!code.trim() && c.name) {
                    setCode(suggestVendorCode(c.name, existingLower))
                  }
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Tag className="h-3.5 w-3.5 text-emerald-600" />
                  {t("vendorCode") || "Code"}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  className="h-10"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("vendorCodePh") || "e.g. V001"}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                  {t("vendorName") || "Name"}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  className="h-10"
                  value={name}
                  onChange={(e) => {
                    const next = e.target.value
                    setName(next)
                    if (!code.trim() && next.trim()) {
                      setCode(suggestVendorCode(next, existingLower))
                    }
                  }}
                  placeholder={t("vendorNamePh") || "Company name"}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {t("vendorTaxNo") || "Tax ID"}
              </label>
              <Input
                className="h-10 tabular-nums"
                value={taxNo}
                onChange={(e) => setTaxNo(e.target.value.replace(/\D/g, "").slice(0, 13))}
                placeholder="13 digits"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {t("vendorAddress") || "Address"}
              </label>
              <Input
                className="h-10"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("vendorAddressPh") || "Address"}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("vendorQuickAddSectionBank") || "Bank (for transfers)"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Landmark className="h-3.5 w-3.5 text-sky-600" />
                  {t("expensePayeeBankName") || "Bank"}
                </label>
                <Input
                  className="h-10"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="K-BANK"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Landmark className="h-3.5 w-3.5 text-sky-600" />
                  {t("inv_account_no") || "Account"}
                </label>
                <Input
                  className="h-10 tabular-nums"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="xxx-x-xxxxx-x"
                />
              </div>
            </div>
          </section>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel") || "Cancel"}
          </Button>
          <Button
            type="button"
            className="min-w-[120px] gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("vendorQuickAddSave") || "Save & select"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
