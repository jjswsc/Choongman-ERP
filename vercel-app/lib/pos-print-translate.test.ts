import { describe, expect, it } from 'vitest'
import { getRuntimeUiString } from '@/lib/runtime-ui-strings'
import { translateReceiptTableDisplayName } from '@/lib/pos-print-translate'

describe('translateReceiptTableDisplayName takeout slots', () => {
  it('localizes ko 포장 N with kitchen print Thai runtime strings', () => {
    const t = (k: string) => getRuntimeUiString('th', k)
    expect(translateReceiptTableDisplayName('포장 1', t)).toBe('ห่อกลับ 1')
    expect(translateReceiptTableDisplayName('Takeout 2', t)).toBe('ห่อกลับ 2')
  })

  it('keeps original when translator lacks slot keys (no Korean fallback)', () => {
    const t = (k: string) => k
    expect(translateReceiptTableDisplayName('포장 1', t)).toBe('포장 1')
  })
})
