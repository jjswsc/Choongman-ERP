import type { PosTourScenario, PosTourStep } from '../pos-tour-types'

export type PosTourStepId =
  | 'tables_tab'
  | 'floor'
  | 'menu'
  | 'cart_order'

const steps: PosTourStep[] = [
  {
    id: 'tables_tab',
    target: 'pos-tour-tab-tables',
    titleKey: 'posTourStepTablesTabTitle',
    bodyKey: 'posTourStepTablesTabBody',
    /** 첫 화면 설명 — 「다음」으로 플로어 스텝으로 */
    advance: 'manual',
  },
  {
    id: 'floor',
    target: 'pos-tour-floor',
    titleKey: 'posTourStepFloorTitle',
    bodyKey: 'posTourStepFloorBody',
    advance: 'table_selected_for_order',
  },
  {
    id: 'menu',
    target: 'pos-tour-menu',
    titleKey: 'posTourStepMenuTitle',
    bodyKey: 'posTourStepMenuBody',
    advance: 'cart_has_line_dinein',
  },
  {
    id: 'cart_order',
    target: 'pos-tour-cart-order',
    titleKey: 'posTourStepCartTitle',
    bodyKey: 'posTourStepCartBody',
    advance: 'manual',
  },
]

export const terminalTablesIntroScenario: PosTourScenario = {
  id: 'terminal-tables-intro',
  titleKey: 'posTourScenarioTablesIntroTitle',
  steps,
}
