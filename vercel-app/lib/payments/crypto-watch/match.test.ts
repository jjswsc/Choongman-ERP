import { describe, expect, it } from 'vitest'
import { allocateUniqueCryptoAmount, cryptoAmountsMatch } from '@/lib/payments/crypto-unique-amount'
import { findCryptoWatchAmountMismatch, matchCryptoWatchDeposit } from '@/lib/payments/crypto-watch/match'

describe('crypto unique amount', () => {
  it('avoids taken USDT amounts', () => {
    const n = allocateUniqueCryptoAmount({
      asset: 'usdt_trc20',
      baseAmount: 199,
      takenAmounts: [199, 199.01],
    })
    expect(n.amount).toBe(199.02)
    expect(n.adjusted).toBe(true)
  })

  it('matches rounded stablecoin amounts', () => {
    expect(cryptoAmountsMatch('usdt_trc20', 5.53, 5.53)).toBe(true)
    expect(cryptoAmountsMatch('usdt_trc20', 5.53, 5.54)).toBe(false)
  })
})

describe('matchCryptoWatchDeposit', () => {
  const baseAttempt = {
    id: '1',
    asset: 'usdt_trc20' as const,
    walletAddress: 'TWallet1',
    amountCrypto: 199.17,
    createdAtMs: 1_700_000_000_000,
    status: 'pending' as const,
  }

  it('matches incoming tx to oldest pending attempt', () => {
    const hit = matchCryptoWatchDeposit({
      attempts: [baseAttempt],
      txs: [
        {
          txHash: 'AbC',
          toAddress: 'TWallet1',
          amount: 199.17,
          timestampMs: 1_700_000_010_000,
          confirmations: 1,
          asset: 'usdt_trc20',
        },
      ],
      usedTxHashes: [],
    })
    expect(hit?.attemptId).toBe('1')
    expect(hit?.txHash).toBe('abc')
    expect(hit?.nextStatus).toBe('confirmed')
  })

  it('ignores other address and used tx', () => {
    expect(
      matchCryptoWatchDeposit({
        attempts: [baseAttempt],
        txs: [
          {
            txHash: 'aaa',
            toAddress: 'TOther',
            amount: 199.17,
            timestampMs: 1_700_000_010_000,
            confirmations: 1,
            asset: 'usdt_trc20',
          },
        ],
        usedTxHashes: [],
      })
    ).toBeNull()

    expect(
      matchCryptoWatchDeposit({
        attempts: [baseAttempt],
        txs: [
          {
            txHash: 'used1',
            toAddress: 'TWallet1',
            amount: 199.17,
            timestampMs: 1_700_000_010_000,
            confirmations: 1,
            asset: 'usdt_trc20',
          },
        ],
        usedTxHashes: ['USED1'],
      })
    ).toBeNull()
  })

  it('marks unconfirmed BTC as seen', () => {
    const hit = matchCryptoWatchDeposit({
      attempts: [
        {
          ...baseAttempt,
          asset: 'btc',
          walletAddress: 'bc1qtest',
          amountCrypto: 0.00123,
        },
      ],
      txs: [
        {
          txHash: 'btctx',
          toAddress: 'bc1qtest',
          amount: 0.00123,
          timestampMs: 1_700_000_010_000,
          confirmations: 0,
          asset: 'btc',
        },
      ],
      usedTxHashes: [],
    })
    expect(hit?.nextStatus).toBe('seen')
  })

  it('flags amount mismatch on same wallet', () => {
    const miss = findCryptoWatchAmountMismatch({
      attempt: baseAttempt,
      txs: [
        {
          txHash: 'wrongamt',
          toAddress: 'TWallet1',
          amount: 50,
          timestampMs: 1_700_000_010_000,
          confirmations: 1,
          asset: 'usdt_trc20',
        },
      ],
      usedTxHashes: [],
    })
    expect(miss?.amount).toBe(50)
  })
})
