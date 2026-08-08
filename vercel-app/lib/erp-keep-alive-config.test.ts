/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import {
  isErpKeepAliveQueryAgnostic,
  resolveErpKeepAliveCacheHref,
} from "@/lib/erp-keep-alive-config"

describe("erp-keep-alive-config query keys", () => {
  it("uses pathname-only keys for admin pages by default", () => {
    expect(isErpKeepAliveQueryAgnostic("/admin/financial-statements?tab=balance")).toBe(true)
    expect(resolveErpKeepAliveCacheHref("/admin/financial-statements?tab=balance")).toBe(
      "/admin/financial-statements"
    )
    expect(resolveErpKeepAliveCacheHref("/admin/items?q=1")).toBe("/admin/items")
  })
})
