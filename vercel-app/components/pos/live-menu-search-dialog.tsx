'use client'

import * as React from 'react'
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
  type PosMenu,
  type PosOrder,
  type PosOrderItem,
} from '@/lib/api-client'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'

interface LiveMenuSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeCode: string
  t: (key: string) => string
}

interface MatchedTarget {
  orderId: number
  orderNo: string
  orderType: string
  tableName: string
  createdAt: string
  itemName: string
  qty: number
  isTable: boolean
  isServed: boolean
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
}: LiveMenuSearchDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [selectedMain, setSelectedMain] = React.useState('')
  const [selectedCategory, setSelectedCategory] = React.useState('')
  const [selectedMenuId, setSelectedMenuId] = React.useState('')
  const [menuKeyword, setMenuKeyword] = React.useState('')

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
      setMenus((menuList || []).filter((m) => m.isActive))
      setMainCategories(catCfg.mainCategories || [])
      setOrders((orderList || []).filter((o) => o.status !== 'cancelled'))
    } finally {
      setLoading(false)
    }
  }, [storeCode])

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
    () => filteredMenus.find((m) => m.id === selectedMenuId) ?? null,
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
        rows.push({
          orderId: order.id,
          orderNo: order.orderNo,
          orderType: order.orderType,
          tableName: order.tableName || '-',
          createdAt: order.createdAt,
          itemName: it.name || '-',
          qty: Number(it.qty ?? 1) || 1,
          isTable,
          isServed,
        })
      }
    }
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return rows
  }, [orders, selectedMenu])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
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
              {matchedTargets.map((r) => (
                <div key={`${r.orderId}-${r.itemName}-${r.createdAt}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.itemName} × {r.qty}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBangkokTime(r.createdAt)} · {(t('posOrderNo') || 'Order No')}: {r.orderNo}
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
                          !r.isServed && 'bg-rose-100 text-rose-700 hover:bg-rose-100',
                          r.isServed && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                        )}
                        variant="secondary"
                      >
                        {r.isServed ? servedLabel : cookingLabel}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {r.isTable ? `${tableLabel} ${r.tableName}` : r.orderNo}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
