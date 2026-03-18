'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Banknote, Search, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useStoreList } from '@/lib/api-client'
import {
  getPettyCashList,
  getPettyCashOptions,
  translateTexts,
  type PettyCashItem,
} from '@/lib/api-client'
import { getPettyCashOptionsWithCache, getPettyCashListWithCache } from '@/lib/offline/cash-offline'
import { addPettyCashTransactionWithOffline } from '@/lib/offline/petty-cash-sync'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useOnlineStatus } from '@/lib/offline'
import { translateApiMessage } from '@/lib/translate-api-message'
import { OfflineBanner } from '@/components/offline-banner'
import { cn } from '@/lib/utils'

const typeKeys: Record<string, string> = {
  receive: 'pettyTypeReceive',
  expense: 'pettyTypeExpense',
  replenish: 'pettyTypeReplenish',
  settle: 'pettyTypeSettle',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/** POS용 패티캐쉬 - 매장 스코프, 시재와 별도 */
export function PosPettyCashTab({ offlineAware = false }: { offlineAware?: boolean } = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const online = useOnlineStatus()
  const storeCode = auth?.store || stores[0] || ''

  const [storeOptions, setStoreOptions] = React.useState<string[]>([])
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [listData, setListData] = React.useState<PettyCashItem[]>([])
  const [listLoading, setListLoading] = React.useState(false)

  const [addStore, setAddStore] = React.useState('')
  const [addType, setAddType] = React.useState<'receive' | 'expense' | 'replenish' | 'settle'>('receive')
  const [addDate, setAddDate] = React.useState(todayStr)
  const [addAmount, setAddAmount] = React.useState('')
  const [addMemo, setAddMemo] = React.useState('')
  const [addSaving, setAddSaving] = React.useState(false)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  const effectiveStore = storeCode

  React.useEffect(() => {
    const memos = [...new Set(listData.map((r) => (r.memo || "").trim()).filter(Boolean))]
    if (memos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(memos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        memos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => { cancelled = true }
  }, [listData, lang])

  const getMemo = React.useCallback((memo: string | undefined) => (memo && memoTransMap[memo]) || memo || "-", [memoTransMap])

  React.useEffect(() => {
    const load = offlineAware ? getPettyCashOptionsWithCache : () => import('@/lib/api-client').then((m) => m.getPettyCashOptions())
    load()
      .then((opts: { stores: string[]; officeDepartments: string[] }) => {
        const list = opts.stores?.filter((s) => s && s !== 'All') || (auth?.store ? [auth.store] : [])
        setStoreOptions(list.length ? list : auth?.store ? [auth.store] : [])
        setAddStore(auth?.store || list[0] || '')
      })
      .catch(() => {
        const list = auth?.store ? [auth.store] : []
        setStoreOptions(list)
        setAddStore(auth?.store || '')
      })
  }, [auth?.store, stores, offlineAware])

  const loadList = React.useCallback(() => {
    if (!effectiveStore) return
    setListLoading(true)
    const fetcher = offlineAware ? getPettyCashListWithCache : getPettyCashList
    fetcher({
      startStr,
      endStr,
      scopeFilter: 'store',
      storeFilter: effectiveStore,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then(setListData)
      .catch(() => setListData([]))
      .finally(() => setListLoading(false))
  }, [startStr, endStr, effectiveStore, auth?.store, auth?.role, offlineAware])

  React.useEffect(() => {
    setAddStore(effectiveStore)
  }, [effectiveStore])

  React.useEffect(() => {
    loadList()
  }, [loadList])

  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadList()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, loadList])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addStore || !addAmount.trim()) {
      alert(t('msg_store_name_first'))
      return
    }
    const amt = parseFloat(addAmount.replace(/,/g, ''))
    if (Number.isNaN(amt) || amt <= 0) {
      alert(t('pettyAlertAmount') || '금액을 입력해 주세요.')
      return
    }
    setAddSaving(true)
    try {
      const res = await addPettyCashTransactionWithOffline({
        store: addStore,
        transDate: addDate,
        transType: addType,
        amount: amt,
        memo: addMemo.trim() || undefined,
        userName: auth?.user,
        userStore: auth?.store,
        userRole: auth?.role,
      })
      if (res.success) {
        setAddAmount('')
        setAddMemo('')
        loadList()
        alert(!online ? t('posOfflineSaved') : (res.message || t('msg_saved')))
      } else {
        alert(translateApiMessage(res.message, t) || res.message || t('msg_save_fail'))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setAddSaving(false)
    }
  }

  const fmt = (n: number) => (n ?? 0).toLocaleString()

  const currentBalance = listData.length > 0 && listData[0].balance_after != null
    ? listData[0].balance_after
    : !listLoading && effectiveStore
      ? 0
      : null

  return (
    <div className="space-y-4">
      <OfflineBanner
        offlineOnly={offlineAware}
        onSyncComplete={loadList}
        offlineMsg={t('posLocalOfflineNotice')}
        syncingMsg={t('posSyncing') || '동기화 중...'}
        retryLabel={t('posRetrySync') || '재시도'}
      />

      {currentBalance != null && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-4 text-center">
          <div className="text-sm font-medium text-muted-foreground mb-1">
            {t('pettyCurrentBalance') || '현재 잔액'}
          </div>
          <div className="text-2xl font-bold tabular-nums text-primary">
            ฿{(currentBalance ?? 0).toLocaleString()}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="mb-4 flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-semibold">{t('adminPettyCash') || '패티 캐쉬'}</h2>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="h-9 w-[140px]"
            />
            <span className="text-muted-foreground">~</span>
            <Input
              type="date"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="h-9 w-[140px]"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setStartStr(todayStr)
                setEndStr(todayStr)
              }}
            >
              {t('posToday') || '오늘'}
            </Button>
            <Button size="sm" onClick={loadList} disabled={listLoading}>
              <Search className="mr-1 h-4 w-4" />
              {listLoading ? t('loading') : t('search') || '조회'}
            </Button>
          </div>

          {listLoading && (
            <div className="mb-4 flex justify-center py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          <div className="overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-xl border">
            <table className="w-full min-w-[400px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColDate') || '날짜'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColType') || '유형'}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('pettyColAmount') || '금액'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColMemo') || '내용'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColUser') || '등록자'}</th>
                </tr>
              </thead>
              <tbody>
                {listData.length === 0 && !listLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      {t('pettyNoData') || '데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  listData.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/10">
                      <td className="px-4 py-3">{r.trans_date}</td>
                      <td className="px-4 py-3">
                        {t(typeKeys[r.trans_type] || r.trans_type) || r.trans_type}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right tabular-nums',
                          r.amount < 0 ? 'text-destructive' : 'text-green-600'
                        )}
                      >
                        {r.amount >= 0 ? '' : '-'}
                        {fmt(Math.abs(r.amount))}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[160px]">
                        {getMemo(r.memo)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate">
                        {r.user_name || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t pt-6">
            <p className="mb-3 text-sm font-medium">{t('pettyAddTitle') || '등록'}</p>
            <form onSubmit={handleAdd} className="flex flex-col gap-3 w-full">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('store') || '매장'}</label>
                  <Input
                    value={addStore}
                    readOnly
                    className="h-9 mt-1 bg-muted/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t('pettyColType') || '유형'}
                  </label>
                  <select
                    value={addType}
                    onChange={(e) => setAddType(e.target.value as typeof addType)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="receive">{t('pettyTypeReceive') || '수령'}</option>
                    <option value="expense">{t('pettyTypeExpense') || '지출'}</option>
                    <option value="replenish">{t('pettyTypeReplenish') || '보충'}</option>
                    <option value="settle">{t('pettyTypeSettle') || '정산'}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t('pettyColDate') || '날짜'}
                  </label>
                  <Input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="h-9 mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t('pettyColAmount') || '금액'}
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="0"
                    className="h-9 mt-1 w-full"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">
                    {t('pettyColMemo') || '내용'} ({t('optional') || '선택'})
                  </label>
                  <Input
                    value={addMemo}
                    onChange={(e) => setAddMemo(e.target.value)}
                    placeholder={t('pettyMemoPh') || '메모'}
                    className="h-9 mt-1 w-full"
                  />
                </div>
              </div>
              <Button type="submit" disabled={addSaving} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                {addSaving ? t('loading') : t('btnSave') || '저장'}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
