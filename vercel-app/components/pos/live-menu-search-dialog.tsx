'use client'

import * as React from 'react'
import { appAlert } from '@/lib/app-message'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  getPosMenuCategories,
  getPosMenus,
  getPosOrders,
  markPosOrderItemServed,
  updatePosOrderStatus,
  type PosMenu,
  type PosOrder,
  type PosOrderItem,
} from '@/lib/api-client'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { PROMOTION_MAIN_CATEGORY, normalizePosMainCategoryTabs } from '@/lib/pos-promo-constants'
import { CheckCircle2 } from 'lucide-react'

interface LiveMenuSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeCode: string
  t: (key: string) => string
  isDemo?: boolean
}

interface MatchedTarget {
  orderId: number
  itemId: string
  orderNo: string
  orderType: string
  tableName: string
  createdAt: string
  itemName: string
  qty: number
  isTable: boolean
  isServed: boolean
  isSample?: boolean
}

const DEMO_SAMPLE_MEMO = '__live_menu_demo_sample__'
const DEMO_FALLBACK_MENU_ID = '__live_menu_demo_fallback__'

/** 카탈로그가 비었을 때(오프라인·빈 매장)에도 실시간 검색 데모 줄을 만들기 위한 최소 메뉴 */
function buildDemoFallbackMenu(params: { categoryMain: string; category: string }): PosMenu {
  const { categoryMain, category } = params
  return {
    id: DEMO_FALLBACK_MENU_ID,
    code: 'DEMO-LIVE',
    name: '(데모) 실시간 메뉴 검색용',
    category,
    categoryMain: categoryMain || undefined,
    price: 10000,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 0,
  }
}

/**
 * 홀 1~6번: **동일 메뉴 1줄**, 테이블마다 수량만 다름(1~6) → 검색·정렬·합산 설명용.
 * 오늘 실주문이 있어도 데모 다이얼로그에서는 이 샘플만 쓰므로 목록이 항상 채워짐.
 */
function buildDemoSampleOrders(menuList: PosMenu[], storeCode: string): PosOrder[] {
  const active = (menuList || []).filter((m) => m?.isActive && String(m.id || '').trim())
  if (active.length === 0) return []
  const m = active[0]!
  const id = String(m.id)
  const name = String(m.name || '').trim() || '(메뉴)'
  const price = Math.max(0, Number(m.price ?? 0) || 0)
  const now = Date.now()
  const dineInRows = Array.from({ length: 6 }, (_, i) => {
    const tableNo = i + 1
    const qty = tableNo
    const perTableItems = [{ id, name, price, qty }]
    const subtotal = price * qty
    return {
      id: -9100 - tableNo,
      orderNo: `DEMO-DINE-${String(tableNo).padStart(3, '0')}`,
      storeCode,
      orderType: 'dine_in',
      tableName: `${tableNo}번`,
      memo: DEMO_SAMPLE_MEMO,
      items: perTableItems,
      subtotal,
      vat: 0,
      total: subtotal,
      status: 'preparing',
      createdAt: new Date(now - (36 - tableNo * 4) * 60_000).toISOString(),
    } satisfies PosOrder
  })
  return [
    ...dineInRows,
    {
      id: -9003,
      orderNo: 'DEMO-DEL-003',
      storeCode,
      orderType: 'delivery',
      tableName: 'Grab #A102',
      memo: DEMO_SAMPLE_MEMO,
      items: [{ id, name, price, qty: 1 }],
      subtotal: price,
      vat: 0,
      total: price,
      status: 'preparing',
      createdAt: new Date(now - 4 * 60_000).toISOString(),
    },
  ]
}

function pickInitialMenuIdForRows(menuList: PosMenu[], orderList: PosOrder[]): string {
  const normalizedIds = new Set<string>()
  for (const order of orderList) {
    for (const item of order.items || []) {
      const raw = normalizeItemId(String(item.id || '').trim())
      if (!raw) continue
      const base = raw.split('-')[0]
      if (base) normalizedIds.add(base)
      normalizedIds.add(raw)
    }
  }
  const matched = menuList.find((m) => {
    const id = String(m.id || '').trim()
    return id && normalizedIds.has(id)
  })
  return String(matched?.id ?? '').trim()
}

function detectDeliveryApp(text: string): 'grab' | 'lineman' | 'shopee' | null {
  const raw = text.toLowerCase()
  if (raw.includes('grab') || raw.includes('그랩')) return 'grab'
  if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return 'lineman'
  if (raw.includes('shopee') || raw.includes('쇼피')) return 'shopee'
  return null
}

function detectDeliveryOrderNo(text: string): string {
  const hashMatch = text.match(/#\s*([A-Za-z0-9-]+)/)
  if (hashMatch?.[1]) return hashMatch[1]
  const bracketMatch = text.match(/\(([^)]+)\)/)
  if (bracketMatch?.[1]) return bracketMatch[1].trim()
  return ''
}

function getDeliveryDisplayLabel(tableName: string, fallbackOrderNo: string): string {
  const app = detectDeliveryApp(tableName)
  const no = detectDeliveryOrderNo(tableName)
  const appEn = app === 'grab' ? 'Grab' : app === 'lineman' ? 'Line Man' : app === 'shopee' ? 'Shopee' : null
  if (appEn && no) return `${appEn} · #${no}`
  if (appEn) return appEn
  if (no) return `#${no}`
  return fallbackOrderNo
}

/** 테이블명 끝의 한글 접미 "번" 제거 (예: "5번" → "5", "1F-3번" → "1F-3") */
function stripKoreanTableNumberSuffix(name: string): string {
  const s = String(name || '').trim()
  if (!s || s === '-') return s
  const stripped = s.replace(/번\s*$/u, '').trim()
  return stripped || s
}

function formatBangkokTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt)
}

function normalizeItemId(raw: string): string {
  if (raw.startsWith('cart-existing-')) {
    return raw.replace(/^cart-existing-\d+-/, '')
  }
  return raw
}

function itemMatchesMenu(item: PosOrderItem, menu: PosMenu): boolean {
  const itemId = normalizeItemId(String(item.id || '').trim())
  const menuId = String(menu.id || '').trim()
  if (!menuId) return false
  if (itemId === menuId || itemId.startsWith(`${menuId}-`)) return true

  const itemName = String(item.name || '').replace(/\s*\(.+\)\s*$/, '').trim().toLowerCase()
  const menuName = String(menu.name || '').trim().toLowerCase()
  return !!itemName && !!menuName && itemName === menuName
}

export function LiveMenuSearchDialog({
  open,
  onOpenChange,
  storeCode,
  t,
  isDemo = false,
}: LiveMenuSearchDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [selectedMain, setSelectedMain] = React.useState('')
  const [selectedCategory, setSelectedCategory] = React.useState('')
  const [selectedMenuId, setSelectedMenuId] = React.useState('')
  const [menuKeyword, setMenuKeyword] = React.useState('')
  const [servingMap, setServingMap] = React.useState<Record<string, boolean>>({})
  const [servingBusyMap, setServingBusyMap] = React.useState<Record<string, boolean>>({})
  const [demoSeeded, setDemoSeeded] = React.useState(false)

  const getTypeLabel = React.useCallback((orderType: string) => {
    if (orderType === 'dine_in') return t('posOrderTypeDineIn') || 'Dine In'
    if (orderType === 'delivery') return t('posOrderTypeDelivery') || 'Delivery'
    if (orderType === 'takeout') return t('posOrderTypeTakeout') || 'Takeout'
    return orderType || '-'
  }, [t])

  const tableLabel = t('posTable') || 'Table'
  const cookingLabel = t('posTableStatusPreparing') || 'Preparing'
  const servedLabel = t('posTableStatusServed') || 'Served'

  const loadAll = React.useCallback(async () => {
    if (!storeCode) return
    setLoading(true)
    try {
      const today = getPosBusinessDateStr()
      const [menuList, catCfg, orderList] = await Promise.all([
        getPosMenus(),
        getPosMenuCategories(),
        getPosOrders({
          storeCode,
          startStr: today,
          endStr: today,
        }),
      ])
      const mains = normalizePosMainCategoryTabs([...(catCfg.mainCategories || []), PROMOTION_MAIN_CATEGORY])
      let activeMenus = (menuList || []).filter((m) => m.isActive)
      if (isDemo && activeMenus.length === 0) {
        const firstMain = mains[0] ?? ''
        const firstCat = (catCfg.categories && catCfg.categories[0]) || '데모'
        activeMenus = [buildDemoFallbackMenu({ categoryMain: firstMain, category: firstCat })]
      }
      setMenus(activeMenus)
      setMainCategories(mains)
      const realOrders = (orderList || []).filter((o) => o.status !== 'cancelled')
      if (isDemo) {
        const seeded = buildDemoSampleOrders(activeMenus, storeCode)
        if (seeded.length > 0) {
          setOrders(seeded)
          setDemoSeeded(true)
          const initialMenuId = pickInitialMenuIdForRows(activeMenus, seeded)
          if (initialMenuId) {
            setSelectedMenuId((prev) => {
              if (prev && activeMenus.some((m) => String(m.id) === String(prev))) return prev
              return initialMenuId
            })
          }
        } else {
          setOrders(realOrders)
          setDemoSeeded(false)
        }
      } else {
        setOrders(realOrders)
        setDemoSeeded(false)
      }
    } finally {
      setLoading(false)
    }
  }, [isDemo, storeCode])

  React.useEffect(() => {
    if (!open) return
    void loadAll()
  }, [open, loadAll])

  React.useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => {
      void loadAll()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [open, loadAll])

  const categoriesForMain = React.useMemo(() => {
    if (!selectedMain) return []
    const set = new Set(
      menus
        .filter((m) => (m.categoryMain ?? '') === selectedMain)
        .map((m) => m.category)
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [menus, selectedMain])

  React.useEffect(() => {
    if (!selectedMain) {
      setSelectedCategory('')
      setSelectedMenuId('')
      return
    }
    if (!categoriesForMain.includes(selectedCategory)) {
      setSelectedCategory(categoriesForMain[0] ?? '')
      setSelectedMenuId('')
    }
  }, [selectedMain, categoriesForMain, selectedCategory])

  const filteredMenus = React.useMemo(() => {
    const q = menuKeyword.trim().toLowerCase()
    return menus.filter((m) => {
      if (selectedMain && (m.categoryMain ?? '') !== selectedMain) return false
      if (selectedCategory && m.category !== selectedCategory) return false
      if (q) {
        const name = String(m.name || '').toLowerCase()
        const code = String(m.code || '').toLowerCase()
        if (!name.includes(q) && !code.includes(q)) return false
      }
      return true
    })
  }, [menus, selectedMain, selectedCategory, menuKeyword])

  const selectedMenu = React.useMemo(
    () => filteredMenus.find((m) => String(m.id) === String(selectedMenuId)) ?? null,
    [filteredMenus, selectedMenuId]
  )

  const matchedTargets = React.useMemo<MatchedTarget[]>(() => {
    if (!selectedMenu) return []

    const rows: MatchedTarget[] = []
    for (const order of orders) {
      for (const it of order.items || []) {
        if (!itemMatchesMenu(it, selectedMenu)) continue
        const isTable = order.orderType === 'dine_in'
        const isServed = isTable && (order.status === 'completed' || Boolean(it.servedAt))
        const isSample = String(order.memo || '').includes(DEMO_SAMPLE_MEMO) || order.id < 0
        rows.push({
          orderId: order.id,
          itemId: String(it.id ?? ''),
          orderNo: order.orderNo,
          orderType: order.orderType,
          tableName: order.tableName || '-',
          createdAt: order.createdAt,
          itemName: it.name || '-',
          qty: Number(it.qty ?? 1) || 1,
          isTable,
          isServed,
          isSample,
        })
      }
    }
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return rows
  }, [orders, selectedMenu])

  const setItemServedFromSearch = React.useCallback(
    async (target: MatchedTarget) => {
      if (!target.isTable || target.isServed || !target.itemId || target.isSample) return
      const key = `${target.orderId}:${target.itemId}`
      if (servingBusyMap[key]) return
      setServingBusyMap((prev) => ({ ...prev, [key]: true }))
      try {
        const res = await markPosOrderItemServed({
          id: target.orderId,
          itemId: target.itemId,
          served: true,
        })
        if (!res.success) {
          await appAlert(res.message || (t('processFail') || '처리 실패'))
          return
        }
        setServingMap((prev) => ({ ...prev, [key]: true }))
        if (
          Number(res.totalCount ?? 0) > 0 &&
          Number(res.servedCount ?? 0) >= Number(res.totalCount ?? 0)
        ) {
          const statusRes = await updatePosOrderStatus({
            id: target.orderId,
            status: 'ready',
          })
          if (!statusRes?.success) {
            await appAlert(statusRes?.message || '서빙 완료 상태 반영에 실패했습니다.')
          }
        }
        await loadAll()
      } catch (e) {
        await appAlert(String(e))
      } finally {
        setServingBusyMap((prev) => ({ ...prev, [key]: false }))
      }
    },
    [loadAll, servingBusyMap, t]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-tour="pos-tour-live-menu-search-dialog">
        <DialogHeader>
          <DialogTitle>{t('search') || 'Search'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 md:grid-cols-4">
          <Select value={selectedMain || '__all__'} onValueChange={(v) => setSelectedMain(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('posMainCategory') || 'Main Category'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{`${t('posMainCategory') || 'Main Category'} ${t('all') || 'All'}`}</SelectItem>
              {mainCategories.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCategory || '__all__'} onValueChange={(v) => setSelectedCategory(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('posCategory') || 'Category'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{`${t('posCategory') || 'Category'} ${t('all') || 'All'}`}</SelectItem>
              {categoriesForMain.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="h-9"
            placeholder={t('search') || '검색'}
            value={menuKeyword}
            onChange={(e) => setMenuKeyword(e.target.value)}
          />

          <Button className="h-9" variant="outline" onClick={() => void loadAll()} disabled={loading}>
            {loading ? (t('loading') || '불러오는 중...') : (t('posRefresh') || '새로고침')}
          </Button>
        </div>
        {demoSeeded && (
          <p className="text-xs text-muted-foreground">
            {t('posDemoBanner') || 'Demo mode'} · 홀 1~6번에 같은 메뉴가 테이블마다 수량 1~6으로 들어가 있습니다(배달 샘플 1건 포함). 위 메뉴 선택란에서 해당 메뉴를 고르면 줄이 쌓이고, 같은 메뉴는 주문 시각이 더 이른 줄부터 처리하는 흐름을 연습해 보세요.
          </p>
        )}

        <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t('items') || 'Menu'} />
          </SelectTrigger>
          <SelectContent>
            {filteredMenus.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} ({m.category})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="max-h-[45vh] overflow-auto rounded-lg border">
          {selectedMenu == null ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{`${t('items') || 'Menu'} ${t('att_select_first') || 'select first'}`}</div>
          ) : matchedTargets.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('itemsNoResults') || 'No matching orders.'}</div>
          ) : (
            <div className="divide-y">
              {matchedTargets.map((r) => {
                const servingKey = `${r.orderId}:${r.itemId}`
                const resolvedServed = Boolean(servingMap[servingKey]) || r.isServed
                const servingBusy = Boolean(servingBusyMap[servingKey])
                return (
                  <div key={`${r.orderId}-${r.itemId}-${r.createdAt}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.itemName} × {r.qty}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBangkokTime(r.createdAt)} · {(t('posOrderNo') || 'Order No')}: {r.orderType === 'delivery' ? getDeliveryDisplayLabel(r.tableName || '', r.orderNo) : r.orderNo}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={cn(
                          r.isTable && 'bg-blue-100 text-blue-700 hover:bg-blue-100',
                          r.orderType === 'delivery' && 'bg-violet-100 text-violet-700 hover:bg-violet-100',
                          r.orderType === 'takeout' && 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                        )}
                        variant="secondary"
                      >
                        {r.isTable ? tableLabel : getTypeLabel(r.orderType)}
                      </Badge>
                      {r.isTable && (
                        <Badge
                          className={cn(
                            !resolvedServed && 'bg-rose-100 text-rose-700 hover:bg-rose-100',
                            resolvedServed && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          )}
                          variant="secondary"
                        >
                          {resolvedServed ? servedLabel : cookingLabel}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {r.isTable
                          ? `${tableLabel} ${stripKoreanTableNumberSuffix(r.tableName)}`
                          : r.orderType === 'delivery'
                            ? getDeliveryDisplayLabel(r.tableName || '', r.orderNo)
                            : r.orderNo}
                      </Badge>
                      {r.isSample && (
                        <Badge variant="outline" className="border-dashed">
                          DEMO
                        </Badge>
                      )}
                      {r.isTable && (
                        <Button
                          type="button"
                          size="sm"
                          variant={resolvedServed ? 'default' : 'outline'}
                          className={cn(
                            'h-8 min-w-[88px] gap-1.5',
                            resolvedServed && 'bg-emerald-600 hover:bg-emerald-600'
                          )}
                          disabled={resolvedServed || servingBusy || !r.itemId || Boolean(r.isSample)}
                          onClick={() => {
                            void setItemServedFromSearch(r)
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {resolvedServed ? 'เสิร์ฟแล้ว' : 'เสิร์ฟ'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
