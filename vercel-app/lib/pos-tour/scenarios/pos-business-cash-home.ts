import type { PosTourScenario, PosTourStep } from '../pos-tour-types'

const BUSINESS_OPEN_DEMO = '/pos/settlement?mode=open&demo=1&scenario=pos-business-open-tour'

const steps: PosTourStep[] = [
  {
    id: 'bc1_intro',
    target: 'pos-tour-nospot',
    titleKey: 'posBusinessCashHomeTourS1Title',
    bodyKey: 'posBusinessCashHomeTourS1Body',
    advance: 'manual',
  },
  {
    id: 'bc2_business_tile',
    target: 'pos-tour-tile-business',
    titleKey: 'posBusinessCashHomeTourS2Title',
    bodyKey: 'posBusinessCashHomeTourS2Body',
    advance: 'manual',
  },
  {
    id: 'bc3_cash_tile',
    target: 'pos-tour-tile-cash',
    titleKey: 'posBusinessCashHomeTourS3Title',
    bodyKey: 'posBusinessCashHomeTourS3Body',
    advance: 'manual',
  },
  {
    id: 'bc4_go_open',
    target: 'pos-tour-nospot',
    titleKey: 'posBusinessCashHomeTourS4Title',
    bodyKey: 'posBusinessCashHomeTourS4Body',
    advance: 'manual',
    navigateOnNext: BUSINESS_OPEN_DEMO,
  },
]

export const posBusinessCashHomeScenario: PosTourScenario = {
  id: 'pos-business-cash-home',
  titleKey: 'posBusinessCashHomeTourTitle',
  steps,
}
