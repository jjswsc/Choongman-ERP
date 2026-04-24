/**
 * POS 테이블 배치: DB에 저장된 (x,y,w,h)는 변환 전 박스 기준이고,
 * `transform: rotate(90|270deg)` 시 화면에 보이는 축맞춤 둘레(AABB)는 w×h와 다릅니다.
 * 배치·스케일·그리드 정렬은 AABB 기준으로 맞춥니다.
 */
export function getPosTableAabb(
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number
): { x: number; y: number; w: number; h: number } {
  const wpx = Math.max(1, Number(w) || 0)
  const hpx = Math.max(1, Number(h) || 0)
  const xp = Math.max(0, Number(x) || 0)
  const yp = Math.max(0, Number(y) || 0)
  const r = (((Number(rotationDeg) || 0) % 360) + 360) % 360
  if (r === 90 || r === 270) {
    return {
      x: xp + (wpx - hpx) / 2,
      y: yp + (hpx - wpx) / 2,
      w: hpx,
      h: wpx,
    }
  }
  return { x: xp, y: yp, w: wpx, h: hpx }
}
