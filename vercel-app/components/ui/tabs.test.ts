// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/erp-navigation", () => ({
  useErpNavigationOptional: () => ({}),
}))

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounts: string[] = []
const setters = new Map<string, (n: number) => void>()

function Panel({ name }: { name: string }) {
  const [count, setCount] = React.useState(0)
  React.useEffect(() => {
    mounts.push(name)
  }, [name])
  setters.set(name, setCount)
  return React.createElement("span", { "data-panel": name }, `${name}:${count}`)
}

function renderTabs(root: Root, value: string, preserveInactiveTabs: boolean) {
  act(() => {
    root.render(
      React.createElement(
        Tabs,
        { value, preserveInactiveTabs },
        React.createElement(
          TabsList,
          null,
          React.createElement(TabsTrigger, { value: "a" }, "A"),
          React.createElement(TabsTrigger, { value: "b" }, "B"),
          React.createElement(TabsTrigger, { value: "c" }, "C")
        ),
        React.createElement(TabsContent, { value: "a" }, React.createElement(Panel, { name: "a" })),
        React.createElement(TabsContent, { value: "b" }, React.createElement(Panel, { name: "b" })),
        React.createElement(TabsContent, { value: "c" }, React.createElement(Panel, { name: "c" }))
      )
    )
  })
}

describe("ERP Tabs preserveInactiveTabs={false}", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it("안 연 탭은 마운트하지 않는다", () => {
    renderTabs(root, "a", false)
    expect(container.querySelector('[data-panel="a"]')).not.toBeNull()
    expect(container.querySelector('[data-panel="b"]')).toBeNull()
    expect(container.querySelector('[data-panel="c"]')).toBeNull()
  })

  it("한 번 연 탭은 다른 탭에 갔다 와도 state를 유지한다", () => {
    renderTabs(root, "a", false)
    renderTabs(root, "b", false)
    act(() => setters.get("b")?.(4))
    renderTabs(root, "a", false)
    expect(container.querySelector('[data-panel="b"]')).not.toBeNull()
    renderTabs(root, "b", false)

    expect(container.querySelector('[data-panel="b"]')?.textContent).toBe("b:4")
    expect(mounts.filter((m) => m === "b")).toHaveLength(1)
    expect(container.querySelector('[data-panel="c"]')).toBeNull()
  })

  it("기본(true)은 모든 탭을 처음부터 유지한다", () => {
    renderTabs(root, "a", true)
    expect(container.querySelectorAll("[data-panel]")).toHaveLength(3)
  })
})
