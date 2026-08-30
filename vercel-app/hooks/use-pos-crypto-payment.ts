'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelPosCryptoAttempt,
  confirmPosCryptoAttempt,
  createPosCryptoAttempt,
  pollPosCryptoAttempt,
} from '@/lib/api-client'
import type { CryptoAssetKey } from '@/lib/payments/crypto-assets'
import type { CryptoPaymentAttempt } from '@/lib/payments/crypto-attempt-types'

const POLL_MS = 6500

type Options = {
  storeCode: string
  enabled: boolean
  staffName?: string
}

/**
 * 폴링은 attempt가 있고 입금 대기(pending/seen)일 때만 interval을 만든다.
 * 매장 OFF·대기 전·종료 후에는 타이머·API 없음.
 */
export function usePosCryptoPayment(opts: Options) {
  const [attempt, setAttempt] = useState<CryptoPaymentAttempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attemptRef = useRef<CryptoPaymentAttempt | null>(null)
  attemptRef.current = attempt

  const waiting =
    opts.enabled &&
    Boolean(attempt?.id) &&
    (attempt?.status === 'pending' || attempt?.status === 'seen')

  const startWait = useCallback(
    async (params: { asset: CryptoAssetKey; amountThb: number; amountCrypto?: number; orderId?: number | null }) => {
      if (!opts.enabled) return null
      setBusy(true)
      setError('')
      try {
        const res = await createPosCryptoAttempt({
          storeCode: opts.storeCode,
          asset: params.asset,
          amountThb: params.amountThb,
          amountCrypto: params.amountCrypto,
          orderId: params.orderId,
        })
        if (!res.success || !res.attempt) {
          setError(res.message || 'posCryptoErrCreate')
          return null
        }
        setAttempt(res.attempt)
        return res.attempt
      } finally {
        setBusy(false)
      }
    },
    [opts.enabled, opts.storeCode]
  )

  const stopWait = useCallback(async (mode: 'cancel' | 'clear') => {
    const cur = attemptRef.current
    if (mode === 'cancel' && cur?.id && (cur.status === 'pending' || cur.status === 'seen')) {
      try {
        await cancelPosCryptoAttempt({ id: cur.id, storeCode: opts.storeCode })
      } catch {
        /* ignore */
      }
    }
    setAttempt(null)
    setError('')
  }, [opts.storeCode])

  const confirmManual = useCallback(async () => {
    const cur = attemptRef.current
    if (!cur?.id) return null
    setBusy(true)
    setError('')
    try {
      const res = await confirmPosCryptoAttempt({
        id: cur.id,
        storeCode: opts.storeCode,
        confirmedBy: opts.staffName || 'staff',
      })
      if (!res.success || !res.attempt) {
        setError(res.message || 'posCryptoErrConfirm')
        return null
      }
      setAttempt(res.attempt)
      return res.attempt
    } finally {
      setBusy(false)
    }
  }, [opts.staffName, opts.storeCode])

  useEffect(() => {
    if (!waiting || !attempt?.id) return
    let cancelled = false
    const tick = async () => {
      const cur = attemptRef.current
      if (!cur?.id || (cur.status !== 'pending' && cur.status !== 'seen')) return
      const res = await pollPosCryptoAttempt({
        id: cur.id,
        storeCode: opts.storeCode,
        watch: true,
      })
      if (cancelled || !res.attempt) return
      setAttempt(res.attempt)
    }
    const timer = window.setInterval(() => {
      void tick()
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [waiting, attempt?.id, opts.storeCode])

  return {
    attempt,
    waiting,
    busy,
    error,
    startWait,
    stopWait,
    confirmManual,
    setError,
  }
}
