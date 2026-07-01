import { describe, expect, it } from 'vitest'
import {
  countPendingStoreMaterialTasks,
  filterCampaignsWithRegisteredMaterials,
  filterCampaignsWithStoreChecklistMaterials,
  findStoreCheckForBranch,
  materialChecklistProgress,
  pickCampaignIdWithPendingStoreTasks,
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

  it('counts pending receive/install tasks for a store', () => {
    const material = baseMaterial({ campaignId: '10' })
    const checks: MarketingMaterialStoreCheck[] = []
    expect(countPendingStoreMaterialTasks([material], checks, 'CM Bangkok', 'HQ-wide')).toBe(1)
  })

  it('picks campaign with pending tasks', () => {
    const materials = [
      baseMaterial({ id: '1', campaignId: '10' }),
      baseMaterial({ id: '2', campaignId: '20', name: 'Poster' }),
    ]
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
        installedPlacementSpot: 'counter',
        note: '',
        updatedAt: null,
      },
    ]
    const picked = pickCampaignIdWithPendingStoreTasks(
      [
        { id: '10', startDate: '2026-06-01' },
        { id: '20', startDate: '2026-07-01' },
      ],
      materials,
      checks,
      'CM Bangkok',
      'HQ-wide'
    )
    expect(picked).toBe('20')
  })

  it('filters campaigns to those with registered checklist materials', () => {
    const materials = [
      baseMaterial({ id: '1', campaignId: '10' }),
      baseMaterial({ id: '2', campaignId: '20', type: 'tentcard' }),
    ]
    const campaigns = [
      { id: '10', startDate: '2026-06-01' },
      { id: '20', startDate: '2026-07-01' },
      { id: '30', startDate: '2026-08-01' },
    ]
    expect(filterCampaignsWithRegisteredMaterials(campaigns, materials).map((c) => c.id)).toEqual([
      '10',
    ])
  })

  it('filters campaigns for a store with assigned checklist materials', () => {
    const materials = [
      baseMaterial({ id: '1', campaignId: '10', branches: ['CM Bangkok'] }),
      baseMaterial({ id: '2', campaignId: '20', branches: ['CM Chiang Mai'] }),
    ]
    const campaigns = [
      { id: '10', startDate: '2026-06-01' },
      { id: '20', startDate: '2026-07-01' },
    ]
    expect(
      filterCampaignsWithStoreChecklistMaterials(
        campaigns,
        materials,
        'CM Bangkok',
        'HQ-wide'
      ).map((c) => c.id)
    ).toEqual(['10'])
  })
})
