import {
  buildFixedAssetAccrualMemo,
  encodeFixedAssetPayeeCode,
  fixedAssetAccrualMemoMarker,
} from './fixed-asset-expense-accrual'

describe('fixed-asset-expense-accrual helpers', () => {
  it('builds memo marker and payee code for bank-link category', () => {
    expect(fixedAssetAccrualMemoMarker(42)).toBe('[AUTO:FA:42]')
    expect(encodeFixedAssetPayeeCode('FA-123')).toBe('FA-123::wm::fixed_asset')
    expect(buildFixedAssetAccrualMemo({ fixedAssetId: 42, assetName: 'Oven', assetCode: 'FA-1' })).toContain(
      '[AUTO:FA:42]'
    )
    expect(buildFixedAssetAccrualMemo({ fixedAssetId: 42, assetName: 'Oven', assetCode: 'FA-1' })).toContain(
      'Oven'
    )
  })
})
