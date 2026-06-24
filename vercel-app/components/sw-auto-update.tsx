"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { isMemberPortalPath } from "@/lib/member-portal-path"

/**
 * 배포 시 새 버전(sw.js) 자동 감지 → 배너 없이 백그라운드에서만 새로고침.
 *
 * 배경: PWA(Serwist `sw.js`)라 화면 JS/HTML이 서비스워커 캐시에 들어간다.
 * POS·ERP 모두 탭을 오래 켜 두면 배포 후에도 옛 코드가 남을 수 있어 갱신이 필요하다.
 *
 * 동작: skipWaiting+clientsClaim 으로 새 sw.js 가 활성화되면 `controllerchange` 등으로 감지한다.
 *  - 주문·입력 중 강제 리로드를 피하기 위해 **즉시 새로고침하지 않는다.**
 *  - 화면이 가려질 때(다른 탭·앱으로 전환)에만 `location.reload()` — UI 배너는 표시하지 않는다.
 *  - IndexedDB·오프라인 큐 등은 건드리지 않는다.
 */
export function SwAutoUpdate() {
  const pathname = usePathname()
  const [updateReady, setUpdateReady] = useState(false)
  const reloadingRef = useRef(false)

  const reloadOnce = () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    window.location.reload()
  }

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
    const onHidden = () => {
      if (document.visibilityState === "hidden") reloadOnce()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => document.removeEventListener("visibilitychange", onHidden)
  }, [updateReady, pathname])

  return null
}
