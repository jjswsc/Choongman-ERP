"use client"
import { appAlert } from "@/lib/app-message"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getLoginData, loginCheck, changePassword } from "@/lib/api-client"
import { useAuth, loadOfflineResumeAuth, type AuthState } from "@/lib/auth-context"
import { isLangCode, useLang, normalizeAdminUiLang, ADMIN_UI_LANG_OPTIONS } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { replacePosOfflineAware, setPosSessionPreferHardNavigation } from "@/lib/pos-offline-nav"
import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import { copyWindowsInstallerUrl, WINDOWS_POS_SETUP_PATH } from "@/lib/windows-installer-copy"
import { labelForStore } from "@/lib/store-list-keys"
import {
  isBrowserOnline,
  runReachabilityProbe,
  REACHABILITY_EVENT,
} from "@/lib/offline/network"
import { useAppBrandConfig } from "@/components/app-brand-provider"

/** i18n 키 누락·손상 시 영어 (번들 문자열은 네트워크 없이 동작 — 이 폴백은 이중 안전장치) */
const LOGIN_I18N_FALLBACK_EN: Record<string, string> = {
  msg_login_network_error:
    "Cannot connect to the network. You may be offline or the server may be unreachable.",
  msg_login_offline_connect_detail:
    "If this browser has no saved prior session (or site data was cleared), you cannot sign in with PIN while offline. Connect to the internet and sign in once. Wi-Fi can look connected even when the server is unreachable.",
  /** getLoginData 실패 직후 /api/online-probe 성공 — 서버는 닿는데 목록 API만 지연·오류 */
  msg_login_list_fetch_title: "Could not load the store list",
  msg_login_list_fetch_soft_fail:
    "The app server responded, but the store list did not load (timeout or temporary error). Tap Retry. If this continues, the login service may be busy — try again in a moment.",
  /** 목록은 받은 뒤 loginCheck 네트워크 실패 — 오프라인 PIN 안내는 부적절 */
  msg_login_submit_network_title: "Login could not be verified",
  msg_login_submit_network_soft:
    "The login request did not complete. Check the connection and try again. If the store list loaded above, the server is reachable — a retry often works.",
}

/** 번역 DB 없을 때 한국어 보조 (pickLoginStr이 영어만 있을 때 ko 사용자용) */
const LOGIN_I18N_FALLBACK_KO: Partial<Record<string, string>> = {
  msg_login_list_fetch_title: "매장 목록을 불러오지 못했습니다",
  msg_login_list_fetch_soft_fail:
    "앱 서버에는 닿았으나 매장 목록을 가져오지 못했습니다(시간 초과 또는 일시 오류). 「다시 시도」를 눌러 주세요. 계속되면 잠시 후 다시 시도하거나 관리자에게 문의하세요.",
  msg_login_submit_network_title: "로그인을 확인할 수 없습니다",
  msg_login_submit_network_soft:
    "로그인 확인 요청이 완료되지 않았습니다. 연결을 확인한 뒤 다시 시도해 주세요. 위에서 매장 목록이 보였다면 서버는 닿는 경우가 많아 재시도로 해결됩니다.",
}

function pickLoginStr(tMsg: (k: string) => string, key: string, lang?: string): string {
  const raw = tMsg(key)
  const fb = LOGIN_I18N_FALLBACK_EN[key]
  const fbKo = lang === "ko" ? LOGIN_I18N_FALLBACK_KO[key] : undefined
  if (lang === "ko" && fbKo && (!raw || raw === key)) return fbKo
  if (fb && (!raw || raw === key)) return fb
  return raw || fbKo || fb || key
}

/** loginCheck API catch 등 — DB/네트워크 실패 시 내려오는 메시지 */
function isLoginCheckBackendFailureMessage(msg: string): boolean {
  const s = String(msg || "")
  return (
    s.includes("일시적으로 연결") ||
    s.includes("인터넷 상태를 확인") ||
    s.includes("Cannot reach the server right now") ||
    s.includes("Cannot reach the login server")
  )
}

type LoginApp = "erp" | "pos" | "mobile"

function normalizeLoginPathname(pathname: string): string {
  const p = (pathname || "/").replace(/\/+$/, "") || "/"
  return p
}

function deriveLoginAppFromRoute(pathname: string, isAdminPage: boolean, redirectTo: string): LoginApp {
  const p = normalizeLoginPathname(pathname)
  if (p === "/pos/login") return "pos"
  if (p === "/admin/login") {
    if (!isAdminPage && redirectTo === "/pos") return "pos"
    return "erp"
  }
  return "erp"
}

function computeErpLandingPath(pathname: string, isAdminPage: boolean, redirectTo: string): string {
  const p = normalizeLoginPathname(pathname)
  if (p === "/admin/login") {
    if (!isAdminPage && redirectTo === "/pos") return "/admin"
    if (redirectTo.startsWith("/admin")) return redirectTo
    return "/admin"
  }
  if (p === "/saas-admin/login") {
    if (redirectTo.startsWith("/saas-admin")) return redirectTo
    return "/saas-admin"
  }
  return "/admin"
}

interface LoginFormProps {
  redirectTo: string
  isAdminPage: boolean
  /** URL ?msg= 등으로 전달된 안내 (예: 관리자 권한 없음) */
  initialNoticeKey?: string
}

export function LoginForm({ redirectTo, isAdminPage, initialNoticeKey }: LoginFormProps) {
  const pathname = usePathname() || ""
  const searchParams = useSearchParams()
  const router = useRouter()
  const { auth, setAuth } = useAuth()
  const [loginData, setLoginData] = useState<Record<string, string[]>>({})
  const [loginStoreLabels, setLoginStoreLabels] = useState<Record<string, string>>({})
  const [loginStoreCompanies, setLoginStoreCompanies] = useState<Record<string, string>>({})
  const [companies, setCompanies] = useState<string[]>([])
  const [company, setCompany] = useState("")
  const [store, setStore] = useState("")
  const [user, setUser] = useState("")
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(true)
  /** getLoginData 출처 — 매장 0개여도 API 성공이면 '오프라인' 배너로 오인하지 않음 */
  const [loginDataSource, setLoginDataSource] = useState<"api" | "cache" | "fallback" | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  /** 연결·서버 도달 실패 등 — 에러 칸 아래에 오프라인 CTA를 같이 띄움 */
  const [errorIsConnectivity, setErrorIsConnectivity] = useState(false)
  const { lang, setLang } = useLang()
  const tMsg = useT(lang)

  const [pwModalOpen, setPwModalOpen] = useState(false)
  const [pwOld, setPwOld] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwNew2, setPwNew2] = useState("")
  const [pwChanging, setPwChanging] = useState(false)
  const [pwError, setPwError] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  /** getLoginData 실패 직후 /api/online-probe 성공 여부 — 서버 도달 vs 완전 오프라인 구분 */
  const [loginListProbeOk, setLoginListProbeOk] = useState<boolean | null>(null)
  const [browserOnline, setBrowserOnline] = useState(true)
  const [hybridPosShell, setHybridPosShell] = useState(false)
  const initialNoticeShownRef = useRef(false)
  const loginAppPrefHydratedRef = useRef(false)
  const companyPrefillAppliedRef = useRef(false)
  const storePrefillAppliedRef = useRef(false)
  const userPrefillAppliedRef = useRef(false)

  const queryCompany = useMemo(
    () => String(searchParams?.get("company") || "").trim(),
    [searchParams]
  )
  const queryStore = useMemo(
    () => String(searchParams?.get("store") || "").trim(),
    [searchParams]
  )
  const queryUser = useMemo(
    () => String(searchParams?.get("user") || "").trim(),
    [searchParams]
  )

  const [loginApp, setLoginApp] = useState<LoginApp>(() =>
    deriveLoginAppFromRoute(pathname, isAdminPage, redirectTo)
  )
  const brand = useAppBrandConfig()

  useLayoutEffect(() => {
    if (loginAppPrefHydratedRef.current) return
    const p = normalizeLoginPathname(pathname)
    if (p !== "/login" && p !== "/admin/login") return
    loginAppPrefHydratedRef.current = true
    try {
      const w = localStorage.getItem("cm_login_app_pref")
      if (w === "erp" || w === "pos" || w === "mobile") setLoginApp(w)
    } catch {
      /* ignore */
    }
  }, [pathname])

  useEffect(() => {
    const p = normalizeLoginPathname(pathname)
    if (p === "/login" || p === "/admin/login") return
    setLoginApp(deriveLoginAppFromRoute(pathname, isAdminPage, redirectTo))
  }, [pathname, isAdminPage, redirectTo])

  const setLoginAppPersist = useCallback((app: LoginApp) => {
    setLoginApp(app)
    try {
      localStorage.setItem("cm_login_app_pref", app)
    } catch {
      /* ignore */
    }
  }, [])

  const erpLandingPath = useMemo(
    () => computeErpLandingPath(pathname, isAdminPage, redirectTo),
    [pathname, isAdminPage, redirectTo]
  )

  const effectiveRedirectTo = useMemo(() => {
    if (loginApp === "mobile") return "/"
    if (loginApp === "pos") return "/pos"
    return erpLandingPath
  }, [loginApp, erpLandingPath])

  const effectiveIsAdminPage = loginApp === "erp"
  const isAdminLoginRoute = pathname === "/admin/login" || pathname === "/saas-admin/login"

  useEffect(() => {
    if (!isAdminLoginRoute) return
    const n = normalizeAdminUiLang(lang)
    if (n !== lang) setLang(n)
  }, [isAdminLoginRoute, lang, setLang])

  /** ERP·모바일: 숨김. POS 웹만 윈도우 설치 안내(하이브리드 셸 안에서는 숨김) */
  const showWindowsInstallerButton = loginApp === "pos" && !hybridPosShell
  const windowsInstallerPath = WINDOWS_POS_SETUP_PATH
  const windowsInstallerLabel = tMsg("posWindowsDownload") || "윈도우 POS 설치파일 받기"
  const handleWindowsInstallerCopy = useCallback(async () => {
    const r = await copyWindowsInstallerUrl(windowsInstallerPath)
    if (r.ok) await appAlert(tMsg("windowsInstallerCopyHint") || "")
    else await appAlert((tMsg("windowsInstallerCopyFail") || "") + r.url)
  }, [tMsg, windowsInstallerPath])

  useEffect(() => {
    setHybridPosShell(isCmPosHybridShell())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const sync = () => setBrowserOnline(isBrowserOnline())
    sync()
    void runReachabilityProbe().then(sync)
    const onOn = () => setBrowserOnline(true)
    const onOff = () => {
      sync()
      void runReachabilityProbe().then(sync)
    }
    window.addEventListener("online", onOn)
    window.addEventListener("offline", onOff)
    window.addEventListener(REACHABILITY_EVENT, sync)
    return () => {
      window.removeEventListener("online", onOn)
      window.removeEventListener("offline", onOff)
      window.removeEventListener(REACHABILITY_EVENT, sync)
    }
  }, [])

  /**
   * localStorage 스냅샷은 렌더 중에 읽으면 SSR(또는 서버 프리렌더)은 null·클라 첫 렌더는 값 있음으로 달라져
   * 하이드레이션 불일치 → 런타임 오류·Fast Refresh 전체 리로드가 난다. 마운트 후에만 채운다.
   */
  const [offlineResume, setOfflineResume] = useState<AuthState | null>(null)
  useLayoutEffect(() => {
    setOfflineResume(loadOfflineResumeAuth())
  }, [])

  const clearFormError = useCallback(() => {
    setError("")
    setErrorIsConnectivity(false)
  }, [])

  const fetchLoginData = useCallback(() => {
    setLoadError(null)
    setLoginListProbeOk(null)
    setLoading(true)
    /** navigator.onLine 거짓 false 대비 프로브. 조기 종료하지 않음 — getLoginDataWithCache가 API를 직접 시도해 오탐을 복구함 */
    const run = async () => {
      if (typeof navigator !== "undefined" && !isBrowserOnline()) {
        await runReachabilityProbe()
      }
      /** Supabase 다구간 + 느린 망 — 짧은 타임아웃은 오탐이 잦음 */
      const timeoutMs = 60_000
      const fetchOnce = () =>
        Promise.race([
          getLoginData(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`연결 시간 초과 (${timeoutMs / 1000}초)`)), timeoutMs)
          ),
        ])
      /** API 실패 시 getLoginData는 throw 대신 _source:fallback 을 줄 수 있음 → 1회 재시도 */
      const loadWithRetry = async () => {
        let last: Awaited<ReturnType<typeof getLoginData>> | undefined
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const d = await fetchOnce()
            last = d
            if (d._source !== "fallback") return d
          } catch (e) {
            if (attempt === 0) continue
            throw e
          }
        }
        return last!
      }
      try {
        const d = await loadWithRetry()
        setLoginData(d.users || {})
        setLoginStoreLabels(d.storeLabels || {})
        const companyMap = d.storeCompanies || {}
        setLoginStoreCompanies(companyMap)
        const companyListRaw = Array.isArray(d.companies) ? d.companies : Object.values(companyMap)
        const companyList = Array.from(
          new Set(companyListRaw.map((x) => String(x || "").trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b))
        setCompanies(companyList)
        setCompany((prev) => {
          if (prev && companyList.includes(prev)) return prev
          return companyList[0] || ""
        })
        const src = d._source ?? "fallback"
        setLoginDataSource(src)
        if (src === "api" || src === "cache") {
          setBrowserOnline(true)
          setLoginListProbeOk(true)
        }
        if (d._source === "fallback") {
          setLoadError("SERVER_ERROR")
          const probeOk = await runReachabilityProbe()
          setLoginListProbeOk(probeOk)
          if (probeOk) setBrowserOnline(true)
        } else {
          setLoadError(null)
        }
        setLoading(false)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const probeOk = await runReachabilityProbe()
        setLoginListProbeOk(probeOk)
        if (probeOk) setBrowserOnline(true)
        setLoadError(
          msg.includes("연결") || msg.includes("시간 초과") || msg.includes("fetch") || msg.includes("Failed")
            ? "SERVER_ERROR"
            : msg
        )
        setLoginData({})
        setLoginStoreLabels({})
        setLoginStoreCompanies({})
        setCompanies([])
        setCompany("")
        setLoginDataSource("fallback")
        setLoading(false)
      }
    }
    void run()
  }, [])

  useEffect(() => {
    if (auth) {
      replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
      return
    }
    /** HMR/라우트 전환 직후 unmount 레이스를 피하려고 취소 가능한 매크로태스크로 지연 */
    const timer = window.setTimeout(() => {
      fetchLoginData()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [auth, effectiveRedirectTo, router, fetchLoginData])

  useEffect(() => {
    if (auth || !initialNoticeKey || initialNoticeShownRef.current) return
    initialNoticeShownRef.current = true
    setError(tMsg(initialNoticeKey))
    setErrorIsConnectivity(false)
  }, [auth, initialNoticeKey, tMsg])

  useEffect(() => {
    if (companyPrefillAppliedRef.current) return
    if (!queryCompany) {
      companyPrefillAppliedRef.current = true
      return
    }
    if (companies.length === 0) return
    const found = companies.find((x) => String(x || "").trim().toLowerCase() === queryCompany.toLowerCase())
    if (found) {
      setCompany(found)
      setStore("")
      setUser("")
    }
    companyPrefillAppliedRef.current = true
  }, [companies, queryCompany])

  const handleStoreChange = (s: string) => {
    setStore(s)
    setUser("")
  }
  const handleCompanyChange = (c: string) => {
    setCompany(c)
    setStore("")
    setUser("")
  }

  const handleLangChange = (l: string) => {
    if (isLangCode(l)) setLang(l)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const effectiveStore = store.trim()
    const effectiveUser = user.trim()
    if (!effectiveStore || !effectiveUser) {
      setErrorIsConnectivity(false)
      setError(tMsg("msg_select_store_name"))
      return
    }
    setSubmitting(true)
    clearFormError()
    const loginListReady =
      (loginDataSource === "api" || loginDataSource === "cache") && stores.length > 0
    if (!loginListReady) {
      if (typeof navigator !== "undefined" && !isBrowserOnline()) {
        await runReachabilityProbe()
      }
      if (!isBrowserOnline()) {
        setError(pickLoginStr(tMsg, "msg_login_network_error", lang))
        setErrorIsConnectivity(true)
        setSubmitting(false)
        return
      }
    }
    try {
      const res = await loginCheck({
        company: company || undefined,
        store: effectiveStore,
        name: effectiveUser,
        pw,
        isAdminPage: effectiveIsAdminPage,
      })
      if (res.success && res.storeName && res.userName) {
        setAuth({
          ...(res.companyName ? { company: res.companyName } : {}),
          ...(res.tenantId ? { tenantId: res.tenantId } : {}),
          store: res.storeName,
          user: res.userName,
          role: res.role || "",
          token: res.token,
          ...(res.employeeId != null && res.employeeId > 0 ? { employeeId: res.employeeId } : {}),
          ...(res.employeeCode ? { employeeCode: String(res.employeeCode).trim() } : {}),
          ...(Array.isArray(res.allowedStores) && res.allowedStores.length > 0
            ? { allowedStores: res.allowedStores }
            : {}),
        })
        replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
      } else {
        const apiMsg = res.message || ""
        if (isLoginCheckBackendFailureMessage(apiMsg)) {
          setError(pickLoginStr(tMsg, "msg_login_network_error", lang))
          setErrorIsConnectivity(true)
        } else {
          setErrorIsConnectivity(false)
          setError(translateApiMessage(apiMsg, tMsg) || apiMsg || tMsg("msg_login_failed"))
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (typeof console !== "undefined" && console.error) {
        console.error("[Login] loginCheck failed:", err)
      }
      const isNetErr =
        msg.includes("fetch") ||
        msg.includes("Failed") ||
        msg.includes("Network") ||
        msg.includes("network") ||
        msg.includes("연결")
      if (isNetErr) {
        setError(pickLoginStr(tMsg, "msg_login_network_error", lang))
        setErrorIsConnectivity(true)
      } else {
        setErrorIsConnectivity(false)
        setError(tMsg("msg_server_error_prefix") + msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handlePwChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!store || !user) {
      setPwError(tMsg("msg_store_name_first"))
      return
    }
    if (!pwOld) {
      setPwError(tMsg("msg_enter_current_pw"))
      return
    }
    if (!pwNew) {
      setPwError(tMsg("msg_enter_new_pw"))
      return
    }
    if (pwNew !== pwNew2) {
      setPwError(tMsg("msg_pw_mismatch"))
      return
    }
    setPwChanging(true)
    setPwError("")
    try {
      const res = await changePassword({ company: company || undefined, store, name: user, oldPw: pwOld, newPw: pwNew })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, tMsg) || tMsg("pw_success"))
        setPwModalOpen(false)
        setPwOld("")
        setPwNew("")
        setPwNew2("")
      } else {
        setPwError(translateApiMessage(res.message, tMsg) || tMsg("msg_change_failed"))
      }
    } catch (err) {
      setPwError(tMsg("msg_server_error_prefix") + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPwChanging(false)
    }
  }

  const isOfficeStore = (s: string) => {
    const x = String(s || "").trim()
    return x === "본사" || x === "오피스" || x === "본점" || x.toLowerCase().includes("office")
  }
  const stores = Object.keys(loginData).sort((a, b) => {
    if (isOfficeStore(a) && !isOfficeStore(b)) return -1
    if (!isOfficeStore(a) && isOfficeStore(b)) return 1
    return a.localeCompare(b)
  })
  const filteredStores = company
    ? stores.filter((s) => {
        const tagged = String(loginStoreCompanies[s] || "").trim()
        return !tagged || tagged === company
      })
    : stores
  /** 목록은 왔는데 회사 태그 불일치로 매장 0개만 되는 경우 — 목록 API 실패와 구분해 선택만 해제 */
  useEffect(() => {
    if (loading || !company) return
    if (stores.length === 0 || filteredStores.length > 0) return
    setCompany("")
  }, [loading, company, stores.length, filteredStores.length])
  useEffect(() => {
    if (storePrefillAppliedRef.current) return
    if (!queryStore) {
      storePrefillAppliedRef.current = true
      return
    }
    if (filteredStores.length === 0) return
    const found = filteredStores.find((x) => String(x || "").trim().toLowerCase() === queryStore.toLowerCase())
    if (found) {
      setStore(found)
      setUser("")
    }
    storePrefillAppliedRef.current = true
  }, [filteredStores, queryStore])
  const users = store ? (loginData[store] || []) : []
  useEffect(() => {
    if (userPrefillAppliedRef.current) return
    if (!queryUser) {
      userPrefillAppliedRef.current = true
      return
    }
    if (!store) return
    if (users.length === 0) return
    const found = users.find((x) => String(x || "").trim().toLowerCase() === queryUser.toLowerCase())
    if (found) setUser(found)
    userPrefillAppliedRef.current = true
  }, [queryUser, store, users])
  useEffect(() => {
    if (!store) return
    if (filteredStores.includes(store)) return
    setStore("")
    setUser("")
  }, [filteredStores, store])
  const noStores = !loading && stores.length === 0
  /** 매장 목록이 비어 있어도 서버/캐시에서 정상 조회면 연결 문제로 보지 않음 */
  const serverListDegraded =
    Boolean(loadError) || (noStores && loginDataSource === "fallback")
  const listLoadedOk = !loading && stores.length > 0
  /**
   * Windows Electron 등에서 navigator.onLine 만 거짓이고 /api/getLoginData 는 성공한 경우 —
   * 매장 목록이 있거나(api/cache 성공) 서버에서 빈 목록을 준 경우에도 연결 실패 배너를 띄우지 않음.
   */
  const listFromServerOk = loginDataSource === "api" || loginDataSource === "cache"
  /** 목록 API 실패 시에도 이전 스냅샷이 있으면 재시도·안내가 필요 — !offlineResume 로 배너를 막지 않음 */
  const showServerUnreachableBanner =
    serverListDegraded || (!browserOnline && !listLoadedOk && !listFromServerOk)
  /** 동일 출처 프로브 성공 + 목록 API만 실패 — 긴 PIN·오프라인 안내 대신 짧은 안내 */
  const useSoftListFailureCopy = Boolean(showServerUnreachableBanner && loginListProbeOk === true)
  const useSoftSubmitNetworkCopy = Boolean(errorIsConnectivity && loginListProbeOk === true)
  /**
   * 전용「오프라인 모드로 들어가기」전체 화면: 진짜 망 단절에 가깝고(목록 실패 배너가 아님), 스냅샷·오프라인·목록 없음.
   * 목록 API 오류/타임아웃(serverListDegraded)이면 재시도 폼을 보여야 하므로 여기서 막지 않음.
   */
  const offlineOnlyScreen =
    Boolean(offlineResume) && !browserOnline && !listLoadedOk && !serverListDegraded
  /** 온라인 + 매장 목록 정상이면 일반 로그인만 — 스냅샷이 있어도「오프라인으로」배너 숨김 */
  const showOfflineResumeBanner =
    Boolean(offlineResume) &&
    !offlineOnlyScreen &&
    (!browserOnline || serverListDegraded) &&
    !listLoadedOk

  const labels = {
    ko: {
      selectStore: "매장 선택",
      selectCompany: "회사 선택",
      selectName: "이름 선택",
      pinPlaceholder: "비밀번호 (PIN)",
      login: "로그인",
      loggingIn: "로그인 중...",
      changePw: "비밀번호 변경",
      pwCurrent: "현재 비밀번호",
      pwNew: "새 비밀번호",
      pwNewConfirm: "새 비밀번호 확인",
      pwChangeBtn: "변경",
      cancel: "취소",
      serverError: "서버에 연결할 수 없습니다.",
      enterOfflineMode: "오프라인 모드로 들어가기",
      retry: "다시 시도",
      refresh: "새로고침",
      connectingToServer: "서버에 연결 중...",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "모바일",
      viewProducts: "제품 안내 보기",
      offlineResumeStore: "매장",
      offlineResumeStaff: "담당자",
      offlineResumeSyncNote:
        "아래로 들어가면 이 매장·담당자로 세션이 복구됩니다. 인터넷이 돌아온 뒤 서버에 주문을 올릴 때도 같은 담당자 이름으로 남습니다.",
    },
    en: {
      selectStore: "Select Store",
      selectCompany: "Select Company",
      selectName: "Select Name",
      pinPlaceholder: "Password (PIN)",
      login: "Login",
      loggingIn: "Logging in...",
      changePw: "Change Password",
      pwCurrent: "Current password",
      pwNew: "New password",
      pwNewConfirm: "Confirm new password",
      pwChangeBtn: "Change",
      cancel: "Cancel",
      serverError: "Cannot connect to the server.",
      enterOfflineMode: "Enter offline mode",
      retry: "Retry",
      refresh: "Refresh",
      connectingToServer: "Connecting to server...",
      loginAppErp: "ERP (Admin)",
      loginAppPos: "POS",
      loginAppMobile: "Mobile",
      viewProducts: "Product guide",
      offlineResumeStore: "Store",
      offlineResumeStaff: "Staff",
      offlineResumeSyncNote:
        "Continuing restores this account. When back online, new orders saved to the server will be recorded under this staff name.",
    },
    th: {
      selectStore: "เลือกสาขา",
      selectCompany: "เลือกบริษัท",
      selectName: "เลือกชื่อ",
      pinPlaceholder: "รหัสผ่าน (PIN)",
      login: "เข้าสู่ระบบ",
      loggingIn: "กำลังเข้าสู่ระบบ...",
      changePw: "เปลี่ยนรหัสผ่าน",
      pwCurrent: "รหัสปัจจุบัน",
      pwNew: "รหัสใหม่",
      pwNewConfirm: "ยืนยันรหัสใหม่",
      pwChangeBtn: "เปลี่ยน",
      cancel: "ยกเลิก",
      serverError: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้",
      enterOfflineMode: "เข้าโหมดออฟไลน์",
      retry: "ลองอีกครั้ง",
      refresh: "รีเฟรช",
      connectingToServer: "กำลังเชื่อมต่อเซิร์ฟเวอร์...",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "มือถือ",
      viewProducts: "ดูข้อมูลสินค้า",
      offlineResumeStore: "สาขา",
      offlineResumeStaff: "พนักงาน",
      offlineResumeSyncNote:
        "ดำเนินการต่อเพื่อกู้บัญชีนี้ เมื่อออนไลน์อีกครั้ง คำสั่งซื้อใหม่จะบันทึกชื่อพนักงานนี้",
    },
    mm: {
      selectStore: "ဆိုင်ရွေးပါ",
      selectCompany: "ကုမ္ပဏီရွေးပါ",
      selectName: "အမည်ရွေးပါ",
      pinPlaceholder: "လျှို့ဝှက်နံပါတ် (PIN)",
      login: "ဝင်ရောက်မည်",
      loggingIn: "ဝင်နေသည်...",
      changePw: "လျှို့ဝှက်နံပါတ်ပြောင်းမည်",
      pwCurrent: "လက်ရှိလျှို့ဝှက်နံပါတ်",
      pwNew: "လျှို့ဝှက်နံပါတ်အသစ်",
      pwNewConfirm: "အသစ်ထပ်ရိုက်ပါ",
      pwChangeBtn: "ပြောင်းမည်",
      cancel: "ပယ်ဖျက်မည်",
      serverError: "ဆာဗာနှင့် ချိတ်ဆက်မရပါ။",
      enterOfflineMode: "အော့ဖ်လိုင်းမုဒ်သို့ ဝင်မည်",
      retry: "ပြန်ကြိုးစားမည်",
      refresh: "ပြန်စမည်",
      connectingToServer: "ဆာဗာနှင့် ချိတ်ဆက်နေသည်...",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "မိုဘိုင်း",
      viewProducts: "ထုတ်ကုန်အချက်အလက်ကြည့်ရန်",
      offlineResumeStore: "ဆိုင်",
      offlineResumeStaff: "တာဝန်ခံ",
      offlineResumeSyncNote:
        "ဆက်လုပ်ပါက ဤအကောင့်ကို ပြန်ဖော်ပါမည်။ အွန်လိုင်န်ပြန်ရောက်သောအခါ အမှာစသစ်များတွင် ဤအမည်ဖြင့် မှတ်တမ်းတင်ပါမည်။",
    },
    la: {
      selectStore: "ເລືອກສາຂາ",
      selectCompany: "ເລືອກບໍລິສັດ",
      selectName: "ເລືອກຊື່",
      pinPlaceholder: "ລະຫັດ (PIN)",
      login: "ເຂົ້າສູ່ລະບົບ",
      loggingIn: "ກຳລັງເຂົ້າສູ່ລະບົບ...",
      changePw: "ປ່ຽນລະຫັດຜ່ານ",
      pwCurrent: "ລະຫັດປັດຈຸບັນ",
      pwNew: "ລະຫັດໃໝ່",
      pwNewConfirm: "ຢືນຢັນລະຫັດໃໝ່",
      pwChangeBtn: "ປ່ຽນ",
      cancel: "ຍົກເລີກ",
      serverError: "ເຊື່ອມຕໍ່ເຊີບເວີບໍ່ໄດ້.",
      enterOfflineMode: "ເຂົ້າໂອບຟ໌ລາຍ",
      retry: "ລອງໃໝ່",
      refresh: "ໂຫຼດໃໝ່",
      connectingToServer: "ກຳລັງເຊື່ອມຕໍ່ເຊີບເວີ...",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "ມືຖື",
      viewProducts: "ເບິ່ງຂໍ້ມູນສິນຄ້າ",
      offlineResumeStore: "ສາຂາ",
      offlineResumeStaff: "ຜູ້ຮັບຜິດຊອບ",
      offlineResumeSyncNote:
        "ສືບຕໍ່ເພື່ອກູ້ບັນຊີນີ້. ເມື່ອອອນລາຍຄືນ, ຄຳສັ່ງຊື້ໃໝ່ຈະບັນທຶກດ້ວຍຊື່ພະນັກງານນີ້.",
    },
  } as const

  /** 번들 문자열(ko~la만 정의). kh·vi·ms 등은 영어 UI로 폴백(i18n 키는 tMsg가 해당 언어 처리). */
  type LoginLabelLang = keyof typeof labels
  const LOGIN_BUILTIN_LABEL_LANGS = ["ko", "en", "th", "mm", "la"] as const satisfies readonly LoginLabelLang[]
  const loginLabelLang: LoginLabelLang = (LOGIN_BUILTIN_LABEL_LANGS as readonly string[]).includes(lang)
    ? (lang as (typeof LOGIN_BUILTIN_LABEL_LANGS)[number])
    : "en"
  const t = labels[loginLabelLang]

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="background-cover" />
        <div className="background-glow" />
      </div>

      <div className="login-wrapper">
        <div className="glass-card">
          <div className="logo-section">
            <Image
              src={brand.logoSrc}
              alt={brand.logoAlt}
              className="logo"
              width={120}
              height={120}
              priority
              unoptimized
            />
            <p className="erp-text">{brand.loginTitle}</p>
          </div>

          {normalizeLoginPathname(pathname) === "/login" ||
          normalizeLoginPathname(pathname) === "/admin/login" ||
          normalizeLoginPathname(pathname) === "/saas-admin/login" ? (
            <div className="mb-4 w-full max-w-sm space-y-2 px-0.5">
              <div
                className="flex gap-1 rounded-xl bg-black/30 p-1 ring-1 ring-white/10"
                role="group"
                aria-label={`${t.loginAppMobile}, ${t.loginAppPos}, ${t.loginAppErp}`}
              >
                {(
                  [
                    { key: "mobile" as const, label: t.loginAppMobile },
                    { key: "pos" as const, label: t.loginAppPos },
                    { key: "erp" as const, label: t.loginAppErp },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLoginAppPersist(key)}
                    className={
                      loginApp === key
                        ? "flex-1 rounded-lg bg-gradient-to-b from-orange-500 to-orange-600 px-2 py-2.5 text-center text-xs font-semibold text-white shadow-md shadow-orange-900/40"
                        : "flex-1 rounded-lg px-2 py-2.5 text-center text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Link
                href="/products"
                className="block w-full rounded-lg bg-gradient-to-b from-orange-500 to-orange-600 px-3 py-2.5 text-center text-xs font-semibold text-white shadow-sm shadow-orange-900/25 transition duration-200 hover:from-orange-400 hover:to-orange-500 hover:shadow-md hover:shadow-orange-900/30"
              >
                {t.viewProducts}
              </Link>
            </div>
          ) : null}

          {loading ? (
            <div className="login-inline-loading">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
              <p className="mt-4 text-center text-sm text-white/80">{t.connectingToServer}</p>
            </div>
          ) : offlineOnlyScreen ? (
            <div className="space-y-3 py-4">
              {offlineResume ? (
                <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-left text-sm text-white/90">
                  <p>
                    <span className="text-white/55">{t.offlineResumeStore}</span>{' '}
                    <span className="font-medium text-white">{offlineResume.store}</span>
                  </p>
                  <p className="mt-1">
                    <span className="text-white/55">{t.offlineResumeStaff}</span>{' '}
                    <span className="font-medium text-white">{offlineResume.user}</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">{t.offlineResumeSyncNote}</p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (offlineResume) {
                    setPosSessionPreferHardNavigation()
                    setAuth(offlineResume)
                    replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
                  }
                }}
                className="w-full rounded-md bg-emerald-600 px-3 py-3 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {t.enterOfflineMode}
              </button>
              {showWindowsInstallerButton ? (
                <button
                  type="button"
                  onClick={() => void handleWindowsInstallerCopy()}
                  className="block w-full rounded-md bg-sky-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-sky-500"
                >
                  {windowsInstallerLabel}
                </button>
              ) : null}
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            {showServerUnreachableBanner ? (
              <div className="mb-3 space-y-2">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
                  <p className="font-medium">
                    {useSoftListFailureCopy
                      ? pickLoginStr(tMsg, "msg_login_list_fetch_title", lang)
                      : t.serverError}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-100/90">
                    {pickLoginStr(
                      tMsg,
                      useSoftListFailureCopy ? "msg_login_list_fetch_soft_fail" : "msg_login_offline_connect_detail",
                      lang
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchLoginData()}
                    className="rounded-md bg-amber-500/30 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500/50"
                  >
                    {t.retry}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-md bg-amber-500/30 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500/50"
                  >
                    {t.refresh}
                  </button>
                </div>
              </div>
            ) : null}
            {showOfflineResumeBanner && offlineResume ? (
              <div className="mb-3 rounded-lg border border-emerald-500/45 bg-emerald-950/35 px-3 py-3 text-center">
                <p className="text-xs leading-relaxed text-emerald-100/95">
                  {pickLoginStr(
                    tMsg,
                    browserOnline ? "msg_login_offline_banner_hint_online" : "msg_login_offline_banner_hint",
                    lang
                  )}
                </p>
                <p className="mt-2 text-sm font-medium text-emerald-50">
                  <span className="text-emerald-200/80">{t.offlineResumeStore}</span> {offlineResume.store}
                  <span className="mx-1.5 text-emerald-400/60">·</span>
                  <span className="text-emerald-200/80">{t.offlineResumeStaff}</span> {offlineResume.user}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPosSessionPreferHardNavigation()
                    setAuth(offlineResume)
                    replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
                  }}
                  className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  {t.enterOfflineMode}
                </button>
              </div>
            ) : null}
            <Select value={lang} onValueChange={handleLangChange}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {ADMIN_UI_LANG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={company} onValueChange={handleCompanyChange} disabled={companies.length === 0}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue placeholder={`${t.selectCompany}...`} />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {companies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={store} onValueChange={handleStoreChange}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue placeholder={`${t.selectStore}...`} />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {filteredStores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {labelForStore(loginStoreLabels, s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={user} onValueChange={setUser} disabled={!store}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue placeholder={`${t.selectName}...`} />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {users.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t.pinPlaceholder}
              className="login-input-field"
              autoComplete="off"
              aria-label="Password"
            />

            {error &&
              (errorIsConnectivity && offlineResume ? (
                <button
                  type="button"
                  onClick={() => {
                    setPosSessionPreferHardNavigation()
                    setAuth(offlineResume)
                    replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
                  }}
                  className="mb-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  {t.enterOfflineMode}
                </button>
              ) : errorIsConnectivity ? (
                <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
                  <p className="font-medium">
                    {useSoftSubmitNetworkCopy
                      ? pickLoginStr(tMsg, "msg_login_submit_network_title", lang)
                      : t.serverError}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-100/90">
                    {pickLoginStr(
                      tMsg,
                      useSoftSubmitNetworkCopy ? "msg_login_submit_network_soft" : "msg_login_offline_connect_detail",
                      lang
                    )}
                  </p>
                </div>
              ) : (
                <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <p className="leading-snug">{error}</p>
                </div>
              ))}

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? t.loggingIn : t.login}
            </button>

            {showWindowsInstallerButton ? (
              <button
                type="button"
                onClick={() => void handleWindowsInstallerCopy()}
                className="mt-2 block w-full rounded-md bg-sky-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-sky-500"
              >
                {windowsInstallerLabel}
              </button>
            ) : null}

            <button
              type="button"
              onClick={async () => {
                if (!store || !user) {
                  await appAlert(tMsg("msg_store_name_first"))
                  return
                }
                setPwModalOpen(true)
                setPwError("")
                setPwOld("")
                setPwNew("")
                setPwNew2("")
              }}
              className="login-change-pw-btn"
            >
              {t.changePw}
            </button>
          </form>
          )}
        </div>
      </div>

      {pwModalOpen && (
        <div className="login-pw-modal" onClick={() => setPwModalOpen(false)}>
          <div className="login-pw-modal-inner" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-center text-lg font-bold text-white">{t.changePw}</h3>
            <form onSubmit={handlePwChange}>
              <input
                type="password"
                value={pwOld}
                onChange={(e) => setPwOld(e.target.value)}
                placeholder={t.pwCurrent}
                className="login-input-field mb-3"
                autoComplete="off"
              />
              <input
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder={t.pwNew}
                className="login-input-field mb-3"
                autoComplete="new-password"
              />
              <input
                type="password"
                value={pwNew2}
                onChange={(e) => setPwNew2(e.target.value)}
                placeholder={t.pwNewConfirm}
                className="login-input-field mb-4"
                autoComplete="new-password"
              />
              {pwError && <p className="mb-3 text-sm text-red-400">{pwError}</p>}
              <button type="submit" className="login-btn mb-2" disabled={pwChanging}>
                {pwChanging ? tMsg("pw_changing") : t.pwChangeBtn}
              </button>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="w-full text-center text-sm text-white/60 hover:text-white"
              >
                {t.cancel}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
