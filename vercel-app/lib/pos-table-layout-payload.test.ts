import { describe, expect, it } from 'vitest'
import {
  normalizePosFloorLabels,
  normalizePosTableColor,
  parsePosTableLayoutJson,
  resolvePosFloorDisplayLabel,
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
  })

  it('parses v1 wrapper with floorLabels', () => {
    const parsed = parsePosTableLayoutJson({
      v: 1,
      tables: [{ id: 't1', name: '1', x: 0, y: 0, w: 80, h: 60, floor: 2 }],
      floorLabels: { '1': '홀', '2': '테라스', '3': '  ' },
    })
    expect(parsed.tables[0]?.floor).toBe(2)
    expect(parsed.floorLabels).toEqual({ 1: '홀', 2: '테라스' })
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

  it('resolves display label with fallback', () => {
    expect(resolvePosFloorDisplayLabel(1, { 1: 'VIP' }, '{n}층')).toBe('VIP')
    expect(resolvePosFloorDisplayLabel(2, {}, '{n}층')).toBe('2층')
  })

  it('normalizes floor labels', () => {
    expect(normalizePosFloorLabels({ 1: '  홀  ', 9: 'x', '2': 'Room' })).toEqual({
      1: '홀',
      2: 'Room',
    })
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
