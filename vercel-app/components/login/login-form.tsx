"use client"
import { appAlert } from "@/lib/app-message"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
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
import { useAuth, loadOfflineResumeAuth } from "@/lib/auth-context"
import { isLangCode, useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"

/** i18n 키 누락·손상 시 영어 (번들 문자열은 네트워크 없이 동작 — 이 폴백은 이중 안전장치) */
const LOGIN_I18N_FALLBACK_EN: Record<string, string> = {
  msg_login_network_error:
    "Cannot connect to the network. You may be offline or the server may be unreachable.",
  msg_login_offline_connect_detail:
    "If this browser has no saved prior session (or site data was cleared), you cannot sign in with PIN while offline. Connect to the internet and sign in once. Wi‑Fi can look connected even when the server is unreachable.",
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
  /** URL ?msg= 등으로 전달된 안내 (예: 관리자 권한 없음) */
  initialNoticeKey?: string
}

export function LoginForm({ redirectTo, isAdminPage, initialNoticeKey }: LoginFormProps) {
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
  const [browserOnline, setBrowserOnline] = useState(true)
  const initialNoticeShownRef = useRef(false)

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

  /** 매 렌더마다 읽음 — Wi‑Fi ON + 캐시 목록이 있을 때도 스냅샷이 있으면 폼 위 배너·에러 시 CTA에 반영 */
  const offlineResume = loadOfflineResumeAuth()

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
    if (auth || !initialNoticeKey || initialNoticeShownRef.current) return
    initialNoticeShownRef.current = true
    setError(tMsg(initialNoticeKey))
    setErrorIsConnectivity(false)
  }, [auth, initialNoticeKey, tMsg])

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
    const effectiveStore = store.trim()
    const effectiveUser = user.trim()
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
  const serverListDegraded = Boolean(loadError) || noStores
  const listLoadedOk = !loading && stores.length > 0
  /**
   * 전용「오프라인 모드로 들어가기」전체 화면: 스냅샷 있고, 브라우저가 오프라인이며, 매장 목록도 못 받은 경우.
   * (일부 환경에서 navigator.onLine 이 거짓 false → 목록은 실제로 받아졌으면 폼을 보여 줌)
   */
  const offlineOnlyScreen = Boolean(offlineResume) && !browserOnline && !listLoadedOk
  /** 온라인 + 매장 목록 정상이면 일반 로그인만 — 스냅샷이 있어도「오프라인으로」배너 숨김 */
  const showOfflineResumeBanner =
    Boolean(offlineResume) &&
    !offlineOnlyScreen &&
    (!browserOnline || serverListDegraded) &&
    !listLoadedOk

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
      enterOfflineMode: "오프라인 모드로 들어가기",
      retry: "다시 시도",
      refresh: "새로고침",
      connectingToServer: "서버에 연결 중...",
      offlineResumeStore: "매장",
      offlineResumeStaff: "담당자",
      offlineResumeSyncNote:
        "아래로 들어가면 이 매장·담당자로 세션이 복구됩니다. 인터넷이 돌아온 뒤 서버에 주문을 올릴 때도 같은 담당자 이름으로 남습니다.",
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
      enterOfflineMode: "Enter offline mode",
      retry: "Retry",
      refresh: "Refresh",
      connectingToServer: "Connecting to server...",
      offlineResumeStore: "Store",
      offlineResumeStaff: "Staff",
      offlineResumeSyncNote:
        "Continuing restores this account. When back online, new orders saved to the server will be recorded under this staff name.",
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
      enterOfflineMode: "เข้าโหมดออฟไลน์",
      retry: "ลองอีกครั้ง",
      refresh: "รีเฟรช",
      connectingToServer: "กำลังเชื่อมต่อเซิร์ฟเวอร์...",
      offlineResumeStore: "สาขา",
      offlineResumeStaff: "พนักงาน",
      offlineResumeSyncNote:
        "ดำเนินการต่อเพื่อกู้บัญชีนี้ เมื่อออนไลน์อีกครั้ง คำสั่งซื้อใหม่จะบันทึกชื่อพนักงานนี้",
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
      enterOfflineMode: "အော့ဖ်လိုင်းမုဒ်သို့ ဝင်မည်",
      retry: "ပြန်ကြိုးစားမည်",
      refresh: "ပြန်စမည်",
      connectingToServer: "ဆာဗာနှင့် ချိတ်ဆက်နေသည်...",
      offlineResumeStore: "ဆိုင်",
      offlineResumeStaff: "တာဝန်ခံ",
      offlineResumeSyncNote:
        "ဆက်လုပ်ပါက ဤအကောင့်ကို ပြန်ဖော်ပါမည်။ အွန်လိုင်န်ပြန်ရောက်သောအခါ အမှာစသစ်များတွင် ဤအမည်ဖြင့် မှတ်တမ်းတင်ပါမည်။",
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
      enterOfflineMode: "ເຂົ້າໂອບຟ໌ລາຍ",
      retry: "ລອງໃໝ່",
      refresh: "ໂຫຼດໃໝ່",
      connectingToServer: "ກຳລັງເຊື່ອມຕໍ່ເຊີບເວີ...",
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

          {loading ? (
            <div className="login-loading py-6">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
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
                    setAuth(offlineResume)
                    router.replace(redirectTo)
                  }
                }}
                className="w-full rounded-md bg-emerald-600 px-3 py-3 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {t.enterOfflineMode}
              </button>
            </div>
          ) : (!browserOnline || serverListDegraded) && !offlineResume ? (
            <div className="flex flex-wrap justify-center gap-2 py-8">
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
          ) : (
          <form onSubmit={handleSubmit}>
            {showOfflineResumeBanner && offlineResume ? (
              <div className="mb-3 rounded-lg border border-emerald-500/45 bg-emerald-950/35 px-3 py-3 text-center">
                <p className="text-xs leading-relaxed text-emerald-100/95">
                  {pickLoginStr(
                    tMsg,
                    browserOnline ? "msg_login_offline_banner_hint_online" : "msg_login_offline_banner_hint"
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
                    setAuth(offlineResume)
                    router.replace(redirectTo)
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
                    setAuth(offlineResume)
                    router.replace(redirectTo)
                  }}
                  className="mb-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  {t.enterOfflineMode}
                </button>
              ) : errorIsConnectivity ? (
                <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
                  <p className="font-medium">{t.serverError}</p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-100/90">
                    {pickLoginStr(tMsg, "msg_login_offline_connect_detail")}
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
