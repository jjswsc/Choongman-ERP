/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/** POS 오프라인·설치형(PWA)에서 메뉴 등 GET이 defaultCache(apis 16건 한도)에서 밀리지 않도록 전용 캐시 */
function isPosWarmGetApi(pathname: string): boolean {
  if (pathname === "/api/members") return true
  const exact = new Set([
    "/api/getStoreList",
    "/api/getPosMenus",
    "/api/getPosMenuCategories",
    "/api/getPosMenuScreenConfig",
  ])
  if (exact.has(pathname)) return true
  return (
    pathname.startsWith("/api/getPosMenuOptions") ||
    pathname.startsWith("/api/getPosPromosWithItems") ||
    pathname.startsWith("/api/getPosTableLayout") ||
    pathname.startsWith("/api/getPosPrinterSettings") ||
    pathname.startsWith("/api/getPosDeliveryApps") ||
    pathname.startsWith("/api/getPosTodaySales") ||
    pathname.startsWith("/api/getPosPaymentMethodItems") ||
    pathname.startsWith("/api/getPosOrders")
  )
}

const posWarmGetApis = {
  matcher({
    sameOrigin,
    url: { pathname },
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && isPosWarmGetApi(pathname)
  },
  method: "GET" as const,
  handler: new NetworkFirst({
    cacheName: "pos-warm-get-apis",
    networkTimeoutSeconds: 12,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 96,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  /** POS GET을 먼저 매칭 — defaultCache의 `/api/` 16건 제한에 메뉴가 쫓겨나지 않게 함 */
  runtimeCaching: [posWarmGetApis, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/admin/login",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return request.destination === "document" && pathname.startsWith("/admin")
        },
      },
      {
        url: "/pos/login",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return request.destination === "document" && pathname.startsWith("/pos")
        },
      },
      {
        url: "/login",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return (
            request.destination === "document" &&
            !pathname.startsWith("/admin") &&
            !pathname.startsWith("/pos")
          )
        },
      },
    ],
  },
})

serwist.addEventListeners()
