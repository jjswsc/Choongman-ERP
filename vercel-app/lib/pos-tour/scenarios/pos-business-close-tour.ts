import type { PosTourScenario, PosTourStep } from '../pos-tour-types'

const steps: PosTourStep[] = [
  {
    id: 'bc0_toolbar',
    target: 'pos-tour-settlement-toolbar',
    titleKey: 'posBusinessCloseTourS0Title',
    bodyKey: 'posBusinessCloseTourS0Body',
    advance: 'manual',
  },
  {
    id: 'bc1_intro',
    target: 'pos-tour-settlement-shell',
    titleKey: 'posBusinessCloseTourS1Title',
    bodyKey: 'posBusinessCloseTourS1Body',
    advance: 'manual',
  },
  {
    id: 'bc2_tabs',
    target: 'pos-tour-close-tabs',
    titleKey: 'posBusinessCloseTourS1aTitle',
    bodyKey: 'posBusinessCloseTourS1aBody',
    advance: 'manual',
  },
  {
    id: 'bc3_entry',
    target: 'pos-tour-close-entry',
    titleKey: 'posBusinessCloseTourS2Title',
    bodyKey: 'posBusinessCloseTourS2Body',
    advance: 'manual',
  },
  {
    id: 'bc4_system',
    target: 'pos-tour-close-system-summary',
    titleKey: 'posBusinessCloseTourS2bTitle',
    bodyKey: 'posBusinessCloseTourS2bBody',
    advance: 'manual',
  },
  {
    id: 'bc5_cash_actual',
    target: 'pos-tour-close-cash-actual',
    titleKey: 'posBusinessCloseTourS3Title',
    bodyKey: 'posBusinessCloseTourS3Body',
    advance: 'manual',
  },
  {
    id: 'bc6_cash_line',
    target: 'pos-tour-close-cash-line',
    titleKey: 'posBusinessCloseTourS3bTitle',
    bodyKey: 'posBusinessCloseTourS3bBody',
    advance: 'manual',
  },
  {
    id: 'bc7_totals',
    target: 'pos-tour-close-input-totals',
    titleKey: 'posBusinessCloseTourS3cTitle',
    bodyKey: 'posBusinessCloseTourS3cBody',
    advance: 'manual',
  },
  {
    id: 'bc8_diff',
    target: 'pos-tour-close-drawer-variance',
    titleKey: 'posBusinessCloseTourS3dTitle',
    bodyKey: 'posBusinessCloseTourS3dBody',
    advance: 'manual',
  },
  {
    id: 'bc9_memo',
    target: 'pos-tour-close-memo',
    titleKey: 'posBusinessCloseTourS3eTitle',
    bodyKey: 'posBusinessCloseTourS3eBody',
    advance: 'manual',
  },
  {
    id: 'bc10_close_check',
    target: 'pos-tour-close-checkbox',
    titleKey: 'posBusinessCloseTourS4Title',
    bodyKey: 'posBusinessCloseTourS4Body',
    advance: 'manual',
  },
  {
    id: 'bc11_save',
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
