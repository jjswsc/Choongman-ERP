import { describe, expect, it } from 'vitest'
import { addPosStoreCodeVariants } from '@/lib/pos-store-code-variants'

function variants(raw: string): string[] {
  const set = new Set<string>()
  addPosStoreCodeVariants(set, raw)
  return Array.from(set)
}

describe('addPosStoreCodeVariants', () => {
  it('strips Omni tenant-prefixed store codes', () => {
    const out = variants('malatang01:1001')
    expect(out).toContain('malatang01:1001')
    expect(out).toContain('1001')
  })

  it('adds SaaS display-name tail after " / "', () => {
    const out = variants('malatang01 / Bibimbap C')
    expect(out).toContain('malatang01 / Bibimbap C')
    expect(out).toContain('Bibimbap C')
  })
})
