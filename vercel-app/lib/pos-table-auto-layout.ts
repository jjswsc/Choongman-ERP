/** POS 플로어(720×480)에 맞게 테이블을 격자 배치하는 순수 로직 */

export type AutoLayoutSlot = {
  x: number
  y: number
  w: number
  h: number
}

export type ComputeAutoLayoutSlotsInput = {
  count: number
  cellW: number
  cellH: number
  floorW: number
  floorH: number
  /** 바깥 여백(px). 기본 24 */
  margin?: number
  /** 그리드 스냅 단위. 기본 24 */
  gridSize?: number
  /** 최소 테이블 폭. 기본 gridSize * 5 */
  minW?: number
  /** 최소 테이블 높이. 기본 gridSize * 4 */
  minH?: number
}

function snap(v: number, gridSize: number) {
  return Math.round(v / gridSize) * gridSize
}

function clampSnap(v: number, min: number, max: number, gridSize: number) {
  return Math.max(min, Math.min(max, snap(v, gridSize)))
}

/**
 * count개 슬롯을 floor 안에 균등 격자 배치.
 * 요청 셀 크기로 안 들어가면 minW/minH까지 축소.
 * 그래도 불가하면 capacityExceeded 와 함께 빈 배열.
 */
export function computeAutoLayoutSlots(
  input: ComputeAutoLayoutSlotsInput
): { slots: AutoLayoutSlot[]; capacity: number; capacityExceeded: boolean } {
  const count = Math.max(0, Math.floor(Number(input.count) || 0))
  const gridSize = Math.max(1, Math.floor(Number(input.gridSize) || 24))
  const margin = Math.max(0, Math.floor(Number(input.margin ?? gridSize) || 0))
  const floorW = Math.max(gridSize, Math.floor(Number(input.floorW) || 0))
  const floorH = Math.max(gridSize, Math.floor(Number(input.floorH) || 0))
  const minW = Math.max(gridSize, Math.floor(Number(input.minW ?? gridSize * 5) || gridSize))
  const minH = Math.max(gridSize, Math.floor(Number(input.minH ?? gridSize * 4) || gridSize))
  const availW = Math.max(0, floorW - margin * 2)
  const availH = Math.max(0, floorH - margin * 2)

  const maxCols = Math.max(1, Math.floor(availW / minW))
  const maxRows = Math.max(1, Math.floor(availH / minH))
  const capacity = maxCols * maxRows

  if (count <= 0) {
    return { slots: [], capacity, capacityExceeded: false }
  }
  if (count > capacity) {
    return { slots: [], capacity, capacityExceeded: true }
  }

  let cellW = clampSnap(Number(input.cellW) || minW, minW, availW, gridSize)
  let cellH = clampSnap(Number(input.cellH) || minH, minH, availH, gridSize)

  const pickBestCols = (w: number, h: number): number | null => {
    const floorAspect = availW / Math.max(availH, 1)
    let bestCols: number | null = null
    let bestScore = Infinity
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols)
      if (cols * w > availW || rows * h > availH) continue
      const gapSlotsX = cols + 1
      const gapSlotsY = rows + 1
      const gapX = (availW - cols * w) / gapSlotsX
      const gapY = (availH - rows * h) / gapSlotsY
      if (gapX < 0 || gapY < 0) continue
      const layoutAspect = (cols * (w + Math.max(gapX, 0))) / Math.max(rows * (h + Math.max(gapY, 0)), 1)
      const aspectPenalty = Math.abs(Math.log(Math.max(layoutAspect, 1e-6) / Math.max(floorAspect, 1e-6)))
      const gapBalance = Math.abs(gapX - gapY) / Math.max(gapX + gapY, 1)
      const unusedTail = cols * rows - count
      const score = aspectPenalty + gapBalance * 0.35 + unusedTail * 0.08
      if (score < bestScore) {
        bestScore = score
        bestCols = cols
      }
    }
    return bestCols
  }

  let cols = pickBestCols(cellW, cellH)
  if (cols == null) {
    // 요청 크기로 불가 → min까지 단계적으로 축소
    for (let step = 0; step < 40; step++) {
      cellW = Math.max(minW, cellW - gridSize)
      cellH = Math.max(minH, cellH - gridSize)
      cols = pickBestCols(cellW, cellH)
      if (cols != null) break
      if (cellW <= minW && cellH <= minH) break
    }
  }

  if (cols == null) {
    // 최후: 최소 크기로 최대한 채우는 열 수
    cols = Math.min(count, maxCols)
    cellW = minW
    cellH = minH
  }

  const rows = Math.ceil(count / cols)
  const gapX = (availW - cols * cellW) / (cols + 1)
  const gapY = (availH - rows * cellH) / (rows + 1)

  const slots: AutoLayoutSlot[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const rawX = margin + gapX * (col + 1) + col * cellW
    const rawY = margin + gapY * (row + 1) + row * cellH
    const x = clampSnap(rawX, 0, floorW - cellW, gridSize)
    const y = clampSnap(rawY, 0, floorH - cellH, gridSize)
    slots.push({ x, y, w: cellW, h: cellH })
  }

  return { slots, capacity, capacityExceeded: false }
}
