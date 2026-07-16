import { describe, expect, it } from "vitest"
import { computeAutoLayoutSlots } from "@/lib/pos-table-auto-layout"

const FLOOR_W = 720
const FLOOR_H = 480
const GRID = 24
const MIN_W = GRID * 5
const MIN_H = GRID * 4

describe("computeAutoLayoutSlots", () => {
  it("returns empty for count 0", () => {
    const res = computeAutoLayoutSlots({
      count: 0,
      cellW: 120,
      cellH: 96,
      floorW: FLOOR_W,
      floorH: FLOOR_H,
    })
    expect(res.slots).toEqual([])
    expect(res.capacityExceeded).toBe(false)
  })

  it("places N tables inside the floor without overlap at min size", () => {
    const res = computeAutoLayoutSlots({
      count: 12,
      cellW: 120,
      cellH: 96,
      floorW: FLOOR_W,
      floorH: FLOOR_H,
      margin: GRID,
      gridSize: GRID,
      minW: MIN_W,
      minH: MIN_H,
    })
    expect(res.capacityExceeded).toBe(false)
    expect(res.slots).toHaveLength(12)
    for (const s of res.slots) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.x + s.w).toBeLessThanOrEqual(FLOOR_W)
      expect(s.y + s.h).toBeLessThanOrEqual(FLOOR_H)
      expect(s.w).toBeGreaterThanOrEqual(MIN_W)
      expect(s.h).toBeGreaterThanOrEqual(MIN_H)
      expect(s.x % GRID).toBe(0)
      expect(s.y % GRID).toBe(0)
    }
    // 축 정렬 AABB 겹침 없어야 함
    for (let i = 0; i < res.slots.length; i++) {
      for (let j = i + 1; j < res.slots.length; j++) {
        const a = res.slots[i]
        const b = res.slots[j]
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it("reports capacityExceeded when too many for floor", () => {
    const res = computeAutoLayoutSlots({
      count: 999,
      cellW: 120,
      cellH: 96,
      floorW: FLOOR_W,
      floorH: FLOOR_H,
      margin: GRID,
      gridSize: GRID,
      minW: MIN_W,
      minH: MIN_H,
    })
    expect(res.capacityExceeded).toBe(true)
    expect(res.slots).toEqual([])
    expect(res.capacity).toBeGreaterThan(0)
    expect(res.capacity).toBeLessThan(999)
  })

  it("shrinks cells when requested size cannot fit count", () => {
    const res = computeAutoLayoutSlots({
      count: 16,
      cellW: 200,
      cellH: 160,
      floorW: FLOOR_W,
      floorH: FLOOR_H,
      margin: GRID,
      gridSize: GRID,
      minW: MIN_W,
      minH: MIN_H,
    })
    expect(res.capacityExceeded).toBe(false)
    expect(res.slots).toHaveLength(16)
    expect(res.slots[0].w).toBeLessThanOrEqual(200)
    expect(res.slots[0].h).toBeLessThanOrEqual(160)
  })
})
