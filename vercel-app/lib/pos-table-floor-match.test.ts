import { describe, expect, it } from 'vitest'
import {
  formatPosDineInTableNameForStorage,
  posDineInTableLabelsMatch,
  resolveDineInOrderForLayoutTable,
} from '@/lib/pos-table-floor-match'

describe('pos-table-floor-match', () => {
  const peers = [
    { id: 't1', name: '3', floor: 1 as const },
    { id: 't2', name: '3', floor: 2 as const },
  ]

  it('legacy table name without floor only matches floor 1 when duplicated', () => {
    expect(posDineInTableLabelsMatch('3', peers[0], { layoutPeers: peers })).toBe(true)
    expect(posDineInTableLabelsMatch('3', peers[1], { layoutPeers: peers })).toBe(false)
  })

  it('2F- prefix matches floor 2 only', () => {
    expect(posDineInTableLabelsMatch('2F-3', peers[1], { layoutPeers: peers })).toBe(true)
    expect(posDineInTableLabelsMatch('2F-3', peers[0], { layoutPeers: peers })).toBe(false)
  })

  it('resolve picks correct order per layout table', () => {
    const orders = [
      { tableName: '3', createdAt: '2026-06-01T10:00:00Z' },
      { tableName: '2F-3', createdAt: '2026-06-01T11:00:00Z' },
    ]
    expect(resolveDineInOrderForLayoutTable(peers[0], orders, peers)?.tableName).toBe('3')
    expect(resolveDineInOrderForLayoutTable(peers[1], orders, peers)?.tableName).toBe('2F-3')
  })

  it('format adds floor prefix for multi-floor stores', () => {
    expect(formatPosDineInTableNameForStorage('3', 2, true)).toBe('2F-3')
    expect(formatPosDineInTableNameForStorage('3', 1, true)).toBe('3')
    expect(formatPosDineInTableNameForStorage('3', 2, false)).toBe('3')
  })
})
