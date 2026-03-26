"use client"
import { appAlert } from "@/lib/app-message"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getLoginData, loginCheck, changePassword } from "@/lib/api-client"
import { useAuth, loadOfflineResumeAuth, type AuthState } from "@/lib/auth-context"
import { isLangCode, useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"

/** i18n 키 누락·손상 시 영어 (번들 문자열은 네트워크 없이 동작 — 이 폴백은 이중 안전장치) */
const LOGIN_I18N_FALLBACK_EN: Record<string, string> = {
  msg_login_network_error:
    "Cannot connect to the network. You may be offline or the server may be unreachable.",
  msg_login_offline_banner_hint:
    "A previous login session exists on this device. Tap the button below to continue without the internet.",
  msg_login_offline_banner_hint_online:
    "Wi‑Fi may look connected but the server may still be unreachable. Tap below to continue with the account saved on this device (cache/offline).",
}

function pickLoginStr(tMsg: (k: string) => string, key: string): string {
  const raw = tMsg(key)
  const fb = LOGIN_I18N_FALLBACK_EN[key]
  if (fb && (!raw || raw === key)) return fb
  return raw || fb || key
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

interface LoginFormProps {
  redirectTo: string
  isAdminPage: boolean
}

export function LoginForm({ redirectTo, isAdminPage }: LoginFormProps) {
  const router = useRouter()
  const { auth, setAuth } = useAuth()
  const [loginData, setLoginData] = useState<Record<string, string[]>>({})
  const [store, setStore] = useState("")
  const [user, setUser] = useState("")
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(true)
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
  /** 서버 장애로 목록이 없을 때 매장/이름 직접 입력 */
  const [manualStore, setManualStore] = useState("")
  const [manualUser, setManualUser] = useState("")
  const [browserOnline, setBrowserOnline] = useState(true)

  useEffect(() => {
    if (typeof window === "undefined") return
    setBrowserOnline(navigator.onLine)
    const onOn = () => setBrowserOnline(true)
    const onOff = () => setBrowserOnline(false)
    window.addEventListener("online", onOn)
    window.addEventListener("offline", onOff)
    return () => {
      window.removeEventListener("online", onOn)
      window.removeEventListener("offline", onOff)
    }
  }, [])

  /**
   * 오프라인 재진입 스냅샷. 로그인 페이지는 `dynamic(..., { ssr: false })`로만 불러와
   * 브라우저에서만 마운트되므로, 첫 렌더에서 곧바로 localStorage를 읽어도 하이드레이션 불일치가 없음.
   */
  const [resumeAuth] = useState<AuthState | null>(() => loadOfflineResumeAuth())

  const clearFormError = useCallback(() => {
    setError("")
    setErrorIsConnectivity(false)
  }, [])

  const fetchLoginData = useCallback(() => {
    setLoadError(null)
    setLoading(true)
    const timeoutMs = 6000
    const withTimeout = Promise.race([
      getLoginData(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`연결 시간 초과 (${timeoutMs / 1000}초)`)), timeoutMs)
      ),
    ])
    withTimeout
      .then((d) => {
        setLoginData(d.users || {})
        if (d._source === 'fallback') {
          setLoadError('SERVER_ERROR')
        } else {
          setLoadError(null)
        }
        setLoading(false)
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        setLoadError(
          msg.includes('연결') || msg.includes('시간 초과') || msg.includes('fetch') || msg.includes('Failed')
            ? 'SERVER_ERROR'
            : msg
        )
        setLoginData({})
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (auth) {
      router.replace(redirectTo)
      return
    }
    fetchLoginData()
  }, [auth, redirectTo, router, fetchLoginData])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("cm_lang")
      if (saved && isLangCode(saved)) setLang(saved)
    }
  }, [setLang])

  const handleStoreChange = (s: string) => {
    setStore(s)
    setUser("")
  }

  const handleLangChange = (l: string) => {
    if (isLangCode(l)) setLang(l)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const effectiveStore = (manualStore || store).trim()
    const effectiveUser = (manualUser || user).trim()
    if (!effectiveStore || !effectiveUser) {
      setErrorIsConnectivity(false)
      setError(tMsg("msg_select_store_name"))
      return
    }
    setSubmitting(true)
    clearFormError()
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(pickLoginStr(tMsg, "msg_login_network_error"))
      setErrorIsConnectivity(true)
      setSubmitting(false)
      return
    }
    try {
      const res = await loginCheck({ store: effectiveStore, name: effectiveUser, pw, isAdminPage })
      if (res.success && res.storeName && res.userName) {
        setAuth({
          store: res.storeName,
          user: res.userName,
          role: res.role || "",
          token: res.token,
        })
        router.replace(redirectTo)
      } else {
        const apiMsg = res.message || ""
        if (isLoginCheckBackendFailureMessage(apiMsg)) {
          setError(pickLoginStr(tMsg, "msg_login_network_error"))
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
        setError(pickLoginStr(tMsg, "msg_login_network_error"))
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
      const res = await changePassword({ store, name: user, oldPw: pwOld, newPw: pwNew })
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

  /**
   * 이전 로그인 스냅샷이 있으면 항상 오프라인 진입 허용.
   * (navigator.onLine === true 인데 서버/DB만 죽은 경우 캐시로 목록이 채워지면 loadError가 없어
   * 예전에는 버튼이 아예 안 보였음.)
   */
  const canEnterOffline = Boolean(resumeAuth)

  const isOfficeStore = (s: string) => {
    const x = String(s || "").trim()
    return x === "본사" || x === "오피스" || x === "본점" || x.toLowerCase().includes("office")
  }
  const stores = Object.keys(loginData).sort((a, b) => {
    if (isOfficeStore(a) && !isOfficeStore(b)) return -1
    if (!isOfficeStore(a) && isOfficeStore(b)) return 1
    return a.localeCompare(b)
  })
  const users = store ? (loginData[store] || []) : []
  const noStores = !loading && stores.length === 0
  /**
   * 이전 세션 복구 배너: 오프라인이거나 서버에서 매장 목록을 못 받았을 때만 표시.
   * (예전에는 resumeAuth만 있으면 온라인+정상일 때도 Wi‑Fi/서버 문구가 항상 떠서 혼란스러움)
   */
  const serverListDegraded = Boolean(loadError) || noStores
  const showResumeBanner = Boolean(resumeAuth) && (!browserOnline || serverListDegraded)

  const labels = {
    ko: {
      selectStore: "매장 선택",
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
      offlineRequiresPreviousLogin: "이 기기에서 이전에 로그인한 적이 있어야 오프라인으로 들어갈 수 있습니다.",
      enterOfflineMode: "오프라인 모드로 들어가기",
      retry: "다시 시도",
      refresh: "새로고침",
      connectingToServer: "서버에 연결 중...",
      manualEntryHint: "매장 목록을 불러올 수 없습니다. 아래에 직접 입력 후 비밀번호를 넣고 로그인을 시도하세요. (서버 복구 시 로그인됩니다)",
      manualStorePlaceholder: "매장명 직접 입력",
      manualUserPlaceholder: "이름 직접 입력",
    },
    en: {
      selectStore: "Select Store",
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
      offlineRequiresPreviousLogin: "You must have logged in on this device before to enter offline.",
      enterOfflineMode: "Enter offline mode",
      retry: "Retry",
      refresh: "Refresh",
      connectingToServer: "Connecting to server...",
      manualEntryHint: "Store list could not be loaded. Enter store and name below, then try login. (Login will work when server is back.)",
      manualStorePlaceholder: "Enter store name",
      manualUserPlaceholder: "Enter your name",
    },
    th: {
      selectStore: "เลือกสาขา",
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
      offlineRequiresPreviousLogin: "ต้องเคยเข้าสู่ระบบบนอุปกรณ์นี้ก่อนจึงจะเข้าโหมดออฟไลน์ได้",
      enterOfflineMode: "เข้าโหมดออฟไลน์",
      retry: "ลองอีกครั้ง",
      refresh: "รีเฟรช",
      connectingToServer: "กำลังเชื่อมต่อเซิร์ฟเวอร์...",
      manualEntryHint: "โหลดรายการสาขาไม่ได้ กรุณาพิมพ์สาขาและชื่อด้านล่าง แล้วลองเข้าสู่ระบบ (จะเข้าได้เมื่อเซิร์ฟเวอร์กลับมา)",
      manualStorePlaceholder: "พิมพ์ชื่อสาขา",
      manualUserPlaceholder: "พิมพ์ชื่อของคุณ",
    },
    mm: {
      selectStore: "ဆိုင်ရွေးပါ",
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
      offlineRequiresPreviousLogin: "အော့ဖ်လိုင်းဝင်ရန် ဤစက်တွင် ယခင်က ဝင်ထားရမည်။",
      enterOfflineMode: "အော့ဖ်လိုင်းမုဒ်သို့ ဝင်မည်",
      retry: "ပြန်ကြိုးစားမည်",
      refresh: "ပြန်စမည်",
      connectingToServer: "ဆာဗာနှင့် ချိတ်ဆက်နေသည်...",
      manualEntryHint: "ဆိုင်စာရင်း မရနိုင်ပါ။ အောက်တွင် ဆိုင်နှင့် အမည် ရိုက်ထည့်ပြီး ဝင်ကြိုးစားပါ။ (ဆာဗာ ပြန်ကောင်းလျှင် ဝင်မည်)",
      manualStorePlaceholder: "ဆိုင်အမည် ရိုက်ထည့်ပါ",
      manualUserPlaceholder: "အမည် ရိုက်ထည့်ပါ",
    },
    la: {
      selectStore: "ເລືອກສາຂາ",
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
      offlineRequiresPreviousLogin: "ຕ້ອງເຄີຍເຂົ້າສູ່ລະບົບໃນອຸປະກອນນີ້ກ່ອນ ຈຶ່ງເຂົ້າໂອບຟ໌ລາຍໄດ້.",
      enterOfflineMode: "ເຂົ້າໂອບຟ໌ລາຍ",
      retry: "ລອງໃໝ່",
      refresh: "ໂຫຼດໃໝ່",
      connectingToServer: "ກຳລັງເຊື່ອມຕໍ່ເຊີບເວີ...",
      manualEntryHint: "โຫຼດລາຍການສາຂາບໍ່ໄດ້ ກະລຸນາພິມສາຂາແລະຊື່ດ້ານລຸ່ມ ແລ້ວລອງເຂົ້າສູ່ລະບົບ (ຈະເຂົ້າໄດ້ເມື່ອເຊີບເວີກັບມາ)",
      manualStorePlaceholder: "ພິມຊື່ສາຂາ",
      manualUserPlaceholder: "ພິມຊື່ຂອງທ່ານ",
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
              src="/img/logo.png"
              alt="Choongman Chicken"
              className="logo"
              width={120}
              height={120}
              priority
              unoptimized
            />
            <p className="erp-text">CM ERP SYSTEM</p>
          </div>

          {showResumeBanner && (
            <div className="mb-4 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-3 text-sm text-emerald-100">
              <p className="mb-2 leading-snug">
                {!browserOnline
                  ? pickLoginStr(tMsg, "msg_login_offline_banner_hint")
                  : pickLoginStr(tMsg, "msg_login_offline_banner_hint_online")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setAuth(resumeAuth)
                  router.replace(redirectTo)
                }}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {t.enterOfflineMode}
              </button>
            </div>
          )}

          {loading ? (
            <div className="login-loading py-6">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
              <p className="mt-4 text-center text-sm text-white/80">{t.connectingToServer}</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            <Select value={lang} onValueChange={handleLangChange}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                <SelectItem value="ko">🇰🇷 한국어</SelectItem>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="th">🇹🇭 ภาษาไทย</SelectItem>
                <SelectItem value="mm">🇲🇲 မြန်မာ</SelectItem>
                <SelectItem value="la">🇱🇦 ພາສາລາວ</SelectItem>
                <SelectItem value="kh">🇰🇭 ភាសាខ្មែរ</SelectItem>
                <SelectItem value="vi">🇻🇳 Tiếng Việt</SelectItem>
                <SelectItem value="ms">🇲🇾 Bahasa Melayu</SelectItem>
              </SelectContent>
            </Select>

            <Select value={store} onValueChange={handleStoreChange}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue placeholder={`${t.selectStore}...`} />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(noStores || loadError) && (
              <div className="-mt-2 mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                <span>{loadError === 'SERVER_ERROR' ? t.serverError : (loadError || tMsg("msg_no_stores_env"))}</span>
                {!resumeAuth && (noStores || loadError) && (
                  <span className="text-xs text-amber-200/90">
                    {t.offlineRequiresPreviousLogin}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {canEnterOffline && (
                    <button
                      type="button"
                      onClick={() => {
                        if (resumeAuth) {
                          setAuth(resumeAuth)
                          router.replace(redirectTo)
                        }
                      }}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      {t.enterOfflineMode}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchLoginData()}
                    className="rounded-md bg-amber-500/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500/50"
                  >
                    {t.retry}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-md bg-amber-500/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500/50"
                  >
                    {t.refresh}
                  </button>
                </div>
              </div>
            )}

            {(loadError || noStores) && (
              <div className="-mt-1 mb-3 flex flex-col gap-2 text-sm">
                <span className="text-amber-200/90">{t.manualEntryHint}</span>
                <input
                  type="text"
                  value={manualStore}
                  onChange={(e) => setManualStore(e.target.value)}
                  placeholder={t.manualStorePlaceholder}
                  className="login-input-field"
                  autoComplete="off"
                  aria-label={t.manualStorePlaceholder}
                />
                <input
                  type="text"
                  value={manualUser}
                  onChange={(e) => setManualUser(e.target.value)}
                  placeholder={t.manualUserPlaceholder}
                  className="login-input-field"
                  autoComplete="off"
                  aria-label={t.manualUserPlaceholder}
                />
              </div>
            )}

            <Select value={user} onValueChange={setUser} disabled={!store && !manualStore}>
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

            {error && (
              <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <p className="leading-snug">{error}</p>
                {errorIsConnectivity && typeof window !== "undefined" && (
                  <div className="mt-3 border-t border-red-500/25 pt-3">
                    {(() => {
                      const snap = loadOfflineResumeAuth()
                      if (snap) {
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setAuth(snap)
                              router.replace(redirectTo)
                            }}
                            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                          >
                            {t.enterOfflineMode}
                          </button>
                        )
                      }
                      return (
                        <p className="text-xs leading-snug text-amber-200/90">{t.offlineRequiresPreviousLogin}</p>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? t.loggingIn : t.login}
            </button>

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
