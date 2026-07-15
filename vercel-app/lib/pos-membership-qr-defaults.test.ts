import { describe, expect, it } from 'vitest'
import {
  POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH,
  POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK,
  normalizeMembershipQrImageUrlForStorage,
  normalizeMembershipQrLinkUrlForStorage,
  resolveMembershipQrLinkUrl,
  resolveReceiptAssetUrl,
} from '@/lib/pos-membership-qr-defaults'

describe('pos-membership-qr-defaults', () => {
  it('defaults to relative /m for multi-domain deploy', () => {
    expect(POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK).toBe('/m')
    expect(POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK).not.toMatch(/point\.o2o\.co\.th/i)
    expect(POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK).not.toMatch(/choongman-erp\.vercel\.app/i)
  })

  it('resolves relative asset with origin', () => {
    expect(resolveReceiptAssetUrl('/pos/x.png', 'https://example.com')).toBe(
      'https://example.com/pos/x.png'
    )
    expect(resolveMembershipQrLinkUrl('/m', 'https://omni.example.com')).toBe(
      'https://omni.example.com/m'
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

  it('normalizes absolute /m links to relative /m for storage', () => {
    expect(normalizeMembershipQrLinkUrlForStorage('https://choongman-erp.vercel.app/m')).toBe('/m')
    expect(normalizeMembershipQrLinkUrlForStorage('/m')).toBe('/m')
    expect(normalizeMembershipQrLinkUrlForStorage('https://point.o2o.co.th/backend/points/manual/1')).toBe(
      'https://point.o2o.co.th/backend/points/manual/1'
    )
  })
})
