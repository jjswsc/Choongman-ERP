import { describe, expect, it } from "vitest"
import {
  getDefaultErpNavFavoriteHrefs,
  moveErpNavFavoriteHref,
  sanitizeErpNavFavoriteHrefs,
  toggleErpNavFavoriteHref,
  getErpNavDashboardQuickHrefs,
} from "@/lib/erp-nav-favorites"

describe("erp nav favorites", () => {
  it("returns role-based defaults", () => {
    expect(getDefaultErpNavFavoriteHrefs("logistic")).toContain("/admin/orders")
    expect(getDefaultErpNavFavoriteHrefs("pos_staff")).toEqual([
      "/pos",
      "/admin/pos-orders",
      "/admin/pos-settlement",
    ])
  })

  it("sanitizes inaccessible and duplicate hrefs", () => {
    const allowed = new Set(["/admin", "/pos"])
    expect(
      sanitizeErpNavFavoriteHrefs(["/admin", "/nope", "/admin", "/pos", "/pos"], allowed)
    ).toEqual(["/admin", "/pos"])
  })

  it("toggles add/remove favorites", () => {
    expect(toggleErpNavFavoriteHref(["/a"], "/b")).toEqual(["/b", "/a"])
    expect(toggleErpNavFavoriteHref(["/a", "/b"], "/a")).toEqual(["/b"])
  })

  it("moves favorite order", () => {
    expect(moveErpNavFavoriteHref(["/a", "/b", "/c"], "/b", "up")).toEqual(["/b", "/a", "/c"])
    expect(moveErpNavFavoriteHref(["/a", "/b", "/c"], "/b", "down")).toEqual(["/a", "/c", "/b"])
  })

  it("caps sanitized favorites at twelve", () => {
    const allowed = new Set(Array.from({ length: 20 }, (_, i) => `/m${i}`))
    const hrefs = Array.from({ length: 15 }, (_, i) => `/m${i}`)
    expect(sanitizeErpNavFavoriteHrefs(hrefs, allowed)).toHaveLength(12)
  })

  it("limits dashboard quick links to six", () => {
    const hrefs = ["/1", "/2", "/3", "/4", "/5", "/6", "/7"]
    expect(getErpNavDashboardQuickHrefs(hrefs)).toEqual(hrefs.slice(0, 6))
  })
})
