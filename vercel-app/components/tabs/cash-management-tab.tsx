'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Wallet, Search, Plus, Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { getPosPrinterSettings, useStoreList } from '@/lib/api-client'
import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { buildPosTillSlipDocumentHtml } from '@/lib/pos-till-slip-html'
import { getTillList, getPosTodaySales, translateTexts, type TillItem } from '@/lib/api-client'
import { getPettyCashOptionsWithCache } from '@/lib/offline/cash-offline'
import { getTillListWithCache } from '@/lib/offline/till-offline'
import { addTillTransactionWithOffline, deleteTillTransactionWithOffline } from '@/lib/offline/till-offline'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useOnlineStatus } from '@/lib/offline'
import { isOfficeRole } from '@/lib/permissions'
import { translateApiMessage } from '@/lib/translate-api-message'
import { OfflineBanner } from '@/components/offline-banner'
import { cn } from '@/lib/utils'
import { drawerOpenOptionFromPrinterSettings, openPosCashDrawer } from '@/lib/pos-cash-drawer'
import { isPosDemoFromQuery } from '@/lib/pos-tour/pos-demo-mode'

const tillTypeKeys: Record<string, string> = {
  deposit: 'posCashDeposit',
  withdrawal: 'posCashWithdrawal',
  sales_withdrawal: 'posSalesWithdrawal',
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** 조회 기간(start~end)에 거래일이 포함되도록 YYYY-MM-DD 범위 확장 */
function expandDateRangeForInclusiveDate(startStr: string, endStr: string, includeDate: string) {
  const lo = includeDate < startStr ? includeDate : startStr
  const hi = includeDate > endStr ? includeDate : endStr
  return { start: lo, end: hi, changed: lo !== startStr || hi !== endStr }
}

export interface CashManagementTabProps {
  /** POS용: 오프라인 시 캐시 사용 */
  offlineAware?: boolean
}

export function CashManagementTab({ offlineAware = false }: CashManagementTabProps = {}) {
  const searchParams = useSearchParams()
  const isPosDemo = isPosDemoFromQuery(searchParams)
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, formatStoreLabel } = useStoreList()
  const online = useOnlineStatus()
  const tillDepositDrawerWarnedRef = React.useRef(false)
  const canSearchAll = isOfficeRole(auth?.role || '')
  const storeCode = auth?.store || stores[0] || ''

  const [storeOptions, setStoreOptions] = React.useState<string[]>([])
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState('')
  const [listData, setListData] = React.useState<TillItem[]>([])
  const [listLoading, setListLoading] = React.useState(false)
  const [completedCash, setCompletedCash] = React.useState<number | null>(null)

  type SubTab = 'till' | 'sales_withdrawal_list'
  const [subTab, setSubTab] = React.useState<SubTab>('till')
  const [salesDateForWithdrawal, setSalesDateForWithdrawal] = React.useState(todayStr)
  const [salesWithdrawalCash, setSalesWithdrawalCash] = React.useState<number | null>(null)
  const [salesWithdrawalAmount, setSalesWithdrawalAmount] = React.useState('')
  const [salesWithdrawalMemo, setSalesWithdrawalMemo] = React.useState('')
  const [salesWithdrawalSaving, setSalesWithdrawalSaving] = React.useState(false)
  const [salesWithdrawalList, setSalesWithdrawalList] = React.useState<TillItem[]>([])
  const [salesWithdrawalListLoading, setSalesWithdrawalListLoading] = React.useState(false)
  const [tillDeleteId, setTillDeleteId] = React.useState<number | null>(null)

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

  const printTillReceipt = React.useCallback(
    async (args: {
      storeCode: string
      transType: 'deposit' | 'withdrawal' | 'sales_withdrawal'
      amountBaht: number
      memo?: string
      transDate: string
      salesDate?: string
      transactionId?: number
      queued: boolean
    }) => {
      if (isPosDemo || typeof window === 'undefined') return
      const storeLabel = formatStoreLabel(args.storeCode)
      const typeKey = tillTypeKeys[args.transType]
      const typeLabel =
        typeKey && t(typeKey) !== typeKey ? t(typeKey) : args.transType
      const fullHtml = buildPosTillSlipDocumentHtml({
        t,
        lang,
        storeLabel,
        typeLabel,
        transType: args.transType,
        amountBaht: args.amountBaht,
        memo: args.memo,
        staffName: auth?.user,
        transDate: args.transDate,
        salesDate: args.salesDate,
        transactionId: args.transactionId,
        queued: args.queued,
        printedAt: new Date(),
      })
      const hw = await getPosPrinterSettings({ storeCode: args.storeCode }).catch(() => null)
      printPosHtmlDocument(fullHtml, {
        title: t('posTillSlipTitle'),
        printDelayMs: 0,
        focusIframeBeforePrint: false,
        printRole: 'receipt',
        printReceiptKind: 'payment',
        escPosCutOverride: resolveEscPosCutOverride(hw, {
          printRole: 'receipt',
          printReceiptKind: 'payment',
        }),
      })
    },
    [isPosDemo, t, lang, formatStoreLabel, auth?.user]
  )

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
      await appAlert(t('msg_store_name_first'))
      return
    }
    const amt = parseFloat(addAmount.replace(/,/g, ''))
    if (Number.isNaN(amt) || amt <= 0) {
      await appAlert(t('pettyAlertAmount') || '금액을 입력해 주세요.')
      return
    }
    setAddSaving(true)
    try {
      if (addType === 'deposit' && !isPosDemo) {
        const hw = await getPosPrinterSettings({ storeCode: addStore }).catch(() => null)
        const drawerOpenOption = drawerOpenOptionFromPrinterSettings(hw)
        const dr = await openPosCashDrawer({
          reason: 'till_deposit',
          source: 'till_deposit',
          storeCode: addStore,
          userName: auth?.user,
          drawerOpenOption,
        })
        if (!dr.success && !tillDepositDrawerWarnedRef.current) {
          tillDepositDrawerWarnedRef.current = true
          await appAlert(
            t('posDrawerOpenBridgeFail') ||
              '돈통 열기를 시도했지만 로컬 브리지 연결에 실패했습니다. POS PC의 로컬 드로어 브리지 실행 상태를 확인해 주세요.'
          )
        }
      }
      const res = await addTillTransactionWithOffline({
        storeCode: addStore,
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
        const { start, end, changed } = expandDateRangeForInclusiveDate(startStr, endStr, addDate)
        if (changed) {
          setStartStr(start)
          setEndStr(end)
        } else {
          void loadList()
        }
        const queued = Boolean(res.queued)
        void printTillReceipt({
          storeCode: addStore,
          transType: addType,
          amountBaht: amt,
          memo: addMemo.trim() || undefined,
          transDate: addDate,
          transactionId: res.transactionId,
          queued: queued || !online,
        })
        await appAlert(
          queued || !online
            ? t('offlineBannerAdminSaved')
            : translateApiMessage(res.message, t) || t('msg_saved')
        )
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t('msg_save_fail'))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setAddSaving(false)
    }
  }

  const loadSalesWithdrawalCash = React.useCallback(() => {
    if (!effectiveStore || (offlineAware && !online)) return
    getPosTodaySales({
      storeCode: effectiveStore,
      startStr: salesDateForWithdrawal,
      endStr: salesDateForWithdrawal,
    })
      .then((r) => setSalesWithdrawalCash(r.completedCash ?? 0))
      .catch(() => setSalesWithdrawalCash(null))
  }, [effectiveStore, salesDateForWithdrawal, offlineAware, online])

  React.useEffect(() => {
    if (salesDateForWithdrawal) loadSalesWithdrawalCash()
  }, [salesDateForWithdrawal, loadSalesWithdrawalCash])

  const loadSalesWithdrawalList = React.useCallback((): Promise<void> => {
    if (!effectiveStore) return Promise.resolve()
    setSalesWithdrawalListLoading(true)
    const start = new Date()
    start.setDate(start.getDate() - 90)
    const rangeStart = start.toISOString().slice(0, 10)
    const rangeEnd = todayStr()
    const fetcher = offlineAware ? getTillListWithCache : getTillList
    return fetcher({
      startStr: rangeStart,
      endStr: rangeEnd,
      storeFilter: effectiveStore,
      userStore: auth?.store,
      userRole: auth?.role,
      typeFilter: 'sales_withdrawal_only',
    })
      .then(setSalesWithdrawalList)
      .catch(() => setSalesWithdrawalList([]))
      .finally(() => setSalesWithdrawalListLoading(false))
      .then(() => undefined)
  }, [effectiveStore, auth?.store, auth?.role, offlineAware])

  React.useEffect(() => {
    if (subTab === 'sales_withdrawal_list') loadSalesWithdrawalList()
  }, [subTab, loadSalesWithdrawalList])

  const handleSalesWithdrawalAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addStore) {
      await appAlert(t('msg_store_name_first'))
      return
    }
    const trimmed = salesWithdrawalAmount.trim()
    let amt: number
    if (trimmed) {
      amt = parseFloat(trimmed.replace(/,/g, ''))
    } else if (salesWithdrawalCash != null && salesWithdrawalCash > 0) {
      amt = salesWithdrawalCash
    } else {
      await appAlert(t('pettyAlertAmount') || '금액을 입력해 주세요.')
      return
    }
    if (Number.isNaN(amt) || amt <= 0) {
      await appAlert(t('pettyAlertAmount') || '금액을 입력해 주세요.')
      return
    }
    setSalesWithdrawalSaving(true)
    try {
      const res = await addTillTransactionWithOffline({
        storeCode: addStore,
        transDate: todayStr(),
        transType: 'sales_withdrawal',
        amount: amt,
        memo: salesWithdrawalMemo.trim() || undefined,
        userName: auth?.user,
        userStore: auth?.store,
        userRole: auth?.role,
        salesDate: salesDateForWithdrawal,
      })
      if (res.success) {
        setSalesWithdrawalAmount('')
        setSalesWithdrawalMemo('')
        const transDay = todayStr()
        const { start, end, changed } = expandDateRangeForInclusiveDate(startStr, endStr, transDay)
        if (changed) {
          setStartStr(start)
          setEndStr(end)
        } else {
          void loadList()
        }
        await loadSalesWithdrawalList()
        loadSalesWithdrawalCash()
        const queued = Boolean(res.queued)
        void printTillReceipt({
          storeCode: addStore,
          transType: 'sales_withdrawal',
          amountBaht: amt,
          memo: salesWithdrawalMemo.trim() || undefined,
          transDate: transDay,
          salesDate: salesDateForWithdrawal,
          transactionId: res.transactionId,
          queued: queued || !online,
        })
        await appAlert(
          queued || !online
            ? t('offlineBannerAdminSaved')
            : translateApiMessage(res.message, t) || t('msg_saved')
        )
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t('msg_save_fail'))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSalesWithdrawalSaving(false)
    }
  }

  const handleDeleteSalesWithdrawal = async (r: TillItem) => {
    const ok = await appConfirm(
      t('posTillDeleteSalesWithdrawalConfirm') ||
        'Delete this sales withdrawal? Till cash movement totals will be updated.'
    )
    if (!ok) return
    setTillDeleteId(r.id)
    try {
      const res = await deleteTillTransactionWithOffline({ id: r.id })
      if (res.success) {
        void loadList()
        void loadSalesWithdrawalList()
        loadSalesWithdrawalCash()
        const queued = Boolean(res.queued)
        await appAlert(
          queued || !online
            ? t('offlineBannerAdminSaved')
            : translateApiMessage(res.message, t) || t('pettyDeleted')
        )
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t('msg_save_fail'))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTillDeleteId(null)
    }
  }

  const fmt = (n: number) => (n ?? 0).toLocaleString()

  const singleDayRange = startStr === endStr
  const ledgerEndBalance = listData.length > 0 ? listData[0].balance_after : null
  const todayTillNetMovement = listData.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  /** 하루만 볼 때: 당일 입출금 순액(전일 마감 시제와 무관). 여러 날: 기간 말 시점 누적 원장 */
  let balanceCardAmount: number | null = null
  if (!listLoading && effectiveStore) {
    if (singleDayRange) {
      balanceCardAmount = todayTillNetMovement
    } else {
      balanceCardAmount = ledgerEndBalance != null ? ledgerEndBalance : 0
    }
  }

  return (
    <div className="space-y-4" data-tour="pos-tour-cash-shell">
      <OfflineBanner
        offlineOnly={offlineAware}
        onSyncComplete={loadList}
        offlineMsg={t('posLocalOfflineNotice')}
        syncingMsg={t('posSyncing') || '동기화 중...'}
        retryLabel={t('posRetrySync') || '재시도'}
      />

      {(balanceCardAmount != null || completedCash != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-tour="pos-tour-cash-balance-cards">
          {balanceCardAmount != null && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-4 text-center">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                {singleDayRange
                  ? t('posTillDayNetMovement') || 'Net till movement (this day)'
                  : t('pettyCurrentBalance') || '현재 잔액'}
              </div>
              <div className="text-2xl font-bold tabular-nums text-primary">
                ฿{(balanceCardAmount ?? 0).toLocaleString()}
              </div>
              {singleDayRange && (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground px-1">
                  {t('posTillDayNetMovementHint') || 'Shows today’s ledger entry sum; not drawer cash from settlement.'}
                </p>
              )}
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
          <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-semibold">{t('posCashInputOutput') || '시재 입출금'}</h2>
            </div>
            <div className="flex rounded-lg border border-input bg-muted/30 p-0.5" data-tour="pos-tour-cash-subtabs">
              <button
                type="button"
                onClick={() => setSubTab('till')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  subTab === 'till' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('posCashInputOutput') || '시재 입출금'}
              </button>
              <button
                type="button"
                onClick={() => setSubTab('sales_withdrawal_list')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  subTab === 'sales_withdrawal_list' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('posSalesWithdrawalList') || '매출액 출금 내역'}
              </button>
            </div>
          </div>

          {subTab === 'sales_withdrawal_list' ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3" data-tour="pos-tour-cash-filters">
                <Button size="sm" onClick={loadSalesWithdrawalList} disabled={salesWithdrawalListLoading}>
                  <Search className="mr-1 h-4 w-4" />
                  {salesWithdrawalListLoading ? t('loading') : t('search') || '조회'}
                </Button>
              </div>
              {salesWithdrawalListLoading && (
                <div className="mb-4 flex justify-center py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
              <div
                className="overflow-auto max-h-[calc(100vh-320px)] min-h-[200px] rounded-xl border"
                data-tour="pos-tour-cash-ledger-table"
              >
                <table className="w-full min-w-[400px] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-left font-semibold">{t('pettyColDate') || '날짜'}</th>
                      {canSearchAll && (
                        <th className="px-4 py-3 text-left font-semibold">{t('store') || '매장'}</th>
                      )}
                      <th className="px-4 py-3 text-left font-semibold">{t('posSalesDateLabel') || '매출 대상일'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t('pettyColAmount') || '금액'}</th>
                      <th className="px-4 py-3 text-left font-semibold">{t('pettyColMemo') || '내용'}</th>
                      <th className="px-4 py-3 text-left font-semibold">{t('pettyColUser') || '등록자'}</th>
                      <th className="w-px px-2 py-3 text-center font-semibold sr-only">{t('delete')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesWithdrawalList.length === 0 && !salesWithdrawalListLoading ? (
                      <tr>
                        <td colSpan={canSearchAll ? 7 : 6} className="px-4 py-12 text-center text-muted-foreground">
                          {t('pettyNoData') || '데이터가 없습니다.'}
                        </td>
                      </tr>
                    ) : (
                      salesWithdrawalList.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/10">
                          <td className="px-4 py-3">{r.trans_date}</td>
                          {canSearchAll && <td className="px-4 py-3 truncate">{r.store}</td>}
                          <td className="px-4 py-3">{r.sales_date || '-'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-destructive">
                            {r.amount >= 0 ? '' : '-'}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="px-4 py-3 truncate max-w-[160px]">{getMemo(r.memo)}</td>
                          <td className="px-4 py-3 text-muted-foreground truncate">{r.user_name || '-'}</td>
                          <td className="px-2 py-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={tillDeleteId != null || salesWithdrawalListLoading}
                              title={t('delete')}
                              aria-label={t('delete')}
                              onClick={() => void handleDeleteSalesWithdrawal(r)}
                            >
                              {tillDeleteId === r.id ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent inline-block" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-tour="pos-tour-cash-filters">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
              <span className="hidden text-muted-foreground sm:inline">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
            </div>
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

          <div
            className="overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-xl border"
            data-tour="pos-tour-cash-ledger-table"
          >
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
                  <th className="w-px px-2 py-3 text-center font-semibold sr-only">{t('delete')}</th>
                </tr>
              </thead>
              <tbody>
                {listData.length === 0 && !listLoading ? (
                  <tr>
                    <td
                      colSpan={canSearchAll ? 7 : 6}
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
                      <td className="px-2 py-3 text-center">
                        {r.trans_type === 'sales_withdrawal' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={tillDeleteId != null || listLoading}
                            title={t('delete')}
                            aria-label={t('delete')}
                            onClick={() => void handleDeleteSalesWithdrawal(r)}
                          >
                            {tillDeleteId === r.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent inline-block" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t pt-6" data-tour="pos-tour-cash-add-form">
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
              <Button type="submit" disabled={addSaving} className="w-full sm:w-auto" data-tour="pos-tour-cash-add-save">
                <Plus className="mr-2 h-4 w-4" />
                {addSaving ? t('loading') : t('btnSave') || '저장'}
              </Button>
            </form>
          </div>

          <div className="mt-6 border-t pt-6" data-tour="pos-tour-cash-sales-withdrawal">
            <p className="mb-2 text-sm font-medium">{t('posSalesWithdrawal') || '매출액 출금'}</p>
            <p className="mb-3 text-xs text-muted-foreground">{t('posSalesWithdrawalHint') || '날짜를 선택하면 해당일 현금 매출액이 표시됩니다. 출금할 금액과 내용을 입력 후 등록하세요.'}</p>
            <form onSubmit={handleSalesWithdrawalAdd} className="flex flex-col gap-3 w-full">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground">{t('posSalesDateLabel') || '매출 대상일'}</label>
                  <Input
                    type="date"
                    value={salesDateForWithdrawal}
                    onChange={(e) => setSalesDateForWithdrawal(e.target.value)}
                    className="h-9 mt-1"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <div className="rounded border bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('pettyTodayCashSales') || '하루 현금 매출'}</span>
                    <span className="ml-2 font-semibold tabular-nums">฿{(salesWithdrawalCash ?? 0).toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('pettyColAmount') || '금액'}</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={salesWithdrawalAmount}
                    onChange={(e) => setSalesWithdrawalAmount(e.target.value)}
                    placeholder="0"
                    className="h-9 mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('pettyColMemo') || '내용'} ({t('optional') || '선택'})</label>
                  <Input
                    value={salesWithdrawalMemo}
                    onChange={(e) => setSalesWithdrawalMemo(e.target.value)}
                    placeholder={t('pettyMemoPh') || '메모'}
                    className="h-9 mt-1 w-full"
                  />
                </div>
              </div>
              <Button type="submit" variant="secondary" disabled={salesWithdrawalSaving} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                {salesWithdrawalSaving ? t('loading') : t('posSalesWithdrawal') || '매출액 출금'}
              </Button>
            </form>
          </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
