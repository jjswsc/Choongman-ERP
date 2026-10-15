// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime"
import { AdminPageKeepAlive } from "@/components/erp/admin-page-keep-alive"
import { clearErpWorkspaceTabs, ensureErpWorkspaceTab } from "@/lib/erp-workspace-tabs"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type FakeLayoutCtx = { segment: string }
type LayoutCtxValue = React.ContextType<typeof LayoutRouterContext>

const mounts: string[] = []
const setters = new Map<string, (n: number) => void>()

function FakePage({ segment }: { segment: string }) {
  const [count, setCount] = React.useState(0)
  React.useEffect(() => {
    mounts.push(segment)
  }, [segment])
  setters.set(segment, setCount)
  return React.createElement("span", { "data-page": segment }, `${segment}:${count}`)
}

/** Next OuterLayoutRouter처럼 LayoutRouterContext의 활성 세그먼트만 그린다 */
function FakeOuterLayoutRouter() {
  const ctx = React.useContext(LayoutRouterContext) as unknown as FakeLayoutCtx | null
  const segment = ctx?.segment || ""
  return React.createElement(FakePage, { key: segment, segment })
}

const layoutChildren = React.createElement(FakeOuterLayoutRouter)

function renderAt(root: Root, segment: string) {
  const pathname = `/admin/${segment}`
  const layoutCtx = { segment } as unknown as LayoutCtxValue
  act(() => {
    root.render(
      React.createElement(
        PathnameContext.Provider,
        { value: pathname },
        React.createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams() },
          React.createElement(
            LayoutRouterContext.Provider,
            { value: layoutCtx },
            React.createElement(AdminPageKeepAlive, null, layoutChildren)
          )
        )
      )
    )
  })
}

describe("AdminPageKeepAlive", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    sessionStorage.clear()
    clearErpWorkspaceTabs()
    mounts.length = 0
    setters.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("다른 메뉴로 갔다 와도 숨긴 화면 state를 유지한다", () => {
    ensureErpWorkspaceTab("/admin/employees")
    ensureErpWorkspaceTab("/admin/leave")

    renderAt(root, "employees")
    act(() => setters.get("employees")?.(3))
    expect(container.querySelector('[data-page="employees"]')?.textContent).toBe("employees:3")

    renderAt(root, "leave")
    renderAt(root, "employees")

    expect(container.querySelector('[data-page="employees"]')?.textContent).toBe("employees:3")
    expect(mounts.filter((s) => s === "employees")).toHaveLength(1)
  })

  it("keep-alive 제외 메뉴(실시간 매출)를 거쳐 와도 state를 유지한다", () => {
    ensureErpWorkspaceTab("/admin/employees")
    ensureErpWorkspaceTab("/admin/live-store-sales")

    renderAt(root, "employees")
    act(() => setters.get("employees")?.(5))

    renderAt(root, "live-store-sales")
    expect(container.querySelectorAll('[data-page="live-store-sales"]')).toHaveLength(1)

    renderAt(root, "employees")
    expect(container.querySelector('[data-page="employees"]')?.textContent).toBe("employees:5")
    expect(mounts.filter((s) => s === "employees")).toHaveLength(1)
  })

  it("숨긴 슬롯이 현재 메뉴 화면을 중복으로 그리지 않는다", () => {
    ensureErpWorkspaceTab("/admin/employees")
    ensureErpWorkspaceTab("/admin/leave")

    renderAt(root, "employees")
    renderAt(root, "leave")

    expect(container.querySelectorAll('[data-page="leave"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-page="employees"]')).toHaveLength(1)
  })
})
