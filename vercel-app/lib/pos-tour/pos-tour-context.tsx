'use client'

import * as React from 'react'
import { getPosTourScenario } from './get-pos-tour-scenario'
import { DEFAULT_POS_TOUR_SCENARIO_ID } from './pos-tour-constants'
import type { PosTourAdvanceKind, PosTourScenario, PosTourStep } from './pos-tour-types'

type PosTourContextValue = {
  isDemo: boolean
  /** 데모일 때 투어 사용 여부(미래: 데모만 켜고 투어는 끄는 옵션) */
  tourEnabled: boolean
  scenario: PosTourScenario
  stepIndex: number
  setStepIndex: React.Dispatch<React.SetStateAction<number>>
  currentStep: PosTourStep | null
  goNext: () => void
  goPrev: () => void
  endTour: () => void
  /** 투어 콘솔(오버레이) 슬롯: 데모·히든 안 함·스텝 있을 때(언어 게이트·투어 공용) */
  showOverlay: boolean
  /**
   * 데모 투어의 **스텝 설명**(스팟라이트)을 띄울지.
   * `false`일 때는 같은 자리(오른쪽 상단)에 **언어 선택**만 먼저 보입니다.
   */
  showTourStepOverlay: boolean
  /** 데모 언어 게이트(「가이드 시작」) 완료 여부 — 시나리오/데모 켤 때마다 false로 리셋 */
  preTourLanguageDone: boolean
  completePreTourLanguage: () => void
}

const Ctx = React.createContext<PosTourContextValue | null>(null)

export function usePosTour(): PosTourContextValue {
  const v = React.useContext(Ctx)
  if (!v) {
    return {
      isDemo: false,
      tourEnabled: false,
      scenario: getPosTourScenario(DEFAULT_POS_TOUR_SCENARIO_ID),
      stepIndex: 0,
      setStepIndex: () => {},
      currentStep: null,
      goNext: () => {},
      goPrev: () => {},
      endTour: () => {},
      showOverlay: false,
      showTourStepOverlay: false,
      preTourLanguageDone: true,
      completePreTourLanguage: () => {},
    }
  }
  return v
}

type ProviderProps = {
  children: React.ReactNode
  isDemo: boolean
  /** URL/시스템에서 읽은 시나리오 id(문자열) */
  scenarioId: string
}

export function PosTourProvider({ children, isDemo, scenarioId }: ProviderProps) {
  const [ended, setEnded] = React.useState(false)
  const [stepIndex, setStepIndex] = React.useState(0)
  const [preTourLanguageDone, setPreTourLanguageDone] = React.useState(!isDemo)
  const scenario = React.useMemo(() => getPosTourScenario(scenarioId), [scenarioId])
  const tourEnabled = isDemo
  const currentStep = scenario.steps[stepIndex] ?? null
  const maxIdx = Math.max(0, scenario.steps.length - 1)

  const completePreTourLanguage = React.useCallback(() => {
    setPreTourLanguageDone(true)
  }, [])

  const goNext = React.useCallback(() => {
    setStepIndex((i) => Math.min(maxIdx, i + 1))
  }, [maxIdx])

  const goPrev = React.useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const endTour = React.useCallback(() => {
    setEnded(true)
  }, [])

  const baseShow =
    isDemo && tourEnabled && !ended && scenario.steps.length > 0
  const value: PosTourContextValue = {
    isDemo,
    tourEnabled,
    scenario,
    stepIndex,
    setStepIndex,
    currentStep,
    goNext,
    goPrev,
    endTour,
    showOverlay: baseShow,
    showTourStepOverlay: baseShow && preTourLanguageDone,
    preTourLanguageDone,
    completePreTourLanguage,
  }

  // 데모·시나리오가 바뀌면: 스텝·언어 게이트(매 페이지·매 시나리오마다 언어 먼저) 리셋
  const scenarioKey = scenario.id
  React.useEffect(() => {
    if (!isDemo) {
      setPreTourLanguageDone(true)
      return
    }
    setStepIndex(0)
    setEnded(false)
    setPreTourLanguageDone(false)
  }, [isDemo, scenarioKey])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function shouldAdvanceToNextStep(
  adv: PosTourAdvanceKind | undefined,
  p: {
    activeTab: 'tables' | 'delivery' | 'takeout'
    selectedTableId: string | null
    servingTableId: string | null
    cartLineCount: number
    selectedDeliveryTargetId: string | null
    selectedTakeoutTargetId: string | null
    paymentModalOpen: boolean
    paymentTab: 'cash' | 'card' | 'qr' | 'delivery_app' | 'other'
    paymentCardAmount: number
    paymentQrAmount: number
    paymentDeliveryAppAmount: number
    paymentOtherAmount: number
    needTaxInvoice: boolean
    paymentCompletedCount: number
    mainDeviceModeChanged: boolean
    servingOrderReady: boolean
    liveMenuSearchOpen: boolean
  }
): boolean {
  if (!adv || adv === 'manual') return false
  switch (adv) {
    case 'active_tab_tables':
      return p.activeTab === 'tables'
    case 'active_tab_delivery':
      return p.activeTab === 'delivery'
    case 'active_tab_takeout':
      return p.activeTab === 'takeout'
    case 'table_selected_for_order':
      return Boolean(p.selectedTableId && !p.servingTableId)
    case 'cart_has_line':
    case 'cart_has_line_dinein':
      return (
        p.cartLineCount > 0 &&
        p.activeTab === 'tables' &&
        Boolean(p.selectedTableId) &&
        !p.servingTableId
      )
    case 'cart_has_line_takeout':
      return (
        p.cartLineCount > 0 &&
        p.activeTab === 'takeout' &&
        p.selectedTakeoutTargetId === 'takeout-draft'
      )
    case 'cart_has_line_delivery':
      return (
        p.cartLineCount > 0 &&
        p.activeTab === 'delivery' &&
        p.selectedDeliveryTargetId === 'delivery-draft'
      )
    case 'serving_panel_open':
      return p.activeTab === 'tables' && Boolean(p.servingTableId)
    case 'takeout_draft':
      return p.selectedTakeoutTargetId === 'takeout-draft'
    case 'payment_modal_open':
      return p.paymentModalOpen
    case 'payment_tab_card':
      return p.paymentModalOpen && p.paymentTab === 'card'
    case 'payment_tab_qr':
      return p.paymentModalOpen && p.paymentTab === 'qr'
    case 'payment_tab_delivery_app':
      return p.paymentModalOpen && p.paymentTab === 'delivery_app'
    case 'payment_tab_other':
      return p.paymentModalOpen && p.paymentTab === 'other'
    case 'payment_card_amount_entered':
      return p.paymentModalOpen && p.paymentTab === 'card' && p.paymentCardAmount > 0
    case 'payment_qr_amount_entered':
      return p.paymentModalOpen && p.paymentTab === 'qr' && p.paymentQrAmount > 0
    case 'payment_delivery_app_amount_entered':
      return p.paymentModalOpen && p.paymentTab === 'delivery_app' && p.paymentDeliveryAppAmount > 0
    case 'payment_other_amount_entered':
      return p.paymentModalOpen && p.paymentTab === 'other' && p.paymentOtherAmount > 0
    case 'tax_invoice_enabled':
      return p.paymentModalOpen && p.needTaxInvoice
    case 'payment_completed':
      return p.paymentCompletedCount > 0
    case 'main_device_mode_changed':
      return p.mainDeviceModeChanged
    case 'live_menu_search_open':
      return p.liveMenuSearchOpen
    case 'serving_order_ready':
      return p.servingOrderReady
    default:
      return false
  }
}

/** 터미널 state와 시나리오 `advance` 규칙을 맞춥니다. */
export function PosTerminalTourController(p: {
  activeTab: 'tables' | 'delivery' | 'takeout'
  /** 신규 주문을 위해 고른 테이블(빈 테이블) */
  selectedTableId: string | null
  /** 진행 중 주문이 있어 “서빙”용으로 열었을 때 */
  servingTableId: string | null
  cartLineCount: number
  /** 배달 탭에서 `새 주문` 등으로 열었을 때 (예: `delivery-draft`) */
  selectedDeliveryTargetId: string | null
  /** 포장 탭에서 `새 주문` 등으로 열었을 때 (예: `takeout-draft`) */
  selectedTakeoutTargetId: string | null
  /** CartPanel 결제 Dialog 열림 */
  paymentModalOpen: boolean
  /** 결제 다이얼로그 내 현재 탭 */
  paymentTab: 'cash' | 'card' | 'qr' | 'delivery_app' | 'other'
  /** 결제 다이얼로그 수단별 입력 금액 */
  paymentCardAmount: number
  paymentQrAmount: number
  paymentDeliveryAppAmount: number
  paymentOtherAmount: number
  /** 세금계산서(영수증) 발행 켜짐 */
  needTaxInvoice: boolean
  /** 결제 완료 클릭 횟수(투어용) */
  paymentCompletedCount: number
  /** 상단 메인/주문 기기 토글을 사용했는지 */
  mainDeviceModeChanged: boolean
  /** 홀 서빙 중 주문이 전체 서빙 완료(ready) 상태 */
  servingOrderReady: boolean
  /** 실시간 메뉴 검색 Dialog 열림 */
  liveMenuSearchOpen: boolean
}) {
  const { scenario, stepIndex, setStepIndex, isDemo, showOverlay, showTourStepOverlay } = usePosTour()
  const s = scenario.steps[stepIndex]
  const advance = s?.advance
  const maxIdx = Math.max(0, scenario.steps.length - 1)
  const autoAdvanceSatisfiedRef = React.useRef<Record<string, boolean>>({})
  const floorFallbackSatisfiedRef = React.useRef(false)

  React.useEffect(() => {
    autoAdvanceSatisfiedRef.current = {}
    floorFallbackSatisfiedRef.current = false
  }, [scenario.id, isDemo])

  React.useEffect(() => {
    if (!isDemo || !showOverlay || !showTourStepOverlay) return
    if (!s) return

    // full-tour floor step fallback:
    // if user taps an occupied table, UI opens serving panel instead of new-order menu.
    // jump directly to serving-panel step so tour does not get stuck on floor step.
    const floorFallbackActive = s.id === 'w10_floor' && p.activeTab === 'tables' && Boolean(p.servingTableId)
    if (!floorFallbackActive) {
      floorFallbackSatisfiedRef.current = false
    } else if (!floorFallbackSatisfiedRef.current) {
      floorFallbackSatisfiedRef.current = true
      const servingPanelIdx = scenario.steps.findIndex((step) => step.id === 'w13a_serving_panel')
      if (servingPanelIdx >= 0) {
        setStepIndex(servingPanelIdx)
      }
      return
    } else {
      return
    }

    if (!advance || advance === 'manual') return
    const satisfied = shouldAdvanceToNextStep(advance, p)
    const stepKey = s.id
    const prevSatisfied = Boolean(autoAdvanceSatisfiedRef.current[stepKey])
    if (!satisfied) {
      autoAdvanceSatisfiedRef.current[stepKey] = false
      return
    }
    if (prevSatisfied) return
    autoAdvanceSatisfiedRef.current[stepKey] = true
    setStepIndex((i) => Math.min(maxIdx, i + 1))
  }, [
    stepIndex,
    advance,
    isDemo,
    showOverlay,
    showTourStepOverlay,
    s,
    p.activeTab,
    p.selectedTableId,
    p.servingTableId,
    p.cartLineCount,
    p.selectedDeliveryTargetId,
    p.selectedTakeoutTargetId,
    p.paymentModalOpen,
    p.paymentTab,
    p.paymentCardAmount,
    p.paymentQrAmount,
    p.paymentDeliveryAppAmount,
    p.paymentOtherAmount,
    p.needTaxInvoice,
    p.paymentCompletedCount,
    p.mainDeviceModeChanged,
    p.servingOrderReady,
    p.liveMenuSearchOpen,
    maxIdx,
    setStepIndex,
  ])

  return null
}
