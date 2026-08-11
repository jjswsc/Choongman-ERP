'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { appAlert, appConfirm } from '@/lib/app-message'
import type { KbankOutcomeState } from '@/components/pos/terminal/pos-terminal-dialogs'
import {
  executeKbankCancelQr,
  executeKbankCheckStatus,
  executeKbankGenerateQr,
  executeKbankSettlement,
  executeKbankVoidPayment,
  executeLinkposDisplayQr,
  executeLinkposClearQr,
  getPosPaymentAttempts,
  type PosPaymentAttempt,
} from '@/lib/api-client'
import {
  extractKbankQrResponseMeta,
  extractKbankPaymentTxnNo,
  isKbankCreditCardQrUnavailableError,
  isKbankPaymentTxnNo,
  isKbankPaymentAttemptApproved,
  isKbankInquiryResponseApproved,
  isKbankQrSessionTxnNo,
  isKbankRateLimitError,
  KBANK_RATE_LIMIT_BACKOFF_MS,
  resolveKbankInquiryTxnNoForRequest,
  resolveKbankVoidTxnNoForRequest,
  resolveKbankCreditCardBrandLabels,
  resolveKbankDisplayQrTypeDetails,
  type KbankDisplayQrTypeSource,
} from '@/lib/payments/kbank-api-reference'
import {
  buildKbankGenerateAuditPaste,
  extractAmountFromEmvQrPayload,
  extractKbankGenerateResponseInfo,
  kbankOrigPartnerTxnUidForFollowup,
} from '@/lib/pos-terminal-kbank-helpers'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { isKbankQrEnabledForStore } from '@/lib/kbank-pilot-stores'
import type { CartPanelPaymentPayload } from '@/components/pos/cart-panel'
import type { LangCode } from '@/lib/lang-context'

// ---------------------------------------------------------------------------
// Params & Return types
// ---------------------------------------------------------------------------

export interface UsePosKbankPaymentParams {
  currentStoreId: string
  currentStoreName: string
  formatStoreLabel: (id: string) => string
  isPosDemo: boolean
  tourPaymentModalOpen: boolean
  tourPaymentQrAmount: number
  customerDisplayQrPayload: string
  customerDisplayPaymentDraft: { paymentQrType?: string } | null
  t: (key: string) => string
  lang: LangCode
  setCustomerDisplayPaymentMessage: (msg: string) => void
}

export interface KbankQrPaymentResult {
  ok: boolean
  qrPending?: boolean
  message?: string
  partnerTransactionId?: string
  qrAmount?: number
  qrType?: 'THAI_QR' | 'CREDIT_CARD'
  pending?: boolean
}

export interface UsePosKbankPaymentReturn {
  // QR state exposed to parent JSX / customer display
  liveKbankQrPayload: string
  liveKbankQrAmount: number
  liveKbankQrType: 'THAI_QR' | 'CREDIT_CARD'
  liveKbankQrTypeSource: KbankDisplayQrTypeSource
  kbankSentQrTypeCode: string
  kbankGenerateAuditText: string
  kbankOpsBusy: boolean
  kbankOpsTxnUid: string
  kbankOpsOrigTxnUid: string
  kbankOpsTxnNo: string
  setKbankOpsTxnNo: (v: string) => void
  kbankOpsTerminalId: string
  setKbankOpsTerminalId: (v: string) => void
  kbankOpsLastResult: string
  kbankOpsCardBrands: string[]
  kbankCallbackState: 'idle' | 'waiting' | 'received' | 'failed'
  kbankOutcomeState: KbankOutcomeState | null
  setKbankOutcomeState: (v: KbankOutcomeState | null) => void
  kbankApiPausedUntilMs: number
  linkposQrBridgeStatus: 'idle' | 'ok' | 'failed'

  // Computed / memos
  isKbankPilotStore: boolean
  demoKbankQrPayload: string
  effectiveStaffKbankQrPayload: string
  showKbankStaffMonitor: boolean
  effectiveStaffKbankQrAmount: number
  effectiveCustomerDisplayQrPayload: string
  effectiveCustomerDisplayQrType: 'THAI_QR' | 'CREDIT_CARD'
  staffKbankQrTypeLabel: string

  // Actions
  clearKbankQrSession: () => void
  runKbankQrPaymentIfNeeded: (
    payment: CartPanelPaymentPayload | null | undefined,
    context?: { orderType?: string; orderLabel?: string; orderId?: number }
  ) => Promise<KbankQrPaymentResult>
  runKbankFollowupAction: (action: 'inquiry' | 'cancel' | 'void' | 'settlement') => Promise<void>
  applyKbankManualMemoTag: (
    memo: string | null | undefined,
    result: { pending?: boolean; partnerTransactionId?: string } | { ok?: boolean }
  ) => string
  registerPendingKbankFinalize: (
    partnerTxnId: string,
    fn: (approval: { txnNo?: string; cardBrands?: string[] }) => void | Promise<void>
  ) => void
  purgeKbankPendingFinalize: (partnerTxnId: string) => void

  // For schedulePostPaymentCustomerQr (parent clears kbank QR after post-pay display)
  clearLiveKbankQr: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePosKbankPayment(params: UsePosKbankPaymentParams): UsePosKbankPaymentReturn {
  const {
    currentStoreId,
    currentStoreName,
    formatStoreLabel,
    isPosDemo,
    tourPaymentModalOpen,
    tourPaymentQrAmount,
    customerDisplayQrPayload,
    customerDisplayPaymentDraft,
    t,
    lang,
    setCustomerDisplayPaymentMessage,
  } = params

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [liveKbankQrPayload, setLiveKbankQrPayload] = useState('')
  const [liveKbankQrAmount, setLiveKbankQrAmount] = useState(0)
  const [liveKbankQrType, setLiveKbankQrType] = useState<'THAI_QR' | 'CREDIT_CARD'>('THAI_QR')
  const [liveKbankQrTypeSource, setLiveKbankQrTypeSource] =
    useState<KbankDisplayQrTypeSource>('requested')
  const [kbankSentQrTypeCode, setKbankSentQrTypeCode] = useState('')
  const [kbankGenerateAuditText, setKbankGenerateAuditText] = useState('')
  const [kbankOpsBusy, setKbankOpsBusy] = useState(false)
  const [kbankOpsTxnUid, setKbankOpsTxnUid] = useState('')
  const kbankOpsTxnUidRef = useRef('')
  const [kbankOpsOrigTxnUid, setKbankOpsOrigTxnUid] = useState('')
  const [kbankOpsTxnNo, setKbankOpsTxnNo] = useState('')
  const [kbankOpsTerminalId, setKbankOpsTerminalId] = useState('')
  const [kbankOpsLastResult, setKbankOpsLastResult] = useState('')
  const [kbankOpsCardBrands, setKbankOpsCardBrands] = useState<string[]>([])
  const [kbankCallbackState, setKbankCallbackState] = useState<'idle' | 'waiting' | 'received' | 'failed'>('idle')
  const [kbankOutcomeState, setKbankOutcomeState] = useState<KbankOutcomeState | null>(null)
  const kbankCallbackNotifiedTxRef = useRef('')
  const kbankOutcomeLastKeyRef = useRef('')
  const kbankManualCancelPendingRef = useRef(false)
  const kbankGenerateLastAtRef = useRef(0)
  const kbankInquiryLastAtRef = useRef(0)
  const kbankFollowupLastAtRef = useRef(0)
  const kbankCcInquiryTriggeredRef = useRef('')
  const kbankApiPausedUntilRef = useRef(0)
  const [kbankApiPausedUntilMs, setKbankApiPausedUntilMs] = useState(0)
  const pendingKbankFinalizeRef = useRef<
    Record<string, (approval: { txnNo?: string; cardBrands?: string[] }) => void | Promise<void>>
  >({})
  const deferredKbankApprovalRef = useRef<
    Record<string, { txnNo?: string; cardBrands?: string[] }>
  >({})
  const [linkposQrBridgeStatus, setLinkposQrBridgeStatus] = useState<'idle' | 'ok' | 'failed'>('idle')

  useEffect(() => {
    kbankOpsTxnUidRef.current = String(kbankOpsTxnUid || '').trim()
  }, [kbankOpsTxnUid])

  // -------------------------------------------------------------------------
  // Memos
  // -------------------------------------------------------------------------

  const isKbankPilotStore = useMemo(() => {
    return isKbankQrEnabledForStore({
      storeId: currentStoreId,
      storeName: currentStoreName,
      storeLabel: formatStoreLabel(currentStoreId || ''),
    })
  }, [currentStoreId, currentStoreName, formatStoreLabel])

  // Reset kbank state when switching away from pilot store
  useEffect(() => {
    if (isKbankPilotStore) return
    setLiveKbankQrPayload('')
    setLiveKbankQrAmount(0)
    setLiveKbankQrType('THAI_QR')
    setKbankOpsTxnUid('')
    setKbankOpsOrigTxnUid('')
    setKbankOpsTxnNo('')
    setKbankOpsLastResult('')
    setKbankCallbackState('idle')
    kbankCallbackNotifiedTxRef.current = ''
    kbankCcInquiryTriggeredRef.current = ''
    pendingKbankFinalizeRef.current = {}
    deferredKbankApprovalRef.current = {}
    setCustomerDisplayPaymentMessage('')
  }, [isKbankPilotStore, currentStoreId, setCustomerDisplayPaymentMessage])

  const kbankTerminalIdStorageKey = useMemo(() => {
    const store = String(currentStoreId || '').trim().toUpperCase()
    return store ? `pos.kbank.terminalId.${store}` : 'pos.kbank.terminalId'
  }, [currentStoreId])

  useEffect(() => {
    if (!isKbankPilotStore) return
    try {
      const saved = String(localStorage.getItem(kbankTerminalIdStorageKey) || '').trim()
      if (saved) setKbankOpsTerminalId(saved)
    } catch {
      /* ignore */
    }
  }, [isKbankPilotStore, kbankTerminalIdStorageKey])

  useEffect(() => {
    if (!isKbankPilotStore) return
    const value = String(kbankOpsTerminalId || '').trim()
    try {
      if (value) localStorage.setItem(kbankTerminalIdStorageKey, value)
    } catch {
      /* ignore */
    }
  }, [isKbankPilotStore, kbankTerminalIdStorageKey, kbankOpsTerminalId])

  useEffect(() => {
    const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
    if (!partnerTxnUid) return
    if (String(kbankOpsOrigTxnUid || '').trim() !== partnerTxnUid) {
      setKbankOpsOrigTxnUid(partnerTxnUid)
    }
  }, [kbankOpsTxnUid, kbankOpsOrigTxnUid])

  const demoKbankQrPayload = useMemo(() => {
    if (!isPosDemo || !tourPaymentModalOpen) return ''
    const amount = Math.max(0, Number(tourPaymentQrAmount || 0))
    if (amount <= 0) return ''
    const store = String(currentStoreId || 'POS DEMO').trim() || 'POS DEMO'
    return `CMERP-DEMO-KBANK|${store}|${amount.toFixed(2)}`
  }, [isPosDemo, tourPaymentModalOpen, tourPaymentQrAmount, currentStoreId])

  const effectiveStaffKbankQrPayload = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live) return live
    return String(demoKbankQrPayload || '').trim()
  }, [liveKbankQrPayload, demoKbankQrPayload])

  const showKbankStaffMonitor = useMemo(
    () =>
      Boolean(
        String(effectiveStaffKbankQrPayload || '').trim() ||
          (!isPosDemo && isKbankPilotStore && String(kbankOpsTxnUid || '').trim())
      ),
    [effectiveStaffKbankQrPayload, isPosDemo, isKbankPilotStore, kbankOpsTxnUid]
  )

  const effectiveStaffKbankQrAmount = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live && liveKbankQrAmount > 0) return liveKbankQrAmount
    if (live) {
      const fromPayload = extractAmountFromEmvQrPayload(live)
      if (fromPayload > 0) return fromPayload
    }
    return Math.max(0, Number(tourPaymentQrAmount || 0))
  }, [liveKbankQrPayload, liveKbankQrAmount, tourPaymentQrAmount])

  const effectiveCustomerDisplayQrPayload = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live) return live
    return String(customerDisplayQrPayload || '').trim()
  }, [liveKbankQrPayload, customerDisplayQrPayload])

  const effectiveCustomerDisplayQrType = useMemo<'THAI_QR' | 'CREDIT_CARD'>(() => {
    if (String(liveKbankQrPayload || '').trim()) return liveKbankQrType
    const draftType = String(customerDisplayPaymentDraft?.paymentQrType || '').trim().toUpperCase()
    return draftType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'THAI_QR'
  }, [liveKbankQrPayload, liveKbankQrType, customerDisplayPaymentDraft?.paymentQrType])

  const staffKbankQrTypeLabel = useMemo(() => {
    const fromBank =
      liveKbankQrTypeSource === 'bank_qr_type' ||
      liveKbankQrTypeSource === 'bank_sof' ||
      liveKbankQrTypeSource === 'emv_payload'
    if (effectiveCustomerDisplayQrType === 'CREDIT_CARD') {
      return fromBank
        ? t('posKbankQrTypeCreditFromBank') || 'Credit Card QR (from bank)'
        : t('posKbankQrTypeCreditRequested') || 'Credit Card QR (requested · bank type not returned)'
    }
    return fromBank
      ? t('posKbankQrTypeThaiFromBank') || 'Thai QR · PromptPay (from bank)'
      : t('posKbankQrTypeThaiRequested') || 'Thai QR · PromptPay (requested)'
  }, [effectiveCustomerDisplayQrType, liveKbankQrTypeSource, t])

  // Clear amount when QR payload goes away
  useEffect(() => {
    if (String(liveKbankQrPayload || '').trim()) return
    setLiveKbankQrAmount(0)
  }, [liveKbankQrPayload])

  // -------------------------------------------------------------------------
  // Internal helpers (useCallback)
  // -------------------------------------------------------------------------

  const sleepMs = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), [])

  const noteKbankRateLimitResponse = useCallback((message: unknown): boolean => {
    if (!isKbankRateLimitError(message)) return false
    if (Date.now() < kbankApiPausedUntilRef.current) return true
    const until = Date.now() + KBANK_RATE_LIMIT_BACKOFF_MS
    kbankApiPausedUntilRef.current = until
    setKbankApiPausedUntilMs(until)
    return true
  }, [])

  const clearKbankApiPause = useCallback(() => {
    kbankApiPausedUntilRef.current = 0
    setKbankApiPausedUntilMs(0)
  }, [])

  const isKbankApiPaused = useCallback(
    () => Date.now() < kbankApiPausedUntilRef.current,
    []
  )

  const alertIfKbankApiPaused = useCallback(
    async (label: string): Promise<boolean> => {
      if (!isKbankApiPaused()) return true
      const waitSec = Math.max(1, Math.ceil((kbankApiPausedUntilRef.current - Date.now()) / 1000))
      const waitMin = Math.max(1, Math.ceil(waitSec / 60))
      await appAlert(
        String(t('posKbankRateLimitAlert') || '')
          .replace('{minutes}', String(waitMin))
          .replace('{label}', label) ||
          `KBank API rate limit exceeded. Wait about ${waitMin} minute(s), then try ${label} once (do not tap repeatedly).`
      )
      return false
    },
    [isKbankApiPaused, t]
  )

  const enforceKbankCooldown = useCallback(
    async (
      bucket: 'generate' | 'inquiry' | 'followup',
      minIntervalMs: number,
      label: string
    ): Promise<boolean> => {
      const targetRef =
        bucket === 'generate'
          ? kbankGenerateLastAtRef
          : bucket === 'inquiry'
            ? kbankInquiryLastAtRef
            : kbankFollowupLastAtRef
      const now = Date.now()
      const elapsed = now - targetRef.current
      const remainingMs = minIntervalMs - elapsed
      if (remainingMs > 0) {
        const waitSec = Math.ceil(remainingMs / 1000)
        await appAlert(
          `KBank rate-limit protection: wait about ${waitSec}s before ${label}.`
        )
        return false
      }
      targetRef.current = now
      return true
    },
    []
  )

  const openKbankOutcomeModal = useCallback(
    (next: KbankOutcomeState, dedupeKey?: string) => {
      const key = String(dedupeKey || `${next.kind}:${next.refId}:${next.amount}`).trim()
      if (key && kbankOutcomeLastKeyRef.current === key) return
      if (key) kbankOutcomeLastKeyRef.current = key
      setKbankOutcomeState(next)
    },
    []
  )

  const tryRunKbankPendingFinalize = useCallback(
    (refId: string, approval: { txnNo?: string; cardBrands?: string[] }) => {
      const key = String(refId || '').trim()
      if (!key) return false
      const finalize = pendingKbankFinalizeRef.current[key]
      if (!finalize) return false
      delete pendingKbankFinalizeRef.current[key]
      delete deferredKbankApprovalRef.current[key]
      void Promise.resolve(finalize(approval)).catch((e) =>
        console.error('kbank pending finalize:', e)
      )
      return true
    },
    []
  )

  const registerPendingKbankFinalize = useCallback(
    (
      partnerTxnId: string,
      fn: (approval: { txnNo?: string; cardBrands?: string[] }) => void | Promise<void>
    ) => {
      const key = String(partnerTxnId || '').trim()
      if (!key) return
      pendingKbankFinalizeRef.current[key] = fn
      const deferred = deferredKbankApprovalRef.current[key]
      if (deferred) {
        tryRunKbankPendingFinalize(key, deferred)
      }
    },
    [tryRunKbankPendingFinalize]
  )

  const purgeKbankPendingFinalize = useCallback((partnerTxnId: string) => {
    const key = String(partnerTxnId || '').trim()
    if (!key) return
    delete pendingKbankFinalizeRef.current[key]
    delete deferredKbankApprovalRef.current[key]
  }, [])

  const clearKbankQrFromLinkpos = useCallback(() => {
    setLinkposQrBridgeStatus('idle')
    void executeLinkposClearQr({ storeCode: currentStoreId })
  }, [currentStoreId])

  const pushKbankQrToLinkposDisplay = useCallback(
    async (p: {
      qrPayload: string
      amount: number
      reference1?: string
      reference2?: string
    }) => {
      setLinkposQrBridgeStatus('idle')
      const out = await executeLinkposDisplayQr({
        qrPayload: p.qrPayload,
        amount: p.amount,
        reference1: p.reference1,
        reference2: p.reference2,
        storeCode: currentStoreId,
      })
      if (out.success) {
        setLinkposQrBridgeStatus('ok')
      } else if (out.message !== 'linkpos_card_api_disabled') {
        setLinkposQrBridgeStatus('failed')
      }
      return out
    },
    [currentStoreId]
  )

  const presentKbankPaymentApproved = useCallback(
    (input: {
      refId: string
      amount?: number
      approvalCode?: string
      timeLabel?: string
      dedupeKey?: string
      paymentMethod?: string
      cardBrands?: string[]
    }) => {
      const refId = String(input.refId || '').trim()
      if (!refId) return
      const brands = input.cardBrands ?? kbankOpsCardBrands
      const approval = { txnNo: input.approvalCode, cardBrands: brands }
      const alreadyNotified = kbankCallbackNotifiedTxRef.current === refId
      if (!alreadyNotified) {
        clearKbankQrFromLinkpos()
        if (!tryRunKbankPendingFinalize(refId, approval)) {
          deferredKbankApprovalRef.current[refId] = approval
        }
      }
      kbankCallbackNotifiedTxRef.current = refId
      setKbankCallbackState('received')
      clearKbankApiPause()
      setCustomerDisplayPaymentMessage('')
      if (alreadyNotified) return
      openKbankOutcomeModal(
        {
          kind: 'success',
          amount:
            input.amount != null && Number.isFinite(input.amount)
              ? input.amount
              : Math.max(0, Number(liveKbankQrAmount || 0)),
          refId,
          paymentMethod:
            input.paymentMethod ||
            (liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR'),
          cardLabel: brands.length > 0 ? brands.join(' / ') : undefined,
          approvalCode: input.approvalCode,
          timeLabel: input.timeLabel || formatPosDateTimeMedium(new Date(), lang),
        },
        input.dedupeKey || `success:${refId}`
      )
    },
    [
      kbankOpsCardBrands,
      liveKbankQrAmount,
      liveKbankQrType,
      openKbankOutcomeModal,
      lang,
      tryRunKbankPendingFinalize,
      clearKbankQrFromLinkpos,
      clearKbankApiPause,
      setCustomerDisplayPaymentMessage,
    ]
  )

  const presentKbankApprovedFromInquiry = useCallback(
    (
      partnerTxnUid: string,
      st: {
        success?: boolean
        status?: string | null
        statusCode?: string | null
        data?: Record<string, unknown>
      },
      dedupePrefix: string,
      options?: { amount?: number; paymentMethod?: string }
    ): boolean => {
      if (!st.success) return false
      const stData = (st.data || {}) as Record<string, unknown>
      if (!isKbankInquiryResponseApproved(st.status, stData, st.statusCode)) return false
      const stTxnNo = extractKbankPaymentTxnNo(stData).slice(0, 20)
      if (stTxnNo) setKbankOpsTxnNo(stTxnNo)
      const inquiryMeta = extractKbankQrResponseMeta(stData)
      const brands = resolveKbankCreditCardBrandLabels({
        sof: inquiryMeta.sof,
        cardScheme: inquiryMeta.cardScheme,
      })
      if (brands.length > 0) setKbankOpsCardBrands(brands)
      presentKbankPaymentApproved({
        refId: partnerTxnUid,
        amount: options?.amount,
        paymentMethod: options?.paymentMethod,
        approvalCode: stTxnNo || undefined,
        cardBrands: brands,
        dedupeKey: `${dedupePrefix}:${partnerTxnUid}:${stTxnNo || st.status || ''}`,
      })
      return true
    },
    [presentKbankPaymentApproved]
  )

  const clearKbankQrSession = useCallback(() => {
    purgeKbankPendingFinalize(kbankOpsTxnUidRef.current)
    clearKbankQrFromLinkpos()
    setLiveKbankQrPayload('')
    setLiveKbankQrType('THAI_QR')
    setKbankOpsTxnUid('')
    setKbankOpsOrigTxnUid('')
    setKbankOpsTxnNo('')
    setCustomerDisplayPaymentMessage('')
    setKbankCallbackState('idle')
    kbankManualCancelPendingRef.current = false
    kbankCcInquiryTriggeredRef.current = ''
  }, [purgeKbankPendingFinalize, clearKbankQrFromLinkpos, setCustomerDisplayPaymentMessage])

  // -------------------------------------------------------------------------
  // Main actions
  // -------------------------------------------------------------------------

  const runKbankQrPaymentIfNeeded = useCallback(
    async (
      payment: CartPanelPaymentPayload | null | undefined,
      context?: { orderType?: string; orderLabel?: string; orderId?: number }
    ): Promise<KbankQrPaymentResult> => {
      if (isPosDemo) return { ok: true }
      kbankManualCancelPendingRef.current = false
      const qrAmount = Math.max(0, Number(payment?.paymentQr || 0))
      if (qrAmount <= 0) return { ok: true }
      if (!isKbankPilotStore) return { ok: true }
      if (!currentStoreId) {
        const msg = t('posStoreRequired') || '매장 정보가 필요합니다.'
        await appAlert(msg)
        return { ok: false, message: msg }
      }
      const canGenerate = await enforceKbankCooldown('generate', 5000, 'Generate QR')
      if (!canGenerate) {
        return { ok: false, message: 'kbank_generate_cooldown' }
      }
      const selectedQrType = String(payment?.paymentQrType || 'THAI_QR').trim().toUpperCase()
      const preferEdcDisplay = Boolean(payment?.paymentQrShowOnEdc)
      const requestedQrType = selectedQrType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'THAI_QR'

      const existingQrPayload = String(liveKbankQrPayload || '').trim()
      const existingPartnerTxnId = String(kbankOpsTxnUid || '').trim()
      const canReuseLiveQr =
        Boolean(existingQrPayload && existingPartnerTxnId) &&
        kbankCallbackState === 'waiting' &&
        !kbankManualCancelPendingRef.current &&
        Math.abs(liveKbankQrAmount - qrAmount) < 0.001 &&
        liveKbankQrType === requestedQrType

      if (canReuseLiveQr) {
        setCustomerDisplayPaymentMessage(
          (t('posPaymentQr') || 'QR') + ' ' + (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
        )
        return {
          ok: false,
          qrPending: true,
          message: 'kbank_qr_pending',
          partnerTransactionId: existingPartnerTxnId,
          qrAmount,
          qrType: requestedQrType,
        }
      }

      if (!(await alertIfKbankApiPaused('Generate QR'))) {
        return { ok: false, message: 'kbank_rate_limit_paused' }
      }

      setCustomerDisplayPaymentMessage(t('posPaymentQr') + ' ' + (t('posLoading') || '로딩 중'))

      const terminalId = String(kbankOpsTerminalId || '').trim()
      const partnerTransactionIdSeed = `POSQR${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
      const generate = await executeKbankGenerateQr({
        amount: qrAmount,
        qrType: requestedQrType,
        storeCode: currentStoreId,
        orderId: context?.orderId,
        partnerTransactionId: partnerTransactionIdSeed,
        reference1: String(context?.orderType || '').slice(0, 20),
        reference2: String(context?.orderLabel || '').slice(0, 20),
        ...(terminalId ? { terminalId } : {}),
      })
      if (!generate.success) {
        setLiveKbankQrPayload('')
        setLiveKbankQrType('THAI_QR')
        setLiveKbankQrTypeSource('requested')
        setKbankSentQrTypeCode(String(generate.sentQrTypeCode || '').trim())
        setKbankGenerateAuditText(
          generate.requestMessage
            ? buildKbankGenerateAuditPaste({
                partnerTxnUid: String(
                  generate.partnerTransactionId || partnerTransactionIdSeed
                ),
                amount: qrAmount,
                requestedQrType,
                sentQrTypeCode: generate.sentQrTypeCode || undefined,
                bankQrTypeCode: generate.bankQrTypeCode,
                bankSof: generate.bankSof,
                requestMessage: generate.requestMessage,
                responseMessage: generate.responseMessage,
                storeCode: currentStoreId,
              })
            : ''
        )
        setKbankCallbackState('idle')
        setKbankOpsTxnUid('')
        setKbankOpsOrigTxnUid('')
        setKbankOpsTxnNo('')
        setCustomerDisplayPaymentMessage('')
        const rateLimited = isKbankRateLimitError(generate.message || generate.statusMessage)
        if (rateLimited) {
          noteKbankRateLimitResponse(generate.message || generate.statusMessage)
        }
        const msg =
          rateLimited
            ? 'KBank rate limit exceeded. Wait 2–5 minutes, then try Generate QR again (do not tap repeatedly).'
            : requestedQrType === 'CREDIT_CARD' &&
                isKbankCreditCardQrUnavailableError(generate.statusCode, generate.message)
              ? t('posKbankCreditCardQrNotRegisteredAlert') ||
                'This store is not registered for Credit Card QR with KBank. Use Thai QR, or ask KBank to enable Credit Card QR for the merchant.'
              : (t('posPaymentQr') || 'QR') + ' ' + (generate.message || 'generate_failed')
        await appAlert(msg)
        return { ok: false, message: msg }
      }

      const partnerTransactionId = String(generate.partnerTransactionId || partnerTransactionIdSeed)
        .trim()
        .slice(0, 32)

      const data = (generate.data || {}) as Record<string, unknown>
      const generatedInfo = extractKbankGenerateResponseInfo(data)
      const generateTxnNoRaw = String(generatedInfo.txnNo || '').trim().slice(0, 20)
      setKbankOpsTxnUid(partnerTransactionId)
      setKbankOpsOrigTxnUid(partnerTransactionId)
      if (generateTxnNoRaw && isKbankPaymentTxnNo(generateTxnNoRaw)) {
        setKbankOpsTxnNo(generateTxnNoRaw)
      } else if (generateTxnNoRaw && isKbankQrSessionTxnNo(generateTxnNoRaw)) {
        setKbankOpsTxnNo('')
      } else if (generateTxnNoRaw) {
        setKbankOpsTxnNo(generateTxnNoRaw)
      } else {
        setKbankOpsTxnNo('')
      }
      setKbankCallbackState('waiting')
      const generatedQrPayload = String(generatedInfo.qrPayload || '').trim()
      const generatedCardBrands = resolveKbankCreditCardBrandLabels({
        sof: generatedInfo.sof,
        cardScheme: generatedInfo.cardScheme,
      })
      setKbankOpsCardBrands(generatedCardBrands)
      if (!generatedQrPayload) {
        setCustomerDisplayPaymentMessage('')
        const msg =
          (t('posPaymentQr') || 'QR') +
          ` response parse failed (${requestedQrType}): qrPayload/qrCode not found.`
        await appAlert(msg)
        return { ok: false, message: msg }
      }
      setLiveKbankQrPayload(generatedQrPayload)
      setLiveKbankQrAmount(qrAmount)
      const bankQrMeta = extractKbankQrResponseMeta(data)
      const qrTypeDetails = resolveKbankDisplayQrTypeDetails({
        qrType: String(generate.bankQrTypeCode || bankQrMeta.qrTypeCode || '').trim(),
        sof: generatedInfo.sof ?? generate.bankSof,
        requested: requestedQrType,
        emvPayload: generatedQrPayload,
      })
      setLiveKbankQrType(qrTypeDetails.displayType)
      setLiveKbankQrTypeSource(qrTypeDetails.source)
      setKbankSentQrTypeCode(String(generate.sentQrTypeCode || '').trim())
      setKbankGenerateAuditText(
        buildKbankGenerateAuditPaste({
          partnerTxnUid: partnerTransactionId,
          amount: qrAmount,
          requestedQrType: requestedQrType,
          sentQrTypeCode: generate.sentQrTypeCode || undefined,
          bankQrTypeCode: qrTypeDetails.bankQrTypeCode || generate.bankQrTypeCode,
          bankSof: qrTypeDetails.bankSof || generate.bankSof,
          requestMessage: generate.requestMessage,
          responseMessage: generate.responseMessage,
          storeCode: currentStoreId,
        })
      )
      if (requestedQrType === 'CREDIT_CARD') {
        if (qrTypeDetails.displayType === 'THAI_QR') {
          await appAlert(
            t('posKbankQrReturnedThaiAlert') ||
              'You selected Credit Card QR, but KBank returned Thai QR (PromptPay). Ask KBank to enable Credit Card QR for this merchant.'
          )
        } else if (qrTypeDetails.source === 'requested') {
          await appAlert(
            t('posKbankQrBankTypeUnknownAlert') ||
              'Credit Card QR was requested (qrType 4). KBank did not return qrType in the response. Please send the audit message below to KBank.'
          )
        }
      }
      void (async () => {
        const out = await pushKbankQrToLinkposDisplay({
          qrPayload: generatedQrPayload,
          amount: qrAmount,
          reference1: String(context?.orderType || '').slice(0, 20),
          reference2: String(context?.orderLabel || '').slice(0, 20),
        })
        if (preferEdcDisplay && !out.success && out.message !== 'linkpos_card_api_disabled') {
          await appAlert(
            t('posQrShowOnEdcFallback') ||
              'แสดงบนเครื่องไม่สำเร็จ — ใช้ QR บนจอแคชเชียร์ได้ครับ'
          )
        }
      })()
      setCustomerDisplayPaymentMessage(
        preferEdcDisplay
          ? t('posWaitingEdcQr') || 'กรุณาสแกน QR บนเครื่องรูดบัตรครับ'
          : (t('posPaymentQr') || 'QR') + ' ' + (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
      )
      let originalTransactionId = String(generatedInfo.originalTxnId || '').trim()
      let refId = String(generatedInfo.referenceId || '').trim()

      const finalizeKbankQrFailureWithManualOption = async (
        failureHint: string
      ): Promise<KbankQrPaymentResult> => {
        const manualMsg =
          (t('posPaymentQr') || 'QR') +
          ' ' +
          failureHint +
          '. ' +
          (t('posProceedQuestion') || '수동 처리로 주문 저장을 계속할까요?')
        const proceed = await appConfirm(manualMsg)
        if (!proceed) {
          setLiveKbankQrPayload('')
          setLiveKbankQrType('THAI_QR')
          setKbankCallbackState('idle')
          setKbankOpsTxnUid('')
          setKbankOpsOrigTxnUid('')
          setKbankOpsTxnNo('')
          setCustomerDisplayPaymentMessage('')
          return { ok: false, message: failureHint }
        }
        setCustomerDisplayPaymentMessage(t('posPaymentQr') + ' ' + (t('posManual') || '수동 처리'))
        return { ok: true, partnerTransactionId, pending: true }
      }

      // Thai QR only: one optional inquiry after 10s
      if (requestedQrType !== 'CREDIT_CARD') {
        await sleepMs(10_000)
        if (kbankManualCancelPendingRef.current) {
          return { ok: false, message: 'kbank_qr_cancelled' }
        }
        if (!isKbankApiPaused()) {
          kbankInquiryLastAtRef.current = Date.now()
          const st = await executeKbankCheckStatus({
            storeCode: currentStoreId,
            orderId: context?.orderId,
            partnerTransactionId,
            originalTransactionId: partnerTransactionId,
            refId: refId || undefined,
            payload: {
              origPartnerTxnUid: partnerTransactionId,
              qrType: requestedQrType,
            },
          })
          const stData = (st.data || {}) as Record<string, unknown>
          const stTxnNo = extractKbankPaymentTxnNo(stData).slice(0, 20)
          if (stTxnNo) setKbankOpsTxnNo(stTxnNo)
          if (!st.success && noteKbankRateLimitResponse(st.statusMessage || st.message)) {
            /* stay pending; staff can Inquiry after backoff */
          } else if (st.success) {
            if (
              presentKbankApprovedFromInquiry(partnerTransactionId, st, 'success', {
                amount: qrAmount,
                paymentMethod: 'PromptPay QR',
              })
            ) {
              return { ok: true, partnerTransactionId }
            }
            const s = String(st.status || '').trim().toLowerCase()
            if (s === 'declined' || s === 'failed') {
              const txnStatusRaw = String(
                stData.txnStatus || stData.transactionStatus || stData.status || stData.paymentStatus || ''
              )
                .trim()
                .toUpperCase()
              const declineBlob = `${String(st.statusMessage || '')} ${String(st.message || '')} ${txnStatusRaw}`
                .trim()
                .toLowerCase()
              const treatedAsCancelled =
                kbankManualCancelPendingRef.current ||
                txnStatusRaw.includes('CANCEL') ||
                declineBlob.includes('cancel')
              if (treatedAsCancelled) {
                kbankManualCancelPendingRef.current = false
                setKbankCallbackState('failed')
                setCustomerDisplayPaymentMessage('')
                openKbankOutcomeModal(
                  {
                    kind: 'cancelled',
                    amount: qrAmount,
                    refId: partnerTransactionId,
                    paymentMethod: 'PromptPay QR',
                    timeLabel: formatPosDateTimeMedium(new Date(), lang),
                  },
                  `cancelled-by-inquiry:${partnerTransactionId}`
                )
                return { ok: false, message: 'kbank_qr_cancelled' }
              }
              setKbankCallbackState('failed')
              const failureHint =
                s === 'failed'
                  ? String(st.statusMessage || st.message || t('processFail') || '결제 실패').trim()
                  : t('posPaymentDeclined') || '결제가 거절되었습니다.'
              return finalizeKbankQrFailureWithManualOption(failureHint)
            }
          } else if (!st.success) {
            const failureHint = String(
              st.statusMessage || st.message || t('processFail') || 'kbank_check_status_failed'
            ).trim()
            if (!noteKbankRateLimitResponse(failureHint)) {
              return finalizeKbankQrFailureWithManualOption(failureHint)
            }
          }
          const inquiryMeta = extractKbankQrResponseMeta(stData)
          if (inquiryMeta.qrTypeCode || inquiryMeta.sof) {
            const inquiryDetails = resolveKbankDisplayQrTypeDetails({
              qrType: inquiryMeta.qrTypeCode,
              sof: inquiryMeta.sof,
              requested: requestedQrType,
              emvPayload: String(liveKbankQrPayload || '').trim(),
            })
            setLiveKbankQrType(inquiryDetails.displayType)
            setLiveKbankQrTypeSource(inquiryDetails.source)
          }
          if (!originalTransactionId) originalTransactionId = String(st.originalTransactionId || '').trim()
          if (!refId) refId = String(st.refId || '').trim()
        }
      }

      if (kbankManualCancelPendingRef.current) {
        return { ok: false, message: 'kbank_qr_cancelled' }
      }

      setCustomerDisplayPaymentMessage(
        (t('posPaymentQr') || 'QR') +
          ' ' +
          (t('posPending') || '대기') +
          ' — ' +
          (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
      )
      return {
        ok: false,
        qrPending: true,
        message: 'kbank_qr_pending',
        partnerTransactionId,
        qrAmount,
        qrType: requestedQrType,
      }
    },
    [
      isPosDemo,
      isKbankPilotStore,
      currentStoreId,
      kbankOpsTerminalId,
      t,
      sleepMs,
      enforceKbankCooldown,
      openKbankOutcomeModal,
      presentKbankPaymentApproved,
      presentKbankApprovedFromInquiry,
      pushKbankQrToLinkposDisplay,
      isKbankApiPaused,
      noteKbankRateLimitResponse,
      alertIfKbankApiPaused,
      liveKbankQrPayload,
      liveKbankQrAmount,
      liveKbankQrType,
      kbankCallbackState,
      kbankOpsTxnUid,
      clearKbankQrSession,
      lang,
      setCustomerDisplayPaymentMessage,
    ]
  )

  const runKbankFollowupAction = useCallback(
    async (action: 'inquiry' | 'cancel' | 'void' | 'settlement') => {
      if (!currentStoreId) {
        await appAlert(t('posStoreRequired') || '매장 정보가 필요합니다.')
        return
      }
      const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
      if (!partnerTxnUid) {
        await appAlert(t('posKbankGenerateFirstAlert') || 'Please run QR Generate first.')
        return
      }
      const origPartnerTxnUid = kbankOrigPartnerTxnUidForFollowup(partnerTxnUid)
      const terminalId = String(kbankOpsTerminalId || '').trim()
      const txnNoRaw = String(kbankOpsTxnNo || '').trim()
      const txnAlreadyPaid =
        kbankCallbackState === 'received' ||
        kbankCallbackNotifiedTxRef.current === partnerTxnUid ||
        kbankCallbackNotifiedTxRef.current === origPartnerTxnUid
      if (txnAlreadyPaid && (action === 'void' || action === 'cancel' || action === 'inquiry')) {
        await appAlert(
          t('posKbankAlreadyPaidNoVoid') ||
            'This transaction is already paid. Void/Cancel/Inquiry is not needed — check order close and receipt.'
        )
        return
      }
      const inquiryTxnNo = resolveKbankInquiryTxnNoForRequest(txnNoRaw, {
        qrType: liveKbankQrType,
      })
      if (!(await alertIfKbankApiPaused(action))) return
      if (action === 'inquiry') {
        const canInquiry = await enforceKbankCooldown('inquiry', 30_000, 'Inquiry')
        if (!canInquiry) return
      } else {
        const canFollowup = await enforceKbankCooldown('followup', 5000, action)
        if (!canFollowup) return
      }
      setKbankOpsBusy(true)
      try {
        if (action === 'inquiry') {
          kbankInquiryLastAtRef.current = Date.now()
          const out = await executeKbankCheckStatus({
            storeCode: currentStoreId,
            partnerTransactionId: partnerTxnUid,
            originalTransactionId: origPartnerTxnUid || undefined,
            terminalId: terminalId || undefined,
            txnNo: inquiryTxnNo,
            payload: {
              ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
              ...(terminalId ? { terminalId } : {}),
              qrType: liveKbankQrType,
              ...(inquiryTxnNo ? { txnNo: inquiryTxnNo } : {}),
            },
          })
          if (out.success) {
            presentKbankApprovedFromInquiry(partnerTxnUid, out, 'inquiry', {
              paymentMethod:
                liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
            })
          } else {
            const errMsg = String(out.statusMessage || out.message || t('processFail') || 'Inquiry failed').trim()
            const rateLimited = noteKbankRateLimitResponse(errMsg)
            await appAlert(
              rateLimited
                ? String(t('posKbankRateLimitAlert') || errMsg)
                    .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                    .replace('{label}', 'Inquiry') || errMsg
                : errMsg
            )
          }
          setKbankOpsLastResult(`[INQUIRY] ${JSON.stringify(out)}`)
          return
        }
        if (action === 'cancel') {
          const cancelPartnerTxnUid = `CCH${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
          const out = await executeKbankCancelQr({
            storeCode: currentStoreId,
            origPartnerTxnUid,
            originalTransactionId: origPartnerTxnUid,
            partnerTxnUid: cancelPartnerTxnUid,
            terminalId: terminalId || undefined,
            payload: {
              partnerTxnUid: cancelPartnerTxnUid,
              origPartnerTxnUid,
              ...(terminalId ? { terminalId } : {}),
            },
          })
          if (out.success) {
            kbankManualCancelPendingRef.current = true
            purgeKbankPendingFinalize(origPartnerTxnUid || partnerTxnUid)
            clearKbankQrFromLinkpos()
            setKbankCallbackState('failed')
            openKbankOutcomeModal(
              {
                kind: 'cancelled',
                amount: Math.max(0, Number(liveKbankQrAmount || 0)),
                refId: origPartnerTxnUid || partnerTxnUid,
                paymentMethod: liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                timeLabel: formatPosDateTimeMedium(new Date(), lang),
              },
              `cancel:${origPartnerTxnUid || partnerTxnUid}:${cancelPartnerTxnUid}`
            )
          }
          setKbankOpsLastResult(`[CANCEL] ${JSON.stringify(out)}`)
          return
        }
        if (action === 'void') {
          let voidTxnNo = resolveKbankVoidTxnNoForRequest(txnNoRaw) || ''
          if (!voidTxnNo) {
            kbankInquiryLastAtRef.current = Date.now()
            const inq = await executeKbankCheckStatus({
              storeCode: currentStoreId,
              partnerTransactionId: partnerTxnUid,
              originalTransactionId: origPartnerTxnUid,
              terminalId: terminalId || undefined,
              payload: {
                origPartnerTxnUid,
                qrType: liveKbankQrType,
                ...(terminalId ? { terminalId } : {}),
              },
            })
            if (inq.success) {
              const inqData = (inq.data || {}) as Record<string, unknown>
              voidTxnNo = extractKbankPaymentTxnNo(inqData).slice(0, 20)
              if (voidTxnNo) setKbankOpsTxnNo(voidTxnNo)
            }
            if (!voidTxnNo) {
              const inqErr = String(
                inq.statusMessage ||
                  inq.message ||
                  t('posKbankVoidInquiryFailed') ||
                  'Could not obtain txnNo from Inquiry. Check KBank response below.'
              ).trim()
              const rateLimited = noteKbankRateLimitResponse(inqErr)
              await appAlert(
                rateLimited
                  ? String(t('posKbankRateLimitAlert') || inqErr)
                      .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                      .replace('{label}', 'Inquiry') || inqErr
                  : inqErr
              )
              setKbankOpsLastResult(`[VOID-INQUIRY] ${JSON.stringify(inq)}`)
              return
            }
          }
          const voidPartnerTxnUid = `VOD${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
          const out = await executeKbankVoidPayment({
            storeCode: currentStoreId,
            origPartnerTxnUid,
            originalTransactionId: origPartnerTxnUid,
            partnerTxnUid: voidPartnerTxnUid,
            terminalId: terminalId || undefined,
            txnNo: voidTxnNo || undefined,
            payload: {
              partnerTxnUid: voidPartnerTxnUid,
              origPartnerTxnUid,
              ...(terminalId ? { terminalId } : {}),
              ...(voidTxnNo ? { txnNo: voidTxnNo } : {}),
            },
          })
          if (out.success) {
            const d = (out.data || {}) as Record<string, unknown>
            const nextTxnNo = extractKbankPaymentTxnNo(d).slice(0, 20) || voidTxnNo
            if (nextTxnNo) setKbankOpsTxnNo(nextTxnNo)
            purgeKbankPendingFinalize(origPartnerTxnUid || partnerTxnUid)
            clearKbankQrFromLinkpos()
            setKbankCallbackState('failed')
            openKbankOutcomeModal(
              {
                kind: 'voided',
                amount: Math.max(0, Number(liveKbankQrAmount || 0)),
                refId: origPartnerTxnUid || partnerTxnUid,
                paymentMethod: liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                approvalCode: nextTxnNo || voidTxnNo || undefined,
                timeLabel: formatPosDateTimeMedium(new Date(), lang),
              },
              `void:${origPartnerTxnUid || partnerTxnUid}:${voidPartnerTxnUid}`
            )
          } else {
            const voidErr = String(
              out.statusMessage ||
                out.message ||
                t('posKbankVoidFailedAlert') ||
                'Void payment failed. Check KBank response in the panel below.'
            ).trim()
            const rateLimited = noteKbankRateLimitResponse(voidErr)
            await appAlert(
              rateLimited
                ? String(t('posKbankRateLimitAlert') || voidErr)
                    .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                    .replace('{label}', 'Void') || voidErr
                : voidErr
            )
          }
          setKbankOpsLastResult(`[VOID] ${JSON.stringify(out)}`)
          return
        }
        if (liveKbankQrType === 'CREDIT_CARD') {
          await appAlert(
            t('posKbankSettlementThaiQrOnlyAlert') ||
              'Manual Settlement is not supported for Credit Card QR. Only Thai QR supports immediate settlement.'
          )
          return
        }
        if (!terminalId) {
          await appAlert(
            t('posKbankTerminalIdRequiredAlert') ||
              'terminalId is required for Settlement. Enter terminalId in the KBank panel or set KBANK_TERMINAL_ID.'
          )
          return
        }
        const settlementPartnerTxnUid = `STM${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
        const out = await executeKbankSettlement({
          storeCode: currentStoreId,
          partnerTxnUid: settlementPartnerTxnUid,
          terminalId,
          qrType: 'THAI_QR',
          payload: {
            partnerTxnUid: settlementPartnerTxnUid,
            terminalId,
            qrType: 'THAI_QR',
          },
        })
        setKbankOpsLastResult(`[SETTLEMENT] ${JSON.stringify(out)}`)
      } finally {
        setKbankOpsBusy(false)
      }
    },
    [
      currentStoreId,
      kbankOpsTxnUid,
      kbankOpsOrigTxnUid,
      kbankOpsTerminalId,
      kbankOpsTxnNo,
      liveKbankQrType,
      kbankCallbackState,
      t,
      enforceKbankCooldown,
      liveKbankQrAmount,
      openKbankOutcomeModal,
      presentKbankPaymentApproved,
      presentKbankApprovedFromInquiry,
      purgeKbankPendingFinalize,
      clearKbankQrFromLinkpos,
      alertIfKbankApiPaused,
      noteKbankRateLimitResponse,
      lang,
    ]
  )

  const applyKbankManualMemoTag = useCallback(
    (
      memo: string | null | undefined,
      result: { pending?: boolean; partnerTransactionId?: string } | { ok?: boolean }
    ) => {
      const base = String(memo ?? '').trim()
      const isManual = Boolean((result as { pending?: boolean }).pending)
      if (!isManual) return base
      const txnId = String((result as { partnerTransactionId?: string }).partnerTransactionId ?? '').trim()
      const tag = txnId ? `[KBANK_MANUAL:${txnId}]` : '[KBANK_MANUAL]'
      if (base.includes(tag)) return base
      if (base.includes('[KBANK_MANUAL')) return base
      return base ? `${base}\n${tag}` : tag
    },
    []
  )

  // -------------------------------------------------------------------------
  // Effects: callback polling, inquiry polling, CC txnNo inquiry
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    const localTxId = String(kbankOpsTxnUid || '').trim()
    if (!localTxId) {
      setKbankCallbackState('idle')
      return
    }
    if (kbankCallbackState === 'idle') {
      setKbankCallbackState('waiting')
    }
    let cancelled = false
    const applyCallbackAttempt = async () => {
      const businessDate = getPosBusinessDateStr()
      const rows = await getPosPaymentAttempts({
        startStr: businessDate,
        endStr: businessDate,
        storeCode: currentStoreId,
        status: 'all',
        localTxId,
        limit: 1,
      })
      if (cancelled || !Array.isArray(rows) || rows.length === 0) return
      const hit = rows[0] as PosPaymentAttempt | undefined
      if (!hit) return
      const status = String(hit.status || '').trim().toLowerCase()
      const lowerText = String(hit.responseText || '').trim().toLowerCase()
      const txnNoFromTextMatch =
        lowerText.match(/(?:txnno|transactionno)\s*[:=]\s*(\d{6,16})/i) ||
        lowerText.match(/\btxnno\b.*?(\d{6,16})\b/i)
      const txnNoFromText = String(txnNoFromTextMatch?.[1] || '').trim()
      const tracePaymentTxnNo = String(hit.traceNo || '').trim()
      let paymentTxnNo = ''
      if (isKbankPaymentTxnNo(tracePaymentTxnNo)) {
        paymentTxnNo = tracePaymentTxnNo
      } else if (isKbankPaymentTxnNo(txnNoFromText)) {
        paymentTxnNo = txnNoFromText
      }
      if (paymentTxnNo && !resolveKbankInquiryTxnNoForRequest(kbankOpsTxnNo, { qrType: liveKbankQrType })) {
        setKbankOpsTxnNo(paymentTxnNo.slice(0, 20))
      }
      if (isKbankPaymentAttemptApproved(hit)) {
        setKbankOpsLastResult(
          `[CALLBACK] ${JSON.stringify({
            localTxId,
            status: hit.status,
            responseCode: hit.responseCode,
            responseText: hit.responseText,
            traceNo: hit.traceNo,
            createdAt: hit.createdAt,
          })}`
        )
        const methodFromText = lowerText.includes('credit') || lowerText.includes('card')
        presentKbankPaymentApproved({
          refId: localTxId,
          amount: Math.max(0, Number(hit.approvedAmount || hit.requestAmount || liveKbankQrAmount || 0)),
          paymentMethod:
            liveKbankQrType === 'CREDIT_CARD' || methodFromText
              ? 'Credit Card QR'
              : 'PromptPay QR',
          approvalCode:
            String(hit.approvalCode || paymentTxnNo || kbankOpsTxnNo || '').trim() || undefined,
          timeLabel: formatPosDateTimeMedium(hit.createdAt ? new Date(hit.createdAt) : new Date(), lang),
          dedupeKey: `callback:${localTxId}:${hit.createdAt || ''}:${hit.responseCode || ''}`,
        })
        return
      }
      if (status === 'declined' || status === 'failed' || status === 'timeout' || status === 'error') {
        setKbankCallbackState('failed')
      }
    }
    void applyCallbackAttempt().catch(() => {})
    const callbackPollMs = liveKbankQrType === 'CREDIT_CARD' ? 5_000 : 8_000
    const timerId = window.setInterval(() => {
      void applyCallbackAttempt().catch(() => {})
    }, callbackPollMs)
    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [
    isKbankPilotStore,
    currentStoreId,
    kbankOpsTxnUid,
    kbankOpsTxnNo,
    kbankCallbackState,
    liveKbankQrAmount,
    liveKbankQrType,
    kbankOpsCardBrands,
    presentKbankPaymentApproved,
    lang,
  ])

  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
    const origPartnerTxnUid = kbankOrigPartnerTxnUidForFollowup(partnerTxnUid)
    if (!partnerTxnUid || kbankCallbackState !== 'waiting') return

    let cancelled = false
    const pollApprovedViaInquiry = async () => {
      if (cancelled || kbankCallbackNotifiedTxRef.current === partnerTxnUid) return
      if (isKbankApiPaused()) return
      const inquiryCooldownMs = liveKbankQrType === 'CREDIT_CARD' ? 20_000 : 60_000
      if (Date.now() - kbankInquiryLastAtRef.current < inquiryCooldownMs) return

      kbankInquiryLastAtRef.current = Date.now()
      const terminalId = String(kbankOpsTerminalId || '').trim()
      const pollInquiryTxnNo = resolveKbankInquiryTxnNoForRequest(String(kbankOpsTxnNo || '').trim(), {
        qrType: liveKbankQrType,
      })
      try {
        const st = await executeKbankCheckStatus({
          storeCode: currentStoreId,
          partnerTransactionId: partnerTxnUid,
          originalTransactionId: origPartnerTxnUid || undefined,
          terminalId: terminalId || undefined,
          txnNo: pollInquiryTxnNo,
          payload: {
            ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
            ...(terminalId ? { terminalId } : {}),
            qrType: liveKbankQrType,
            ...(pollInquiryTxnNo ? { txnNo: pollInquiryTxnNo } : {}),
          },
        })
        if (cancelled) return
        if (!st.success) {
          noteKbankRateLimitResponse(st.statusMessage || st.message)
          return
        }
        presentKbankApprovedFromInquiry(partnerTxnUid, st, 'auto-inquiry', {
          paymentMethod:
            liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
        })
      } catch {
        /* noop */
      }
    }

    const pollFirstDelayMs = liveKbankQrType === 'CREDIT_CARD' ? 12_000 : 60_000
    const pollIntervalMs = liveKbankQrType === 'CREDIT_CARD' ? 45_000 : 120_000
    const firstDelayMs = window.setTimeout(() => {
      void pollApprovedViaInquiry()
    }, pollFirstDelayMs)
    const intervalId = window.setInterval(() => {
      void pollApprovedViaInquiry()
    }, pollIntervalMs)

    return () => {
      cancelled = true
      window.clearTimeout(firstDelayMs)
      window.clearInterval(intervalId)
    }
  }, [
    isKbankPilotStore,
    currentStoreId,
    kbankOpsTxnUid,
    kbankOpsOrigTxnUid,
    kbankOpsTerminalId,
    kbankOpsTxnNo,
    kbankCallbackState,
    presentKbankPaymentApproved,
    presentKbankApprovedFromInquiry,
    isKbankApiPaused,
    noteKbankRateLimitResponse,
    liveKbankQrType,
  ])

  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    if (liveKbankQrType !== 'CREDIT_CARD') return
    if (kbankCallbackState !== 'waiting') return
    const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
    if (!partnerTxnUid || kbankCallbackNotifiedTxRef.current === partnerTxnUid) return
    const inquiryTxnNo = resolveKbankInquiryTxnNoForRequest(kbankOpsTxnNo, {
      qrType: 'CREDIT_CARD',
    })
    if (!inquiryTxnNo) return
    const triggerKey = `${partnerTxnUid}:${inquiryTxnNo}`
    if (kbankCcInquiryTriggeredRef.current === triggerKey) return
    if (isKbankApiPaused()) return
    kbankCcInquiryTriggeredRef.current = triggerKey

    let cancelled = false
    void (async () => {
      if (Date.now() - kbankInquiryLastAtRef.current < 3_000) return
      kbankInquiryLastAtRef.current = Date.now()
      const origPartnerTxnUid = kbankOrigPartnerTxnUidForFollowup(partnerTxnUid)
      const terminalId = String(kbankOpsTerminalId || '').trim()
      try {
        const st = await executeKbankCheckStatus({
          storeCode: currentStoreId,
          partnerTransactionId: partnerTxnUid,
          originalTransactionId: origPartnerTxnUid || undefined,
          terminalId: terminalId || undefined,
          txnNo: inquiryTxnNo,
          payload: {
            ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
            ...(terminalId ? { terminalId } : {}),
            qrType: 'CREDIT_CARD',
            txnNo: inquiryTxnNo,
          },
        })
        if (cancelled) return
        if (!st.success) {
          noteKbankRateLimitResponse(st.statusMessage || st.message)
          return
        }
        const shown = presentKbankApprovedFromInquiry(partnerTxnUid, st, 'cc-txn-inquiry', {
          paymentMethod: 'Credit Card QR',
        })
        if (!shown) kbankCcInquiryTriggeredRef.current = ''
      } catch {
        kbankCcInquiryTriggeredRef.current = ''
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    isKbankPilotStore,
    currentStoreId,
    liveKbankQrType,
    kbankCallbackState,
    kbankOpsTxnUid,
    kbankOpsTxnNo,
    kbankOpsTerminalId,
    presentKbankApprovedFromInquiry,
    isKbankApiPaused,
    noteKbankRateLimitResponse,
  ])

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  const clearLiveKbankQr = useCallback(() => {
    setLiveKbankQrPayload('')
    setLiveKbankQrType('THAI_QR')
  }, [])

  return {
    liveKbankQrPayload,
    liveKbankQrAmount,
    liveKbankQrType,
    liveKbankQrTypeSource,
    kbankSentQrTypeCode,
    kbankGenerateAuditText,
    kbankOpsBusy,
    kbankOpsTxnUid,
    kbankOpsOrigTxnUid,
    kbankOpsTxnNo,
    setKbankOpsTxnNo,
    kbankOpsTerminalId,
    setKbankOpsTerminalId,
    kbankOpsLastResult,
    kbankOpsCardBrands,
    kbankCallbackState,
    kbankOutcomeState,
    setKbankOutcomeState,
    kbankApiPausedUntilMs,
    linkposQrBridgeStatus,
    isKbankPilotStore,
    demoKbankQrPayload,
    effectiveStaffKbankQrPayload,
    showKbankStaffMonitor,
    effectiveStaffKbankQrAmount,
    effectiveCustomerDisplayQrPayload,
    effectiveCustomerDisplayQrType,
    staffKbankQrTypeLabel,
    clearKbankQrSession,
    runKbankQrPaymentIfNeeded,
    runKbankFollowupAction,
    applyKbankManualMemoTag,
    registerPendingKbankFinalize,
    purgeKbankPendingFinalize,
    clearLiveKbankQr,
  }
}
