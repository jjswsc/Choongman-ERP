"use client"

import * as React from "react"
import { BookmarkPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  deleteExpenseRecurringTemplate,
  loadExpenseRecurringTemplates,
  type ExpenseRecurringTemplate,
  upsertExpenseRecurringTemplate,
} from "@/lib/expense-recurring-templates"

export type ExpenseRecurringTemplateApplyPayload = ExpenseRecurringTemplate

export function ExpenseRecurringTemplatesBar({
  onApply,
  onSaveCurrent,
  canSave,
}: {
  onApply: (tpl: ExpenseRecurringTemplateApplyPayload) => void
  onSaveCurrent: () => Omit<ExpenseRecurringTemplate, "id"> | null
  canSave: boolean
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const [templates, setTemplates] = React.useState<ExpenseRecurringTemplate[]>([])

  React.useEffect(() => {
    setTemplates(loadExpenseRecurringTemplates())
  }, [])

  if (templates.length === 0 && !canSave) return null

  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {tt("expenseRecurringTemplatesTitle", "반복 경비 빠른 입력")}
        </span>
        {canSave ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              const snap = onSaveCurrent()
              if (!snap) return
              setTemplates(upsertExpenseRecurringTemplate(snap))
            }}
          >
            <BookmarkPlus className="h-3.5 w-3.5 mr-1" />
            {tt("expenseRecurringTemplatesSave", "현재 양식 저장")}
          </Button>
        ) : null}
      </div>
      {templates.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="flex items-center gap-1 rounded-full border bg-background pl-2 pr-1">
              <button
                type="button"
                className="text-xs py-1 hover:text-primary"
                onClick={() => onApply(tpl)}
              >
                {tpl.label}
              </button>
              <button
                type="button"
                className="p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={tt("btnDelete", "삭제")}
                onClick={() => setTemplates(deleteExpenseRecurringTemplate(tpl.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {tt("expenseRecurringTemplatesEmpty", "자주 쓰는 경비를 입력한 뒤 「현재 양식 저장」을 누르세요.")}
        </p>
      )}
    </div>
  )
}
