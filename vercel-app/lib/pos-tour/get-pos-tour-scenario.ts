import { DEFAULT_POS_TOUR_SCENARIO_ID } from './pos-tour-constants'
import type { PosTourScenario } from './pos-tour-types'
import { posMainWalkthroughScenario } from './scenarios/pos-main-walkthrough'
import { terminalFullWalkthroughScenario } from './scenarios/terminal-full-walkthrough'
import { terminalTablesIntroScenario } from './scenarios/terminal-tables-intro'
import { posBusinessCashHomeScenario } from './scenarios/pos-business-cash-home'
import { posBusinessOpenScenario } from './scenarios/pos-business-open-tour'
import { posCashManagementScenario } from './scenarios/pos-cash-management-tour'
import { posBusinessCloseScenario } from './scenarios/pos-business-close-tour'

const registry: Record<string, PosTourScenario> = {
  [posMainWalkthroughScenario.id]: posMainWalkthroughScenario,
  [terminalFullWalkthroughScenario.id]: terminalFullWalkthroughScenario,
  [terminalTablesIntroScenario.id]: terminalTablesIntroScenario,
  [posBusinessCashHomeScenario.id]: posBusinessCashHomeScenario,
  [posBusinessOpenScenario.id]: posBusinessOpenScenario,
  [posCashManagementScenario.id]: posCashManagementScenario,
  [posBusinessCloseScenario.id]: posBusinessCloseScenario,
}

export function getPosTourScenario(scenarioId: string | null | undefined): PosTourScenario {
  const key = String(scenarioId || DEFAULT_POS_TOUR_SCENARIO_ID).trim() || DEFAULT_POS_TOUR_SCENARIO_ID
  return registry[key] ?? registry[DEFAULT_POS_TOUR_SCENARIO_ID]!
}
