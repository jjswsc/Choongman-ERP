"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isMemberPortalPath } from "@/lib/member-portal-path"
import {
  hasRecentChunkRecovery,
  recoverFromChunkLoadError,
  shouldDeferPosAutoReload,
} from "@/lib/chunk-load-recovery"
import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import { useLang } from "@/lib/lang-context"
import { tOr, useT } from "@/lib/i18n"
import {
  currentDocumentNextBuildStamp,
  extractSharedNextBuildStamp,
  shouldReloadForNewWebBuild,
} from "@/lib/web-build-stamp"

/**
 * POS 경로: 탭이 항상 전체 화면(키오스크)이라 visibilitychange → hidden이 발생하지 않는다.
 * 새 SW 활성화 감지 후 이 시간이 지나면 탭 상태와 무관하게 자동 새로고침한다.
 */
const POS_AUTO_RELOAD_DELAY_MS = 8_000

function isPosPath(p: string) {
  return p === "/pos" || p.startsWith("/pos/")
}
function isAdminPath(p: string) {
  return p === "/admin" || p.startsWith("/admin/")
}

/**
 * 배포 시 새 버전(sw.js) 자동 감지 → 배너 없이 백그라운드에서만 새로고침.
 *
 * 배경: PWA(Serwist `sw.js`)라 화면 JS/HTML이 서비스워커 캐시에 들어간다.
 * POS·ERP 모두 탭을 오래 켜 두면 배포 후에도 옛 코드가 남을 수 있어 갱신이 필요하다.
 *
 * 동작: skipWaiting+clientsClaim 으로 새 sw.js 가 활성화되면 `controllerchange` 등으로 감지한다.
 *  - **Windows POS**: SW가 있으면 웹 POS와 같이 `controllerchange`로 갱신한다. SW가 아직 없으면
 *    같은 페이지 HTML의 webpack 스탬프를 5분마다 비교한다. 배포 감지 후 캐시 비우기는 온라인일 때만.
 *  - **POS(PWA)**: 키오스크·전체 화면이라 탭이 숨겨지지 않으므로 감지 후 짧은 유예(8초) 뒤 자동 새로고침.
 *    주문(/pos/order)·결제(/pos/terminal) 중에는 장바구니가 지워지지 않게 미루고, 홈으로 나간 뒤에 갱신한다.
 *  - **ERP/관리자**: 자동 새로고침하지 않는다. 열어 둔 메뉴들의 탭·조회 결과가 한꺼번에 사라지므로
 *    배너로 알리고 직원이 누를 때만 새로고침한다. 옛 청크 오류는 StaleBundleAutoRecover가 복구한다.
 *  - **기타**: 탭이 숨겨질 때만 새로고침 (기존 동작).
 *  - IndexedDB·오프라인 큐 등은 건드리지 않는다.
 */
export function SwAutoUpdate() {
  const pathname = usePathname()
  const t = useT(useLang().lang)
  const [updateReady, setUpdateReady] = useState(false)
  const [erpBannerDismissed, setErpBannerDismissed] = useState(false)
  const reloadingRef = useRef(false)

  const reloadOnce = () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    if (isPosPath(pathname)) {
      if (shouldDeferPosAutoReload(pathname)) {
        reloadingRef.current = false
        return
      }
      void recoverFromChunkLoadError().then((didReload) => {
        if (!didReload) reloadingRef.current = false
      })
      return
    }
    window.location.reload()
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    if (process.env.NODE_ENV !== "production") return
    if (isMemberPortalPath(pathname)) return
    if (!isCmPosHybridShell()) return
    if (!isPosPath(pathname)) return

    let cancelled = false
    const check = () => {
      if (cancelled || !navigator.onLine) return
      if (navigator.serviceWorker?.controller) return
      if (hasRecentChunkRecovery()) return
      const current = currentDocumentNextBuildStamp(document)
      if (!current) return
      void fetch(`/pos/login?_cmBuild=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "text/html" },
      })
        .then((res) => (res.ok ? res.text() : ""))
        .then((html) => {
          if (cancelled || !html) return
          if (shouldReloadForNewWebBuild(current, extractSharedNextBuildStamp(html))) {
            setUpdateReady(true)
          }
        })
        .catch(() => {})
    }

    check()
    const intervalId = window.setInterval(check, 5 * 60_000)
    window.addEventListener("online", check)
    window.addEventListener("focus", check)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("online", check)
      window.removeEventListener("focus", check)
    }
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (process.env.NODE_ENV !== "production") return
    if (isMemberPortalPath(pathname)) return
    const sw = navigator.serviceWorker
    if (!sw) return

    const hadController = !!sw.controller

    const markUpdateReady = () => {
      if (!hadController) return
      setUpdateReady(true)
    }

    sw.addEventListener("controllerchange", markUpdateReady)

    let reg: ServiceWorkerRegistration | null = null
    let intervalId: number | undefined

    const checkForUpdate = () => {
      if (!navigator.onLine) return
      reg?.update().catch(() => {})
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate()
    }

    void sw.ready
      .then((r) => {
        reg = r
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") markUpdateReady()
          })
        }
        watch(r.waiting)
        watch(r.installing)
        r.addEventListener("updatefound", () => watch(r.installing))
        checkForUpdate()
        intervalId = window.setInterval(checkForUpdate, 5 * 60_000)
      })
      .catch(() => {})

    window.addEventListener("online", checkForUpdate)
    window.addEventListener("focus", checkForUpdate)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      sw.removeEventListener("controllerchange", markUpdateReady)
      window.removeEventListener("online", checkForUpdate)
      window.removeEventListener("focus", checkForUpdate)
      document.removeEventListener("visibilitychange", onVisible)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [pathname])

  useEffect(() => {
    if (isMemberPortalPath(pathname)) return
    if (!updateReady) return

    if (isPosPath(pathname)) {
      // 주문·결제 중에는 갱신을 미룬다. 홈 등으로 나가면 pathname이 바뀌며 그때 연다.
      if (shouldDeferPosAutoReload(pathname)) return
      const tid = window.setTimeout(reloadOnce, POS_AUTO_RELOAD_DELAY_MS)
      return () => window.clearTimeout(tid)
    }

    if (isAdminPath(pathname)) return

    const onHidden = () => {
      if (document.visibilityState === "hidden") reloadOnce()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => document.removeEventListener("visibilitychange", onHidden)
  }, [updateReady, pathname])

  const isErpWorkspace = isAdminPath(pathname) && pathname !== "/admin/login"
  if (!updateReady || !isErpWorkspace || erpBannerDismissed) return null

  return (
    <div
      role="status"
      className="fixed bottom-3 right-3 z-[210] flex max-w-[min(26rem,calc(100vw-1.5rem))] items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-50 px-3 py-2 text-xs text-sky-950 shadow-lg dark:bg-sky-950/90 dark:text-sky-50"
    >
      <span className="min-w-0 flex-1 leading-snug">
        {tOr(t, "erpNewVersionReady", "새 버전이 배포되었습니다. 작업을 마친 뒤 새로고침하세요.")}
      </span>
      <Button type="button" size="sm" className="h-7 shrink-0 gap-1 px-2.5 text-xs" onClick={reloadOnce}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {tOr(t, "erpNewVersionReload", "새로고침")}
      </Button>
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sky-900/70 hover:bg-sky-100 hover:text-sky-950 dark:text-sky-100/70 dark:hover:bg-sky-900"
        title={tOr(t, "erpNewVersionLater", "나중에")}
        aria-label={tOr(t, "erpNewVersionLater", "나중에")}
        onClick={() => setErpBannerDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
