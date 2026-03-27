import { cn } from '@/lib/utils'

/** 페이지 최상위 탭: 카드 + 탭바 */
export const adminTabsRootCn =
  'w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm'

export const adminTabsBarCn = 'border-b border-border bg-muted/25'

export const adminTabsScrollCn =
  'overflow-x-auto overflow-y-hidden [scrollbar-width:thin]'

/** 가로 스크롤 한 줄 (탭 많을 때) */
export const adminTabsListRowCn =
  'inline-flex h-auto min-h-12 w-max max-w-none flex-nowrap items-center justify-start gap-1 rounded-none border-0 bg-transparent px-2 py-2 sm:gap-1.5 sm:px-4 sm:py-2.5'

const adminTabsListGridBaseCn =
  'grid w-full gap-1.5 rounded-none border-0 bg-transparent p-2 sm:gap-2 sm:p-3'

/** 균등 그리드 탭 — cols만 합성 (예: grid-cols-2 max-w-md) */
export function adminTabsListGridClass(...cols: string[]) {
  return cn(adminTabsListGridBaseCn, ...cols)
}

export const adminTabsTriggerCn =
  'group gap-2 shrink-0 whitespace-nowrap rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground shadow-none transition-all duration-200 hover:border-border hover:bg-muted hover:text-foreground hover:shadow-md hover:ring-1 hover:ring-border/40 dark:hover:ring-border/50 data-[state=active]:border-primary/35 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-primary/25 data-[state=active]:hover:border-primary/45 data-[state=active]:hover:bg-primary/16 data-[state=active]:hover:shadow-md data-[state=active]:hover:ring-primary/35'

export const adminTabsTriggerGridCn = cn(adminTabsTriggerCn, 'w-full justify-center')

export const adminTabsIconCn =
  'h-4 w-4 shrink-0 opacity-80 transition-opacity group-hover:opacity-100'

export const adminTabsContentCn = 'mt-0 p-4 sm:p-6 focus-visible:ring-0'

export const adminTabsContentFlushCn = 'mt-0 focus-visible:ring-0'
