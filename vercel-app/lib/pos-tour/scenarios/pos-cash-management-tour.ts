import type { PosTourScenario, PosTourStep } from '../pos-tour-types'

const BUSINESS_CLOSE_DEMO = '/pos/settlement?demo=1&scenario=pos-business-close-tour'

const steps: PosTourStep[] = [
  {
    id: 'cm1_intro',
    target: 'pos-tour-cash-shell',
    titleKey: 'posCashTourS1Title',
    bodyKey: 'posCashTourS1Body',
    advance: 'manual',
  },
  {
    id: 'cm2_add_form',
    target: 'pos-tour-cash-add-form',
    titleKey: 'posCashTourS2Title',
    bodyKey: 'posCashTourS2Body',
    advance: 'manual',
  },
  {
    id: 'cm3_add_save',
    target: 'pos-tour-cash-add-save',
    titleKey: 'posCashTourS3Title',
    bodyKey: 'posCashTourS3Body',
    advance: 'manual',
  },
  {
    id: 'cm4_go_close',
    target: 'pos-tour-nospot',
    titleKey: 'posCashTourS4Title',
    bodyKey: 'posCashTourS4Body',
    advance: 'manual',
    navigateOnNext: BUSINESS_CLOSE_DEMO,
  },
]

export const posCashManagementScenario: PosTourScenario = {
  id: 'pos-cash-management-tour',
  titleKey: 'posCashTourTitle',
  steps,
}
