'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { appAlert } from '@/lib/app-message'
import {
  getPosChannelSettlementGross,
  getPosChannelSettlements,
  importPosChannelSettlements,
  savePosChannelSettlement,
  type PosChannelSettlementChannel,
  type PosChannelSettlementRow,
} from '@/lib/api-client'
import { parseChannelSettlementCsv } from '@/lib/parse-channel-settlement-csv'
import { deriveFeeFromGrossNet, roundSettlementMoney } from '@/lib/pos-channel-settlement'
import { cn } from '@/lib/utils'

const CHANNELS: { id: PosChannelSettlementChannel; labelKey: string; fallback: string }[] = [
  { id: 'card', labelKey: 'posChannelSettleCard', fallback: '카드' },
  { id: 'grab', labelKey: 'posChannelSettleGrab', fallback: 'Grab' },
  { id: 'lineman', labelKey: 'posChannelSettleLineman', fallback: 'LINE MAN' },
  { id: 'shopee', labelKey: 'posChannelSettleShopee', fallback: 'Shopee' },
]

function formatBaht(n: number): string {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export type PosChannelSettlementPanelProps = {
  t: (key: string) => string
  storeCode: string
  settleDate: string
  className?: string
  /** 통장 입금 행에서 열 때 NET 프리필 */
  initialNet?: number
  /** 정산 저장 시 연결할 통장 거래 ID */
  bankTransactionId?: number
  /** 다이얼로그 등 좁은 UI에서는 CSV 일괄 숨김 */
  hideCsv?: boolean
  onPosted?: () => void
}

export function PosChannelSettlementPanel({
  t,
  storeCode,
  settleDate,
  className,
  initialNet,
  bankTransactionId,
  hideCsv = false,
  onPosted,
}: PosChannelSettlementPanelProps) {
  const [channel, setChannel] = React.useState<PosChannelSettlementChannel>('card')
  const [gross, setGross] = React.useState(0)
  const [net, setNet] = React.useState('')
  const [fee, setFee] = React.useState('')
  const [memo, setMemo] = React.useState('')
  const [loadingGross, setLoadingGross] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [posted, setPosted] = React.useState<PosChannelSettlementRow[]>([])
  const [suggestedFee, setSuggestedFee] = React.useState<number | null>(null)
  const [platformFeePct, setPlatformFeePct] = React.useState<number | null>(null)
  const [feeSourceKey, setFeeSourceKey] = React.useState<string | null>(null)
  const [csvImporting, setCsvImporting] = React.useState(false)
  const csvInputRef = React.useRef<HTMLInputElement>(null)

  const loadGross = React.useCallback(async () => {
    if (!storeCode || !settleDate) return
    setLoadingGross(true)
    try {
      const res = await getPosChannelSettlementGross({ storeCode, settleDate, channel })
      if (res.success) {
        const g = roundSettlementMoney(Number(res.gross) || 0)
        setGross(g)
        setSuggestedFee(res.suggestedFee != null ? roundSettlementMoney(res.suggestedFee) : null)
        setPlatformFeePct(
          res.platformFeePct != null && Number.isFinite(Number(res.platformFeePct))
            ? Number(res.platformFeePct)
            : null
        )
        setFeeSourceKey(res.suggestedFeeSource ?? null)
      }
    } catch (e) {
      console.error('loadGross:', e)
    } finally {
      setLoadingGross(false)
    }
  }, [storeCode, settleDate, channel])

  const loadPosted = React.useCallback(async () => {
    if (!storeCode || !settleDate) return
    try {
      const res = await getPosChannelSettlements({ storeCode, settleDate })
      if (res.success && res.settlements) {
        setPosted(res.settlements)
      }
    } catch (e) {
      console.error('loadPosted:', e)
    }
  }, [storeCode, settleDate])

  React.useEffect(() => {
    void loadGross()
    void loadPosted()
  }, [loadGross, loadPosted])

  React.useEffect(() => {
    if (initialNet != null && initialNet > 0) return
    setNet('')
    setFee('')
    setSuggestedFee(null)
    setPlatformFeePct(null)
    setFeeSourceKey(null)
  }, [channel, settleDate, storeCode, initialNet])

  React.useEffect(() => {
    if (initialNet == null || initialNet <= 0) return
    const netNum = roundSettlementMoney(initialNet)
    setNet(String(netNum))
  }, [initialNet])

  React.useEffect(() => {
    if (initialNet == null || initialNet <= 0 || gross <= 0) return
    const netNum = roundSettlementMoney(initialNet)
    const feeNum = deriveFeeFromGrossNet(gross, netNum)
    setFee(feeNum > 0 ? String(feeNum) : '')
  }, [initialNet, gross])

  const onNetChange = (raw: string) => {
    setNet(raw)
    const netNum = roundSettlementMoney(Number(raw) || 0)
    const feeNum = deriveFeeFromGrossNet(gross, netNum)
    setFee(feeNum > 0 ? String(feeNum) : '')
  }

  const onFeeChange = (raw: string) => {
    setFee(raw)
    const feeNum = roundSettlementMoney(Number(raw) || 0)
    const netNum = roundSettlementMoney(Math.max(0, gross - feeNum))
    setNet(netNum > 0 ? String(netNum) : '')
  }

  const applySuggestedFee = () => {
    if (suggestedFee == null) return
    setFee(String(suggestedFee))
    setNet(String(roundSettlementMoney(Math.max(0, gross - suggestedFee))))
  }

  const handlePost = async (repost = false) => {
    const netNum = roundSettlementMoney(Number(net) || 0)
    const feeNum =
      fee.trim() !== '' ? roundSettlementMoney(Number(fee) || 0) : deriveFeeFromGrossNet(gross, netNum)
    if (gross <= 0) {
      await appAlert(t('posChannelSettleNoGross') || 'POS 채권(GROSS)이 없습니다.')
      return
    }
    if (Math.abs(gross - feeNum - netNum) > 0.02) {
      await appAlert(t('posChannelSettleMismatch') || 'GROSS = 수수료 + NET 이어야 합니다.')
      return
    }
    setSaving(true)
    try {
      const res = await savePosChannelSettlement({
        storeCode,
        settleDate,
        channel,
        gross,
        net: netNum,
        fee: feeNum,
        feeSource:
          suggestedFee != null && Math.abs(feeNum - suggestedFee) < 0.02
            ? feeSourceKey || 'platform_policy_pct'
            : 'manual',
        memo: memo.trim() || undefined,
        bankTransactionId:
          bankTransactionId != null && bankTransactionId > 0 ? bankTransactionId : undefined,
        repost,
      })
      if (res.success) {
        await appAlert(
          res.alreadyPosted
            ? t('posChannelSettleAlreadyPosted') || '이미 동일 금액으로 분개되어 있습니다.'
            : t('posChannelSettlePosted') || '채널 정산 분개가 생성되었습니다.'
        )
        void loadPosted()
        onPosted?.()
      } else {
        await appAlert(res.message || t('msg_save_fail') || '저장 실패')
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const existing = posted.find((p) => p.channel === channel)

  const handleCsvFile = async (file: File | null) => {
    if (!file || !storeCode || !settleDate) return
    setCsvImporting(true)
    try {
      const text = await file.text()
      const parsed = parseChannelSettlementCsv(text, { storeCode, settleDate })
      if (!parsed.rows.length) {
        const errHint =
          parsed.errors.length > 0
            ? `\n${parsed.errors.slice(0, 5).join('\n')}`
            : ''
        await appAlert((t('posChannelSettleCsvNoRows') || '인식된 행이 없습니다.') + errHint)
        return
      }
      const res = await importPosChannelSettlements({
        rows: parsed.rows.map((r) => ({
          storeCode: r.storeCode,
          settleDate: r.settleDate,
          channel: r.channel,
          gross: r.gross,
          net: r.net,
          fee: r.fee,
          memo: r.memo,
          feeSource: 'csv_import',
        })),
      })
      const n = res.processed ?? 0
      const f = res.failed ?? 0
      const tpl = t('posChannelSettleCsvDone') || '{n}건 분개 완료, {f}건 실패'
      let msg = tpl.replace('{n}', String(n)).replace('{f}', String(f))
      if (parsed.errors.length) {
        msg += `\n${t('posChannelSettleCsvParseErrors') || '파싱 경고'}: ${parsed.errors.slice(0, 3).join(', ')}`
      }
      await appAlert(msg)
      void loadPosted()
      void loadGross()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setCsvImporting(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  if (!storeCode) return null

  return (
    <div
      className={cn('rounded-lg border border-dashed border-primary/30 bg-muted/20 p-4 space-y-3', className)}
      data-tour="pos-channel-settlement"
    >
      <div>
        <p className="text-sm font-semibold">{t('posChannelSettleTitle') || '채널 정산 (회계)'}</p>
        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
          {t('posChannelSettleHint') ||
            '배달: 플랫폼(Grab/LINE 등)이 매출 GROSS에서 수수료를 빼고 익일 NET을 입금합니다(본사 PO 배달 GP와 별도).\nGROSS(1130)=POS 결제 합계, NET=통장 실입금, FEE=GROSS−NET. 통장 입금 분류는 「매출 수령」만.'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <Link
            href={`/admin/pos-menus?tab=deliveryOps`}
            className="text-primary underline underline-offset-2"
          >
            {t('posChannelSettleGpPlatformLink') || '플랫폼 정산 % (배달앱 운영)'}
          </Link>
          <Link
            href="/admin/accounting/purchase-order?tab=billing_settings"
            className="text-primary underline underline-offset-2"
          >
            {t('posChannelSettleGpPoLink') || '본사 PO 배달 GP % (청구 비율)'}
          </Link>
        </p>
        {bankTransactionId != null && bankTransactionId > 0 ? (
          <p className="text-[11px] text-sky-700 dark:text-sky-400 mt-1">
            {t('posChannelSettleBankLinkedHint') ||
              `통장 입금 #${bankTransactionId}과 연결됩니다. 분개 생성 시 자동 연결.`}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 min-w-[8rem]">
          <label className="text-xs text-muted-foreground">{t('posChannelSettleChannel') || '채널'}</label>
          <Select value={channel} onValueChange={(v) => setChannel(v as PosChannelSettlementChannel)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {t(c.labelKey) || c.fallback}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void loadGross()} disabled={loadingGross}>
          {loadingGross ? '...' : t('posChannelSettleRefreshGross') || 'POS GROSS 불러오기'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <div className="rounded-md bg-background/80 px-3 py-2 border">
          <span className="text-muted-foreground text-xs">GROSS (1130)</span>
          <p className="font-bold tabular-nums">{formatBaht(gross)} ฿</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('posChannelSettleFee') || '수수료'}</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            className="h-9 tabular-nums"
            value={fee}
            onChange={(e) => onFeeChange(e.target.value)}
          />
          {suggestedFee != null && channel !== 'card' ? (
            <button
              type="button"
              className="text-[11px] text-primary underline text-left"
              onClick={applySuggestedFee}
            >
              {t('posChannelSettleUsePlatformFee') || '플랫폼 수수료(예상)'}: {formatBaht(suggestedFee)} ฿
              {platformFeePct != null
                ? ` (${platformFeePct}%${feeSourceKey === 'platform_default' ? ` · ${t('posChannelSettleFeeDefault') || '기본'}` : ''})`
                : ''}
            </button>
          ) : channel === 'card' ? (
            <p className="text-[11px] text-muted-foreground">
              {t('posChannelSettleCardFeeHint') || '카드: NET은 PG/카드사 입금액. FEE=GROSS−NET.'}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">NET ({t('posChannelSettleBank') || '통장 입금'})</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            className="h-9 tabular-nums"
            value={net}
            onChange={(e) => onNetChange(e.target.value)}
          />
        </div>
      </div>

      <Input
        placeholder={t('posChannelSettleMemo') || '메모 (선택)'}
        className="h-9 text-sm"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void handlePost(false)} disabled={saving || !!existing?.journalEntryId}>
          {saving ? '...' : t('posChannelSettlePostJournal') || '정산 분개 생성'}
        </Button>
        {existing?.journalEntryId ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void handlePost(true)} disabled={saving}>
            {t('posChannelSettleRepost') || '재분개'}
          </Button>
        ) : null}
      </div>

      {existing ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {t('posChannelSettleExisting') || '등록됨'}: GROSS {formatBaht(existing.gross)} / FEE {formatBaht(existing.fee)}{' '}
          / NET {formatBaht(existing.net)}
          {existing.journalEntryId ? ` · JE#${existing.journalEntryId}` : ''}
        </p>
      ) : null}

      {posted.length > 1 ? (
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {posted
            .filter((p) => p.channel !== channel)
            .map((p) => (
              <li key={p.channel}>
                {p.channel}: {formatBaht(p.net)} ฿ NET
                {p.journalEntryId ? ' ✓' : ''}
              </li>
            ))}
        </ul>
      ) : null}

      {!hideCsv ? (
        <div className="border-t border-dashed pt-3 space-y-2">
          <p className="text-xs font-semibold">{t('posChannelSettleCsvTitle') || '정산서 CSV 일괄'}</p>
          <p className="text-[11px] text-muted-foreground whitespace-pre-line">
            {t('posChannelSettleCsvHint') ||
              '열: settle_date, channel, gross, net, fee(선택). 매장·날짜는 화면 선택값이 기본.'}
          </p>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            onChange={(e) => void handleCsvFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={csvImporting}
            onClick={() => csvInputRef.current?.click()}
          >
            {csvImporting ? '...' : t('posChannelSettleCsvImport') || 'CSV 가져와 분개'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
