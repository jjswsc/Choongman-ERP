import { describe, expect, it } from 'vitest'
import { uniqueTrimmedReferenceNos } from './force-outbound-delete-siblings'

describe('uniqueTrimmedReferenceNos', () => {
  it('collects ForceOutbound invoice refs so sibling ForcePush can be deleted', () => {
    expect(
      uniqueTrimmedReferenceNos([
        { reference_no: '08092026' },
        { reference_no: ' 08092026 ' },
        { reference_no: '3151034357' },
        { reference_no: '' },
        { reference_no: null },
      ])
    ).toEqual(['08092026', '3151034357'])
  })
})
