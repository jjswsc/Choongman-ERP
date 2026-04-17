"use client"

import * as React from "react"
import { Briefcase } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  effectiveHazardAllowanceForJob,
  isKitchenJobForPayroll,
} from "@/lib/employee-job-rules"
import { formatEmployeeDisplayName } from "@/lib/employee-display-name"
import type { EmployeeFormData } from "@/components/employees/employee-form"

const DEFAULT_JOB_OPTIONS = ["Service", "Kitchen", "Officer", "Director", "Logistic"]

function mergeJobOptions(api: string[]): string[] {
  const s = new Set<string>()
  for (const d of DEFAULT_JOB_OPTIONS) s.add(d)
  for (const j of api) {
    const t = String(j || "").trim()
    if (t) s.add(t)
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}

function parseBaht(v: string): number {
  const n = Math.floor(Number(String(v).replace(/[^\d.-]/g, "")) || 0)
  return Math.max(0, n)
}

export function EmployeeJobEditDialog({
  open,
  onOpenChange,
  form,
  jobOptions,
  saving,
  onSave,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: EmployeeFormData | null
  jobOptions: string[]
  saving: boolean
  onSave: (next: EmployeeFormData) => Promise<void>
  t: (k: string) => string
}) {
  const mergedOpts = React.useMemo(() => {
    const base = mergeJobOptions(jobOptions)
    const cur = String(form?.job || "").trim()
    if (cur && !base.includes(cur)) {
      return [...base, cur].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    }
    return base
  }, [jobOptions, form?.job])
  const [draftJob, setDraftJob] = React.useState("")
  const [draftRiskStr, setDraftRiskStr] = React.useState("0")
  const lastKitchenHazRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!open || !form) return
    const j = String(form.job || "Service").trim() || "Service"
    setDraftJob(j)
    const r = form.riskAllowance != null ? Math.floor(Number(form.riskAllowance) || 0) : 0
    setDraftRiskStr(String(r))
    lastKitchenHazRef.current = null
  }, [open, form])

  const draftRisk = parseBaht(draftRiskStr)
  const kitchenNow = isKitchenJobForPayroll(draftJob)

  const handleJobChange = (v: string) => {
    const next = String(v || "").trim()
    const wasKitchen = isKitchenJobForPayroll(draftJob)
    const nowKitchen = isKitchenJobForPayroll(next)
    if (wasKitchen && !nowKitchen && draftRisk > 0) {
      lastKitchenHazRef.current = draftRisk
      setDraftRiskStr("0")
    } else if (!wasKitchen && nowKitchen) {
      const restore = lastKitchenHazRef.current
      if (restore != null && restore > 0) {
        setDraftRiskStr(String(restore))
      }
    }
    setDraftJob(next)
  }

  const handleSave = async () => {
    if (!form) return
    const job = String(draftJob || "").trim() || "Service"
    const risk = effectiveHazardAllowanceForJob(job, draftRisk)
    await onSave({ ...form, job, riskAllowance: risk })
  }

  const displayName = form
    ? formatEmployeeDisplayName(form.name, form.nameTitle)
    : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" aria-hidden />
            {t("emp_job_edit_title")}
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed">
            {t("emp_job_edit_desc")}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <div className="space-y-4 py-1">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("emp_label_store")}: </span>
              <span className="font-medium">{form.store || "—"}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">{t("emp_label_name")}: </span>
              <span className="font-semibold">{displayName}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t("emp_label_job")}</Label>
              <Select
                value={mergedOpts.includes(draftJob) ? draftJob : mergedOpts[0] || "Service"}
                onValueChange={handleJobChange}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mergedOpts.map((j) => (
                    <SelectItem key={j} value={j}>
                      {j}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t("emp_risk_allowance")}</Label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={!kitchenNow}
                value={kitchenNow ? draftRiskStr : "0"}
                onChange={(e) => setDraftRiskStr(e.target.value)}
                className="h-9 text-sm tabular-nums"
              />
              {!kitchenNow ? (
                <p className="text-[11px] text-muted-foreground">{t("emp_job_edit_haz_zero_note")}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">{t("emp_risk_allowance_hint")}</p>
              )}
            </div>

            <p className="text-[11px] text-amber-800 dark:text-amber-200/90 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-2">
              {t("emp_job_edit_eval_note")}
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !form}>
            {saving ? t("loading") : t("emp_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
