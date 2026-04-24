import type { PosTourScenario, PosTourStep } from '../pos-tour-types'
import { POS_DEMO_ROUTES } from '../demo-routes'

const steps: PosTourStep[] = [
  { id: 'h1_welcome', target: 'pos-tour-nospot', titleKey: 'posMainTourH1Title', bodyKey: 'posMainTourH1Body', advance: 'manual' },
  { id: 'h2_header', target: 'pos-tour-header', titleKey: 'posMainTourH2Title', bodyKey: 'posMainTourH2Body', advance: 'manual' },
  { id: 'h7_manage', target: 'pos-tour-main-manage-section', titleKey: 'posMainTourH7Title', bodyKey: 'posMainTourH7Body', advance: 'manual' },
  { id: 'h8_business', target: 'pos-tour-tile-business', titleKey: 'posMainTourH8Title', bodyKey: 'posMainTourH8Body', advance: 'manual' },
  { id: 'h9_cash', target: 'pos-tour-tile-cash', titleKey: 'posMainTourH9Title', bodyKey: 'posMainTourH9Body', advance: 'manual' },
  { id: 'h3_order_block', target: 'pos-tour-main-order-section', titleKey: 'posMainTourH3Title', bodyKey: 'posMainTourH3Body', advance: 'manual' },
  { id: 'h4_dine_in', target: 'pos-tour-tile-dine-in', titleKey: 'posMainTourH4Title', bodyKey: 'posMainTourH4Body', advance: 'manual' },
  { id: 'h5_takeout', target: 'pos-tour-tile-takeout', titleKey: 'posMainTourH5Title', bodyKey: 'posMainTourH5Body', advance: 'manual' },
  { id: 'h6_delivery', target: 'pos-tour-tile-delivery', titleKey: 'posMainTourH6Title', bodyKey: 'posMainTourH6Body', advance: 'manual' },
  { id: 'h10_operations', target: 'pos-tour-tile-operations', titleKey: 'posMainTourH10Title', bodyKey: 'posMainTourH10Body', advance: 'manual' },
  { id: 'h11_switch_user', target: 'pos-tour-switch-user', titleKey: 'posMainTourH11Title', bodyKey: 'posMainTourH11Body', advance: 'manual' },
  {
    id: 'h12_goto_terminal',
    target: 'pos-tour-nospot',
    titleKey: 'posMainTourH12Title',
    bodyKey: 'posMainTourH12Body',
    advance: 'manual',
    navigateOnNext: POS_DEMO_ROUTES.terminalFullDineIn,
  },
]

export const posMainWalkthroughScenario: PosTourScenario = {
  id: 'pos-main-walkthrough',
  titleKey: 'posMainTourScenarioTitle',
  steps,
}
