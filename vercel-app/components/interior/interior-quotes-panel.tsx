"use client"

import * as React from "react"
import Link from "next/link"
import { FileText, Link2, Plus, ScanLine, Wallet } from "lucide-react"
import { appAlert } from "@/lib/app-message"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AdminEmptyState } from "@/components/erp/admin-empty-state"
import { AdminTableSkeleton } from "@/components/erp/admin-table-skeleton"
import {
  getInteriorFiles,
  getInteriorExpenseItems,
  saveInteriorExpenseItem,
  saveInteriorProjectFile,
  extractInteriorQuoteAmount,
  type InteriorExpenseItem,
  type InteriorProjectFile,
} from "@/lib/api-client"
import { INTERIOR_ADMIN, withInteriorProjectId } from "@/lib/interior-admin-nav"
import { tr } from "@/lib/i18n"

type InteriorQuotesPanelProps = {
  projectId: string
  t: (key: string) => string
}

export function InteriorQuotesPanel({ projectId, t }: InteriorQuotesPanelProps) {
  const [files, setFiles] = React.useState<InteriorProjectFile[]>([])
  const [expenses, setExpenses] = React.useState<InteriorExpenseItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingId, setSavingId] = React.useState<number | null>(null)
  const [extractingId, setExtractingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      getInteriorFiles({ projectId }).catch(() => []),
      getInteriorExpenseItems({ projectId }).catch(() => []),
    ])
      .then(([f, e]) => {
        setFiles(f || [])
        setExpenses(e || [])
      })
      .finally(() => setLoading(false))
  }, [projectId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const quoteFiles = React.useMemo(
    () => (files || []).filter((f) => f.fileType === "quote" || (f.quoteAmount ?? 0) > 0),
    [files]
  )

  const expenseById = React.useMemo(() => {
    const map = new Map<number, InteriorExpenseItem>()
    for (const e of expenses) {
      if (e.id) map.set(e.id, e)
    }
    return map
  }, [expenses])

  const totalFileQuotes = quoteFiles.reduce((s, f) => s + (f.quoteAmount ?? 0), 0)
  const totalExpenseQuotes = expenses.reduce((s, e) => s + (e.quote ?? 0), 0)
  const variance = totalFileQuotes - totalExpenseQuotes

  const extractQuoteAmount = async (file: InteriorProjectFile) => {
    if (!file.id) return
    setExtractingId(file.id)
    try {
      const res = await extractInteriorQuoteAmount({ fileId: file.id, projectId })
      if (!res.success || res.amount == null) {
        await appAlert(res.message || t("interiorQuoteExtractFail"))
        return
      }
      const saveRes = await saveInteriorProjectFile({ id: file.id, quoteAmount: res.amount })
      if (!saveRes.success) {
        await appAlert(saveRes.message || t("msg_save_fail"))
        return
      }
      loadData()
      await appAlert(
        `${t("interiorQuoteExtractDone")}\n฿${res.amount.toLocaleString()}\n${tr(t, "interiorQuoteExtractMeta", { method: res.method || "?", confidence: res.confidence || "?" })}`
      )
    } finally {
      setExtractingId(null)
    }
  }

  const saveQuoteAmount = async (file: InteriorProjectFile, amount: number) => {
    if (!file.id) return
    setSavingId(file.id)
    try {
      const res = await saveInteriorProjectFile({ id: file.id, quoteAmount: amount })
      if (!res.success) await appAlert(res.message || t("msg_save_fail"))
      else loadData()
    } finally {
      setSavingId(null)
    }
  }

  const linkExpense = async (file: InteriorProjectFile, expenseId: string) => {
    if (!file.id) return
    setSavingId(file.id)
    try {
      const linkedExpenseId = expenseId === "__none__" ? null : Number(expenseId)
      const res = await saveInteriorProjectFile({ id: file.id, linkedExpenseId })
      if (!res.success) {
        await appAlert(res.message || t("msg_save_fail"))
        return
      }
      if (linkedExpenseId && file.quoteAmount && file.quoteAmount > 0) {
        const exp = expenseById.get(linkedExpenseId)
        if (exp && (exp.quote ?? 0) !== file.quoteAmount) {
          await saveInteriorExpenseItem({
            id: exp.id,
            projectId: Number(projectId),
            description: exp.description || file.fileName || "",
            quote: file.quoteAmount,
            paid: exp.paid,
            balance: file.quoteAmount - (exp.paid ?? 0),
            category: exp.category,
            vendorCode: exp.vendorCode,
            sortOrder: exp.sortOrder,
          })
        }
      }
      loadData()
    } finally {
      setSavingId(null)
    }
  }

  const createExpenseFromFile = async (file: InteriorProjectFile) => {
    if (!file.id) return
    setSavingId(file.id)
    try {
      const res = await saveInteriorExpenseItem({
        projectId: Number(projectId),
        category: "견적",
        description: file.fileName || t("interiorTabQuotesDocs"),
        quote: file.quoteAmount ?? 0,
        paid: 0,
        balance: file.quoteAmount ?? 0,
        sortOrder: expenses.length,
      })
      if (!res.success || !res.id) {
        await appAlert(res.message || t("msg_save_fail"))
        return
      }
      await saveInteriorProjectFile({ id: file.id, linkedExpenseId: res.id, quoteAmount: file.quoteAmount ?? 0 })
      loadData()
      await appAlert(t("msg_saved"))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{t("interiorCostsQuotesHint")}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t("interiorQuotesFileTotal")}</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">฿{totalFileQuotes.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t("interiorQuotesExpenseTotal")}</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">฿{totalExpenseQuotes.toLocaleString()}</p>
        </div>
        <div className={`rounded-lg border p-3 ${variance !== 0 ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
          <p className="text-xs text-muted-foreground">{t("interiorQuotesVariance")}</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {variance > 0 ? "+" : ""}฿{variance.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={withInteriorProjectId(INTERIOR_ADMIN.drawings, projectId, "files")}>
            <FileText className="h-3.5 w-3.5" />
            {t("interiorFiles")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={withInteriorProjectId(INTERIOR_ADMIN.costs, projectId, "expense")}>
            <Wallet className="h-3.5 w-3.5" />
            {t("interiorExpense")}
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <AdminTableSkeleton columns={5} rows={4} />
        ) : quoteFiles.length === 0 ? (
          <AdminEmptyState icon={FileText} title={t("interiorQuotesEmpty")} description={t("interiorQuotesEmptyHint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("interiorFileName")}</TableHead>
                <TableHead className="w-32 text-right">{t("interiorQuote")}</TableHead>
                <TableHead className="min-w-[10rem]">{t("interiorQuotesLinkedExpense")}</TableHead>
                <TableHead className="w-28 text-right">{t("interiorQuotesLinkedQuote")}</TableHead>
                <TableHead className="w-36"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quoteFiles.map((file) => {
                const linked = file.linkedExpenseId ? expenseById.get(file.linkedExpenseId) : undefined
                const linkedQuote = linked?.quote ?? 0
                const mismatch = file.quoteAmount && linked && linkedQuote !== file.quoteAmount
                const canExtract = /\.(pdf|png|jpe?g|webp|gif)$/i.test(String(file.fileName || ""))
                return (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span>{file.fileName}</span>
                        {canExtract ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 w-fit gap-1 text-[10px]"
                            disabled={extractingId === file.id || savingId === file.id}
                            onClick={() => void extractQuoteAmount(file)}
                          >
                            <ScanLine className="h-3 w-3" />
                            {extractingId === file.id ? t("interiorQuoteExtracting") : t("interiorQuoteExtract")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-right font-mono"
                        defaultValue={file.quoteAmount ?? 0}
                        disabled={savingId === file.id}
                        onBlur={(e) => {
                          const next = Number(e.target.value) || 0
                          if (next !== (file.quoteAmount ?? 0)) void saveQuoteAmount(file, next)
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={file.linkedExpenseId ? String(file.linkedExpenseId) : "__none__"}
                        onValueChange={(v) => void linkExpense(file, v)}
                        disabled={savingId === file.id}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={t("interiorQuotesSelectExpense")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("interiorQuotesNoLink")}</SelectItem>
                          {expenses.map((e) => (
                            <SelectItem key={e.id} value={String(e.id)}>
                              {e.description?.slice(0, 40) || `#${e.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${mismatch ? "text-amber-600" : ""}`}>
                      {linked ? `฿${linkedQuote.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell>
                      {!file.linkedExpenseId ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1 text-xs"
                          disabled={savingId === file.id}
                          onClick={() => void createExpenseFromFile(file)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t("interiorQuotesCreateExpense")}
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" />
                          #{file.linkedExpenseId}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
