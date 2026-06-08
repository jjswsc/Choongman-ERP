'use client'
import { appAlert } from "@/lib/app-message"

import * as React from 'react'
import { ChevronDown, ChevronUp, Plus, RotateCw, Save, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { localizeApiMessage } from '@/lib/translate-api-message'
import {
  getPosDeliveryApps,
  getGrabStoreIntegrations,
  savePosDeliveryApps,
  useStoreList,
  type GrabStoreIntegrationSnapshot,
  type PosDeliveryApp,
} from '@/lib/api-client'
import { isOfficeRole } from '@/lib/permissions'
import { parseGrabMenuNotificationMerchantBulkInput } from '@/lib/grab-menu-notification-input-parse'
import { cn } from '@/lib/utils'
import { PosScreenConfigActionBar, PosScreenConfigEmeraldSaveButton } from '@/components/pos/pos-screen-config-action-bar'
import { PosScreenConfigCopyInline } from '@/components/pos/pos-screen-config-copy-blocks'

const ACCENT_COLORS = ['lime', 'sky', 'amber', 'slate'] as const

export function PosDeliveryAppsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [items, setItems] = React.useState<PosDeliveryApp[]>([])
  const [includeDisabled, setIncludeDisabled] = React.useState(true)
  const [grabLoading, setGrabLoading] = React.useState(false)
  const [grabActionLoading, setGrabActionLoading] = React.useState(false)
  const [grabIntegrations, setGrabIntegrations] = React.useState<GrabStoreIntegrationSnapshot[]>([])
  const [selectedGrabMerchantID, setSelectedGrabMerchantID] = React.useState('')
  /** 비우면 드롭다운 선택 매장만 메뉴 갱신; 채우면 쉼표·줄바꿈 등으로 여러 merchant ID 일괄 갱신 */
  const [grabMenuNotificationBulk, setGrabMenuNotificationBulk] = React.useState('')
  const [grabLastActionLog, setGrabLastActionLog] = React.useState<{
    action: 'status' | 'menu_refresh'
    ok: boolean
    message: string
    at: string
  } | null>(null)

  const canSearchAll = isOfficeRole(auth?.role || '')

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

  const loadGrabIntegrations = React.useCallback(async () => {
    setGrabLoading(true)
    try {
      const rows = await getGrabStoreIntegrations({ status: 'ACTIVE', limit: 200 })
      const deduped = Array.from(
        new Map(rows.map((r) => [String(r.grabMerchantID || '').trim(), r])).values()
      ).filter((r) => String(r.grabMerchantID || '').trim())
      setGrabIntegrations(deduped)
      if (!selectedGrabMerchantID && deduped[0]?.grabMerchantID) {
        setSelectedGrabMerchantID(String(deduped[0].grabMerchantID))
      } else if (
        selectedGrabMerchantID &&
        !deduped.some((r) => String(r.grabMerchantID || '').trim() === selectedGrabMerchantID)
      ) {
        setSelectedGrabMerchantID(String(deduped[0]?.grabMerchantID || ''))
      }
    } catch {
      setGrabIntegrations([])
    } finally {
      setGrabLoading(false)
    }
  }, [selectedGrabMerchantID])

  React.useEffect(() => {
    void loadGrabIntegrations()
  }, [loadGrabIntegrations])

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
        await appAlert(tr('itemsAlertSaved', '저장되었습니다.'))
        loadData()
      } else {
        await appAlert(localizeApiMessage(res.message, t, t('msg_save_fail_detail'), lang))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      return v && v !== key ? v : fallback
    },
    [t]
  )
  const getAccentColorLabel = React.useCallback(
    (color: (typeof ACCENT_COLORS)[number]) => {
      switch (color) {
        case 'lime':
          return tr('posDeliveryAppsAccentLimeGrab', '라임 (Grab)')
        case 'sky':
          return tr('posDeliveryAppsAccentSkyLineMan', '스카이 (Line Man)')
        case 'amber':
          return tr('posDeliveryAppsAccentAmberShopee', '앰버 (Shopee)')
        case 'slate':
        default:
          return tr('posDeliveryAppsAccentSlateEtc', '슬레이트 (기타)')
      }
    },
    [tr]
  )
  const deliveryCopyTarget = canSearchAll ? (storeCode?.trim() || '') : String(auth?.store || '').trim()
  const showStoreCopy =
    Boolean(deliveryCopyTarget) && stores.filter((s) => s && s !== deliveryCopyTarget).length > 0
  const selectedGrabIntegration = React.useMemo(
    () =>
      grabIntegrations.find(
        (r) => String(r.grabMerchantID || '').trim() === String(selectedGrabMerchantID || '').trim()
      ) || null,
    [grabIntegrations, selectedGrabMerchantID]
  )

  const handleGrabStoreStatus = React.useCallback(async () => {
    const merchantID = String(selectedGrabMerchantID || '').trim()
    if (!merchantID) {
      await appAlert(tr('posDeliveryGrabMerchantRequired', 'Grab 매장을 먼저 선택해 주세요.'))
      return
    }
    setGrabActionLoading(true)
    try {
      const res = await fetch(`/api/grab/getStoreStatus?merchantID=${encodeURIComponent(merchantID)}`, {
        method: 'GET',
      })
      const json = (await res.json()) as { success?: boolean; data?: { isOpen?: boolean; closeReason?: string }; message?: string }
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || `HTTP ${res.status}`)
      }
      const isOpen = Boolean(json?.data?.isOpen)
      const closeReason = String(json?.data?.closeReason || '').trim()
      setGrabLastActionLog({
        action: 'status',
        ok: true,
        message: isOpen
          ? tr('posDeliveryGrabStatusOpen', 'Grab 매장 상태: 영업 중')
          : `${tr('posDeliveryGrabStatusClosed', 'Grab 매장 상태: 휴점')}${closeReason ? ` (${closeReason})` : ''}`,
        at: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', hour12: false }),
      })
      await appAlert(
        isOpen
          ? tr('posDeliveryGrabStatusOpen', 'Grab 매장 상태: 영업 중')
          : `${tr('posDeliveryGrabStatusClosed', 'Grab 매장 상태: 휴점')}${closeReason ? ` (${closeReason})` : ''}`
      )
    } catch (e) {
      setGrabLastActionLog({
        action: 'status',
        ok: false,
        message: String(e),
        at: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', hour12: false }),
      })
      await appAlert(String(e))
    } finally {
      setGrabActionLoading(false)
    }
  }, [selectedGrabMerchantID, tr])

  const handleGrabMenuRefresh = React.useCallback(async () => {
    const bulkIds = parseGrabMenuNotificationMerchantBulkInput(grabMenuNotificationBulk)
    const fallbackId = String(selectedGrabMerchantID || '').trim()
    const merchantIDs =
      bulkIds.length > 0 ? bulkIds : fallbackId ? [fallbackId] : []
    if (merchantIDs.length === 0) {
      await appAlert(tr('posDeliveryGrabMerchantRequired', 'Grab 매장을 먼저 선택해 주세요.'))
      return
    }
    setGrabActionLoading(true)
    try {
      const res = await fetch('/api/grab/updateMenuNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:
          merchantIDs.length === 1
            ? JSON.stringify({ merchantID: merchantIDs[0] })
            : JSON.stringify({ merchantIDs }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        notifiedMerchantIDs?: string[]
      }
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || `HTTP ${res.status}`)
      }
      const n = Array.isArray(json.notifiedMerchantIDs) ? json.notifiedMerchantIDs.length : merchantIDs.length
      const okMsg =
        n > 1
          ? (tr('posDeliveryGrabMenuRefreshRequestedMany', 'Grab 메뉴 갱신 요청 {{n}}건을 보냈습니다.').replace(
              '{{n}}',
              String(n)
            ) || `Grab 메뉴 갱신 요청 ${n}건을 보냈습니다.`)
          : tr('posDeliveryGrabMenuRefreshRequested', 'Grab 메뉴 갱신 요청을 보냈습니다.')
      setGrabLastActionLog({
        action: 'menu_refresh',
        ok: true,
        message: okMsg,
        at: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', hour12: false }),
      })
      await appAlert(okMsg)
    } catch (e) {
      setGrabLastActionLog({
        action: 'menu_refresh',
        ok: false,
        message: String(e),
        at: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok', hour12: false }),
      })
      await appAlert(String(e))
    } finally {
      setGrabActionLoading(false)
    }
  }, [grabMenuNotificationBulk, selectedGrabMerchantID, tr])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PosScreenConfigActionBar
          left={
            <>
              {canSearchAll && (
                <Select value={storeCode || '__global__'} onValueChange={(v) => setStoreCode(v === '__global__' ? '' : v)}>
                  <SelectTrigger className="h-10 w-40">
                    <SelectValue placeholder={tr('store', '매장')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__global__">{tr('posDeliveryAppsGlobal', '전역')}</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadData} disabled={loading}>
                <RotateCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                {tr('posRefresh', '새로고침')}
              </Button>
              <label className="flex items-center gap-2 text-sm shrink-0">
                <input
                  type="checkbox"
                  checked={includeDisabled}
                  onChange={(e) => setIncludeDisabled(e.target.checked)}
                />
                {tr('posDeliveryAppsIncludeDisabled', '비활성 포함')}
              </label>
              {showStoreCopy ? (
                <PosScreenConfigCopyInline
                  variant="delivery"
                  targetStoreCode={deliveryCopyTarget}
                  stores={stores}
                  tr={tr}
                  onCopySuccess={() => void loadData()}
                />
              ) : null}
            </>
          }
          right={
            <PosScreenConfigEmeraldSaveButton onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? '...' : tr('itemsBtnSave', '저장')}
            </PosScreenConfigEmeraldSaveButton>
          }
        />
        {canSearchAll && !storeCode?.trim() ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tr(
              'posDeliveryGlobalRowHint',
              '전역 배달앱 목록을 편집 중입니다. 매장별로 다른 매장에서 복사하려면 위에서 매장을 먼저 선택하세요.'
            )}
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tr(
              'posScreenConfigStoreRowHint',
              '선택한 매장에만 저장됩니다. 다른 매장과 동일하게 맞추려면 원본 매장을 고른 뒤 복사를 누르세요.'
            )}
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {tr('posDeliveryGrabOpsTitle', 'Grab 운영')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => void loadGrabIntegrations()}
            disabled={grabLoading || grabActionLoading}
          >
            <RotateCw className={cn('h-4 w-4', grabLoading && 'animate-spin')} />
            {tr('posRefresh', '새로고침')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedGrabMerchantID || '__none__'} onValueChange={(v) => setSelectedGrabMerchantID(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-9 w-[240px]">
              <SelectValue placeholder={tr('posDeliveryGrabMerchantSelect', 'Grab 매장 선택')} />
            </SelectTrigger>
            <SelectContent>
              {grabIntegrations.length === 0 ? (
                <SelectItem value="__none__">{tr('posDeliveryGrabMerchantEmpty', '연동된 Grab 매장 없음')}</SelectItem>
              ) : (
                grabIntegrations.map((row) => {
                  const merchantID = String(row.grabMerchantID || '').trim()
                  const partnerID = String(row.partnerMerchantID || '').trim()
                  return (
                    <SelectItem key={merchantID} value={merchantID}>
                      {partnerID ? `${merchantID} (파트너 ${partnerID})` : merchantID}
                    </SelectItem>
                  )
                })
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void handleGrabStoreStatus()}
            disabled={grabActionLoading || !selectedGrabMerchantID}
          >
            {tr('posDeliveryGrabCheckStoreStatus', '상태 확인')}
          </Button>
          <Button
            size="sm"
            className="h-9"
            onClick={() => void handleGrabMenuRefresh()}
            disabled={
              grabActionLoading ||
              (parseGrabMenuNotificationMerchantBulkInput(grabMenuNotificationBulk).length === 0 &&
                !String(selectedGrabMerchantID || '').trim())
            }
          >
            {tr('posDeliveryGrabMenuRefresh', '메뉴 갱신 요청')}
          </Button>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground" htmlFor="grab-menu-notification-bulk">
            {tr('posDeliveryGrabMenuRefreshBulkLabel', '메뉴 갱신 대상 (여러 개 붙여넣기)')}
          </label>
          <Textarea
            id="grab-menu-notification-bulk"
            value={grabMenuNotificationBulk}
            onChange={(e) => setGrabMenuNotificationBulk(e.target.value)}
            placeholder={tr(
              'posDeliveryGrabMenuRefreshBulkPlaceholder',
              'GFSBPOS-204-253, GFSBPOS-533-636, GFSBPOS-811-087'
            )}
            rows={3}
            className="min-h-[4.5rem] resize-y font-mono text-xs"
            disabled={grabActionLoading}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tr(
              'posDeliveryGrabMenuRefreshBulkHint',
              '비우면 위에서 선택한 Grab 매장만 갱신합니다. 여러 개는 쉼표·줄바꿈·세미콜론으로 구분해 붙여 넣을 수 있습니다.'
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedGrabIntegration
            ? `${tr('posDeliveryGrabSelectedPartner', '선택 파트너 매장')}: ${selectedGrabIntegration.partnerMerchantID || '-'}`
            : tr('posDeliveryGrabOpsHint', '연동된 Grab 매장을 선택한 뒤 상태 확인 또는 메뉴 갱신 요청을 실행하세요.')}
        </p>
        {grabLastActionLog ? (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              grabLastActionLog.ok
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-red-300 bg-red-50 text-red-900'
            )}
          >
            [{grabLastActionLog.at}] {grabLastActionLog.action === 'status' ? '상태 확인' : '메뉴 갱신'} ·{' '}
            {grabLastActionLog.ok ? '성공' : '실패'} · {grabLastActionLog.message}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" />
            {tr('posScreenConfigTabDelivery', '배달앱 관리')}
          </div>
          <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
            <Plus className="h-4 w-4" />
            {tr('posDeliveryAppsAdd', '추가')}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">{tr('loading', '불러오는 중...')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsOrder', '순서')}</th>
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsCode', '코드')}</th>
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsName', '표시명')}</th>
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsKeywords', '인식 키워드')}</th>
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsAccent', '배지색')}</th>
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsEnabled', '활성')}</th>
                  <th className="text-left p-2 font-medium">{tr('posDeliveryAppsDineOut', '매장결제 노출')}</th>
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
                        placeholder={tr('posDeliveryAppsCodePlaceholder', '예: grab')}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-8 w-28"
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        placeholder={tr('posDeliveryAppsNamePlaceholder', '예: Grab')}
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
                        placeholder={tr('posDeliveryAppsKeywordsPlaceholder', '예: grab, 그랩')}
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
                          {ACCENT_COLORS.map((color) => (
                            <SelectItem key={color} value={color}>
                              {getAccentColorLabel(color)}
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
                        {tr('delete', '삭제')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {tr('posDeliveryAppsGuide', '인식 키워드: 주문 라벨(customerName, orderNo, memo)에 포함되면 해당 배달앱으로 인식됩니다. 매장결제 노출: 테이블 결제 시 "배달앱 결제" 옵션에 표시됩니다.')}
        </p>
      </div>

    </div>
  )
}
