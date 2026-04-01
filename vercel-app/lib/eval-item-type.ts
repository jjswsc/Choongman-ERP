/** evaluation_items / evaluation_results 의 eval_type */

export type EvalItemType = 'kitchen' | 'service' | 'manager'

export function normalizeEvalItemType(type: unknown): EvalItemType {
  const t = String(type || '')
    .toLowerCase()
    .trim()
  if (t === 'service') return 'service'
  if (t === 'manager') return 'manager'
  return 'kitchen'
}
