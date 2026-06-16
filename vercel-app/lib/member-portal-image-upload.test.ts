import { describe, expect, it } from 'vitest'
import {
  fileForMemberPortalImageUpload,
  guessMemberPortalImageContentType,
  normalizeMemberPortalImageContentType,
} from '@/lib/member-portal-image-upload'

describe('member-portal-image-upload', () => {
  it('normalizes jpg aliases', () => {
    expect(normalizeMemberPortalImageContentType('image/jpg')).toBe('image/jpeg')
    expect(normalizeMemberPortalImageContentType('image/pjpeg')).toBe('image/jpeg')
    expect(normalizeMemberPortalImageContentType('image/png; charset=binary')).toBe('image/png')
  })

  it('guesses mime from extension when type is empty', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'banner.PNG', { type: '' })
    expect(guessMemberPortalImageContentType(file)).toBe('image/png')
  })

  it('re-wraps file when browser type is missing', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpeg', { type: '' })
    const wrapped = fileForMemberPortalImageUpload(file)
    expect(wrapped.type).toBe('image/jpeg')
    expect(wrapped).not.toBe(file)
  })
})
