"use client"

import { useEffect, useRef, useState } from "react"
import { useLang } from "@/lib/lang-context"

/** 배너 문구 — 전 화면 공용이라 i18n.ts(거대·타 작업과 충돌) 대신 여기서 직접 다국어 처리. */
const COPY: Record<string, { msg: string; btn: string }> = {
  ko: { msg: "새 버전이 적용됐습니다. 새로고침하면 반영됩니다.", btn: "지금 업데이트" },
  en: { msg: "A new version is ready. Reload to apply it.", btn: "Update now" },
  th: { msg: "มีเวอร์ชันใหม่แล้ว รีเฟรชหน้าจอเพื่อใช้งาน", btn: "อัปเดตเลย" },
  vi: { msg: "Đã có phiên bản mới. Tải lại để áp dụng.", btn: "Cập nhật ngay" },
  mm: { msg: "ဗားရှင်းအသစ်ရပါပြီ။ ပြန်လည်စတင်ပါ။", btn: "ယခုအပ်ဒိတ်လုပ်ပါ" },
  la: { msg: "ມີເວີຊັນໃໝ່ແລ້ວ ໂຫຼດໃໝ່ເພື່ອນຳໃຊ້", btn: "ອັບເດດດຽວນີ້" },
  kh: { msg: "មានកំណែថ្មីហើយ។ ផ្ទុកឡើងវិញដើម្បីប្រើ។", btn: "ធ្វើបច្ចុប្បន្នភាពឥឡូវ" },
  ms: { msg: "Versi baharu tersedia. Muat semula untuk menggunakannya.", btn: "Kemas kini sekarang" },
}

/**
 * 배포 시 새 버전(sw.js) 자동 감지 → 안내 후 자동 새로고침.
 *
 * 배경: 이 앱은 PWA(Serwist `sw.js`)라 화면 JS/HTML이 서비스워커 캐시에 들어간다.
 *  - POS 기기는 `/pos/login`에서 캐시 리셋을 일부러 안 하므로(오프라인 보호),
 *    배포·앱 재시작·메뉴 새로고침만으로는 옛 화면 코드가 캐시에서 계속 떠 업데이트가 안 보였다.
 *
 * 동작: SW는 이미 skipWaiting+clientsClaim 이라, 새 sw.js 가 감지되면 즉시 활성화되며
 *  `controllerchange` 가 발생한다. 이를 "업데이트 준비됨" 신호로 본다.
 *  - 주문 중 강제 리로드로 장바구니가 날아가지 않도록 **즉시 새로고침하지 않고**,
 *    ① 안내 배너 + 수동 [지금 업데이트] 버튼, ② 화면이 가려질 때(백그라운드) 자동 새로고침.
 *  - 오프라인 데이터(IndexedDB·큐)는 건드리지 않는다. 단순 location.reload() 만 한다.
 */
export function SwAutoUpdate() {
  const { lang } = useLang()
  const copy = COPY[lang] || COPY.en
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
    const sw = navigator.serviceWorker
    if (!sw) return

    // 페이지가 이미 SW의 제어를 받고 있었는지(=기존 설치). 최초 설치(컨트롤러 없음)에는
    // controllerchange 가 자연히 발생하므로 그때는 새로고침하지 않는다(업데이트일 때만).
    const hadController = !!sw.controller

    const onControllerChange = () => {
      if (!hadController) return
      setUpdateReady(true)
    }
    sw.addEventListener("controllerchange", onControllerChange)

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
        // 새 워커가 설치→활성화되면(배포) 업데이트 신호.
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated" && hadController) setUpdateReady(true)
          })
        }
        watch(r.waiting)
        watch(r.installing)
        r.addEventListener("updatefound", () => watch(r.installing))
        checkForUpdate()
        // 장시간 켜둔 매장 기기를 위해 주기적으로 새 배포 확인(네트워크 있을 때만).
        intervalId = window.setInterval(checkForUpdate, 60_000)
      })
      .catch(() => {})

    window.addEventListener("online", checkForUpdate)
    window.addEventListener("focus", checkForUpdate)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      sw.removeEventListener("controllerchange", onControllerChange)
      window.removeEventListener("online", checkForUpdate)
      window.removeEventListener("focus", checkForUpdate)
      document.removeEventListener("visibilitychange", onVisible)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [])

  // 업데이트가 준비되면, 화면이 가려질 때(주문 중이 아닐 가능성↑) 자동 새로고침.
  useEffect(() => {
    if (!updateReady) return
    const onHidden = () => {
      if (document.visibilityState === "hidden") reloadOnce()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => document.removeEventListener("visibilitychange", onHidden)
  }, [updateReady])

  if (!updateReady) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[2147483646] flex items-center justify-center gap-3 border-t border-emerald-300 bg-emerald-50/95 px-4 py-2.5 text-sm text-emerald-900 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] backdrop-blur"
    >
      <span className="min-w-0 truncate">{copy.msg}</span>
      <button
        type="button"
        onClick={reloadOnce}
        className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-700"
      >
        {copy.btn}
      </button>
    </div>
  )
}
