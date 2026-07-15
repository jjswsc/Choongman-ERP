import { describe, expect, it } from 'vitest'
import {
  POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH,
  normalizeMembershipQrImageUrlForStorage,
  resolveReceiptAssetUrl,
} from '@/lib/pos-membership-qr-defaults'

describe('pos-membership-qr-defaults', () => {
  it('resolves relative asset with origin', () => {
    expect(resolveReceiptAssetUrl('/pos/x.png', 'https://example.com')).toBe(
      'https://example.com/pos/x.png'
    )
  })

  it('stores relative path instead of vercel/localhost absolute urls', () => {
    expect(
      normalizeMembershipQrImageUrlForStorage(
        'https://choongman-erp.vercel.app/pos/membership-points-manual-qr.png'
      )
    ).toBe(POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH)
    expect(
      normalizeMembershipQrImageUrlForStorage('http://localhost:3000/pos/membership-points-manual-qr.png')
    ).toBe(POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH)
    expect(normalizeMembershipQrImageUrlForStorage(POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH)).toBe(
      POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH
    )
  })
})
