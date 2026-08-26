import { describe, expect, it } from 'vitest'
import { PWA_SHELL_REVISION } from '@/lib/pwa-shell-revision'

describe('PWA_SHELL_REVISION', () => {
  it('is a stable non-git-sha shell id', () => {
    expect(PWA_SHELL_REVISION.length).toBeGreaterThan(0)
    expect(PWA_SHELL_REVISION).not.toMatch(/^[0-9a-f]{40}$/i)
  })
})
