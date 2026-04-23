import type { PosTourScenario, PosTourStep } from '../pos-tour-types'

const steps: PosTourStep[] = [
  {
    id: 'bc1_intro',
    target: 'pos-tour-settlement-shell',
    titleKey: 'posBusinessCloseTourS1Title',
    bodyKey: 'posBusinessCloseTourS1Body',
    advance: 'manual',
  },
  {
    id: 'bc2_entry',
    target: 'pos-tour-close-entry',
    titleKey: 'posBusinessCloseTourS2Title',
    bodyKey: 'posBusinessCloseTourS2Body',
    advance: 'manual',
  },
  {
    id: 'bc3_cash_actual',
    target: 'pos-tour-close-cash-actual',
    titleKey: 'posBusinessCloseTourS3Title',
    bodyKey: 'posBusinessCloseTourS3Body',
    advance: 'manual',
  },
  {
    id: 'bc4_close_check',
    target: 'pos-tour-close-checkbox',
    titleKey: 'posBusinessCloseTourS4Title',
    bodyKey: 'posBusinessCloseTourS4Body',
    advance: 'manual',
  },
  {
    id: 'bc5_save',
    target: 'pos-tour-close-save',
    titleKey: 'posBusinessCloseTourS5Title',
    bodyKey: 'posBusinessCloseTourS5Body',
    advance: 'manual',
  },
]

export const posBusinessCloseScenario: PosTourScenario = {
  id: 'pos-business-close-tour',
  titleKey: 'posBusinessCloseTourTitle',
  steps,
}
