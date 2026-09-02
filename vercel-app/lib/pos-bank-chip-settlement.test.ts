import { describe, expect, it } from 'vitest'
import {
  appendBankChipNote,
  bankChannelSettlementRowAction,
  bankChipSavePatch,
  channelFeeSettleDateCandidates,
  channelSettlementAllowsReceivableReceive,
  depositCategoryForPosBankChip,
  inferPosBankChipKind,
  isFeeBearingPosBankChip,
  settlementChannelForPosBankChip,
} from './pos-bank-chip-settlement'

describe('pos-bank-chip-settlement', () => {
  it('maps staff chips to kinds and deposit categories', () => {
    expect(inferPosBankChipKind('store sales QR')).toBe('qr')
    expect(inferPosBankChipKind('Line man sales')).toBe('lineman')
    expect(inferPosBankChipKind('Grab Sales')).toBe('grab')
    expect(inferPosBankChipKind('Shopee Sales')).toBe('shopee')
    expect(inferPosBankChipKind('Credit Card Sales')).toBe('card')
    expect(inferPosBankChipKind('Cash Deposit')).toBe('cash')
    expect(inferPosBankChipKind('Sale Old Oil')).toBe('oil')
    expect(depositCategoryForPosBankChip('qr')).toBe('receivable_receive')
    expect(depositCategoryForPosBankChip('lineman')).toBe('receivable_receive')
    expect(depositCategoryForPosBankChip('cash')).toBe('cash_to_bank')
    expect(depositCategoryForPosBankChip('oil')).toBe('other_income')
  })

  it('only fee-bearing chips get channel settlement', () => {
    expect(isFeeBearingPosBankChip('qr')).toBe(false)
    expect(isFeeBearingPosBankChip('cash')).toBe(false)
    expect(settlementChannelForPosBankChip('lineman')).toBe('lineman')
    expect(settlementChannelForPosBankChip('qr')).toBe(null)
    expect(
      bankChannelSettlementRowAction({
        note: 'store sales QR',
        storeName: 'CM Bangna',
        isChannelSettled: false,
      })
    ).toBe('none')
    expect(
      bankChannelSettlementRowAction({
        note: 'Line man sales',
        storeName: 'CM Bangna',
        isChannelSettled: false,
      })
    ).toBe('post')
    expect(
      bankChannelSettlementRowAction({
        note: 'Line man sales',
        storeName: 'CM Bangna',
        isChannelSettled: true,
      })
    ).toBe('edit')
  })

  it('allows receivable_receive + fee journal for POS channel memos, not B2B', () => {
    expect(channelSettlementAllowsReceivableReceive({ note: 'store sales QR' })).toBe(true)
    expect(channelSettlementAllowsReceivableReceive({ memo: 'โอนเงินมัดจำ' })).toBe(false)
  })

  it('fills chip note without duplicating and sets deposit category', () => {
    expect(appendBankChipNote('', 'store sales QR')).toBe('store sales QR')
    expect(appendBankChipNote('store sales QR', 'store sales QR')).toBe('store sales QR')
    expect(bankChipSavePatch({ phrase: 'store sales QR', transType: 'deposit', accountStore: 'CM Bangna' })).toEqual(
      { category: 'receivable_receive', storeName: 'CM Bangna' }
    )
    expect(bankChipSavePatch({ phrase: 'Cash Deposit', transType: 'deposit' })).toEqual({
      category: 'cash_to_bank',
    })
    expect(bankChipSavePatch({ phrase: 'store sales QR', transType: 'withdraw' })).toEqual({})
  })

  it('tries sales date then T-1 then same-day for fee settle dates', () => {
    expect(channelFeeSettleDateCandidates({ transDate: '2026-09-02', salesDate: '2026-09-01' })).toEqual([
      '2026-09-01',
      '2026-09-02',
    ])
    expect(channelFeeSettleDateCandidates({ transDate: '2026-09-02' })).toEqual(['2026-09-01', '2026-09-02'])
  })
})
