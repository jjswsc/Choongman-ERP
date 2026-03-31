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

/**
 * defaultCache는 `/_next/static/*.js`를 CacheFirst로 캐시함.
 * 배포 직후·일시 오류로 HTML이 JS 청크 URL에 캐시되면 실행 시 SyntaxError(Invalid or unexpected token)가 난다.
 * 동일 경로는 네트워크 우선으로 덮어쓴다(캐시 이름 분리로 과거 오염 캐시와 분리).
 */
const nextStaticBuildAssets = {
  matcher({
    sameOrigin,
    url: { pathname },
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && /\/_next\/static\/.+\.(?:js|css)$/i.test(pathname)
  },
  method: "GET" as const,
  handler: new NetworkFirst({
    /** 이름 변경 시 기존 `next-static-build-assets`에 남은 오염 엔트리를 더 이상 쓰지 않음 */
    cacheName: "next-static-build-assets-v2",
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 7 * 24 * 60 * 60,
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
  /** `/_next/static` → POS warm API → 나머지 defaultCache */
  runtimeCaching: [nextStaticBuildAssets, posWarmGetApis, ...defaultCache],
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
