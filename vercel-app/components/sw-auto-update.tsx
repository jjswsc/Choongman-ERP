"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { isMemberPortalPath } from "@/lib/member-portal-path"

/**
 * POS·ERP 경로: 탭이 항상 전체 화면(키오스크)이라 visibilitychange → hidden이 발생하지 않는다.
 * 새 SW 활성화 감지 후 이 시간이 지나면 탭 상태와 무관하게 자동 새로고침한다.
 */
const POS_AUTO_RELOAD_DELAY_MS = 8_000
const ERP_AUTO_RELOAD_DELAY_MS = 30_000

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
 *  - **POS**: 키오스크·전체 화면이라 탭이 숨겨지지 않으므로 감지 후 짧은 유예(8초) 뒤 자동 새로고침.
 *  - **ERP/관리자**: 탭 전환이 가능하므로 hidden 시 즉시 새로고침. 30초 내 hidden이 없으면 타이머 폴백.
 *  - **기타**: 탭이 숨겨질 때만 새로고침 (기존 동작).
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

    if (isPosPath(pathname)) {
      const tid = window.setTimeout(reloadOnce, POS_AUTO_RELOAD_DELAY_MS)
      return () => window.clearTimeout(tid)
    }

    if (isAdminPath(pathname)) {
      const onHidden = () => {
        if (document.visibilityState === "hidden") reloadOnce()
      }
      document.addEventListener("visibilitychange", onHidden)
      const tid = window.setTimeout(reloadOnce, ERP_AUTO_RELOAD_DELAY_MS)
      return () => {
        document.removeEventListener("visibilitychange", onHidden)
        window.clearTimeout(tid)
      }
    }

    const onHidden = () => {
      if (document.visibilityState === "hidden") reloadOnce()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => document.removeEventListener("visibilitychange", onHidden)
  }, [updateReady, pathname])

  return null
}
