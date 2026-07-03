/** 지출 등록 — 반복 경비 빠른 입력 템플릿 (브라우저 localStorage) */

export type ExpenseRecurringTemplate = {
  id: string
  label: string
  categoryMain: 'expense' | 'purchase'
  payeeCode?: string
  payeeName?: string
  accountSubjectId?: number | null
  memo?: string
  amount?: string
  vatAmount?: string
}

const STORAGE_KEY = 'cm_expense_recurring_templates_v1'
const MAX_TEMPLATES = 12

export function loadExpenseRecurringTemplates(): ExpenseRecurringTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpenseRecurringTemplate[]
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_TEMPLATES)
  } catch {
    return []
  }
}

export function saveExpenseRecurringTemplates(templates: ExpenseRecurringTemplate[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)))
  } catch {
    // ignore
  }
}

export function upsertExpenseRecurringTemplate(
  template: Omit<ExpenseRecurringTemplate, 'id'> & { id?: string }
): ExpenseRecurringTemplate[] {
  const list = loadExpenseRecurringTemplates()
  const id = template.id || `tpl_${Date.now()}`
  const row: ExpenseRecurringTemplate = { ...template, id }
  const next = [row, ...list.filter((x) => x.id !== id)].slice(0, MAX_TEMPLATES)
  saveExpenseRecurringTemplates(next)
  return next
}

export function deleteExpenseRecurringTemplate(id: string): ExpenseRecurringTemplate[] {
  const next = loadExpenseRecurringTemplates().filter((x) => x.id !== id)
  saveExpenseRecurringTemplates(next)
  return next
}
