import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_DISPLAY_MEDIA_ERR,
  fileForCustomerDisplayMediaUpload,
  guessCustomerDisplayMediaContentType,
  isUnstableCustomerDisplayMediaUrl,
  normalizeCustomerDisplayMediaContentType,
  prepareCustomerDisplayMediaUpload,
  sniffCustomerDisplayMediaContentType,
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

  it('sniffs jpeg magic bytes', async () => {
    const jpegHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
    const file = new File([jpegHead], '5842D275-D49D-4C17-9C45-88848E6EE48A', { type: '' })
    expect(await sniffCustomerDisplayMediaContentType(file)).toBe('image/jpeg')
    const wrapped = fileForCustomerDisplayMediaUpload(file, 'image', 'image/jpeg')
    expect(wrapped!.contentType).toBe('image/jpeg')
  })

  it('sniffs HEIC ftyp brand as image/heic not video/mp4', async () => {
    // size(4) + 'ftyp' + 'heic'
    const heicHead = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
    ])
    const file = new File([heicHead], 'IMG_0001.HEIC', { type: '' })
    expect(await sniffCustomerDisplayMediaContentType(file)).toBe('image/heic')
    expect(fileForCustomerDisplayMediaUpload(file, 'image', 'image/heic')).toBeNull()
  })

  it('rejects sniff that conflicts with preferredKind', () => {
    const file = new File([new Uint8Array([1])], '5842D275-D49D-4C17-9C45-88848E6EE48A', { type: '' })
    expect(fileForCustomerDisplayMediaUpload(file, 'image', 'video/mp4')).toBeNull()
    expect(fileForCustomerDisplayMediaUpload(file, 'video', 'image/jpeg')).toBeNull()
    const videoFile = new File([new Uint8Array([1])], 'clip.mp4', { type: 'video/mp4' })
    expect(fileForCustomerDisplayMediaUpload(videoFile, 'image')).toBeNull()
  })

  it('prepare returns English HEIC error when reencode is unavailable', async () => {
    const heicHead = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
    ])
    const file = new File([heicHead], 'IMG_0001.HEIC', { type: 'image/heic' })
    const result = await prepareCustomerDisplayMediaUpload(file, 'image')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('heic_unsupported')
      expect(result.message).toBe(CUSTOMER_DISPLAY_MEDIA_ERR.HEIC_UNSUPPORTED)
    }
  })

  it('detects unstable facebook cdn urls', () => {
    expect(
      isUnstableCustomerDisplayMediaUrl(
        'https://scontent.fbkk35-1.fna.fbcdn.net/v/t39.30808-6/x.jpg?_nc_cat=1'
      )
    ).toBe(true)
    expect(
      isUnstableCustomerDisplayMediaUrl(
        'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/pos-menu-images/a.jpg'
      )
    ).toBe(false)
  })

  it('rejects unknown types', () => {
    const file = new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' })
    expect(fileForCustomerDisplayMediaUpload(file)).toBeNull()
  })
})
