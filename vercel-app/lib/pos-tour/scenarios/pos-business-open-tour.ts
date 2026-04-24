import type { PosTourScenario, PosTourStep } from '../pos-tour-types'
import { POS_DEMO_ROUTES } from '../demo-routes'

const steps: PosTourStep[] = [
  {
    id: 'bo0_toolbar',
    target: 'pos-tour-settlement-toolbar',
    titleKey: 'posBusinessOpenTourS0Title',
    bodyKey: 'posBusinessOpenTourS0Body',
    advance: 'manual',
  },
  {
    id: 'bo1_intro',
    target: 'pos-tour-settlement-shell',
    titleKey: 'posBusinessOpenTourS1Title',
    bodyKey: 'posBusinessOpenTourS1Body',
    advance: 'manual',
  },
  {
    id: 'bo2_prev_day',
    target: 'pos-tour-open-prev-summary',
    titleKey: 'posBusinessOpenTourS1aTitle',
    bodyKey: 'posBusinessOpenTourS1aBody',
    advance: 'manual',
  },
  {
    id: 'bo3_denom',
    target: 'pos-tour-open-denom-grid',
    titleKey: 'posBusinessOpenTourS2Title',
    bodyKey: 'posBusinessOpenTourS2Body',
    advance: 'manual',
  },
  {
    id: 'bo4_denom_total',
    target: 'pos-tour-open-denom-total',
    titleKey: 'posBusinessOpenTourS2bTitle',
    bodyKey: 'posBusinessOpenTourS2bBody',
    advance: 'manual',
  },
  {
    id: 'bo5_save_open',
    target: 'pos-tour-open-save',
    titleKey: 'posBusinessOpenTourS3Title',
    bodyKey: 'posBusinessOpenTourS3Body',
    advance: 'manual',
  },
  {
    id: 'bo6_full_settlement',
    target: 'pos-tour-open-link-full-settlement',
    titleKey: 'posBusinessOpenTourS3bTitle',
    bodyKey: 'posBusinessOpenTourS3bBody',
    advance: 'manual',
  },
  {
    id: 'bo7_go_cash',
    target: 'pos-tour-nospot',
    titleKey: 'posBusinessOpenTourS4Title',
    bodyKey: 'posBusinessOpenTourS4Body',
    advance: 'manual',
    navigateOnNext: POS_DEMO_ROUTES.cashManagement,
  },
]

export const posBusinessOpenScenario: PosTourScenario = {
  id: 'pos-business-open-tour',
  titleKey: 'posBusinessOpenTourTitle',
  steps,
}
