import { describe, expect, it } from 'vitest'
import { formatPosMenuImageUploadSpecHint, POS_MENU_IMAGE_UPLOAD_SPEC } from '@/lib/pos-menu-image-upload-spec'

describe('pos-menu-image-upload-spec', () => {
  it('substitutes placeholders', () => {
    const out = formatPosMenuImageUploadSpecHint((key) =>
      key === 'posMenuImageUploadSpec'
        ? 'min {minPx} ideal {idealMin}-{idealMax} max {maxPx} {recMb}/{maxMb}'
        : key
    )
    expect(out).toBe(
      `min ${POS_MENU_IMAGE_UPLOAD_SPEC.minLongEdgePx} ideal ${POS_MENU_IMAGE_UPLOAD_SPEC.idealLongEdgeMinPx}-${POS_MENU_IMAGE_UPLOAD_SPEC.idealLongEdgeMaxPx} max ${POS_MENU_IMAGE_UPLOAD_SPEC.maxLongEdgePx} ${POS_MENU_IMAGE_UPLOAD_SPEC.recommendedMaxFileMb}/${POS_MENU_IMAGE_UPLOAD_SPEC.maxFileMb}`
    )
  })
})
