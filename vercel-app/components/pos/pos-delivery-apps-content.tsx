'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, Plus, RotateCw, Save, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import {
  getPosDeliveryApps,
  savePosDeliveryApps,
  useStoreList,
  type PosDeliveryApp,
} from '@/lib/api-client'
import { isOfficeRole } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const ACCENT_COLORS = [
  { value: 'lime', label: 'Lime (Grab)' },
  { value: 'sky', label: 'Sky (Line Man)' },
  { value: 'amber', label: 'Amber (Shopee)' },
  { value: 'slate', label: 'Slate (기타)' },
] as const

export function PosDeliveryAppsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [items, setItems] = React.useState<PosDeliveryApp[]>([])
  const [includeDisabled, setIncludeDisabled] = React.useState(true)

  const canSearchAll = isOfficeRole(auth?.role || '')
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ''

  const loadData = React.useCallback(() => {
    setLoading(true)
    getPosDeliveryApps({ storeCode: canSearchAll && storeCode ? storeCode : undefined, includeDisabled })
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [canSearchAll, storeCode, includeDisabled])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreCode(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const updateItem = (index: number, patch: Partial<PosDeliveryApp>) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const moveItem = (index: number, dir: 'up' | 'down') => {
    const to = dir === 'up' ? index - 1 : index + 1
    if (to < 0 || to >= items.length) return
    setItems((prev) => {
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[to]
      next[to] = tmp
      return next.map((it, i) => ({ ...it, displayOrder: i }))
    })
  }

  const addItem = () => {
    const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.displayOrder), 0) + 1 : 0
    setItems((prev) => [
      ...prev,
      {
        id: 0,
        code: '',
        name: '',
        matchKeywords: [],
        displayOrder: maxOrder,
        enabled: true,
        dineOutEnabled: true,
        accentColor: 'slate',
        storeCode: null,
      },
    ])
  }

  const removeItem = (index: number) => {
    const it = items[index]
    if (it.id > 0) {
      updateItem(index, { enabled: false })
    } else {
      setItems((prev) => prev.filter((_, i) => i !== index))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = items
        .filter((i) => i.code.trim())
        .map((i, idx) => ({
          id: i.id,
          code: i.code.trim(),
          name: i.name.trim() || i.code.trim(),
          matchKeywords: i.matchKeywords?.length ? i.matchKeywords : [i.code.toLowerCase()],
          displayOrder: idx,
          enabled: i.enabled,
          dineOutEnabled: i.dineOutEnabled,
          accentColor: i.accentColor || null,
        }))
      const res = await savePosDeliveryApps({ storeCode: canSearchAll && storeCode ? storeCode : undefined, items: payload })
      if (res.success) {
        alert(t('itemsAlertSaved') || '저장되었습니다.')
        loadData()
      } else {
        alert(res.message || t('msg_save_fail_detail'))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {canSearchAll && (
          <Select value={storeCode || '__global__'} onValueChange={(v) => setStoreCode(v === '__global__' ? '' : v)}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue placeholder={t('store') || '매장'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__global__">{t('posDeliveryAppsGlobal') || '전역'}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDisabled}
            onChange={(e) => setIncludeDisabled(e.target.checked)}
          />
          {t('posDeliveryAppsIncludeDisabled') || '비활성 포함'}
        </label>
        <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadData} disabled={loading}>
          <RotateCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          {t('posRefresh') || '새로고침'}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" />
            {t('posScreenConfigTabDelivery') || '배달앱 관리'}
          </div>
          <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
            <Plus className="h-4 w-4" />
            {t('posDeliveryAppsAdd') || '추가'}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{t('loading') || '불러오는 중...'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsOrder') || '순서'}</th>
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsCode') || '코드'}</th>
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsName') || '표시명'}</th>
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsKeywords') || '인식 키워드'}</th>
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsAccent') || '배지색'}</th>
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsEnabled') || '활성'}</th>
                  <th className="text-left p-2 font-medium">{t('posDeliveryAppsDineOut') || 'Dine out'}</th>
                  <th className="text-left p-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id || `new-${idx}`} className={cn('border-b', !it.enabled && 'opacity-60')}>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(idx, 'up')} disabled={idx === 0}>
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1}>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-8 w-24 font-mono text-xs"
                        value={it.code}
                        onChange={(e) => updateItem(idx, { code: e.target.value })}
                        placeholder="grab"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-8 w-28"
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        placeholder="Grab"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-8 min-w-[120px]"
                        value={(it.matchKeywords || []).join(', ')}
                        onChange={(e) =>
                          updateItem(
                            idx,
                            { matchKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) }
                          )
                        }
                        placeholder="grab, 그랩"
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        value={it.accentColor || 'slate'}
                        onValueChange={(v) => updateItem(idx, { accentColor: v })}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCENT_COLORS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={it.enabled}
                        onChange={(e) => updateItem(idx, { enabled: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={it.dineOutEnabled}
                        onChange={(e) => updateItem(idx, { dineOutEnabled: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="p-2">
                      <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeItem(idx)}>
                        {t('delete') || '삭제'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t('posDeliveryAppsGuide') || '인식 키워드: 주문 라벨(customerName, orderNo, memo)에 포함되면 해당 배달앱으로 인식됩니다. Dine out: 테이블 결제 시 "배달앱 결제" 옵션에 표시됩니다.'}
        </p>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? '...' : t('itemsBtnSave') || '저장'}
        </Button>
      </div>
    </div>
  )
}
