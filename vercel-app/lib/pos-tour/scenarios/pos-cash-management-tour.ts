import type { PosTourScenario, PosTourStep } from '../pos-tour-types'
import { POS_DEMO_ROUTES } from '../demo-routes'

const steps: PosTourStep[] = [
  {
    id: 'cm1_intro',
    target: 'pos-tour-cash-shell',
    titleKey: 'posCashTourS1Title',
    bodyKey: 'posCashTourS1Body',
    advance: 'manual',
  },
  {
    id: 'cm2_subtabs',
    target: 'pos-tour-cash-subtabs',
    titleKey: 'posCashTourS1bTitle',
    bodyKey: 'posCashTourS1bBody',
    advance: 'manual',
  },
  {
    id: 'cm3_filters',
    target: 'pos-tour-cash-filters',
    titleKey: 'posCashTourS1cTitle',
    bodyKey: 'posCashTourS1cBody',
    advance: 'manual',
  },
  {
    id: 'cm4_ledger',
    target: 'pos-tour-cash-ledger-table',
    titleKey: 'posCashTourS1dTitle',
    bodyKey: 'posCashTourS1dBody',
    advance: 'manual',
  },
  {
    id: 'cm5_sales_withdrawal',
    target: 'pos-tour-cash-sales-withdrawal',
    titleKey: 'posCashTourS1eTitle',
    bodyKey: 'posCashTourS1eBody',
    advance: 'manual',
  },
  {
    id: 'cm6_add_form',
    target: 'pos-tour-cash-add-form',
    titleKey: 'posCashTourS2Title',
    bodyKey: 'posCashTourS2Body',
    advance: 'manual',
  },
  {
    id: 'cm7_add_save',
    target: 'pos-tour-cash-add-save',
    titleKey: 'posCashTourS3Title',
    bodyKey: 'posCashTourS3Body',
    advance: 'manual',
  },
  {
    id: 'cm8_go_close',
    target: 'pos-tour-nospot',
    titleKey: 'posCashTourS4Title',
    bodyKey: 'posCashTourS4Body',
    advance: 'manual',
    navigateOnNext: POS_DEMO_ROUTES.businessClose,
  },
]

export const posCashManagementScenario: PosTourScenario = {
  id: 'pos-cash-management-tour',
  titleKey: 'posCashTourTitle',
  steps,
}
