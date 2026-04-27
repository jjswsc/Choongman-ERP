import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import type { AdminEmployeeItem } from '@/lib/api-client'

/** 경고서·평가 이력에서 평가 탭으로 점프할 때 닉·직무 보조 */
export function resolveEmployeeNickJobForEvalJump(
  list: (AdminEmployeeItem & { finalGrade?: string })[],
  store: string,
  name: string
): { nick: string; job: string } {
  const jStore = String(store || '').trim()
  const jName = String(name || '').trim()
  const jNameNorm = jName ? normalizeEmployeeNameForGradeMatch(jName) : ''
  for (const e of list) {
    const atStore =
      storesMatchForGradeLookup(e.store || '', jStore) ||
      (Array.isArray(e.extraStores) &&
        e.extraStores.some((x) => storesMatchForGradeLookup(String(x || ''), jStore)))
    if (!atStore) continue
    const n = String(e.name || '').trim()
    const nick = String(e.nick || '').trim()
    const job = String(e.job || '').trim()
    if (jName && n === jName) return { nick, job }
    const nNorm = n ? normalizeEmployeeNameForGradeMatch(n) : ''
    if (jNameNorm && nNorm && jNameNorm === nNorm) return { nick, job }
  }
  return { nick: '', job: '' }
}
