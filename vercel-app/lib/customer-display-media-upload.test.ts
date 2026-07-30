import { describe, expect, it } from 'vitest'
import {
  fileForCustomerDisplayMediaUpload,
  guessCustomerDisplayMediaContentType,
  normalizeCustomerDisplayMediaContentType,
} from '@/lib/customer-display-media-upload'

describe('customer-display-media-upload', () => {
  it('normalizes image/jpg and image/pjpeg to image/jpeg', () => {
    expect(normalizeCustomerDisplayMediaContentType('image/jpg')).toBe('image/jpeg')
    expect(normalizeCustomerDisplayMediaContentType('image/pjpeg; charset=binary')).toBe('image/jpeg')
  })

  it('guesses jpeg from extension when type is empty', () => {
    const file = new File([new Uint8Array([1, 2, 3])], '5842D275-D49D-4C17-9C45-88848E6EE48A.jpg', {
      type: '',
    })
    expect(guessCustomerDisplayMediaContentType(file)).toBe('image/jpeg')
  })

  it('guesses jpeg from extension when type is octet-stream', () => {
    const file = new File([new Uint8Array([1])], 'photo.JPG', { type: 'application/octet-stream' })
    expect(guessCustomerDisplayMediaContentType(file)).toBe('image/jpeg')
  })

  it('wraps file with normalized type and extension for GUID names without ext', () => {
    const file = new File([new Uint8Array([1])], '5842D275-D49D-4C17-9C45-88848E6EE48A', {
      type: 'image/jpg',
    })
    const wrapped = fileForCustomerDisplayMediaUpload(file)
    expect(wrapped).not.toBeNull()
    expect(wrapped!.contentType).toBe('image/jpeg')
    expect(wrapped!.file.type).toBe('image/jpeg')
    expect(wrapped!.file.name).toMatch(/\.jpg$/i)
  })

  it('uses preferredKind when type and extension are missing', () => {
    const file = new File([new Uint8Array([1])], '5842D275-D49D-4C17-9C45-88848E6EE48A', {
      type: '',
    })
    expect(guessCustomerDisplayMediaContentType(file, 'image')).toBe('image/jpeg')
    const wrapped = fileForCustomerDisplayMediaUpload(file, 'image')
    expect(wrapped!.contentType).toBe('image/jpeg')
    expect(wrapped!.file.name).toMatch(/\.jpg$/i)
  })

  it('rejects unknown types', () => {
    const file = new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' })
    expect(fileForCustomerDisplayMediaUpload(file)).toBeNull()
  })
})
