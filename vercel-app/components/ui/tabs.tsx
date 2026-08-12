'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'
import { useErpNavigationOptional } from '@/lib/erp-navigation'
import { ErpTabActiveProvider } from '@/lib/erp-page-visibility'

const ErpTabsValueContext = React.createContext<string | undefined>(undefined)
/** ERP에서 비활성 TabsContent forceMount 여부 (무거운 화면은 false) */
const ErpTabsPreserveInactiveContext = React.createContext(true)

export type ErpTabsRootProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  /**
   * ERP keep-alive 환경에서 비활성 탭 DOM 유지 여부.
   * 지출·은행·미수미지급 등 무거운 화면은 false로 두어 메모리 부담을 줄인다.
   * @default true
   */
  preserveInactiveTabs?: boolean
}

function Tabs({ value, preserveInactiveTabs = true, ...props }: ErpTabsRootProps) {
  const inErp = useErpNavigationOptional() != null
  const preserve = inErp && preserveInactiveTabs !== false
  /** value={undefined}를 넘기면 Radix가 제어 모드로 깨질 수 있어, 있을 때만 전달 */
  const controlled = value !== undefined
  return (
    <ErpTabsPreserveInactiveContext.Provider value={preserve}>
      <ErpTabsValueContext.Provider value={value}>
        <TabsPrimitive.Root {...(controlled ? { value } : {})} {...props} />
      </ErpTabsValueContext.Provider>
    </ErpTabsPreserveInactiveContext.Provider>
  )
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-slate-200 dark:bg-slate-700 p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, value, ...props }, ref) => {
  const preserveInactive = React.useContext(ErpTabsPreserveInactiveContext)
  const selectedValue = React.useContext(ErpTabsValueContext)
  // value 미전달(비제어 Tabs)이면 활성 탭을 알 수 없으므로 기존처럼 모두 active로 둔다.
  const tabActive =
    selectedValue === undefined ? true : value == null || selectedValue === value

  return (
    <ErpTabActiveProvider active={tabActive}>
      <TabsPrimitive.Content
        ref={ref}
        value={value}
        forceMount={preserveInactive ? true : undefined}
        className={cn(
          'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          preserveInactive && 'data-[state=inactive]:hidden',
          className,
        )}
        {...props}
      />
    </ErpTabActiveProvider>
  )
})
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
