/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist"

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

/** ERP 오프라인 읽기 캐시 대상 API */
function isErpWarmGetApi(pathname: string): boolean {
  const exact = new Set([
    "/api/getStoreList",
    "/api/getVendorsForPurchase",
    "/api/getVendorsForSales",
    "/api/getBankAccounts",
    "/api/getAppData",
    "/api/getPosSalesFilterOptions",
  ])
  if (exact.has(pathname)) return true
  return (
    pathname.startsWith("/api/getChecklistItems") ||
    pathname.startsWith("/api/getReceivablePayableList") ||
    pathname.startsWith("/api/getReceivablePayableSummary") ||
    pathname.startsWith("/api/getPurchaseOrders") ||
    pathname.startsWith("/api/getPurchaseOrderItems") ||
    pathname.startsWith("/api/getPurchaseOrderSummaries") ||
    pathname.startsWith("/api/getPosSalesByPeriod") ||
    pathname.startsWith("/api/getPosSalesByDeliveryApp") ||
    pathname.startsWith("/api/getPosSalesByPayment") ||
    pathname.startsWith("/api/getPosSalesByStore")
  )
}

/**
 * APK/설치파일: SW defaultCache·오프라인 폴백이 끼면 HTML이 저장되어 휴대폰에서 "파일을 열 수 없음"이 난다.
 * 항상 네트워크로만 받도록 한다.
 */
const downloadsBinaryNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && /^\/downloads\/.+\.(apk|exe)$/i.test(pathname)
  },
  method: "GET" as const,
  handler: new NetworkOnly(),
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

const erpWarmGetApis = {
  matcher({
    sameOrigin,
    url: { pathname },
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && isErpWarmGetApi(pathname)
  },
  method: "GET" as const,
  handler: new NetworkFirst({
    cacheName: "erp-warm-get-apis",
    networkTimeoutSeconds: 15,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 192,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
}

/**
 * Supabase Storage 공개 객체는 defaultCache(이미지 규칙 등)에 걸리면 Electron 하이브리드 POS에서만 썸네일이 비는 사례가 있다.
 * 확장자 없는 파일명·destination 미설정 등으로 예전 매처에서 빠지면 SW 캐시로 떨어지므로,
 * `*.supabase.co` + `/storage/v1/object/public/` 인 GET 전부 네트워크 전용으로 통일한다.
 */
const supabaseStoragePublicImagesNetworkOnly = {
  matcher({
    url,
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    if (request.method !== "GET") return false
    if (!url.pathname.includes("/storage/v1/object/public/")) return false
    const host = url.hostname.toLowerCase()
    return host.endsWith(".supabase.co") || host === "supabase.co"
  },
  method: "GET" as const,
  handler: new NetworkOnly(),
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
  /** 설치 패키지 → `/_next/static` → POS warm API → ERP warm API → 나머지 defaultCache */
  runtimeCaching: [
    downloadsBinaryNetworkOnly,
    nextStaticBuildAssets,
    posWarmGetApis,
    erpWarmGetApis,
    supabaseStoragePublicImagesNetworkOnly,
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/admin/login",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return request.destination === "document" && pathname.startsWith("/admin")
        },
      },
      /**
       * `/pos/login`만 로그인 문서로 폴백.
       * 예전: `/pos/*` 전부 → `/pos/login` 이라 오프라인에서 `/pos/terminal` 등이 로그인 HTML로 열리고,
       * 세션 있으면 로그인 폼이 곧바로 `/pos`로 되돌려 매장·배달·포장 버튼이 "안 넘어가는" 것처럼 보였음.
       */
      {
        url: "/pos/login",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return request.destination === "document" && pathname === "/pos/login"
        },
      },
      {
        url: "/pos",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return (
            request.destination === "document" &&
            pathname.startsWith("/pos") &&
            pathname !== "/pos/login"
          )
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
