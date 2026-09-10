import { createRequire } from "module"

const require = createRequire(import.meta.url)
const recovery = require("./pos-shell-recovery.js") as {
  DOM_BLANK_PROBE_JS: string
  nextLiveBlankHits: (prev: number, isBlank: boolean) => number
  decideLiveBlankAction: (opts: Record<string, unknown>) => string
  decideRendererGoneAction: (opts: Record<string, unknown>) => string
  shouldOpenAtLogin: (opts: Record<string, unknown>) => boolean
  shouldRelaunchAfterAllWindowsClosed: (opts: Record<string, unknown>) => boolean
  bumpRecoveries: (
    prev: { count?: number; windowStart?: number } | null,
    now: number,
    windowMs: number
  ) => { count: number; windowStart: number }
  recoveriesInWindow: (
    prev: { count?: number; windowStart?: number } | null,
    now: number,
    windowMs: number
  ) => number
}

describe("pos-shell-recovery", () => {
  it("exports a probe script that returns a boolean IIFE", () => {
    expect(recovery.DOM_BLANK_PROBE_JS.startsWith("(() =>")).toBe(true)
    expect(recovery.DOM_BLANK_PROBE_JS.includes("querySelector")).toBe(true)
  })

  it("resets blank hits when the page has UI again", () => {
    expect(recovery.nextLiveBlankHits(2, false)).toBe(0)
    expect(recovery.nextLiveBlankHits(0, true)).toBe(1)
    expect(recovery.nextLiveBlankHits(1, true)).toBe(2)
  })

  it("waits for two blank polls then Clear Cache, not a plain reload", () => {
    expect(
      recovery.decideLiveBlankAction({
        isBlank: true,
        consecutiveHits: 1,
        hitsBeforeReload: 2,
      })
    ).toBe("wait")
    expect(
      recovery.decideLiveBlankAction({
        isBlank: true,
        consecutiveHits: 2,
        hitsBeforeReload: 2,
        recoveriesInWindow: 0,
      })
    ).toBe("clear-cache")
  })

  it("clears cache immediately when the renderer probe fails", () => {
    expect(
      recovery.decideLiveBlankAction({
        probeFailed: true,
        recoveriesInWindow: 0,
        maxRecoveries: 3,
      })
    ).toBe("clear-cache")
  })

  it("falls back to offline after too many recoveries", () => {
    expect(
      recovery.decideLiveBlankAction({
        isBlank: true,
        consecutiveHits: 2,
        recoveriesInWindow: 3,
        maxRecoveries: 3,
      })
    ).toBe("offline")
    expect(
      recovery.decideLiveBlankAction({
        probeFailed: true,
        recoveriesInWindow: 3,
        maxRecoveries: 3,
      })
    ).toBe("offline")
  })

  it("does not touch the page while loading, cooling down, or on offline.html", () => {
    expect(recovery.decideLiveBlankAction({ isBlank: true, consecutiveHits: 9, isLoading: true })).toBe("wait")
    expect(recovery.decideLiveBlankAction({ isBlank: true, consecutiveHits: 9, cooldown: true })).toBe("wait")
    expect(recovery.decideLiveBlankAction({ isBlank: true, consecutiveHits: 9, onOfflinePage: true })).toBe("wait")
  })

  it("clears the streak when the page is not blank", () => {
    expect(recovery.decideLiveBlankAction({ isBlank: false, consecutiveHits: 2 })).toBe("clear")
  })

  it("clears cache after a crashed renderer and ignores a clean exit", () => {
    expect(recovery.decideRendererGoneAction({ reason: "crashed", recoveriesInWindow: 0 })).toBe("clear-cache")
    expect(recovery.decideRendererGoneAction({ reason: "oom", recoveriesInWindow: 1 })).toBe("clear-cache")
    expect(recovery.decideRendererGoneAction({ reason: "clean-exit" })).toBe("ignore")
    expect(recovery.decideRendererGoneAction({ reason: "crashed", recoveriesInWindow: 3, maxRecoveries: 3 })).toBe(
      "offline"
    )
  })

  it("enables open-at-login for packaged builds unless env disables it", () => {
    expect(recovery.shouldOpenAtLogin({ isPackaged: true })).toBe(true)
    expect(recovery.shouldOpenAtLogin({ isPackaged: false })).toBe(false)
    expect(recovery.shouldOpenAtLogin({ isPackaged: true, envValue: "0" })).toBe(false)
    expect(recovery.shouldOpenAtLogin({ isPackaged: false, envValue: "1" })).toBe(true)
  })

  it("relaunches after an unexpected window close on Windows", () => {
    expect(
      recovery.shouldRelaunchAfterAllWindowsClosed({ userRequestedQuit: false, platform: "win32" })
    ).toBe(true)
    expect(
      recovery.shouldRelaunchAfterAllWindowsClosed({ userRequestedQuit: true, platform: "win32" })
    ).toBe(false)
    expect(
      recovery.shouldRelaunchAfterAllWindowsClosed({ userRequestedQuit: false, platform: "darwin" })
    ).toBe(false)
  })

  it("counts recoveries inside a time window", () => {
    const first = recovery.bumpRecoveries(null, 1000, 180000)
    expect(first).toEqual({ count: 1, windowStart: 1000 })
    const second = recovery.bumpRecoveries(first, 2000, 180000)
    expect(second.count).toBe(2)
    const later = recovery.bumpRecoveries(second, 200000, 180000)
    expect(later).toEqual({ count: 1, windowStart: 200000 })
    expect(recovery.recoveriesInWindow(second, 2000, 180000)).toBe(2)
    expect(recovery.recoveriesInWindow(second, 200000, 180000)).toBe(0)
  })
})
