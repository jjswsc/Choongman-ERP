import { describe, expect, it } from 'vitest'
import {
  defaultPosCryptoPaymentSettings,
  isPosCryptoPaymentTabVisible,
  validateCryptoWalletAddress,
} from '@/lib/payments/crypto-assets'

describe('validateCryptoWalletAddress', () => {
  it('accepts TRC20', () => {
    const v = validateCryptoWalletAddress('usdt_trc20', 'TR7NHqjeKQwFCHDndysssW23hcuKqpNPSe')
    expect(v.ok).toBe(true)
  })

  it('rejects ERC20 on TRC20 slot', () => {
    const v = validateCryptoWalletAddress('usdt_trc20', '0xdac17f958d2ee523a2206206994597c13d831ec7')
    expect(v.ok).toBe(false)
    expect(v.errorKey).toBe('posCryptoErrWalletTron')
  })

  it('accepts EVM', () => {
    const v = validateCryptoWalletAddress('eth', '0xAbcdefabcdefabcdefabcdefabcdefabcdefabcd')
    expect(v.ok).toBe(true)
    expect(v.normalized).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
  })
})

describe('isPosCryptoPaymentTabVisible', () => {
  it('hides when master is off even with wallets', () => {
    const s = defaultPosCryptoPaymentSettings()
    s.wallets.usdt_trc20 = 'TR7NHqjeKQwFCHDndysssW23hcuKqpNPSe'
    s.assetsEnabled.usdt_trc20 = true
    s.enabled = false
    expect(isPosCryptoPaymentTabVisible(s)).toBe(false)
  })

  it('shows only when master + coin + address', () => {
    const s = defaultPosCryptoPaymentSettings()
    s.enabled = true
    s.wallets.usdt_trc20 = 'TR7NHqjeKQwFCHDndysssW23hcuKqpNPSe'
    s.assetsEnabled.usdt_trc20 = true
    expect(isPosCryptoPaymentTabVisible(s)).toBe(true)
  })
})
