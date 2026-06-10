/** POS 메뉴 이미지 업로드 권장값 — `pos-menu-image-compress`·presign 한도와 맞춤 */
export const POS_MENU_IMAGE_UPLOAD_SPEC = {
  /** POS 타일 선명도 — 운영 그래픽(750×750)과 동일 */
  minLongEdgePx: 750,
  idealLongEdgeMinPx: 750,
  idealLongEdgeMaxPx: 1200,
  /** `preparePosMenuImageFileForUpload` 자동 리사이즈 상한 */
  maxLongEdgePx: 1600,
  recommendedMaxFileMb: 2,
  /** `uploadPosMenuImage/presign` 하드 상한 */
  maxFileMb: 4,
} as const

export function formatPosMenuImageUploadSpecHint(t: (key: string) => string): string {
  const { minLongEdgePx, idealLongEdgeMinPx, idealLongEdgeMaxPx, maxLongEdgePx, recommendedMaxFileMb, maxFileMb } =
    POS_MENU_IMAGE_UPLOAD_SPEC
  let s = t('posMenuImageUploadSpec')
  s = s.split('{minPx}').join(String(minLongEdgePx))
  s = s.split('{idealMin}').join(String(idealLongEdgeMinPx))
  s = s.split('{idealMax}').join(String(idealLongEdgeMaxPx))
  s = s.split('{maxPx}').join(String(maxLongEdgePx))
  s = s.split('{recMb}').join(String(recommendedMaxFileMb))
  s = s.split('{maxMb}').join(String(maxFileMb))
  return s
}
