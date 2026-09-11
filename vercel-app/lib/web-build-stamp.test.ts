import { describe, expect, it } from "vitest"
import {
  currentDocumentNextBuildStamp,
  extractSharedNextBuildStamp,
  shouldReloadForNewWebBuild,
} from "@/lib/web-build-stamp"

describe("extractSharedNextBuildStamp", () => {
  it("reads the webpack runtime chunk shared by all pages", () => {
    expect(
      extractSharedNextBuildStamp(
        `<script src="/_next/static/chunks/webpack-abc123.js"></script>
         <script src="/_next/static/chunks/app/pos/terminal/page-zzz.js"></script>`
      )
    ).toBe("/_next/static/chunks/webpack-abc123.js")
  })

  it("also matches an unhashed webpack.js filename", () => {
    expect(extractSharedNextBuildStamp('<script src="/_next/static/chunks/webpack.js"></script>')).toBe(
      "/_next/static/chunks/webpack.js"
    )
  })

  it("ignores page-only chunks so login vs terminal HTML do not look like a new deploy", () => {
    const login = extractSharedNextBuildStamp(
      `<script src="/_next/static/chunks/webpack-abc123.js"></script>
       <script src="/_next/static/chunks/app/pos/login/page-aaa.js"></script>`
    )
    const terminal = extractSharedNextBuildStamp(
      `<script src="/_next/static/chunks/webpack-abc123.js"></script>
       <script src="/_next/static/chunks/app/pos/terminal/page-bbb.js"></script>`
    )
    expect(login).toBe(terminal)
  })
})

describe("shouldReloadForNewWebBuild", () => {
  it("reloads only when both stamps exist and differ", () => {
    expect(
      shouldReloadForNewWebBuild(
        "/_next/static/chunks/webpack-old.js",
        "/_next/static/chunks/webpack-new.js"
      )
    ).toBe(true)
    expect(
      shouldReloadForNewWebBuild(
        "/_next/static/chunks/webpack-abc.js",
        "/_next/static/chunks/webpack-abc.js"
      )
    ).toBe(false)
    expect(shouldReloadForNewWebBuild("", "/_next/static/chunks/webpack-new.js")).toBe(false)
    expect(shouldReloadForNewWebBuild("/_next/static/chunks/webpack-old.js", "")).toBe(false)
  })
})

describe("currentDocumentNextBuildStamp", () => {
  it("reads script src from the live document", () => {
    const nodes = [
      { getAttribute: (name: string) => (name === "src" ? "/_next/static/chunks/webpack-live.js" : null) },
    ]
    expect(
      currentDocumentNextBuildStamp({
        querySelectorAll: () => nodes,
      })
    ).toBe("/_next/static/chunks/webpack-live.js")
  })
})
