'use client'

import { useEffect, useRef } from 'react'
import { preloadCommonData, preloadPosOfflineData, preloadErpOfflineData } from '@/lib/offline/preload'

/** 로그인 성공 직후 1회 — 공통 데이터 preload */
export function usePreloadCommonOnLogin(isLoggedIn: boolean) {
  const done = useRef(false)
  useEffect(() => {
    if (!isLoggedIn || done.current) return
    done.current = true
    preloadCommonData()
  }, [isLoggedIn])
}

/** POS 화면 진입 시 — 메뉴·배달앱·프린터 등 preload (백그라운드) */
export function usePreloadPosData(storeCode?: string | null) {
  useEffect(() => {
    if (!storeCode) {
      preloadPosOfflineData()
      return
    }
    preloadPosOfflineData(storeCode)
  }, [storeCode])
}

/** ERP/관리자 화면 진입 시 — 거래처·품목·창고 등 preload (백그라운드) */
export function usePreloadErpData() {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    preloadErpOfflineData()
  }, [])
}
