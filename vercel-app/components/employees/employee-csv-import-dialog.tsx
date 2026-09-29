"use client"

import * as React from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { appAlert, appConfirm } from "@/lib/app-message"

export function EmployeeCsvImportDialog({ onImported }: { onImported?: () => void }) {
  const t = useT(useLang().lang)
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)

  const handleImport = async () => {
    if (!file) return
    if (!(await appConfirm(`${t("emp_csv_import_warn")}\n\n${t("emp_csv_import_run")}?`))) return
    setBusy(true)
    try {
      const csv = await file.text()
      const res = await fetch("/api/importEmployeesFromCsv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        added?: number
        updated?: number
        skippedCodes?: number
        skippedRows?: number
      }
      if (!json.success) {
        await appAlert(json.message || t("msg_empty_result"))
        return
      }
      const parts = [
        tr(t, "emp_csv_import_ok_detail", {
          added: json.added ?? 0,
          updated: json.updated ?? 0,
        }),
      ]
      if ((json.skippedCodes ?? 0) > 0) {
        parts.push(tr(t, "emp_csv_import_code_skipped", { n: json.skippedCodes ?? 0 }))
      }
      if ((json.skippedRows ?? 0) > 0) {
        parts.push(tr(t, "emp_csv_import_rows_skipped", { n: json.skippedRows ?? 0 }))
      }
      await appAlert(parts.join("\n"))
      setOpen(false)
      setFile(null)
      onImported?.()
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {t("emp_csv_import")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("emp_csv_import_title")}</DialogTitle>
          <DialogDescription>{t("emp_csv_import_warn")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">{t("emp_csv_import_pick")}</label>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={!file || busy}>
            {busy ? t("loading") : t("emp_csv_import_run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
