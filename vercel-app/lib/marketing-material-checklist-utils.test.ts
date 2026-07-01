import { describe, expect, it } from 'vitest'
import {
  findStoreCheckForBranch,
  materialChecklistProgress,
} from './marketing-material-checklist-utils'
import type { MarketingMaterial } from './api-client/marketing-materials'
import type { MarketingMaterialStoreCheck } from './api-client/marketing-material-store-checks'

const baseMaterial = (overrides: Partial<MarketingMaterial> = {}): MarketingMaterial => ({
  id: '1',
  campaignId: '10',
  type: 'standee',
  name: 'Summer standee',
  quantity: 1,
  unitCost: 0,
  actualCost: 0,
  branches: ['CM Bangkok'],
  isHqWide: false,
  displayStartDate: null,
  displayEndDate: null,
  placementSpots: [],
  status: 'completed',
  producedOn: '2026-07-01',
  note: '',
  ...overrides,
})

describe('marketing-material-checklist-utils', () => {
  it('matches store checks across CM prefix variants', () => {
    const checks: MarketingMaterialStoreCheck[] = [
      {
        id: '9',
        materialId: '1',
        campaignId: '10',
        storeName: 'Bangkok',
        receivedOn: '2026-07-02',
        receivedBy: 'A',
        installedOn: null,
        installedBy: '',
        installedPlacementSpot: null,
        note: '',
        updatedAt: null,
      },
    ]
    const found = findStoreCheckForBranch(checks, '1', 'CM Bangkok')
    expect(found?.receivedOn).toBe('2026-07-02')
  })

  it('counts received/install progress per branch', () => {
    const material = baseMaterial({
      branches: ['CM Bangkok', 'CM Chiang Mai'],
    })
    const checks: MarketingMaterialStoreCheck[] = [
      {
        id: '1',
        materialId: '1',
        campaignId: '10',
        storeName: 'Bangkok',
        receivedOn: '2026-07-02',
        receivedBy: 'A',
        installedOn: '2026-07-03',
        installedBy: 'A',
        installedPlacementSpot: 'entrance',
        note: '',
        updatedAt: null,
      },
    ]
    const p = materialChecklistProgress(material, checks, 'HQ-wide')
    expect(p.storeCount).toBe(2)
    expect(p.receivedCount).toBe(1)
    expect(p.installedCount).toBe(1)
  })
})
