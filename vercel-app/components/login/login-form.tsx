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
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getLoginData, loginCheck, changePassword, saasAdminTotpBootstrap } from "@/lib/api-client"
import { seedSaasEnabledModules } from "@/lib/use-saas-enabled-modules"
import { isLoginExcludedStoreKey } from "@/lib/pos-sales-test-office"
import { readLoginDataFromCacheOnly, type LoginDataResult } from "@/lib/offline/erp-offline"
import { useAuth, loadOfflineResumeAuth, clearOfflineLoginSnapshot, enrichOfflinePosAuth, type AuthState } from "@/lib/auth-context"
import {
  isLangCode,
  useLang,
  normalizeAdminUiLang,
  ADMIN_UI_LANG_OPTIONS,
  type LangCode,
} from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { replacePosOfflineAware, setPosSessionPreferHardNavigation } from "@/lib/pos-offline-nav"
import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import {
  isPosOfflinePhaseAEnabled,
  persistOfflinePilotFromQuery,
} from "@/lib/pos-offline-pilot"
import {
  copyWindowsInstallerUrl,
  isLocalDevHost,
  openWindowsInstallerDownload,
  WINDOWS_POS_CHOONGMAN_SETUP_PATH,
  WINDOWS_POS_OMNI_SETUP_PATH,
  windowsPosSetupPathForBrand,
} from "@/lib/windows-installer-copy"
import { dedupeLoginStoreKeysByLabel, labelForStore } from "@/lib/store-list-keys"
import {
  isBrowserOnline,
  runReachabilityProbe,
  REACHABILITY_EVENT,
  reportNetworkFailure,
} from "@/lib/offline/network"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { canAccessSaasAdmin } from "@/lib/permissions"
import {
  isSaasPlatformDefaultLoginCompany,
  isSaasAdminLoginPath,
  isSaasPartnerLoginStoreClient,
  SAAS_PARTNER_LOGIN_STORE_DEFAULT,
} from "@/lib/saas-partner-login-defaults-client"

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
  msg_login_2fa_enroll_required:
    "Admin 2FA setup is required (Omni). Scan the QR/secret below, enter the 6-digit code, then confirm.",
  msg_login_2fa_invalid: "Invalid 2FA code. Try again.",
  msg_login_2fa_unavailable: "2FA is required but could not be verified. Contact support.",
  msg_login_ip_blocked: "This IP is not allowed for this company (Omni).",
  msg_login_policy_unavailable: "Login security policy is temporarily unavailable. Try again shortly.",
  msg_login_2fa_placeholder: "2FA code (6 digits)",
  msg_login_2fa_confirm_enroll: "Confirm 2FA & continue",
  msg_login_2fa_secret_label: "Authenticator secret",
}

/** 번역 DB 없을 때 한국어 보조 (pickLoginStr이 영어만 있을 때 ko 사용자용) */
const LOGIN_I18N_FALLBACK_KO: Partial<Record<string, string>> = {
  msg_login_list_fetch_title: "매장 목록을 불러오지 못했습니다",
  msg_login_list_fetch_soft_fail:
    "앱 서버에는 닿았으나 매장 목록을 가져오지 못했습니다(시간 초과 또는 일시 오류). 「다시 시도」를 눌러 주세요. 계속되면 잠시 후 다시 시도하거나 관리자에게 문의하세요.",
  msg_login_submit_network_title: "로그인을 확인할 수 없습니다",
  msg_login_submit_network_soft:
    "로그인 확인 요청이 완료되지 않았습니다. 연결을 확인한 뒤 다시 시도해 주세요. 위에서 매장 목록이 보였다면 서버는 닿는 경우가 많아 재시도로 해결됩니다.",
  msg_login_2fa_enroll_required:
    "관리자 2FA 등록이 필요합니다(Omni). 아래 시크릿을 Authenticator에 등록한 뒤 6자리 코드를 입력하고 확인하세요.",
  msg_login_2fa_invalid: "2FA 인증번호가 올바르지 않습니다.",
  msg_login_2fa_unavailable: "2FA가 필수인데 확인할 수 없습니다. 지원팀에 문의하세요.",
  msg_login_ip_blocked: "이 회사(Omni)에서 허용되지 않은 IP입니다.",
  msg_login_policy_unavailable: "로그인 보안 정책을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  msg_login_2fa_placeholder: "2FA 코드 (6자리)",
  msg_login_2fa_confirm_enroll: "2FA 확인 후 계속",
  msg_login_2fa_secret_label: "Authenticator 시크릿",
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

/** 로그인 언어 셀렉트 표시용 국기 이모지 */
const LOGIN_LANG_FLAG_EMOJI: Record<LangCode, string> = {
  ko: "🇰🇷",
  en: "🇬🇧",
  th: "🇹🇭",
  mm: "🇲🇲",
  la: "🇱🇦",
  kh: "🇰🇭",
  vi: "🇻🇳",
  ms: "🇲🇾",
}

type LoginApp = "erp" | "pos" | "mobile"

/** 마지막 로그인 선택(회사·매장·이름) — PIN은 저장하지 않음 */
const LOGIN_LAST_SELECTION_KEY = "cm_login_last_selection"
/** SaaS 관리 로그인 전용 — POS/ERP 선택과 섞이지 않게 분리 */
const LOGIN_LAST_SELECTION_SAAS_KEY = "cm_login_last_selection_saas_admin"

type LoginLastSelection = {
  company?: string
  store?: string
  user?: string
}

function loginLastSelectionStorageKey(saasAdmin: boolean): string {
  return saasAdmin ? LOGIN_LAST_SELECTION_SAAS_KEY : LOGIN_LAST_SELECTION_KEY
}

function readLoginLastSelection(saasAdmin = false): LoginLastSelection | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(loginLastSelectionStorageKey(saasAdmin))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const o = parsed as Record<string, unknown>
    const company = String(o.company ?? "").trim()
    const store = String(o.store ?? "").trim()
    const user = String(o.user ?? "").trim()
    if (!store && !user && !company) return null
    return {
      ...(company ? { company } : {}),
      ...(store ? { store } : {}),
      ...(user ? { user } : {}),
    }
  } catch {
    return null
  }
}

function saveLoginLastSelection(
  sel: { company?: string; store?: string; user?: string },
  opts?: { saasAdmin?: boolean }
) {
  if (typeof window === "undefined") return
  const saasAdmin = Boolean(opts?.saasAdmin)
  const user = String(sel.user ?? "").trim()
  const company = String(sel.company ?? "").trim()
  let store = String(sel.store ?? "").trim()
  if (saasAdmin && !store) store = SAAS_PARTNER_LOGIN_STORE_DEFAULT
  /** SaaS: 회사·이름만 있어도 저장(대리점은 매장 필드 숨김). 일반: 매장·이름 필수 */
  if (saasAdmin) {
    if (!company && !user) return
  } else if (!store || !user) {
    return
  }
  try {
    localStorage.setItem(
      loginLastSelectionStorageKey(saasAdmin),
      JSON.stringify({
        ...(company ? { company } : {}),
        ...(store ? { store } : {}),
        ...(user ? { user } : {}),
      })
    )
  } catch {
    /* ignore */
  }
}

function normalizeLoginPathname(pathname: string): string {
  const p = (pathname || "/").replace(/\/+$/, "") || "/"
  return p
}

function isSaasAdminLoginPathFromBrowser(): boolean {
  if (typeof window === "undefined") return false
  return isSaasAdminLoginPath(window.location.pathname || "")
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
  /** Omni 관리자 2FA — 충만 UI에는 미표시 */
  const [totpCode, setTotpCode] = useState("")
  const [totpEnrollSecret, setTotpEnrollSecret] = useState("")
  const [totpEnrollUrl, setTotpEnrollUrl] = useState("")
  const [needsTotp, setNeedsTotp] = useState(false)
  const [needsTotpEnroll, setNeedsTotpEnroll] = useState(false)
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true
    return !isSaasAdminLoginPathFromBrowser()
  })
  /** getLoginData 출처 — 매장 0개여도 API 성공이면 '오프라인' 배너로 오인하지 않음 */
  const [loginDataSource, setLoginDataSource] = useState<"api" | "cache" | "fallback" | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  /** 연결·서버 도달 실패 등 — 에러 칸 아래에 오프라인 CTA를 같이 띄움 */
  const [errorIsConnectivity, setErrorIsConnectivity] = useState(false)
  /** loginCheck 호출이 브라우저에서 네트워크 예외로 끊긴 경우만 true(API JSON으로 실패 메시지를 받은 경우는 false) */
  const [loginErrorFromClientFetch, setLoginErrorFromClientFetch] = useState(false)
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
  const lastLoginSelectionRef = useRef<LoginLastSelection | null>(null)
  const lastLoginSelectionHydratedRef = useRef(false)
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
  /** 고객사 로그인 링크(회사 바로가기) — 기존 세션 강제 해제 */
  const forceAccountSwitch = useMemo(
    () => String(searchParams?.get("switch") || "").trim() === "1",
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

  useLayoutEffect(() => {
    if (lastLoginSelectionHydratedRef.current) return
    lastLoginSelectionHydratedRef.current = true
    const saas =
      isSaasAdminLoginPath(normalizeLoginPathname(pathname)) || isSaasAdminLoginPathFromBrowser()
    lastLoginSelectionRef.current = readLoginLastSelection(saas)
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

  const posLoginPreserveQuery = useMemo(() => {
    if (loginApp !== "pos" || !searchParams) return ""
    const p = new URLSearchParams()
    const demo = String(searchParams.get("demo") || "").trim()
    const scenario = String(searchParams.get("scenario") || "").trim()
    if (demo) p.set("demo", demo)
    if (scenario) p.set("scenario", scenario)
    const s = p.toString()
    return s ? `?${s}` : ""
  }, [loginApp, searchParams])

  const effectiveRedirectTo = useMemo(() => {
    if (loginApp === "mobile") return "/"
    if (loginApp === "pos") return `/pos${posLoginPreserveQuery}`
    return erpLandingPath
  }, [loginApp, erpLandingPath, posLoginPreserveQuery])

  /** SaaS 관리 로그인은 탭과 무관하게 항상 관리자 권한 검증 — 이전: mobile/POS 탭이면 isAdminPage false로 잘못 전달됨 */
  const effectiveIsAdminPage =
    normalizeLoginPathname(pathname) === "/saas-admin/login" ? true : loginApp === "erp"
  const isAdminLoginRoute = pathname === "/admin/login" || pathname === "/saas-admin/login"
  const loginPath = useMemo(() => normalizeLoginPathname(pathname), [pathname])
  const isSaasAdminLogin = isSaasAdminLoginPath(loginPath)

  const resolveSaasAdminLogin = useCallback((): boolean => {
    if (isSaasAdminLoginPath(loginPath)) return true
    return isSaasAdminLoginPathFromBrowser()
  }, [loginPath])
  /** Omni SaaS·ERP 관리 로그인: 회사·매장·이름 직접 입력 */
  const isOmniBrand = brand.key === "omnifoodtech"
  const isOmniAdminLogin = loginPath === "/admin/login" && isOmniBrand
  /** Omni 전체(POS 포함): 회사명 직접 입력 → 해당 테넌트 목록만 로드. 충만은 Select 유지 */
  const useManualCompanyField = isSaasAdminLogin || isOmniBrand
  /**
   * Omni /admin/login·SaaS 관리: 매장·이름 직접 입력.
   * Omni POS·충만: 매장·이름 Select (Omni는 회사 입력 후 scoped getLoginData).
   */
  const useManualStoreUserFields = isSaasAdminLogin || isOmniAdminLogin
  /** SaaS 대리점 — 매장 Partner 자동. 플랫폼 본사(OmniFoodTech 등)는 매장 직접 입력 */
  const saasPartnerLoginFlow =
    isSaasAdminLogin &&
    (() => {
      const c = company.trim()
      if (!c) return true
      return !isSaasPlatformDefaultLoginCompany(c)
    })()
  const hideSaasPartnerStoreField = saasPartnerLoginFlow
  /** 수동 회사·매장·이름(Omni admin·SaaS)만 로그인 목록 API 스킵 */
  const skipLoginDataFetch = useManualStoreUserFields
  /** Omni POS 등: 회사 입력 후에만 scoped getLoginData */
  const needsScopedLoginData = isOmniBrand && !skipLoginDataFetch

  useEffect(() => {
    if (!isAdminLoginRoute) return
    const n = normalizeAdminUiLang(lang)
    if (n !== lang) setLang(n)
  }, [isAdminLoginRoute, lang, setLang])

  /** ERP·모바일: 숨김. POS 웹만 윈도우 설치 안내(하이브리드 셸 안에서는 숨김) */
  const showWindowsInstallerButton = loginApp === "pos" && !hybridPosShell
  const [localDevHost, setLocalDevHost] = useState(false)
  useEffect(() => {
    setLocalDevHost(isLocalDevHost())
  }, [])
  const windowsInstallerPath = windowsPosSetupPathForBrand(brand.key)
  const windowsInstallerLabel = tMsg("posWindowsDownload") || "윈도우 POS 설치파일 받기"
  const windowsOmniInstallerLabel = tMsg("posWindowsDownloadOmni") || "Omni POS 받기"
  const windowsChoongmanInstallerLabel = tMsg("posWindowsDownloadChoongman") || "충만 POS 받기"
  const handleWindowsInstallerDownload = useCallback(
    async (path: string) => {
      const url = openWindowsInstallerDownload(path)
      const copied = await copyWindowsInstallerUrl(path)
      if (!copied.ok) {
        await appAlert((tMsg("windowsInstallerCopyFail") || "") + url)
      }
    },
    [tMsg]
  )

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
    /**
     * 회사 로그인 바로가기(switch=1 / company·store·user 프리필):
     * 새 탭은 sessionStorage가 비지만 localStorage에 대리점(Partner/admin) 스냅샷이 남아
     * 「오프라인 모드로 들어가기」가 뜨는 문제 → 스냅샷 제거 후 고객사 로그인 폼만 표시.
     *
     * SaaS 관리(/saas-admin/login)는 서버 인증 필수 — POS 오프라인 스냅샷으로 진입하면
     * /saas-admin ↔ 로그인 화면이 반복되므로 스냅샷을 쓰지 않는다.
     */
    if (resolveSaasAdminLogin()) {
      setOfflineResume(null)
      return
    }
    const switchingAccount =
      forceAccountSwitch ||
      Boolean(queryCompany) ||
      Boolean(queryStore) ||
      Boolean(queryUser)
    if (switchingAccount) {
      clearOfflineLoginSnapshot()
      setOfflineResume(null)
      return
    }
    setOfflineResume(loadOfflineResumeAuth())
  }, [forceAccountSwitch, queryCompany, queryStore, queryUser, resolveSaasAdminLogin])

  useEffect(() => {
    persistOfflinePilotFromQuery(searchParams)
  }, [searchParams])

  const clearFormError = useCallback(() => {
    setError("")
    setErrorIsConnectivity(false)
    setLoginErrorFromClientFetch(false)
  }, [])

  const applyLoginDataResult = useCallback((d: LoginDataResult) => {
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
      const cur = String(prev || "").trim()
      if (!cur) return companyList[0] || ""
      if (companyList.includes(cur)) return cur
      const ci = companyList.find((c) => c.toLowerCase() === cur.toLowerCase())
      if (ci) return ci
      /** 수동 입력·쿼리 프리필(신규 회사)은 목록에 없어도 덮어쓰지 않음 — 예전엔 companyList[0]=Omni로 고정됨 */
      return cur
    })
    const src = d._source ?? "fallback"
    setLoginDataSource(src)
    if (src === "api" || src === "cache") {
      setBrowserOnline(true)
      setLoginListProbeOk(true)
    }
    if (d._source === "fallback") {
      setLoadError("SERVER_ERROR")
      void runReachabilityProbe().then((probeOk) => {
        setLoginListProbeOk(probeOk)
        if (probeOk) setBrowserOnline(true)
      })
    } else {
      setLoadError(null)
    }
  }, [])

  const fetchLoginData = useCallback(
    (companyOverride?: string) => {
      setLoadError(null)
      setLoginListProbeOk(null)
      setLoading(true)
      /** navigator.onLine 거짓 false 대비 프로브. 조기 종료하지 않음 — getLoginDataWithCache가 API를 직접 시도해 오탐을 복구함 */
      const run = async () => {
        const scopeCompany = String(companyOverride ?? company ?? "").trim()
        const loginOpts =
          needsScopedLoginData || (isOmniBrand && scopeCompany)
            ? scopeCompany
              ? { company: scopeCompany }
              : null
            : undefined

        if (loginOpts === null) {
          setLoginData({})
          setLoginStoreLabels({})
          setLoginStoreCompanies({})
          setCompanies([])
          setLoginDataSource("fallback")
          setLoadError(null)
          setLoading(false)
          return
        }

        if (typeof navigator !== "undefined" && !isBrowserOnline()) {
          await runReachabilityProbe()
        }
        const loginSnapshot = loadOfflineResumeAuth()
        const bootV2 = isPosOfflinePhaseAEnabled(loginSnapshot?.store)
        const hybridFastBoot =
          bootV2 &&
          typeof window !== "undefined" &&
          isCmPosHybridShell() &&
          loginApp === "pos" &&
          !!loginSnapshot

        let timeoutMs = 60_000
        if (hybridFastBoot) {
          if (!isBrowserOnline()) {
            timeoutMs = 3_000
          } else {
            const probeOk = await runReachabilityProbe()
            if (!probeOk) timeoutMs = 3_000
          }
          if (timeoutMs === 3_000) {
            const cachedOnly = await readLoginDataFromCacheOnly(loginOpts)
            if (cachedOnly._source === "cache") {
              applyLoginDataResult(cachedOnly)
              setLoading(false)
              return
            }
          }
        } else {
          const hybridOfflineBoot =
            typeof window !== "undefined" &&
            isCmPosHybridShell() &&
            !isBrowserOnline() &&
            !!loginSnapshot
          if (hybridOfflineBoot) timeoutMs = 3_000
        }

        const fetchOnce = () =>
          Promise.race([
            getLoginData(loginOpts),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`연결 시간 초과 (${timeoutMs / 1000}초)`)), timeoutMs)
            ),
          ])
        /** API 실패 시 getLoginData는 throw 대신 _source:fallback 을 줄 수 있음 → 1회 재시도 */
        const maxAttempts = hybridFastBoot && timeoutMs === 3_000 ? 1 : 2
        const loadWithRetry = async () => {
          let last: LoginDataResult | undefined
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              const d = await fetchOnce()
              last = d
              if (d._source !== "fallback") return d
            } catch (e) {
              if (attempt < maxAttempts - 1) continue
              throw e
            }
          }
          return last!
        }
        try {
          const d = await loadWithRetry()
          applyLoginDataResult(d)
          setLoading(false)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const probeOk = await runReachabilityProbe()
          setLoginListProbeOk(probeOk)
          if (probeOk) setBrowserOnline(true)
          const companyGate =
            msg === "company_required" ||
            msg === "company_not_found" ||
            msg === "company_inactive" ||
            /company_required|company_not_found|company_inactive/i.test(msg)
          setLoadError(
            companyGate
              ? msg === "company_required"
                ? "COMPANY_REQUIRED"
                : "COMPANY_NOT_FOUND"
              : msg.includes("연결") ||
                  msg.includes("시간 초과") ||
                  msg.includes("fetch") ||
                  msg.includes("Failed")
                ? "SERVER_ERROR"
                : msg
          )
          setLoginData({})
          setLoginStoreLabels({})
          setLoginStoreCompanies({})
          setCompanies([])
          if (!needsScopedLoginData) setCompany("")
          setLoginDataSource("fallback")
          setLoading(false)
        }
      }
      void run()
    },
    [applyLoginDataResult, company, isOmniBrand, loginApp, needsScopedLoginData]
  )

  useLayoutEffect(() => {
    if (skipLoginDataFetch || resolveSaasAdminLogin()) setLoading(false)
  }, [skipLoginDataFetch, resolveSaasAdminLogin])

  useEffect(() => {
    if (auth) {
      const authCompany = String(auth.company || "").trim().toLowerCase()
      const authStore = String(auth.store || "").trim().toLowerCase()
      const authUser = String(auth.user || "").trim().toLowerCase()
      const qCompany = queryCompany.toLowerCase()
      const qStore = queryStore.toLowerCase()
      const qUser = queryUser.toLowerCase()
      const prefillsMismatch =
        (Boolean(qCompany) && authCompany !== qCompany) ||
        (Boolean(qStore) && authStore !== qStore) ||
        (Boolean(qUser) && authUser !== qUser)
      /**
       * 회사 로그인 바로가기(switch=1) 또는 다른 회사·매장·이름 프리필이 있으면
       * 기존 대리점(Partner)/다른 계정 세션을 끊고 로그인 폼을 보여 준다.
       * 주의: logout()은 /admin/login으로 리다이렉트하며 query(company=JSW)를 날리므로 쓰면 안 됨.
       */
      const mustSwitchAccount =
        forceAccountSwitch ||
        prefillsMismatch ||
        (isSaasPartnerLoginStoreClient(auth.store || "") &&
          (Boolean(queryCompany) || Boolean(queryStore) || Boolean(queryUser)))
      /**
       * SaaS 관리: 권한 없는 세션(POS 스냅샷·오프라인 진입 등)으로 /saas-admin ↔ 로그인 루프 방지.
       * ?msg=no_admin 이거나, 본사/회계도 아니고 대리점(Partner) 세션도 아니면 폼만 표시.
       * (대리점은 saas_partner_users로 별도 허용 — canAccessSaasAdmin만으로 끊으면 안 됨)
       */
      const saasLoginDenied =
        resolveSaasAdminLogin() &&
        (initialNoticeKey === "msg_no_admin_permission" ||
          (!canAccessSaasAdmin(auth.role || "") &&
            !isSaasPartnerLoginStoreClient(auth.store || "")))
      if (mustSwitchAccount || saasLoginDenied) {
        clearOfflineLoginSnapshot()
        setOfflineResume(null)
        setAuth(null)
        void fetch(`${window.location.origin}/api/logout`, {
          method: "POST",
          credentials: "same-origin",
        }).catch(() => {})
        return
      }
      replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
      return
    }
    if (skipLoginDataFetch || resolveSaasAdminLogin()) {
      setLoading(false)
      return
    }
    /** Omni POS: 회사 입력 전 전역 목록 호출 금지 — company debounce effect가 로드 */
    if (needsScopedLoginData) {
      setLoading(false)
      return
    }
    /** HMR/라우트 전환 직후 unmount 레이스를 피하려고 취소 가능한 매크로태스크로 지연 */
    const timer = window.setTimeout(() => {
      fetchLoginData()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [
    auth,
    effectiveRedirectTo,
    router,
    fetchLoginData,
    resolveSaasAdminLogin,
    skipLoginDataFetch,
    needsScopedLoginData,
    forceAccountSwitch,
    queryCompany,
    queryStore,
    queryUser,
    setAuth,
    initialNoticeKey,
  ])

  /** Omni POS: 회사명 입력 후 해당 테넌트 매장·직원만 로드 */
  useEffect(() => {
    if (!needsScopedLoginData || auth) return
    const scopeCompany = company.trim()
    if (!scopeCompany) {
      setLoginData({})
      setLoginStoreLabels({})
      setLoginStoreCompanies({})
      setCompanies([])
      setStore("")
      setUser("")
      setLoadError(null)
      setLoading(false)
      return
    }
    const timer = window.setTimeout(() => {
      fetchLoginData(scopeCompany)
    }, 400)
    return () => {
      window.clearTimeout(timer)
    }
  }, [needsScopedLoginData, auth, company, fetchLoginData])

  useEffect(() => {
    if (auth || !initialNoticeKey || initialNoticeShownRef.current) return
    initialNoticeShownRef.current = true
    setError(tMsg(initialNoticeKey))
    setErrorIsConnectivity(false)
  }, [auth, initialNoticeKey, tMsg])

  /** SaaS 관리: 입력 중인 회사·이름(·매장)을 브라우저에 보관 — 다음 방문 시 프리필 (PIN 제외) */
  useEffect(() => {
    if (!isSaasAdminLogin) return
    if (queryCompany || queryStore || queryUser) return
    const timer = window.setTimeout(() => {
      saveLoginLastSelection(
        {
          company: company.trim() || undefined,
          store: hideSaasPartnerStoreField
            ? store.trim() || SAAS_PARTNER_LOGIN_STORE_DEFAULT
            : store.trim() || undefined,
          user: user.trim() || undefined,
        },
        { saasAdmin: true }
      )
    }, 450)
    return () => window.clearTimeout(timer)
  }, [
    isSaasAdminLogin,
    company,
    store,
    user,
    hideSaasPartnerStoreField,
    queryCompany,
    queryStore,
    queryUser,
  ])

  useEffect(() => {
    if (companyPrefillAppliedRef.current) return
    const savedCompany = lastLoginSelectionRef.current?.company || ""
    let targetCompany = queryCompany || savedCompany
    if (isSaasAdminLogin && !queryCompany && isSaasPlatformDefaultLoginCompany(targetCompany)) {
      targetCompany = ""
    }
    if (!targetCompany) {
      companyPrefillAppliedRef.current = true
      return
    }
    if (useManualCompanyField) {
      setCompany(targetCompany)
      if (queryCompany) {
        if (isSaasAdminLogin && !isSaasPlatformDefaultLoginCompany(targetCompany)) {
          setStore(queryStore || SAAS_PARTNER_LOGIN_STORE_DEFAULT)
        } else {
          setStore(queryStore || "")
        }
        setUser(queryUser || "")
      }
      companyPrefillAppliedRef.current = true
      return
    }
    if (companies.length === 0) return
    const found = companies.find(
      (x) => String(x || "").trim().toLowerCase() === targetCompany.toLowerCase()
    )
    if (found) {
      setCompany(found)
      if (queryCompany) {
        setStore(queryStore || "")
        setUser(queryUser || "")
      }
    }
    companyPrefillAppliedRef.current = true
  }, [companies, queryCompany, queryStore, queryUser, useManualCompanyField, isSaasAdminLogin])

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
    const effectiveCompany = company.trim()
    /** SaaS 대리점 로그인: 매장은 가상 키(Partner). UI 비노출·비워도 기본값 사용 */
    const effectiveStore = hideSaasPartnerStoreField
      ? store.trim() || SAAS_PARTNER_LOGIN_STORE_DEFAULT
      : store.trim()
    const effectiveUser = user.trim()
    if (!effectiveStore || !effectiveUser) {
      setErrorIsConnectivity(false)
      setError(tMsg("msg_select_store_name"))
      return
    }
    if (useManualCompanyField && !effectiveCompany) {
      setErrorIsConnectivity(false)
      setError(tMsg("msg_select_store_name"))
      return
    }
    setSubmitting(true)
    clearFormError()
    const loginListReady =
      !useManualCompanyField &&
      (loginDataSource === "api" || loginDataSource === "cache") &&
      stores.length > 0
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
        company: effectiveCompany || company || undefined,
        store: effectiveStore,
        name: effectiveUser,
        pw,
        isAdminPage: effectiveIsAdminPage,
        ...(isOmniBrand && effectiveIsAdminPage && totpCode.trim()
          ? { totpCode: totpCode.trim() }
          : {}),
      })
      if (res.success && res.storeName && res.userName) {
        setNeedsTotp(false)
        setNeedsTotpEnroll(false)
        setTotpEnrollSecret("")
        setTotpEnrollUrl("")
        saveLoginLastSelection(
          {
            company: res.companyName || company || undefined,
            store: res.storeName,
            user: res.userName,
          },
          { saasAdmin: resolveSaasAdminLogin() }
        )
        const nextTenantId =
          res.tenantId && !res.saasPartnerLogin ? String(res.tenantId).trim() : ""
        /** 로그인 직후 enabled-modules API 왕복 제거 */
        if (res.enabledModules) {
          seedSaasEnabledModules(res.enabledModules, nextTenantId || null)
        } else {
          seedSaasEnabledModules(null, nextTenantId || null)
        }
        setAuth({
          ...(res.companyName ? { company: res.companyName } : {}),
          ...(nextTenantId ? { tenantId: nextTenantId } : {}),
          store: res.storeName,
          user: res.userName,
          role: res.role || "",
          token: res.token,
          ...(res.employeeId != null && res.employeeId > 0 ? { employeeId: res.employeeId } : {}),
          ...(res.employeeCode ? { employeeCode: String(res.employeeCode).trim() } : {}),
          ...(Array.isArray(res.allowedStores) && res.allowedStores.length > 0
            ? { allowedStores: res.allowedStores }
            : {}),
          ...(res.canManageOfficePayroll ? { canManageOfficePayroll: true } : {}),
        })
        const postLoginPath =
          res.saasPartnerLogin && loginPath === "/admin/login" ? "/saas-admin" : effectiveRedirectTo
        replacePosOfflineAware(postLoginPath, (p) => router.replace(p))
      } else {
        const apiMsg = res.message || ""
        const code = String(res.code || "")
        if (isOmniBrand && code === "2fa_enrollment_required") {
          setNeedsTotpEnroll(true)
          setNeedsTotp(true)
          setErrorIsConnectivity(false)
          setLoginErrorFromClientFetch(false)
          setError(pickLoginStr(tMsg, "msg_login_2fa_enroll_required", lang))
          try {
            const enroll = await saasAdminTotpBootstrap({
              action: "bootstrap_enroll",
              company: effectiveCompany || company || undefined,
              store: effectiveStore,
              name: effectiveUser,
              pw,
            })
            if (enroll.success && enroll.secret) {
              setTotpEnrollSecret(enroll.secret)
              setTotpEnrollUrl(enroll.otpauthUrl || "")
            }
          } catch {
            /* 등록 API 실패해도 안내 문구는 유지 */
          }
        } else if (isOmniBrand && (code === "2fa_invalid" || code === "saas_2fa_unavailable")) {
          setNeedsTotp(true)
          setErrorIsConnectivity(false)
          setLoginErrorFromClientFetch(false)
          setError(
            code === "saas_2fa_unavailable"
              ? pickLoginStr(tMsg, "msg_login_2fa_unavailable", lang)
              : pickLoginStr(tMsg, "msg_login_2fa_invalid", lang)
          )
        } else if (isOmniBrand && (code === "ip_not_allowed" || code === "ip_allowlist_empty")) {
          setErrorIsConnectivity(false)
          setLoginErrorFromClientFetch(false)
          setError(pickLoginStr(tMsg, "msg_login_ip_blocked", lang))
        } else if (isOmniBrand && code === "saas_login_policy_unavailable") {
          setErrorIsConnectivity(false)
          setLoginErrorFromClientFetch(false)
          setError(pickLoginStr(tMsg, "msg_login_policy_unavailable", lang))
        } else if (isLoginCheckBackendFailureMessage(apiMsg)) {
          /** 응답 본문이 왔으므로 TCP/브라우저 단절이 아님 — 서버·DB·토큰 처리 등일 수 있음(연결 재시도 안내는 오해 소지) */
          setErrorIsConnectivity(false)
          setLoginErrorFromClientFetch(false)
          setError(
            translateApiMessage(apiMsg, tMsg) ||
              pickLoginStr(tMsg, "msg_login_network_error", lang)
          )
        } else {
          setErrorIsConnectivity(false)
          setLoginErrorFromClientFetch(false)
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
        reportNetworkFailure()
        setLoginListProbeOk(false)
        setError(pickLoginStr(tMsg, "msg_login_network_error", lang))
        setErrorIsConnectivity(true)
        setLoginErrorFromClientFetch(true)
      } else {
        setErrorIsConnectivity(false)
        setLoginErrorFromClientFetch(false)
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
  const stores = Object.keys(loginData)
    .filter((s) => !isLoginExcludedStoreKey(s))
    .sort((a, b) => {
    if (isOfficeStore(a) && !isOfficeStore(b)) return -1
    if (!isOfficeStore(a) && isOfficeStore(b)) return 1
    return a.localeCompare(b)
  })
  const filteredStoresRaw = company
    ? stores.filter((s) => {
        const tagged = String(loginStoreCompanies[s] || "").trim()
        if (!tagged) return true
        return tagged.toLowerCase() === company.trim().toLowerCase()
      })
    : stores
  /** 같은 표시명(예: 1001)이 store_name·store_code 두 키로 오면 한 줄만 표시 */
  const filteredStores = dedupeLoginStoreKeysByLabel(filteredStoresRaw, loginStoreLabels)
  /** 목록은 왔는데 회사 태그 불일치로 매장 0개만 되는 경우 — 목록 API 실패와 구분해 선택만 해제 */
  useEffect(() => {
    if (useManualCompanyField) return
    if (loading || !company) return
    if (stores.length === 0 || filteredStores.length > 0) return
    setCompany("")
  }, [loading, company, stores.length, filteredStores.length, useManualCompanyField])
  useEffect(() => {
    if (storePrefillAppliedRef.current) return
    const savedStore = lastLoginSelectionRef.current?.store || ""
    const targetStore =
      queryStore ||
      savedStore ||
      (isSaasAdminLogin && saasPartnerLoginFlow ? SAAS_PARTNER_LOGIN_STORE_DEFAULT : "")
    if (!targetStore) {
      storePrefillAppliedRef.current = true
      return
    }
    if (useManualStoreUserFields) {
      setStore(targetStore)
      if (queryStore) setUser("")
      storePrefillAppliedRef.current = true
      return
    }
    if (filteredStores.length === 0) return
    const found = filteredStores.find(
      (x) => String(x || "").trim().toLowerCase() === targetStore.toLowerCase()
    )
    if (found) {
      setStore(found)
      if (queryStore) setUser("")
    }
    storePrefillAppliedRef.current = true
  }, [filteredStores, queryStore, useManualStoreUserFields, isSaasAdminLogin, saasPartnerLoginFlow])
  const users = store ? (loginData[store] || []) : []
  useEffect(() => {
    if (userPrefillAppliedRef.current) return
    const savedUser = lastLoginSelectionRef.current?.user || ""
    const targetUser = queryUser || savedUser
    if (!targetUser) {
      userPrefillAppliedRef.current = true
      return
    }
    if (useManualStoreUserFields) {
      if (store) setUser(targetUser)
      userPrefillAppliedRef.current = true
      return
    }
    if (!store) return
    if (users.length === 0) return
    const found = users.find((x) => String(x || "").trim().toLowerCase() === targetUser.toLowerCase())
    if (found) setUser(found)
    userPrefillAppliedRef.current = true
  }, [queryUser, store, users, useManualStoreUserFields])
  useEffect(() => {
    if (useManualStoreUserFields) return
    if (!store) return
    if (filteredStores.includes(store)) return
    setStore("")
    setUser("")
  }, [filteredStores, store, useManualStoreUserFields])
  const noStores = !loading && stores.length === 0
  /** 매장 목록이 비어 있어도 서버/캐시에서 정상 조회면 연결 문제로 보지 않음 */
  const companyScopeError = loadError === "COMPANY_REQUIRED" || loadError === "COMPANY_NOT_FOUND"
  const serverListDegraded =
    (Boolean(loadError) && !companyScopeError) ||
    (noStores && loginDataSource === "fallback" && !needsScopedLoginData)
  const listLoadedOk = !loading && stores.length > 0
  /**
   * Windows Electron 등에서 navigator.onLine 만 거짓이고 /api/getLoginData 는 성공한 경우 —
   * 매장 목록이 있거나(api/cache 성공) 서버에서 빈 목록을 준 경우에도 연결 실패 배너를 띄우지 않음.
   */
  const listFromServerOk = loginDataSource === "api" || loginDataSource === "cache"
  /**
   * 스냅샷 없어도 POS·하이브리드는 캐시 목록에서 고른 매장·이름으로 오프라인 진입 허용.
   */
  const effectiveOfflineResume = useMemo((): AuthState | null => {
    /** SaaS 관리는 온라인 서버 인증 필수 — POS 오프라인 CTA/전체화면 진입 금지 */
    if (isSaasAdminLogin || resolveSaasAdminLogin()) return null
    /** 고객사 로그인 전환 중에는 대리점 오프라인 CTA 숨김 */
    if (
      forceAccountSwitch ||
      Boolean(queryCompany) ||
      Boolean(queryStore) ||
      Boolean(queryUser)
    ) {
      return null
    }
    if (offlineResume) return enrichOfflinePosAuth(offlineResume)
    if (loginApp !== "pos" && !hybridPosShell) return null
    const s = store.trim()
    const u = user.trim()
    if (!s || !u) return null
    if (loginDataSource !== "cache" && loginDataSource !== "api") return null
    let token: string | undefined
    try {
      token = sessionStorage.getItem("cm_token") || localStorage.getItem("cm_token") || undefined
    } catch {
      /* ignore */
    }
    return enrichOfflinePosAuth({
      ...(company ? { company: company.trim() } : {}),
      store: s,
      user: u,
      role: "",
      token,
    })
  }, [
    isSaasAdminLogin,
    resolveSaasAdminLogin,
    forceAccountSwitch,
    queryCompany,
    queryStore,
    queryUser,
    offlineResume,
    loginApp,
    hybridPosShell,
    store,
    user,
    company,
    loginDataSource,
  ])
  /**
   * 목록이 캐시뿐이거나, 온라인 목록 뒤 loginCheck가 네트워크로 실패한 경우 오프라인 CTA.
   * browserOnline·stale 프로브로 숨기지 않음(Windows/Electron에서 Wi‑Fi 끊어도 onLine=true 인 경우).
   */
  const canOfferOfflineResume =
    Boolean(effectiveOfflineResume) &&
    (loginDataSource !== "api" || errorIsConnectivity)
  /**
   * 전용「오프라인 모드로 들어가기」전체 화면: 스냅샷·목록 없음·서버 로그인 불가일 때.
   */
  const offlineOnlyScreen =
    canOfferOfflineResume && !listLoadedOk && !serverListDegraded
  /**
   * 목록은 캐시로 보여도 서버 로그인 불가면 폼 위에 오프라인 진입 배너.
   */
  const showOfflineResumeBanner =
    canOfferOfflineResume && !offlineOnlyScreen

  /** Phase A — 로딩 중에도 스냅샷 있으면 오프라인 진입 버튼 우선 표시 */
  const showOfflineEntryDuringLoad =
    isPosOfflinePhaseAEnabled(effectiveOfflineResume?.store) && loading && offlineOnlyScreen

  /** 목록 API 실패 시에도 이전 스냅샷이 있으면 재시도·안내가 필요 */
  const showServerUnreachableBanner =
    serverListDegraded || (!browserOnline && !listLoadedOk && !listFromServerOk)
  /** 동일 출처 프로브 성공 + 목록 API만 실패 — 긴 PIN·오프라인 안내 대신 짧은 안내 */
  const useSoftListFailureCopy = Boolean(showServerUnreachableBanner && loginListProbeOk === true)
  const useSoftSubmitNetworkCopy = Boolean(
    errorIsConnectivity && loginListProbeOk === true && loginErrorFromClientFetch
  )

  const labels = {
    ko: {
      selectStore: "매장 선택",
      selectCompany: "회사 선택",
      selectName: "이름 선택",
      typeCompany: "회사명 입력",
      typePartnerCompany: "대리점명(회사명) 입력",
      companyRequired: "회사명을 입력하면 매장·이름 목록이 표시됩니다.",
      companyNotFound: "회사를 찾을 수 없습니다. 회사명을 확인해 주세요.",
      typeStore: "매장명 입력",
      typeName: "이름 입력",
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
      connectingCanEnterOffline:
        "서버 연결을 시도하는 동안에도 아래 버튼으로 바로 오프라인 모드에 들어갈 수 있습니다.",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "모바일",
      /** ERP 탭: 웹 관리(Admin)용 — Staff는 「모바일」 안내 */
      loginErpStaffHint:
        "「ERP」는 매장/본사 관리 권한(매니저·가맹점주·슈퍼바이저·본사·회계 등)이 있는 계정만 사용할 수 있습니다. 일반 직원은 「모바일」을 선택하세요.",
      offlineResumeStore: "매장",
      offlineResumeStaff: "담당자",
      offlineResumeSyncNote:
        "아래로 들어가면 이 매장·담당자로 세션이 복구됩니다. 인터넷이 돌아온 뒤 서버에 주문을 올릴 때도 같은 담당자 이름으로 남습니다.",
    },
    en: {
      selectStore: "Select Store",
      selectCompany: "Select Company",
      selectName: "Select Name",
      typeCompany: "Company name",
      typePartnerCompany: "Partner / company name",
      companyRequired: "Enter your company name to load stores and staff.",
      companyNotFound: "Company not found. Please check the company name.",
      typeStore: "Store name",
      typeName: "Name",
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
      connectingCanEnterOffline:
        "You can enter offline mode below while we try to reach the server.",
      loginAppErp: "ERP (Admin)",
      loginAppPos: "POS",
      loginAppMobile: "Mobile",
      loginErpStaffHint:
        "“ERP (Admin)” is for managers, franchisees, supervisors, HQ, and other authorized accounts. Store staff should choose “Mobile”.",
      offlineResumeStore: "Store",
      offlineResumeStaff: "Staff",
      offlineResumeSyncNote:
        "Continuing restores this account. When back online, new orders saved to the server will be recorded under this staff name.",
    },
    th: {
      selectStore: "เลือกสาขา",
      selectCompany: "เลือกบริษัท",
      selectName: "เลือกชื่อ",
      typeCompany: "ชื่อบริษัท",
      typePartnerCompany: "ชื่อตัวแทน/บริษัท",
      companyRequired: "กรอกชื่อบริษัทเพื่อโหลดสาขาและพนักงานครับ",
      companyNotFound: "ไม่พบบริษัท กรุณาตรวจสอบชื่อบริษัทครับ",
      typeStore: "ชื่อสาขา",
      typeName: "ชื่อ",
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
      connectingCanEnterOffline:
        "ระหว่างเชื่อมต่อเซิร์ฟเวอร์ สามารถกดปุ่มด้านล่างเพื่อเข้าโหมดออฟไลน์ได้ทันที",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "มือถือ",
      loginErpStaffHint:
        "แท็บ “ERP” สำหรับบัญชีที่มีสิทธิ์จัดการ (ผู้จัดการ/แฟรนไชส์/สำนักงาน/บัญชี) เท่านั้น พนักงานทั่วไปให้เลือก “มือถือ”",
      offlineResumeStore: "สาขา",
      offlineResumeStaff: "พนักงาน",
      offlineResumeSyncNote:
        "ดำเนินการต่อเพื่อกู้บัญชีนี้ เมื่อออนไลน์อีกครั้ง คำสั่งซื้อใหม่จะบันทึกชื่อพนักงานนี้",
    },
    mm: {
      selectStore: "ဆိုင်ရွေးပါ",
      selectCompany: "ကုမ္ပဏီရွေးပါ",
      selectName: "အမည်ရွေးပါ",
      typeCompany: "ကုမ္ပဏီအမည်",
      typePartnerCompany: "ကိုယ်စားလှယ်/ကုမ္ပဏီအမည်",
      companyRequired: "Enter company name to load stores.",
      companyNotFound: "Company not found.",
      typeStore: "ဆိုင်အမည်",
      typeName: "အမည်",
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
      connectingCanEnterOffline:
        "You can enter offline mode below while we try to reach the server.",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "မိုဘိုင်း",
      loginErpStaffHint:
        "“ERP” ဟာ မန်နေဂျာ/ဖြေရှင်းချိန်/ရုံးစသည့် အကောင့်အတွက်သာ။ ပြေစာပိုင်းဝန်ထမ်းများသည် “မိုဘိုင်း”ကို ရွေးပါ။",
      offlineResumeStore: "ဆိုင်",
      offlineResumeStaff: "တာဝန်ခံ",
      offlineResumeSyncNote:
        "ဆက်လုပ်ပါက ဤအကောင့်ကို ပြန်ဖော်ပါမည်။ အွန်လိုင်န်ပြန်ရောက်သောအခါ အမှာစသစ်များတွင် ဤအမည်ဖြင့် မှတ်တမ်းတင်ပါမည်။",
    },
    la: {
      selectStore: "ເລືອກສາຂາ",
      selectCompany: "ເລືອກບໍລິສັດ",
      selectName: "ເລືອກຊື່",
      typeCompany: "ຊື່ບໍລິສັດ",
      typePartnerCompany: "ຊື່ຕົວແທນ/ບໍລິສັດ",
      companyRequired: "Enter company name to load stores.",
      companyNotFound: "Company not found.",
      typeStore: "ຊື່ຮ້ານ",
      typeName: "ຊື່",
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
      connectingCanEnterOffline:
        "You can enter offline mode below while we try to reach the server.",
      loginAppErp: "ERP",
      loginAppPos: "POS",
      loginAppMobile: "ມືຖື",
      loginErpStaffHint:
        "ແຖບ “ERP” ສຳລັບບັນຊີທີ່ມີສິດຄວບຄຸມ (ຜູ້ຈັດການ/ສຳນັກງານ/ບັນຊີ). ພະນັກງານທົ່ວໄປ ເລືອກ “ມືຖື”.",
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
          normalizeLoginPathname(pathname) === "/admin/login" ? (
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
              {loginApp === "erp" && normalizeLoginPathname(pathname) !== "/saas-admin/login" ? (
                <p className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-center text-[11px] leading-relaxed text-amber-100/95">
                  {t.loginErpStaffHint}
                </p>
              ) : null}
            </div>
          ) : null}

          {loading && !showOfflineEntryDuringLoad ? (
            <div className="login-inline-loading">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
              <p className="mt-4 text-center text-sm text-white/80">{t.connectingToServer}</p>
            </div>
          ) : offlineOnlyScreen ? (
            <div className="space-y-3 py-4">
              {showOfflineEntryDuringLoad ? (
                <p className="text-center text-xs leading-relaxed text-white/65">{t.connectingCanEnterOffline}</p>
              ) : null}
              {effectiveOfflineResume ? (
                <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-left text-sm text-white/90">
                  <p>
                    <span className="text-white/55">{t.offlineResumeStore}</span>{' '}
                    <span className="font-medium text-white">{effectiveOfflineResume.store}</span>
                  </p>
                  <p className="mt-1">
                    <span className="text-white/55">{t.offlineResumeStaff}</span>{' '}
                    <span className="font-medium text-white">{effectiveOfflineResume.user}</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">{t.offlineResumeSyncNote}</p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (effectiveOfflineResume) {
                    setPosSessionPreferHardNavigation()
                    setAuth(effectiveOfflineResume)
                    replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
                  }
                }}
                className="w-full rounded-md bg-emerald-600 px-3 py-3 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {t.enterOfflineMode}
              </button>
              {showWindowsInstallerButton ? (
                localDevHost ? (
                  <div className="flex w-full flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handleWindowsInstallerDownload(WINDOWS_POS_OMNI_SETUP_PATH)}
                      className="block w-full rounded-md bg-violet-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-violet-500"
                    >
                      {windowsOmniInstallerLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleWindowsInstallerDownload(WINDOWS_POS_CHOONGMAN_SETUP_PATH)}
                      className="block w-full rounded-md bg-sky-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-sky-500"
                    >
                      {windowsChoongmanInstallerLabel}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleWindowsInstallerDownload(windowsInstallerPath)}
                    className="block w-full rounded-md bg-sky-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-sky-500"
                  >
                    {windowsInstallerLabel}
                  </button>
                )
              ) : null}
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-3 w-full max-w-sm" data-login-step="language">
              <Select
                value={lang}
                onValueChange={handleLangChange}
                aria-label={tMsg("posLanguage")}
              >
                <SelectTrigger type="button" className="login-select-trigger ring-1 ring-white/20" style={{ color: "white" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="login-select-content">
                  {ADMIN_UI_LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {`${LOGIN_LANG_FLAG_EMOJI[o.value]} ${o.label}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            {useManualCompanyField ? (
              <input
                type="text"
                value={company}
                onChange={(e) => {
                  const nextCompany = e.target.value
                  setCompany(nextCompany)
                  const nextPartnerFlow =
                    isSaasAdminLogin &&
                    (!nextCompany.trim() || !isSaasPlatformDefaultLoginCompany(nextCompany.trim()))
                  if (nextPartnerFlow) {
                    /** 대리점 — Partner 기본값 유지. 이름 입력은 유지(매 글자마다 지우지 않음) */
                    setStore((prev) => prev.trim() || SAAS_PARTNER_LOGIN_STORE_DEFAULT)
                  } else if (isSaasAdminLogin) {
                    setStore("")
                  } else {
                    setStore("")
                    setUser("")
                  }
                }}
                placeholder={isSaasAdminLogin ? t.typePartnerCompany : t.typeCompany}
                className="login-input-field"
                autoComplete="organization"
                aria-label={isSaasAdminLogin ? t.typePartnerCompany : t.typeCompany}
                data-testid="login-input-company"
              />
            ) : (
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
            )}
            {needsScopedLoginData && !company.trim() ? (
              <p className="text-center text-[11px] leading-relaxed text-white/65">{t.companyRequired}</p>
            ) : null}
            {needsScopedLoginData && loadError === "COMPANY_NOT_FOUND" ? (
              <p className="text-center text-[11px] leading-relaxed text-amber-200/95">{t.companyNotFound}</p>
            ) : null}

            {hideSaasPartnerStoreField ? null : useManualStoreUserFields ? (
              <input
                type="text"
                value={store}
                onChange={(e) => {
                  setStore(e.target.value)
                  setUser("")
                }}
                placeholder={t.typeStore}
                className="login-input-field"
                autoComplete="organization"
                aria-label={t.typeStore}
                data-testid="login-input-store"
              />
            ) : (
              <Select value={store} onValueChange={handleStoreChange}>
                <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }} data-testid="login-select-store">
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
            )}

            {useManualStoreUserFields ? (
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder={t.typeName}
                className="login-input-field"
                autoComplete="username"
                aria-label={t.typeName}
                data-testid="login-input-user"
              />
            ) : (
              <Select value={user} onValueChange={setUser} disabled={!store}>
                <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }} data-testid="login-select-user">
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
            )}

            {showOfflineResumeBanner && effectiveOfflineResume ? (
              <div className="mb-3 rounded-lg border border-emerald-500/45 bg-emerald-950/35 px-3 py-3 text-center">
                <p className="text-xs leading-relaxed text-emerald-100/95">
                  {pickLoginStr(
                    tMsg,
                    browserOnline ? "msg_login_offline_banner_hint_online" : "msg_login_offline_banner_hint",
                    lang
                  )}
                </p>
                <p className="mt-2 text-sm font-medium text-emerald-50">
                  <span className="text-emerald-200/80">{t.offlineResumeStore}</span> {effectiveOfflineResume.store}
                  <span className="mx-1.5 text-emerald-400/60">·</span>
                  <span className="text-emerald-200/80">{t.offlineResumeStaff}</span> {effectiveOfflineResume.user}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPosSessionPreferHardNavigation()
                    setAuth(effectiveOfflineResume)
                    replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
                  }}
                  className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  {t.enterOfflineMode}
                </button>
              </div>
            ) : null}

            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t.pinPlaceholder}
              className="login-input-field"
              autoComplete="off"
              aria-label="Password"
              data-testid="login-password"
            />

            {isOmniBrand && effectiveIsAdminPage ? (
              <div className="space-y-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={pickLoginStr(tMsg, "msg_login_2fa_placeholder", lang)}
                  className="login-input-field"
                  aria-label="TOTP"
                  data-testid="login-totp"
                />
                {needsTotpEnroll && totpEnrollSecret ? (
                  <div className="rounded-lg border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-left text-xs text-sky-100/95">
                    <p className="font-medium">{pickLoginStr(tMsg, "msg_login_2fa_secret_label", lang)}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-sky-50">{totpEnrollSecret}</p>
                    {totpEnrollUrl ? (
                      <p className="mt-1 break-all text-[10px] text-sky-200/80">{totpEnrollUrl}</p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-2 w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
                      disabled={submitting || totpCode.trim().length !== 6}
                      onClick={async () => {
                        setSubmitting(true)
                        clearFormError()
                        try {
                          const conf = await saasAdminTotpBootstrap({
                            action: "bootstrap_confirm",
                            company: company.trim() || undefined,
                            store: hideSaasPartnerStoreField
                              ? store.trim() || SAAS_PARTNER_LOGIN_STORE_DEFAULT
                              : store.trim(),
                            name: user.trim(),
                            pw,
                            totpCode: totpCode.trim(),
                          })
                          if (!conf.success) {
                            setError(
                              conf.message || pickLoginStr(tMsg, "msg_login_2fa_invalid", lang)
                            )
                            return
                          }
                          setNeedsTotpEnroll(false)
                          const res = await loginCheck({
                            company: company.trim() || undefined,
                            store: hideSaasPartnerStoreField
                              ? store.trim() || SAAS_PARTNER_LOGIN_STORE_DEFAULT
                              : store.trim(),
                            name: user.trim(),
                            pw,
                            isAdminPage: effectiveIsAdminPage,
                            totpCode: totpCode.trim(),
                          })
                          if (res.success && res.storeName && res.userName) {
                            setNeedsTotp(false)
                            saveLoginLastSelection(
                              {
                                company: res.companyName || company || undefined,
                                store: res.storeName,
                                user: res.userName,
                              },
                              { saasAdmin: resolveSaasAdminLogin() }
                            )
                            const nextTenantId =
                              res.tenantId && !res.saasPartnerLogin
                                ? String(res.tenantId).trim()
                                : ""
                            if (res.enabledModules) {
                              seedSaasEnabledModules(res.enabledModules, nextTenantId || null)
                            } else {
                              seedSaasEnabledModules(null, nextTenantId || null)
                            }
                            setAuth({
                              ...(res.companyName ? { company: res.companyName } : {}),
                              ...(nextTenantId ? { tenantId: nextTenantId } : {}),
                              store: res.storeName,
                              user: res.userName,
                              role: res.role || "",
                              token: res.token,
                              ...(res.employeeId != null && res.employeeId > 0
                                ? { employeeId: res.employeeId }
                                : {}),
                              ...(res.employeeCode
                                ? { employeeCode: String(res.employeeCode).trim() }
                                : {}),
                              ...(Array.isArray(res.allowedStores) && res.allowedStores.length > 0
                                ? { allowedStores: res.allowedStores }
                                : {}),
                              ...(res.canManageOfficePayroll
                                ? { canManageOfficePayroll: true }
                                : {}),
                            })
                            const postLoginPath =
                              res.saasPartnerLogin && loginPath === "/admin/login"
                                ? "/saas-admin"
                                : effectiveRedirectTo
                            replacePosOfflineAware(postLoginPath, (p) => router.replace(p))
                          } else {
                            setError(res.message || tMsg("msg_login_failed"))
                          }
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e))
                        } finally {
                          setSubmitting(false)
                        }
                      }}
                    >
                      {pickLoginStr(tMsg, "msg_login_2fa_confirm_enroll", lang)}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error &&
              (canOfferOfflineResume ? (
                <div className="mb-3 space-y-2">
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
                    <p className="font-medium">
                      {useSoftSubmitNetworkCopy
                        ? pickLoginStr(tMsg, "msg_login_submit_network_title", lang)
                        : error}
                    </p>
                    {!useSoftSubmitNetworkCopy && errorIsConnectivity ? (
                      <p className="mt-2 text-xs leading-relaxed text-amber-100/90">
                        {pickLoginStr(tMsg, "msg_login_offline_connect_detail", lang)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!effectiveOfflineResume) return
                      setPosSessionPreferHardNavigation()
                      setAuth(effectiveOfflineResume)
                      replacePosOfflineAware(effectiveRedirectTo, (p) => router.replace(p))
                    }}
                    className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    {t.enterOfflineMode}
                  </button>
                </div>
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

            <button type="submit" className="login-btn" disabled={submitting} data-testid="login-submit">
              {submitting ? t.loggingIn : t.login}
            </button>

            {showWindowsInstallerButton ? (
              localDevHost ? (
                <div className="mt-2 flex w-full flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void handleWindowsInstallerDownload(WINDOWS_POS_OMNI_SETUP_PATH)}
                    className="block w-full rounded-md bg-violet-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-violet-500"
                  >
                    {windowsOmniInstallerLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleWindowsInstallerDownload(WINDOWS_POS_CHOONGMAN_SETUP_PATH)}
                    className="block w-full rounded-md bg-sky-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-sky-500"
                  >
                    {windowsChoongmanInstallerLabel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleWindowsInstallerDownload(windowsInstallerPath)}
                  className="mt-2 block w-full rounded-md bg-sky-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-sky-500"
                >
                  {windowsInstallerLabel}
                </button>
              )
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
