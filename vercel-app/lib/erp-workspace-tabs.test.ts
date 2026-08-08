/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import {
  ERP_WORKSPACE_DASHBOARD_HREF,
  ERP_WORKSPACE_TABS_KEY,
  MAX_ERP_WORKSPACE_TABS,
  clearErpWorkspaceTabs,
  closeOtherErpWorkspaceTabs,
  ensureErpWorkspaceTab,
  findNeighborWorkspaceTabHref,
  getErpWorkspaceTabs,
  removeErpWorkspaceTab,
  reorderErpWorkspaceTabs,
  resolveErpWorkspaceTabHref,
} from "@/lib/erp-workspace-tabs"
import { resolveErpKeepAliveCacheHref, isErpKeepAliveExcluded } from "@/lib/erp-keep-alive-config"

describe("erp-workspace-tabs", () => {
  afterEach(() => {
    clearErpWorkspaceTabs()
    sessionStorage.removeItem(ERP_WORKSPACE_TABS_KEY)
  })

  it("resolves help query off tab key", () => {
    expect(resolveErpWorkspaceTabHref("/admin/vendors?erp_help=1")).toBe("/admin/vendors")
  })

  it("keeps leave?tab= under one workspace key", () => {
    expect(resolveErpWorkspaceTabHref("/admin/leave?tab=stats")).toBe("/admin/leave")
    expect(resolveErpKeepAliveCacheHref("/admin/leave?tab=stats")).toBe("/admin/leave")
  })

  it("keeps financial-statements?tab= under one workspace key", () => {
    expect(resolveErpWorkspaceTabHref("/admin/financial-statements?tab=balance")).toBe(
      "/admin/financial-statements"
    )
    expect(resolveErpKeepAliveCacheHref("/admin/financial-statements?tab=margin&store=All")).toBe(
      "/admin/financial-statements"
    )
  })

  it("accumulates menus without forcing dashboard", () => {
    ensureErpWorkspaceTab("/admin/vendors")
    ensureErpWorkspaceTab("/admin/leave?tab=stats")
    const hrefs = getErpWorkspaceTabs().map((t) => t.href)
    expect(hrefs).not.toContain(ERP_WORKSPACE_DASHBOARD_HREF)
    expect(hrefs).toContain("/admin/vendors")
    expect(hrefs).toContain("/admin/leave")
  })

  it("allows closing dashboard and finds neighbor", () => {
    ensureErpWorkspaceTab("/admin")
    ensureErpWorkspaceTab("/admin/vendors")
    ensureErpWorkspaceTab("/admin/members")
    const before = getErpWorkspaceTabs()
    const neighbor = findNeighborWorkspaceTabHref("/admin/vendors", before)
    expect(neighbor).toBe("/admin/members")
    removeErpWorkspaceTab("/admin/vendors")
    expect(getErpWorkspaceTabs().map((t) => t.href)).not.toContain("/admin/vendors")
    removeErpWorkspaceTab("/admin")
    expect(getErpWorkspaceTabs().map((t) => t.href)).not.toContain("/admin")
  })

  it("evicts LRU when over max tabs", () => {
    for (let i = 0; i < MAX_ERP_WORKSPACE_TABS + 2; i++) {
      ensureErpWorkspaceTab(`/admin/vendors?x=${i}`)
    }
    expect(getErpWorkspaceTabs().length).toBeLessThanOrEqual(MAX_ERP_WORKSPACE_TABS)
  })

  it("reorders any tabs and closes others without keeping dashboard", () => {
    ensureErpWorkspaceTab("/admin")
    ensureErpWorkspaceTab("/admin/vendors")
    ensureErpWorkspaceTab("/admin/items")
    ensureErpWorkspaceTab("/admin/notices")
    reorderErpWorkspaceTabs("/admin/notices", "/admin/vendors")
    const hrefs = getErpWorkspaceTabs().map((t) => t.href)
    expect(hrefs.indexOf("/admin/notices")).toBeLessThan(hrefs.indexOf("/admin/vendors"))
    const removed = closeOtherErpWorkspaceTabs("/admin/items")
    expect(removed).toContain("/admin/vendors")
    expect(removed).toContain("/admin")
    expect(getErpWorkspaceTabs().map((t) => t.href)).toEqual(["/admin/items"])
  })
})

describe("erp-keep-alive-config excludes", () => {
  it("excludes only live realtime dashboard; search screens stay keep-alive", () => {
    expect(isErpKeepAliveExcluded("/admin/live-store-sales")).toBe(true)
    expect(isErpKeepAliveExcluded("/admin/attendance")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/payroll")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/stock")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/outbound")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/pos-orders")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/vendors")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/sales-management")).toBe(false)
    expect(isErpKeepAliveExcluded("/admin/financial-statements")).toBe(false)
  })
})
