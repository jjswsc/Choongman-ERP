import type { PosTourScenario, PosTourStep } from '../pos-tour-types'

const CASH_MANAGEMENT_DEMO = '/pos/local/cash?demo=1&scenario=pos-cash-management-tour'

const steps: PosTourStep[] = [
  {
    id: 'bo1_intro',
    target: 'pos-tour-settlement-shell',
    titleKey: 'posBusinessOpenTourS1Title',
    bodyKey: 'posBusinessOpenTourS1Body',
    advance: 'manual',
  },
  {
    id: 'bo2_count_cash',
    target: 'pos-tour-open-cash-counts',
    titleKey: 'posBusinessOpenTourS2Title',
    bodyKey: 'posBusinessOpenTourS2Body',
    advance: 'manual',
  },
  {
    id: 'bo3_save_open',
    target: 'pos-tour-open-save',
    titleKey: 'posBusinessOpenTourS3Title',
    bodyKey: 'posBusinessOpenTourS3Body',
    advance: 'manual',
  },
  {
    id: 'bo4_go_cash',
    target: 'pos-tour-nospot',
    titleKey: 'posBusinessOpenTourS4Title',
    bodyKey: 'posBusinessOpenTourS4Body',
    advance: 'manual',
    navigateOnNext: CASH_MANAGEMENT_DEMO,
  },
]

export const posBusinessOpenScenario: PosTourScenario = {
  id: 'pos-business-open-tour',
  titleKey: 'posBusinessOpenTourTitle',
  steps,
}
