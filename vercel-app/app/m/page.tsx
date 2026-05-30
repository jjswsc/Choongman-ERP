"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

type PortalMember = {
  id: number
  memberNo: string
  name: string
  phone: string
  birthDate?: string
  gender?: string
  nationality?: string
  pointBalance?: number
  tierCode?: string
}

type PointRow = {
  id: number
  kind: string
  points: number
  note: string
  createdAt: string
}

type CouponRow = {
  id: number
  couponCode: string
  status: string
  issuedAt: string
}

type VisitRow = {
  orderId: number
  orderNo: string
  storeCode: string
  total: number
  visitedAt: string
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  return res.json() as Promise<T>
}

export default function MemberPortalPage() {
  const [member, setMember] = React.useState<PortalMember | null>(null)
  const [phone, setPhone] = React.useState("")
  const [otpCode, setOtpCode] = React.useState("")
  const [debugCode, setDebugCode] = React.useState("")
  const [step, setStep] = React.useState<"phone" | "otp" | "home">("phone")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [points, setPoints] = React.useState<PointRow[]>([])
  const [coupons, setCoupons] = React.useState<CouponRow[]>([])
  const [visits, setVisits] = React.useState<VisitRow[]>([])
  const [profile, setProfile] = React.useState({
    name: "",
    birthDate: "",
    gender: "",
    nationality: "",
    email: "",
    referralCode: "",
    consentMarketing: false,
  })

  const loadMe = React.useCallback(async () => {
    const me = await getJson<{ success: boolean; member?: PortalMember }>("/api/member-portal/me")
    if (!me.success || !me.member) return false
    setMember(me.member)
    setProfile((p) => ({
      ...p,
      name: me.member?.name || "",
      birthDate: me.member?.birthDate || "",
      gender: me.member?.gender || "",
      nationality: me.member?.nationality || "",
    }))
    const [pointsRes, couponsRes, visitsRes] = await Promise.all([
      getJson<{ success: boolean; rows?: PointRow[] }>("/api/member-portal/me/points"),
      getJson<{ success: boolean; rows?: CouponRow[] }>("/api/member-portal/me/coupons"),
      getJson<{ success: boolean; rows?: VisitRow[] }>("/api/member-portal/me/visits"),
    ])
    setPoints(pointsRes.rows || [])
    setCoupons(couponsRes.rows || [])
    setVisits(visitsRes.rows || [])
    setStep("home")
    return true
  }, [])

  React.useEffect(() => {
    loadMe().catch(() => {})
  }, [loadMe])

  const requestOtp = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string; debugCode?: string }>(
        "/api/member-portal/auth/request-otp",
        { phone }
      )
      if (!res.success) {
        setError(res.message || "인증번호 요청 실패")
        return
      }
      setDebugCode(res.debugCode || "")
      setStep("otp")
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string }>(
        "/api/member-portal/auth/verify-otp",
        { phone, otpCode, deviceLabel: "member-web" }
      )
      if (!res.success) {
        setError(res.message || "인증 실패")
        return
      }
      await loadMe()
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string; member?: PortalMember }>(
        "/api/member-portal/register",
        profile
      )
      if (!res.success) {
        setError(res.message || "저장 실패")
        return
      }
      if (res.member) setMember(res.member)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await postJson<{ success: boolean }>("/api/member-portal/auth/logout", {})
    setMember(null)
    setStep("phone")
    setPhone("")
    setOtpCode("")
    setPoints([])
    setCoupons([])
    setVisits([])
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">회원 전용 페이지</h1>
        <p className="text-sm text-muted-foreground">전화번호로 간편 로그인 후 포인트/쿠폰/방문 내역을 확인하세요.</p>
      </div>

      {!!error && <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {step === "phone" && (
        <Card>
          <CardHeader>
            <CardTitle>로그인</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>전화번호</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812345678" />
            <Button onClick={requestOtp} disabled={loading || !phone.trim()}>
              {loading ? "요청 중..." : "인증번호 받기"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "otp" && (
        <Card>
          <CardHeader>
            <CardTitle>인증번호 입력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>OTP 코드</Label>
            <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="6자리 코드" />
            {!!debugCode && (
              <p className="text-xs text-muted-foreground">
                개발 모드 코드: <span className="font-semibold">{debugCode}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("phone")}>이전</Button>
              <Button onClick={verifyOtp} disabled={loading || !otpCode.trim()}>
                {loading ? "확인 중..." : "로그인"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "home" && member && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>내 정보</CardTitle>
              <Button variant="outline" onClick={logout}>로그아웃</Button>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>이름</Label>
                <Input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>전화번호</Label>
                <Input value={member.phone || ""} disabled />
              </div>
              <div className="space-y-1">
                <Label>생년월일</Label>
                <Input type="date" value={profile.birthDate} onChange={(e) => setProfile((p) => ({ ...p, birthDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>성별</Label>
                <Input value={profile.gender} onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))} placeholder="남/여" />
              </div>
              <div className="space-y-1">
                <Label>국적</Label>
                <Input value={profile.nationality} onChange={(e) => setProfile((p) => ({ ...p, nationality: e.target.value }))} placeholder="TH / KR ..." />
              </div>
              <div className="space-y-1">
                <Label>이메일</Label>
                <Input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>추천인 코드(선택)</Label>
                <Input value={profile.referralCode} onChange={(e) => setProfile((p) => ({ ...p, referralCode: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={profile.consentMarketing}
                  onChange={(e) => setProfile((p) => ({ ...p, consentMarketing: e.target.checked }))}
                />
                마케팅 수신 동의
              </label>
              <div className="md:col-span-2">
                <Button onClick={saveProfile} disabled={loading}>
                  {loading ? "저장 중..." : "정보 저장"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">현재 포인트</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{Number(member.pointBalance || 0).toLocaleString()} P</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">회원 등급</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{member.tierCode || "BRONZE"}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">쿠폰 수</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{coupons.length}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">포인트 내역</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left">일시</th>
                      <th className="p-2 text-left">구분</th>
                      <th className="p-2 text-left">포인트</th>
                      <th className="p-2 text-left">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.createdAt}</td>
                        <td className="p-2">{r.kind}</td>
                        <td className="p-2">{r.points}</td>
                        <td className="p-2">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">쿠폰</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left">쿠폰코드</th>
                      <th className="p-2 text-left">상태</th>
                      <th className="p-2 text-left">발행일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.couponCode}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2">{r.issuedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">최근 방문/주문</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left">일시</th>
                      <th className="p-2 text-left">주문번호</th>
                      <th className="p-2 text-left">매장</th>
                      <th className="p-2 text-left">결제금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((r) => (
                      <tr key={r.orderId} className="border-t">
                        <td className="p-2">{r.visitedAt}</td>
                        <td className="p-2">{r.orderNo}</td>
                        <td className="p-2">{r.storeCode}</td>
                        <td className="p-2">{Number(r.total || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

