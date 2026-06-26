import { cn } from '@/lib/utils'

const PAIR_GROUP_ROW_STYLES = [
  {
    accrual: 'border-l-[3px] border-l-sky-500/80 bg-sky-50/60 dark:bg-sky-950/30',
    settlement: 'border-l-[3px] border-l-sky-400/60 bg-sky-50/35 dark:bg-sky-950/20',
    card: 'border-sky-200/80 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/25',
  },
  {
    accrual: 'border-l-[3px] border-l-violet-500/80 bg-violet-50/60 dark:bg-violet-950/30',
    settlement: 'border-l-[3px] border-l-violet-400/60 bg-violet-50/35 dark:bg-violet-950/20',
    card: 'border-violet-200/80 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-950/25',
  },
  {
    accrual: 'border-l-[3px] border-l-teal-500/80 bg-teal-50/60 dark:bg-teal-950/30',
    settlement: 'border-l-[3px] border-l-teal-400/60 bg-teal-50/35 dark:bg-teal-950/20',
    card: 'border-teal-200/80 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-950/25',
  },
  {
    accrual: 'border-l-[3px] border-l-amber-500/80 bg-amber-50/60 dark:bg-amber-950/30',
    settlement: 'border-l-[3px] border-l-amber-400/60 bg-amber-50/35 dark:bg-amber-950/20',
    card: 'border-amber-200/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/25',
  },
] as const

export function getLedgerPairRowClass(
  meta: { groupId: number; role: 'accrual' | 'settlement' | 'standalone' } | undefined
): string {
  if (!meta || meta.role === 'standalone') return ''
  const idx = (meta.groupId - 1) % PAIR_GROUP_ROW_STYLES.length
  const style = PAIR_GROUP_ROW_STYLES[idx]
  return meta.role === 'accrual' ? style.accrual : style.settlement
}

export function getLedgerPairCardClass(groupId: number): string {
  const idx = (groupId - 1) % PAIR_GROUP_ROW_STYLES.length
  return cn('rounded-md border', PAIR_GROUP_ROW_STYLES[idx].card)
}

export function ledgerPairGroupBadge(groupId: number): string {
  return String(groupId)
}
