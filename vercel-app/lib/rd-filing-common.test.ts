import { describe, expect, it } from 'vitest'
import { splitThaiPayeeName } from '@/lib/rd-filing-common'

describe('splitThaiPayeeName', () => {
  it('splits PND3 natural-person given name and surname', () => {
    expect(splitThaiPayeeName('รักษา วิจิตรโสภาพันธ์')).toEqual({
      titleName: '',
      firstName: 'รักษา',
      middleName: '',
      surName: 'วิจิตรโสภาพันธ์',
    })
  })

  it('extracts glued Thai title then splits given name and surname', () => {
    expect(splitThaiPayeeName('นายสมชาย ใจดี')).toEqual({
      titleName: 'นาย',
      firstName: 'สมชาย',
      middleName: '',
      surName: 'ใจดี',
    })
    expect(splitThaiPayeeName('น.ส.ปิยวรรณ แสนทวีสุข')).toEqual({
      titleName: 'น.ส.',
      firstName: 'ปิยวรรณ',
      middleName: '',
      surName: 'แสนทวีสุข',
    })
  })

  it('matches นางสาว before นาง', () => {
    expect(splitThaiPayeeName('นางสาว ณฐนนท ยุ่นแก้ว')).toEqual({
      titleName: 'นางสาว',
      firstName: 'ณฐนนท',
      middleName: '',
      surName: 'ยุ่นแก้ว',
    })
  })

  it('puts extra given tokens into middle name', () => {
    expect(splitThaiPayeeName('Mary Jane Watson')).toEqual({
      titleName: '',
      firstName: 'Mary',
      middleName: 'Jane',
      surName: 'Watson',
    })
  })

  it('keeps a single token in first name', () => {
    expect(splitThaiPayeeName('Cherprang')).toEqual({
      titleName: '',
      firstName: 'Cherprang',
      middleName: '',
      surName: '',
    })
  })

  it('does not treat คุณากร as title คุณ', () => {
    expect(splitThaiPayeeName('คุณากร ใจดี')).toEqual({
      titleName: '',
      firstName: 'คุณากร',
      middleName: '',
      surName: 'ใจดี',
    })
  })

  it('keeps English company names in one name field', () => {
    expect(splitThaiPayeeName('Polonext Co. Ltd.')).toEqual({
      titleName: '',
      firstName: 'Polonext Co. Ltd.',
      middleName: '',
      surName: '',
    })
  })

  it('maps หจก. to ห้างหุ้นส่วนจำกัด title', () => {
    expect(splitThaiPayeeName('หจก. ทดสอบ')).toEqual({
      titleName: 'ห้างหุ้นส่วนจำกัด',
      firstName: 'ทดสอบ',
      middleName: '',
      surName: '',
    })
  })
})
