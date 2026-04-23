import { describe, expect, it } from 'vitest'
import { getPosTourScenario } from './get-pos-tour-scenario'
import { DEFAULT_POS_TOUR_SCENARIO_ID } from './pos-tour-constants'
import { terminalFullWalkthroughScenario } from './scenarios/terminal-full-walkthrough'
import { terminalTablesIntroScenario } from './scenarios/terminal-tables-intro'

describe('getPosTourScenario', () => {
  it('returns the default for unknown ids', () => {
    const s = getPosTourScenario('___does_not_exist___')
    expect(s.id).toBe(terminalFullWalkthroughScenario.id)
    expect(s.id).toBe(DEFAULT_POS_TOUR_SCENARIO_ID)
  })
  it('resolves known scenario ids', () => {
    expect(getPosTourScenario('pos-main-walkthrough').id).toBe('pos-main-walkthrough')
    expect(getPosTourScenario('terminal-tables-intro').id).toBe(terminalTablesIntroScenario.id)
    expect(getPosTourScenario('terminal-full-walkthrough').id).toBe(terminalFullWalkthroughScenario.id)
    expect(getPosTourScenario('pos-business-cash-home').id).toBe('pos-business-cash-home')
    expect(getPosTourScenario('pos-business-open-tour').id).toBe('pos-business-open-tour')
    expect(getPosTourScenario('pos-cash-management-tour').id).toBe('pos-cash-management-tour')
    expect(getPosTourScenario('pos-business-close-tour').id).toBe('pos-business-close-tour')
  })
})
