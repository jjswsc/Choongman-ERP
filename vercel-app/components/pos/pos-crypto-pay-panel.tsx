'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePosCryptoPayment } from '@/hooks/use-pos-crypto-payment'
import {
  CRYPTO_ASSET_DEFS,
  buildCryptoQrPayload,
  listUsableCryptoAssets,
  type CryptoAssetKey,
  type PosCryptoPaymentSettings,
} from '@/lib/payments/crypto-assets'
import type { CryptoPaymentAttempt } from '@/lib/payments/crypto-attempt-types'
import { cn } from '@/lib/utils'

export type CryptoDepositDisplay = {
  qrPayload: string
  asset: CryptoAssetKey
  networkLabel: string
  amountThb: number
  amountCrypto: number
  walletAddress: string
}

export function PosCryptoPayPanel({
  storeCode,
  settings,
  amountThb,
  staffName,
  enabled,
  t,
  onConfirmed,
  onDisplayChange,
}: {
  storeCode: string
  settings: PosCryptoPaymentSettings
  amountThb: number
  staffName?: string
  enabled: boolean
  t: (key: string, fallback?: string) => string
  onConfirmed: (attempt: CryptoPaymentAttempt) => void
  onDisplayChange?: (payload: CryptoDepositDisplay | null) => void
}) {
  const usable = listUsableCryptoAssets(settings)
  const [asset, setAsset] = React.useState<CryptoAssetKey | ''>(usable[0] || '')
  const [manualCrypto, setManualCrypto] = React.useState('')
  const [qrUrl, setQrUrl] = React.useState('')
  const { attempt, waiting, busy, error, startWait, stopWait, confirmManual } = usePosCryptoPayment({
    storeCode,
    enabled,
    staffName,
  })
  const onConfirmedRef = React.useRef(onConfirmed)
  onConfirmedRef.current = onConfirmed
  const confirmedIdRef = React.useRef('')

  React.useEffect(() => {
    if (asset && usable.includes(asset)) return
    setAsset(usable[0] || '')
  }, [usable, asset])

  React.useEffect(() => {
    if (attempt?.status !== 'confirmed' || !attempt.id) return
    if (confirmedIdRef.current === attempt.id) return
    confirmedIdRef.current = attempt.id
    onConfirmedRef.current(attempt)
  }, [attempt])

  const payload = React.useMemo(() => {
    if (!attempt) return ''
    return buildCryptoQrPayload(attempt.asset, attempt.walletAddress, attempt.amountCrypto)
  }, [attempt])

  React.useEffect(() => {
    if (!payload) {
      setQrUrl('')
      return
    }
    let cancelled = false
    void QRCode.toDataURL(payload, { width: 420, margin: 1, errorCorrectionLevel: 'M' }).then((url) => {
      if (!cancelled) setQrUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [payload])

  React.useEffect(() => {
    if (!attempt || !waiting) {
      onDisplayChange?.(null)
      return
    }
    onDisplayChange?.({
      qrPayload: payload,
      asset: attempt.asset,
      networkLabel: CRYPTO_ASSET_DEFS[attempt.asset].networkLabel,
      amountThb: attempt.amountThb,
      amountCrypto: attempt.amountCrypto,
      walletAddress: attempt.walletAddress,
    })
  }, [attempt, waiting, payload, onDisplayChange])

  React.useEffect(() => {
    return () => {
      onDisplayChange?.(null)
    }
  }, [onDisplayChange])

  const remainSec = useRemainSec(attempt?.expiresAt)
  const tr = (key: string, fallback: string) => t(key) || fallback
  const def = asset ? CRYPTO_ASSET_DEFS[asset] : null

  if (!enabled || usable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {tr('posCryptoNoAsset', '사용할 코인이 없습니다. POS 설정 → 결제 관리에서 코인과 주소를 켜세요.')}
      </p>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-card p-3">
      <div className="flex flex-wrap gap-1.5">
        {usable.map((key) => {
          const d = CRYPTO_ASSET_DEFS[key]
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={asset === key ? 'default' : 'outline'}
              disabled={waiting}
              onClick={() => setAsset(key)}
            >
              {d.asset} {d.network === 'trc20' || d.network === 'erc20' ? d.network.toUpperCase() : ''}
            </Button>
          )
        })}
      </div>
      {def ? (
        <p className={cn('text-xs font-semibold', def.network === 'trc20' ? 'text-red-600' : 'text-sky-700')}>
          {tr('posCryptoNetworkWarn', '반드시')} {def.networkLabel}
          {tr('posCryptoNetworkWarn2', ' 으로만 보내세요. 다른 체인으로 보내면 복구할 수 없습니다.')}
        </p>
      ) : null}

      {attempt && waiting ? (
        <>
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">{tr('posCryptoPayThb', '결제 금액')}</p>
            <p className="text-3xl font-bold tabular-nums">{attempt.amountThb.toLocaleString()} THB</p>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {attempt.amountCrypto} {CRYPTO_ASSET_DEFS[attempt.asset].asset}
            </p>
            <p className="text-xs text-muted-foreground">
              {tr('posCryptoRateLock', '남은 시간')} {formatRemain(remainSec)}
            </p>
            {attempt.status === 'seen' ? (
              <p className="text-sm font-semibold text-amber-600">
                {tr('posCryptoSeen', '입금 감지. 확정 대기 중')}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{tr('posCryptoWaiting', '입금 대기')}</p>
            )}
          </div>
          {qrUrl ? (
            <img src={qrUrl} alt="crypto qr" className="mx-auto h-52 w-52 rounded-lg bg-white p-1" />
          ) : null}
          <div className="flex items-center gap-2">
            <Input readOnly value={attempt.walletAddress} className="font-mono text-[11px]" />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(attempt.walletAddress)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {attempt.amountAdjusted ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {tr('posCryptoUniqueAdjusted', '같은 금액 대기가 있어 받을 수량을 조금 바꿨습니다. 이 수량으로 보내세요.')}
            </p>
          ) : null}
          {attempt.watchHint === 'amount_mismatch' ? (
            <p className="text-xs font-semibold text-destructive">
              {tr('posCryptoAmountMismatch', '입금이 왔지만 수량이 다릅니다. 금액을 확인하거나 직원이 입금 확인하세요.')}
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{tr(error, error)}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void confirmManual()}>
              {tr('posCryptoConfirmManual', '입금 확인')}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void stopWait('cancel')}>
              {tr('posCryptoCancelWait', '대기 취소')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-xs text-muted-foreground">{tr('posCryptoManualQty', '받을 코인 수량 (환율 실패 시)')}</p>
            <Input
              value={manualCrypto}
              onChange={(e) => setManualCrypto(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{tr(error, error)}</p> : null}
          {attempt?.status === 'expired' ? (
            <p className="text-xs text-destructive">{tr('posCryptoExpired', '시간이 만료되었습니다. 다시 시작하세요.')}</p>
          ) : null}
          <Button
            type="button"
            disabled={busy || amountThb <= 0 || !asset}
            onClick={() =>
              void startWait({
                asset: asset as CryptoAssetKey,
                amountThb,
                amountCrypto: Number(manualCrypto) || undefined,
              })
            }
          >
            {tr('posCryptoStartWait', '입금 대기 시작')}
          </Button>
        </>
      )}
    </div>
  )
}

function useRemainSec(expiresAt?: string) {
  const [sec, setSec] = React.useState(0)
  React.useEffect(() => {
    if (!expiresAt) {
      setSec(0)
      return
    }
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSec(left)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])
  return sec
}

function formatRemain(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
