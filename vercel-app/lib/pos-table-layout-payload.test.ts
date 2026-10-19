import { describe, expect, it } from 'vitest'
import {
  normalizePosFloorLabels,
  normalizePosTableColor,
  parsePosTableLayoutJson,
  resolvePosFloorDisplayLabel,
  resolvePosTableFloorCount,
  serializePosTableLayoutJson,
} from '@/lib/pos-table-layout-payload'

describe('pos-table-layout-payload', () => {
  it('parses legacy table array', () => {
    const parsed = parsePosTableLayoutJson([
      { id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 1 },
    ])
    expect(parsed.tables).toHaveLength(1)
    expect(parsed.tables[0]?.id).toBe('t1')
    expect(parsed.floorLabels).toEqual({})
    expect(parsed.floorCount).toBe(3)
  })

  it('parses v1 wrapper with floorLabels', () => {
    const parsed = parsePosTableLayoutJson({
      v: 1,
      tables: [{ id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 2 }],
      floorLabels: { '1': '홀', '2': '테라스', '3': '  ' },
    })
    expect(parsed.tables[0]?.floor).toBe(2)
    expect(parsed.floorLabels).toEqual({ 1: '홀', 2: '테라스' })
    expect(parsed.floorCount).toBe(3)
  })

  it('parses floorCount and floor 4+ labels', () => {
    const parsed = parsePosTableLayoutJson({
      v: 1,
      tables: [{ id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 4 }],
      floorLabels: { 4: 'GRAB2' },
      floorCount: 5,
    })
    expect(parsed.tables[0]?.floor).toBe(4)
    expect(parsed.floorLabels).toEqual({ 4: 'GRAB2' })
    expect(parsed.floorCount).toBe(5)
  })

  it('serializes wrapper only when labels exist', () => {
    const tables = [{ id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 1 as const }]
    expect(Array.isArray(serializePosTableLayoutJson(tables, {}))).toBe(true)
    const wrapped = serializePosTableLayoutJson(tables, { 1: '홀', 2: '테라스' })
    expect(Array.isArray(wrapped)).toBe(false)
    expect(wrapped).toMatchObject({
      v: 1,
      floorLabels: { 1: '홀', 2: '테라스' },
    })
  })

  it('serializes floorCount when above default', () => {
    const tables = [{ id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 1 }]
    const wrapped = serializePosTableLayoutJson(tables, {}, 5)
    expect(Array.isArray(wrapped)).toBe(false)
    expect(wrapped).toMatchObject({ v: 1, floorCount: 5, floorLabels: {} })
  })

  it('resolves display label with fallback', () => {
    expect(resolvePosFloorDisplayLabel(1, { 1: 'VIP' }, '{n}층')).toBe('VIP')
    expect(resolvePosFloorDisplayLabel(2, {}, '{n}층')).toBe('2층')
  })

  it('normalizes floor labels', () => {
    expect(normalizePosFloorLabels({ 1: '  홀  ', 9: 'x', '2': 'Room', 4: 'VIP2' })).toEqual({
      1: '홀',
      2: 'Room',
      4: 'VIP2',
    })
  })

  it('resolvePosTableFloorCount prefers max of tables, labels, raw', () => {
    expect(resolvePosTableFloorCount([{ floor: 4 }], { 5: 'A' }, 3)).toBe(5)
    expect(resolvePosTableFloorCount([], {}, 8)).toBe(8)
    expect(resolvePosTableFloorCount([], {}, 99)).toBe(8)
  })

  it('parses and serializes optional table color', () => {
    const parsed = parsePosTableLayoutJson([
      { id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 1, color: '#2563EB' },
      { id: 't2', name: '2', x: 0, y: 0, w: 80, h: 60, floor: 1, color: 'not-a-color' },
    ])
    expect(parsed.tables[0]?.color).toBe('#2563eb')
    expect(parsed.tables[1]?.color).toBeUndefined()
    const serialized = serializePosTableLayoutJson(parsed.tables, {})
    expect(Array.isArray(serialized)).toBe(true)
    if (Array.isArray(serialized)) {
      expect(serialized[0]).toMatchObject({ id: 't1', color: '#2563eb' })
      expect(serialized[1]).not.toHaveProperty('color')
    }
  })

  it('normalizes short hex colors', () => {
    expect(normalizePosTableColor('#abc')).toBe('#aabbcc')
    expect(normalizePosTableColor('')).toBeUndefined()
  })
})
