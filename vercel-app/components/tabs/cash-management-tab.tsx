'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Wallet, Search, Plus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useStoreList } from '@/lib/api-client'
import { getTillList, addTillTransaction, getPettyCashOptions, getPosTodaySales, translateTexts, type TillItem } from '@/lib/api-client'
import { getPettyCashOptionsWithCache } from '@/lib/offline/cash-offline'
import { getTillListWithCache } from '@/lib/offline/till-offline'
import { addPettyCashTransactionWithOffline } from '@/lib/offline/petty-cash-sync'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useOnlineStatus } from '@/lib/offline'
import { isOfficeRole } from '@/lib/permissions'
import { translateApiMessage } from '@/lib/translate-api-message'
import { OfflineBanner } from '@/components/offline-banner'
import { cn } from '@/lib/utils'

const tillTypeKeys: Record<string, string> = {
  deposit: 'posCashDeposit',
  withdrawal: 'posCashWithdrawal',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export interface CashManagementTabProps {
  /** POS용: 오프라인 시 캐시 사용 */
  offlineAware?: boolean
}

export function CashManagementTab({ offlineAware = false }: CashManagementTabProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const online = useOnlineStatus()
  const canSearchAll = isOfficeRole(auth?.role || '')
  const storeCode = auth?.store || stores[0] || ''

  const [storeOptions, setStoreOptions] = React.useState<string[]>([])
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState('')
  const [listData, setListData] = React.useState<TillItem[]>([])
  const [listLoading, setListLoading] = React.useState(false)
  const [completedCash, setCompletedCash] = React.useState<number | null>(null)

  const [addStore, setAddStore] = React.useState('')
  const [addType, setAddType] = React.useState<'deposit' | 'withdrawal'>('deposit')
  const [addDate, setAddDate] = React.useState(todayStr)
  const [addAmount, setAddAmount] = React.useState('')
  const [addMemo, setAddMemo] = React.useState('')
  const [addSaving, setAddSaving] = React.useState(false)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  const effectiveStore = canSearchAll ? (storeFilter || storeCode) : storeCode

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
        const list = canSearchAll
          ? (opts.stores?.length ? opts.stores : (auth?.store ? [auth.store] : stores))
          : (auth?.store ? [auth.store] : [])
        setStoreOptions(list.length ? list : (auth?.store ? [auth.store] : []))
        const first = auth?.store || list[0] || ''
        setAddStore(first)
        if (!storeFilter && canSearchAll) setStoreFilter(list[0] || '')
      })
      .catch(() => {
        const list = auth?.store ? [auth.store] : stores
        setStoreOptions(canSearchAll ? (list.length ? list : ['']) : (auth?.store ? [auth.store] : []))
        setAddStore(auth?.store || list[0] || '')
      })
  }, [auth?.store, stores, canSearchAll, offlineAware])

  const loadList = React.useCallback(() => {
    if (!effectiveStore) return
    setListLoading(true)
    const fetcher = offlineAware ? getTillListWithCache : getTillList
    const params = {
      startStr,
      endStr,
      storeFilter: effectiveStore || undefined,
      userStore: auth?.store,
      userRole: auth?.role,
    }
    fetcher(params)
      .then(setListData)
      .catch(() => setListData([]))
      .finally(() => setListLoading(false))

    // 하루 현금 매출: 조회 시 항상 함께 로드 (오프라인 시 스킵)
    if (!(offlineAware && !online)) {
      getPosTodaySales({
        storeCode: effectiveStore,
        startStr,
        endStr,
      })
        .then((r) => setCompletedCash(r.completedCash ?? 0))
        .catch(() => setCompletedCash(null))
    } else {
      setCompletedCash(null)
    }
  }, [startStr, endStr, effectiveStore, storeCode, canSearchAll, auth?.store, auth?.role, offlineAware, online])

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

      {(currentBalance != null || completedCash != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {completedCash != null && (
            <div className="rounded-xl border-2 border-muted bg-muted/30 px-6 py-4 text-center">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                {t('pettyTodayCashSales') || '하루 현금 매출'}
              </div>
              <div className="text-2xl font-bold tabular-nums">
                ฿{(completedCash ?? 0).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-semibold">{t('posCashInputOutput') || '시재 입출금'}</h2>
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
            {canSearchAll && storeOptions.length > 0 && (
              <Select
                value={storeFilter || storeOptions[0]}
                onValueChange={setStoreFilter}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder={t('store') || '매장'} />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
                  {canSearchAll && (
                    <th className="px-4 py-3 text-left font-semibold">{t('store') || '매장'}</th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColType') || '유형'}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('pettyColAmount') || '금액'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColMemo') || '내용'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('pettyColUser') || '등록자'}</th>
                </tr>
              </thead>
              <tbody>
                {listData.length === 0 && !listLoading ? (
                  <tr>
                    <td
                      colSpan={canSearchAll ? 6 : 5}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      {t('pettyNoData') || '데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  listData.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/10">
                      <td className="px-4 py-3">{r.trans_date}</td>
                      {canSearchAll && (
                        <td className="px-4 py-3 truncate">{r.store}</td>
                      )}
                      <td className="px-4 py-3">
                        {t(tillTypeKeys[r.trans_type] || r.trans_type) || r.trans_type}
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
                  <Select value={addStore} onValueChange={setAddStore} disabled={!canSearchAll}>
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue placeholder={t('msg_select_store_name')} />
                    </SelectTrigger>
                    <SelectContent>
                      {storeOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t('pettyColType') || '유형'}
                  </label>
                    <Select
                    value={addType}
                    onValueChange={(v) => setAddType(v as 'deposit' | 'withdrawal')}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">{t('posCashDeposit') || '입금'}</SelectItem>
                      <SelectItem value="withdrawal">{t('posCashWithdrawal') || '출금'}</SelectItem>
                    </SelectContent>
                  </Select>
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
