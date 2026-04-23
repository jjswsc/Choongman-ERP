import { DEFAULT_POS_TOUR_SCENARIO_ID } from './pos-tour-constants'
import type { PosTourScenario } from './pos-tour-types'
import { posMainWalkthroughScenario } from './scenarios/pos-main-walkthrough'
import { terminalFullWalkthroughScenario } from './scenarios/terminal-full-walkthrough'
import { terminalTablesIntroScenario } from './scenarios/terminal-tables-intro'

const registry: Record<string, PosTourScenario> = {
  [posMainWalkthroughScenario.id]: posMainWalkthroughScenario,
  [terminalFullWalkthroughScenario.id]: terminalFullWalkthroughScenario,
  [terminalTablesIntroScenario.id]: terminalTablesIntroScenario,
}

export function getPosTourScenario(scenarioId: string | null | undefined): PosTourScenario {
  const key = String(scenarioId || DEFAULT_POS_TOUR_SCENARIO_ID).trim() || DEFAULT_POS_TOUR_SCENARIO_ID
  return registry[key] ?? registry[DEFAULT_POS_TOUR_SCENARIO_ID]!
}
