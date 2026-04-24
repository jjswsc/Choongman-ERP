'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from 'react'
import { CreditCard, Save, Plus, Trash2 } from 'lucide-react'
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
  getPosPaymentMethodItems,
  savePosPaymentMethodItem,
  deletePosPaymentMethodItem,
  useStoreList,
  type PosPaymentMethodItem,
} from '@/lib/api-client'
import { isOfficeRole } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { PosScreenConfigEmeraldSaveButton } from '@/components/pos/pos-screen-config-action-bar'
import { PosScreenConfigStoreAndCopyRow } from '@/components/pos/pos-screen-config-store-and-copy-row'

function isSyntheticPaymentMethodId(id: string | undefined): boolean {
  return Boolean(id?.startsWith('syn:'))
}

const CATEGORIES = [
  { value: 'card', labelKey: 'posPaymentCategoryCard' },
  { value: 'qr', labelKey: 'posPaymentCategoryQrMobile' },
  { value: 'delivery', labelKey: 'posPaymentCategoryDeliveryApp' },
  { value: 'other', labelKey: 'posPaymentCategoryOther' },
] as const

export function PosPaymentSettingsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [items, setItems] = React.useState<PosPaymentMethodItem[]>([])
  const [categoryFilter, setCategoryFilter] = React.useState<string>('__all__')
  const [selected, setSelected] = React.useState<PosPaymentMethodItem | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editHidden, setEditHidden] = React.useState(false)
  const [editCategory, setEditCategory] = React.useState<PosPaymentMethodItem['category']>('card')

  const canSearchAll = isOfficeRole(auth?.role || '')
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ''

  const loadData = React.useCallback(async () => {
    if (!effectiveStore) return []
    setLoading(true)
    try {
      const list = await getPosPaymentMethodItems({ storeCode: effectiveStore }) || []
      setItems(list)
      if (selected && !list.some((i) => i.id === selected.id)) {
        setSelected(null)
        setEditName('')
        setEditHidden(false)
      }
      return list
    } catch {
      setItems([])
      return []
    } finally {
      setLoading(false)
    }
  }, [effectiveStore, selected?.id])

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

  React.useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditHidden(selected.hidden)
      setEditCategory(selected.category)
    } else {
      setEditName('')
      setEditHidden(false)
      setEditCategory('card')
    }
  }, [selected])

  const filteredItems = React.useMemo(() => {
    if (!categoryFilter || categoryFilter === '__all__') return items
    return items.filter((i) => i.category === categoryFilter)
  }, [items, categoryFilter])

  const handleNew = () => {
    setSelected(null)
    setEditName('')
    setEditHidden(false)
    setEditCategory('card')
  }

  const handleSave = async () => {
    const name = editName.trim()
    if (!name) {
      await appAlert(t('posPaymentMethodNameRequired') || '이름을 입력하세요.')
      return
    }
    if (!effectiveStore) return
    setSaving(true)
    try {
      const res = await savePosPaymentMethodItem({
        id: selected?.id,
        storeCode: effectiveStore,
        category: editCategory,
        name,
        hidden: editHidden,
      })
      if (res.success) {
        await appAlert(t('itemsAlertSaved') || '저장되었습니다.')
        const list = await loadData()
        if (!selected && res.id) {
          const next = list.find((i) => i.id === res.id)
          if (next) setSelected(next)
        }
      } else {
        await appAlert(res.message || t('msg_save_fail_detail'))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!await appConfirm(t('posPaymentMethodDeleteConfirm') || `"${selected.name}" 항목을 삭제하시겠습니까?`)) return
    setDeleting(true)
    try {
      const res = await deletePosPaymentMethodItem({ id: selected.id })
      if (res.success) {
        setSelected(null)
        setEditName('')
        await loadData()
      } else {
        await appAlert(res.message || t('msg_save_fail_detail'))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDeleting(false)
    }
  }

  const tr = (key: string, fallback: string) => t(key) || fallback
  const categoryLabel = React.useCallback(
    (value: string, fallback?: string) =>
      t(CATEGORIES.find((c) => c.value === value)?.labelKey || '') || fallback || value,
    [t]
  )
  const code = String(effectiveStore || '').trim()
  const showCopy = Boolean(code) && stores.filter((s) => s && s !== code).length > 0

  return (
    <div className="space-y-4">
      <PosScreenConfigStoreAndCopyRow
        canPickStore={canSearchAll}
        stores={stores}
        pickedStore={storeCode}
        onPickedStoreChange={setStoreCode}
        readOnlyStoreCode={canSearchAll ? null : auth?.store ?? null}
        effectiveStore={effectiveStore}
        showCopy={showCopy}
        copyVariant="payment"
        tr={tr}
        onRefresh={() => void loadData()}
        refreshLoading={loading}
        onCopySuccess={() => void loadData()}
        rightSlot={
          <PosScreenConfigEmeraldSaveButton onClick={handleSave} disabled={saving || !effectiveStore}>
            <Save className="h-4 w-4" />
            {saving ? '...' : t('itemsBtnSave') || '저장'}
          </PosScreenConfigEmeraldSaveButton>
        }
      />

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold mb-4">
          <CreditCard className="h-4 w-4" />
          {t('posScreenConfigTabPayment') || '결제 관리'} — {t('posPaymentSettingsManageSuffix')}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{t('loading') || '불러오는 중...'}</p>
        ) : (
          <div className="flex gap-6 flex-col sm:flex-row">
            <div className="flex-1 min-w-0 sm:max-w-xs">
              <div className="flex gap-2 mb-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue placeholder={t('posPaymentCategoryAll') || '전체'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('posPaymentCategoryAll') || '전체'}</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {categoryLabel(c.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-2 w-10">#</th>
                      <th className="text-left px-2 py-2 w-20">{t('posPaymentMethodCategory') || '분류'}</th>
                      <th className="text-left px-2 py-2">{t('name') || '이름'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          {items.length === 0 ? (
                            <span>
                              {t('posPaymentMethodListEmptyAll') ||
                                '등록된 항목이 없습니다. API/DB 오류이거나 pos_payment_method_items 테이블이 없을 수 있습니다. Supabase에서 vercel-app/scripts/pos_payment_method_items.sql 실행 후 새로고침해 보세요.'}
                            </span>
                          ) : (
                            <span>
                              {t('posPaymentMethodListEmptyCategory') ||
                                '이 분류에 해당하는 항목이 없습니다. 분류를「전체」로 바꾸거나 오른쪽에서 신규로 추가하세요.'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={cn(
                            'border-t cursor-pointer hover:bg-muted/30',
                            selected?.id === item.id && 'bg-primary/10'
                          )}
                          onClick={() => setSelected(item)}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {categoryLabel(item.category, item.category)}
                          </td>
                          <td className="px-2 py-1.5">
                            {item.name}
                            {isSyntheticPaymentMethodId(item.id) && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({t('posPaymentMethodDefaultBadge') || '기본'})
                              </span>
                            )}
                            {item.hidden && (
                              <span className="ml-1 text-xs text-muted-foreground">({t('posHidden')})</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex-1 space-y-4 min-w-0">
              <div>
                <label className="text-sm font-medium">{t('name') || '이름'}</label>
                <Input
                  className="mt-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('posPaymentMethodNamePlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('posPaymentMethodCategory') || '분류'}</label>
                <Select value={editCategory} onValueChange={(v) => setEditCategory(v as PosPaymentMethodItem['category'])}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {categoryLabel(c.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('posPaymentMethodHidden') || '숨김'}</label>
                <Select value={editHidden ? 'yes' : 'no'} onValueChange={(v) => setEditHidden(v === 'yes')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">{t('yes') || '예'}</SelectItem>
                    <SelectItem value="no">{t('no') || '아니오'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleNew} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t('posPaymentMethodNew') || '신규'}
                </Button>
                {selected && !isSyntheticPaymentMethodId(selected.id) && (
                  <Button
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? '...' : t('delete') || '삭제'}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('posPaymentSettingsGuide') ||
                  'POS 결제 화면「기타」세부(QR 분류)와 결산 카드·QR·배달앱 breakdown에 연동됩니다. (기본)은 DB에 행이 없을 때 결산과 같은 기본 목록입니다. 저장하면 매장 항목이 DB에 추가됩니다.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
