/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { ExpirationPlugin, CacheFirst, NetworkFirst, NetworkOnly, Serwist } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/**
 * 실시간 매출·테이블 현황용 API — SW NetworkFirst(타임아웃 시 옛 캐시)에 넣으면
 * 「검색」직후에도 배달 완료·홀 손님이 늦게/안 바뀐 것처럼 보인다. IndexedDB 폴백은 앱 코드에 있음.
 */
function isPosLiveOpsGetApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/getPosTodaySales") ||
    pathname.startsWith("/api/getPosOrders") ||
    pathname.startsWith("/api/posRealtimeRevenueDashboard") ||
    pathname.startsWith("/api/posSalesByStore") ||
    pathname.startsWith("/api/posSalesByStoreChannel") ||
    pathname.startsWith("/api/posSalesByChannel") ||
    pathname.startsWith("/api/posSalesByDeliveryApp") ||
    pathname.startsWith("/api/posDeliveryAppReconcile") ||
    pathname.startsWith("/api/posKbankQrReconcile") ||
    pathname.startsWith("/api/posCardReconcile") ||
    pathname.startsWith("/api/posCashReconcile") ||
    pathname.startsWith("/api/posSalesByPeriod")
  )
}

/** POS 오프라인·설치형(PWA)에서 메뉴 등 GET이 defaultCache(apis 16건 한도)에서 밀리지 않도록 전용 캐시 */
function isPosWarmGetApi(pathname: string): boolean {
  if (isPosLiveOpsGetApi(pathname)) return false
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
    pathname.startsWith("/api/getPosPaymentMethodItems")
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
    pathname.startsWith("/api/getPosSalesByPayment") ||
    pathname.startsWith("/api/posSalesByPaymentBreakdown")
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

/** 당일 매출·주문 목록 — 항상 네트워크(검색/실시간 반영이 캐시에 막히지 않게) */
const posLiveOpsGetApisNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && isPosLiveOpsGetApi(pathname)
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
 * Supabase Storage 객체 GET은 defaultCache에 걸리면 Electron 하이브리드에서 썸네일이 비는 사례가 있다.
 * public / sign(서명) / 기타 object 경로를 모두 네트워크 전용으로 통일한다.
 */
const supabaseStorageObjectImagesNetworkOnly = {
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
    if (!url.pathname.includes("/storage/v1/object/")) return false
    const host = url.hostname.toLowerCase()
    return host.endsWith(".supabase.co") || host === "supabase.co"
  },
  method: "GET" as const,
  handler: new NetworkOnly(),
}

/**
 * `<img src="https://다른도메인/...">` 는 defaultCache 이미지 규칙에 걸리면 opaque·오염 캐시로
 * Electron 하이브리드에서만 안 보이는 사례가 있다. 교차 출처 image GET 은 캐시하지 않는다.
 */
const crossOriginImageGetNetworkOnly = {
  matcher({
    request,
    sameOrigin,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    if (request.method !== "GET" || sameOrigin) return false
    return request.destination === "image"
  },
  method: "GET" as const,
  handler: new NetworkOnly(),
}

/**
 * 로그인·인증 API와 로그인 문서는 SW 캐시 전략에 넣지 않음(NetworkOnly).
 * defaultCache에 걸리면 SW 경유 fetch가 깨져 "Failed to fetch"가 나는 환경이 있음.
 */
const authLoginApisGetNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    if (!sameOrigin || request.method !== "GET") return false
    return pathname === "/api/getLoginData" || pathname === "/api/online-probe"
  },
  method: "GET" as const,
  handler: new NetworkOnly(),
}

/** 회원 라운지 API — 쿠키 기반 개인정보이므로 SW 캐시 금지(공용 기기·계정 전환) */
const memberPortalApisNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && pathname.startsWith("/api/member-portal")
  },
  handler: new NetworkOnly(),
}

const authLoginPostNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return (
      sameOrigin &&
      (pathname === "/api/loginCheck" || pathname === "/api/changePassword") &&
      request.method === "POST"
    )
  },
  method: "POST" as const,
  handler: new NetworkOnly(),
}

/** POS 로그인 문서 — 오프라인 cold start(하이브리드·PWA)에서 프리캐시·캐시 우선 */
const posLoginDocumentNetworkFirst = {
  matcher({
    sameOrigin,
    url: { pathname },
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    if (!sameOrigin || request.method !== "GET") return false
    return pathname === "/pos/login" && request.destination === "document"
  },
  method: "GET" as const,
  handler: new NetworkFirst({
    cacheName: "pos-login-document",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 4,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
}

const loginPagesGetNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    if (!sameOrigin || request.method !== "GET") return false
    return pathname === "/admin/login" || pathname === "/login"
  },
  method: "GET" as const,
  handler: new NetworkOnly(),
}

/**
 * KBank QR 결제 가이드카드 브랜드 PNG — `public/pos/qr-brands/`.
 * posMenuImageProxy 와 달리 정적 자산이라 CDN·브라우저 장기 캐시 가능.
 */
const posQrBrandAssetsCacheFirst = {
  matcher({
    sameOrigin,
    url: { pathname },
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && request.method === "GET" && pathname.startsWith("/pos/qr-brands/")
  },
  method: "GET" as const,
  handler: new CacheFirst({
    cacheName: "pos-qr-brand-assets-v1",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 16,
        maxAgeSeconds: 365 * 24 * 60 * 60,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
}

/**
 * (canceled)/ERR_FAILED·빈 타일이 난다. 캐시하지 않고 항상 네트워크만 사용.
 */
const posMenuImageProxyGetNetworkOnly = {
  matcher({
    sameOrigin,
    url: { pathname },
    request,
  }: {
    request: Request
    sameOrigin: boolean
    url: URL
    event?: ExtendableEvent
  }) {
    return sameOrigin && request.method === "GET" && pathname === "/api/posMenuImageProxy"
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
  /** true일 때 일부 브라우저에서 navigate fetch + SW 조합으로 Failed to fetch 로그가 남는 사례 있음 */
  navigationPreload: false,
  /** posMenuImageProxy 는 href가 `...png`로 끝나 defaultCache 이미지 RegExp에도 걸릴 수 있어 반드시 최우선 등록 */
  runtimeCaching: [
    posMenuImageProxyGetNetworkOnly,
    posQrBrandAssetsCacheFirst,
    authLoginApisGetNetworkOnly,
    memberPortalApisNetworkOnly,
    authLoginPostNetworkOnly,
    posLoginDocumentNetworkFirst,
    loginPagesGetNetworkOnly,
    downloadsBinaryNetworkOnly,
    nextStaticBuildAssets,
    posLiveOpsGetApisNetworkOnly,
    posWarmGetApis,
    erpWarmGetApis,
    supabaseStorageObjectImagesNetworkOnly,
    crossOriginImageGetNetworkOnly,
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
            !pathname.startsWith("/pos") &&
            !pathname.startsWith("/m")
          )
        },
      },
      {
        url: "/m",
        matcher({ request }) {
          const pathname = new URL(request.url).pathname
          return request.destination === "document" && pathname.startsWith("/m")
        },
      },
    ],
  },
})

serwist.addEventListeners()
