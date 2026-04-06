/** 페이지 최상위 탭: 카드 + 탭바 */
export const adminTabsRootCn =
  'w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm'

/** 긴 세로 콘텐츠(주간 스케줄 등)가 잘리지 않게 — 페이지 스크롤로 이어지도록 overflow 숨김 제거 */
export const adminTabsRootScrollableCn =
  'w-full min-h-0 rounded-xl border border-border bg-card shadow-sm'

export const adminTabsBarCn = 'border-b border-border bg-muted/25'

export const adminTabsScrollCn =
  'overflow-x-auto overflow-y-hidden [scrollbar-width:thin]'

/** 가로 스크롤 한 줄 (탭 많을 때) */
export const adminTabsListRowCn =
  'inline-flex h-auto min-h-12 w-max max-w-none flex-nowrap items-center justify-start gap-1 rounded-none border-0 bg-transparent px-2 py-2 sm:gap-1.5 sm:px-4 sm:py-2.5'

export const adminTabsTriggerCn =
  'group gap-2 shrink-0 whitespace-nowrap rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground shadow-none transition-all duration-200 hover:border-border hover:bg-muted hover:text-foreground hover:shadow-md hover:ring-1 hover:ring-border/40 dark:hover:ring-border/50 data-[state=active]:border-primary/35 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-primary/25 data-[state=active]:hover:border-primary/45 data-[state=active]:hover:bg-primary/16 data-[state=active]:hover:shadow-md data-[state=active]:hover:ring-primary/35'

export const adminTabsIconCn =
  'h-4 w-4 shrink-0 opacity-80 transition-opacity group-hover:opacity-100'

export const adminTabsContentCn = 'mt-0 p-4 sm:p-6 focus-visible:ring-0'

export const adminTabsContentFlushCn = 'mt-0 focus-visible:ring-0'

/** 세무 신고 등 바깥 탭 카드 안에 embed 할 때 — 안쪽 Tabs에 테두리·그림자·배경 박스 없음 */
export const adminTabsRootEmbeddedCn =
  'w-full overflow-visible rounded-none border-0 bg-transparent shadow-none'

/** embed 시 바깥 TabsContent가 패딩을 담당 */
export const adminTabsContentEmbeddedCn = 'mt-0 p-0 focus-visible:ring-0'
