/** จำนวนเงินภาษี (บาท) → ตัวอักษรไทย สำหรับแบบ 50 ทวิ */

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

function readThreeDigits(n: number): string {
  const hundred = Math.floor(n / 100)
  const ten = Math.floor((n % 100) / 10)
  const unit = n % 10
  let out = ''
  if (hundred > 0) out += `${DIGITS[hundred]}ร้อย`
  if (ten > 1) out += `${DIGITS[ten]}สิบ`
  else if (ten === 1) out += 'สิบ'
  if (unit > 0) {
    if (ten > 0 && unit === 1) out += 'เอ็ด'
    else out += DIGITS[unit]
  }
  return out
}

function integerToThai(n: number): string {
  if (n === 0) return 'ศูนย์'
  let num = Math.floor(Math.abs(n))
  if (num === 0) return 'ศูนย์'

  const parts: string[] = []
  let scale = 0
  while (num > 0) {
    const chunk = num % 1_000_000
    if (chunk > 0) {
      let chunkText = ''
      let tmp = chunk
      let pos = 0
      while (tmp > 0) {
        const seg = tmp % 1000
        if (seg > 0) {
          const segText = readThreeDigits(seg)
          chunkText = segText + (pos > 0 ? POSITIONS[pos] : '') + chunkText
        }
        tmp = Math.floor(tmp / 1000)
        pos += 3
      }
      if (scale > 0) chunkText += 'ล้าน'
      parts.unshift(chunkText)
    }
    num = Math.floor(num / 1_000_000)
    scale += 1
  }
  return parts.join('')
}

/** บาทเท่านั้น (ทศนิยม 2 ตำแหน่ง → สตางค์) */
export function thaiBahtInWords(amount: number): string {
  const n = Math.max(0, Number(amount) || 0)
  const baht = Math.floor(n)
  const satang = Math.round((n - baht) * 100)
  let text = integerToThai(baht) + 'บาท'
  if (satang > 0) text += integerToThai(satang) + 'สตางค์'
  else text += 'ถ้วน'
  return text
}
