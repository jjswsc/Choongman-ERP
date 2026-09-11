import { describe, expect, it } from "vitest"
import {
  shouldRegisterPosServiceWorker,
  shouldReloadAfterHybridSwUnregister,
} from "@/lib/pos-service-worker-policy"

describe("shouldRegisterPosServiceWorker", () => {
  it("registers only production non-hybrid clients", () => {
    expect(shouldRegisterPosServiceWorker({ isProduction: true, isHybridShell: false })).toBe(true)
    expect(shouldRegisterPosServiceWorker({ isProduction: true, isHybridShell: true })).toBe(false)
    expect(shouldRegisterPosServiceWorker({ isProduction: false, isHybridShell: false })).toBe(false)
  })
})

describe("shouldReloadAfterHybridSwUnregister", () => {
  it("reloads once when a controller was still running the page", () => {
    expect(
      shouldReloadAfterHybridSwUnregister({
        hadController: true,
        alreadyClearedThisSession: false,
        recentChunkRecovery: false,
      })
    ).toBe(true)
  })

  it("does not loop after a session reload or chunk recovery", () => {
    expect(
      shouldReloadAfterHybridSwUnregister({
        hadController: true,
        alreadyClearedThisSession: true,
        recentChunkRecovery: false,
      })
    ).toBe(false)
    expect(
      shouldReloadAfterHybridSwUnregister({
        hadController: true,
        alreadyClearedThisSession: false,
        recentChunkRecovery: true,
      })
    ).toBe(false)
    expect(
      shouldReloadAfterHybridSwUnregister({
        hadController: false,
        alreadyClearedThisSession: false,
        recentChunkRecovery: false,
      })
    ).toBe(false)
  })
})
