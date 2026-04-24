/**
 * `data-tour` 속성 값(셀렉터 `[data-tour="…"]`와 동일).
 * 터미널·하위 컴포넌트에 같은 문자열을 박아야 스포트라이트가 맞습니다.
 */
export type PosTourTargetId = string

export type PosTourAdvanceKind =
  | 'manual'
  | 'active_tab_tables'
  | 'active_tab_delivery'
  | 'active_tab_takeout'
  | 'table_selected_for_order'
  | 'cart_has_line'
  | 'cart_has_line_dinein'
  | 'cart_has_line_delivery'
  | 'cart_has_line_takeout'
  | 'serving_panel_open'
  | 'takeout_draft'
  | 'payment_modal_open'
  | 'payment_tab_card'
  | 'payment_tab_qr'
  | 'payment_tab_delivery_app'
  | 'payment_tab_other'
  | 'payment_card_amount_entered'
  | 'payment_qr_amount_entered'
  | 'payment_delivery_app_amount_entered'
  | 'payment_other_amount_entered'
  | 'tax_invoice_enabled'
  | 'payment_completed'
  /** 상단 메인/주문 기기 토글을 최소 1회 변경 */
  | 'main_device_mode_changed'
  /** 실시간 메뉴 검색 다이얼로그 열림 */
  | 'live_menu_search_open'
  /** 홀 서빙 패널에서 줄별 서빙을 1개 이상 체크 */
  | 'serving_item_checked'
  /** 홀 서빙 패널에서 주문 상태가 ready(전체 서빙 완료 처리 후) */
  | 'serving_order_ready'

/** `spotlightSequence` 한 칸에 대응하는 툴팁 키 쌍 */
export type PosTourSpotlightSequenceCopy = {
  titleKey: string
  bodyKey: string
}

export type PosTourStep = {
  /** 내부/테스트용 식별(시나리오 내 유일) */
  id: string
  /** 하이라이트: `[data-tour=…]` (특수: `pos-tour-nospot` = 전체 딤만) */
  target: PosTourTargetId
  titleKey: string
  bodyKey: string
  /** 이 조건이 만족될 때 다음 스텝으로 */
  advance?: PosTourAdvanceKind
  /** false면 어두운 마스크 없이 툴팁만(결제 다이얼로그 z-order 대비) */
  overlayDim?: boolean
  /**
   * 한 스텝 안에서 `[data-tour=…]`를 순서대로 번갈아 하이라이트(예: 테이블 경과분 → 색 단계 → 주문 시각).
   * DOM에 해당 마커가 없으면 `target`으로 폴백합니다.
   */
  spotlightSequence?: PosTourTargetId[]
  /**
   * `spotlightSequence`와 같은 길이를 권장. 있으면 조명이 바뀔 때마다 해당 인덱스의 title/body 키로 툴팁 문구를 바꿉니다.
   * 길이가 짧거나 없으면 `titleKey`/`bodyKey`로 폴백합니다.
   */
  spotlightSequenceCopy?: readonly PosTourSpotlightSequenceCopy[]
  /** `spotlightSequence` 전환 주기(ms). 기본 2600. `spotlightSequenceManualAdvance`가 true면 무시 */
  spotlightSequenceIntervalMs?: number
  /**
   * true면 순환 타이머 없이 **「다음」**으로만 다음 조명으로 이동(마지막 조명에서 「다음」= 다음 투어 스텝).
   * `advance: 'manual'`인 스텝에서 주로 사용.
   */
  spotlightSequenceManualAdvance?: boolean
  /**「다음」시 이 경로로 이동(예: 홈 투어 끝 → 터미널) — `router.push` */
  navigateOnNext?: string
}

export type PosTourScenario = {
  id: string
  titleKey: string
  steps: readonly PosTourStep[]
}
