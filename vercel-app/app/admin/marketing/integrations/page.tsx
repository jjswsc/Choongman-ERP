"use client"

import * as React from "react"
import { Settings2, MessageCircle, Facebook, Music2, ExternalLink, Loader2 } from "lucide-react"
import { useT, tr as i18nTr } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Button } from "@/components/ui/button"
import { getLineOaGroupV2List, getLineOaGroups, getLineOaSegments } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"

export default function MarketingIntegrationsPage() {
  const t = useT(useLang().lang)
  const [segmentLoading, setSegmentLoading] = React.useState(false)
  const [segmentPreview, setSegmentPreview] = React.useState<string | null>(null)
  const [groupLoading, setGroupLoading] = React.useState(false)
  const [groupPreview, setGroupPreview] = React.useState<string | null>(null)
  const [groupV2Loading, setGroupV2Loading] = React.useState(false)
  const [groupV2Preview, setGroupV2Preview] = React.useState<string | null>(null)

  const testSegmentList = async () => {
    setSegmentLoading(true)
    setSegmentPreview(null)
    try {
      const r = await getLineOaSegments({ page: 1, size: 50, sort: "id:asc" })
      if (!r.success) {
        await appAlert(r.message || t("adminMarketingLineOaSegmentApiFail"))
        setSegmentPreview(JSON.stringify(r, null, 2))
        return
      }
      setSegmentPreview(JSON.stringify(r, null, 2))
      await appAlert(
        typeof r.total === "number"
          ? i18nTr(t, "adminMarketingLineOaSegmentOkTotal", { total: r.total })
          : t("adminMarketingLineOaSegmentOkList")
      )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setSegmentLoading(false)
    }
  }

  const testGroupList = async () => {
    setGroupLoading(true)
    setGroupPreview(null)
    try {
      const r = await getLineOaGroups({ page: 1, size: 20, sort: "id:asc" })
      if (!r.success) {
        await appAlert(r.message || t("adminMarketingLineOaGroupApiFail"))
        setGroupPreview(JSON.stringify(r, null, 2))
        return
      }
      setGroupPreview(JSON.stringify(r, null, 2))
      await appAlert(
        typeof r.total === "number"
          ? i18nTr(t, "adminMarketingLineOaGroupOkTotal", { total: r.total })
          : t("adminMarketingLineOaGroupOkList")
      )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setGroupLoading(false)
    }
  }

  const testGroupV2List = async () => {
    setGroupV2Loading(true)
    setGroupV2Preview(null)
    try {
      const r = await getLineOaGroupV2List({ page: 1, size: 20, sort: "id:asc" })
      if (!r.success) {
        await appAlert(r.message || t("adminMarketingLineOaGroupV2ApiFail"))
        setGroupV2Preview(JSON.stringify(r, null, 2))
        return
      }
      setGroupV2Preview(JSON.stringify(r, null, 2))
      await appAlert(
        typeof r.total === "number"
          ? i18nTr(t, "adminMarketingLineOaGroupV2OkTotal", { total: r.total })
          : t("adminMarketingLineOaGroupV2OkList")
      )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setGroupV2Loading(false)
    }
  }

  return (
    <MarketingPageShell maxWidthClass="max-w-3xl">
        <MarketingPageHero icon={Settings2} title={t("adminMarketingIntegrations") || "마케팅 연동"} />

        <div className="space-y-4">
          {/* LINE OA */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00B900]/10">
                <MessageCircle className="h-5 w-5 text-[#00B900]" />
              </div>
              <div>
                <h3 className="font-semibold">LINE Official Account (OA)</h3>
                <p className="text-xs text-muted-foreground">
                  Messaging API, LIFF, Broadcast → 생일 쿠폰, 타겟 푸시, 회원 CRM
                </p>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 mb-3">
              <li>• 메시징: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN (기존 /api/line/webhook)</li>
              <li>
                • 회원 포털 LINE 로그인: LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET (미설정 시 LINE_CHANNEL_SECRET
                폴백). <strong className="text-foreground">Channel ID는 숫자만</strong> (예: 2004403638) — LINE Login
                채널 Basic settings 값. <strong className="text-destructive">U로 시작하는 사용자 ID는 사용 불가</strong>
              </li>
              <li>
                • LINE Developers → LINE Login 채널 → Callback URL에{' '}
                <code className="text-xs">/api/member-portal/auth/line/callback</code> 등록. Basic settings → Linked LINE
                Official Account에서 OA 연결 후 로그인 동의 화면에 친구 추가 옵션 표시
              </li>
              <li>
                • (선택) LINE_LOGIN_BOT_PROMPT — <code className="text-xs">normal</code>(기본, 동의 화면에 친구 추가
                체크) / <code className="text-xs">aggressive</code>(별도 친구 추가 화면) / <code className="text-xs">off</code>
              </li>
              <li>
                • OAPlus Public API: 베이스 <code className="text-xs">https://developers-oaplus.line.biz</code> —
                아래 URL env에 경로 포함. 키는 OAPlus 관리자 Settings → API keys에서 발급 →{' '}
                <code className="text-xs">X-API-KEY</code> 로 전송 (서버 프록시가 대신 붙임)
              </li>
              <li>
                • (선택) LINE_OAPLUS_USER_AGENT — 미설정 시 <code className="text-xs">CM-ERP OAPlus</code> (문서
                권장 예: 서비스명/회사명)
              </li>
              <li>
                • 기타 API 레이트 리밋(문서): 시간당 5,000 / 초당 500 — 초과 시 429
              </li>
              <li>
                • Segment API (X-API-KEY): LINE_OA_SEGMENT_LIST_URL — 문서의「세그먼트 목록 GET」전체 URL(쿼리
                제외)
              </li>
              <li>• LINE_OA_SEGMENT_X_API_KEY — 발급받은 X-API-KEY</li>
              <li>
                • (선택) LINE_OA_SEGMENT_DETAIL_URL — 세그먼트 상세 GET URL. 미설정 시 LIST URL 뒤에 /
                {'{segmentId}'} 자동 추가
              </li>
              <li>
                • LINE_OA_SEGMENT_CREATE_AUDIENCE_URL — OA Audience 생성 POST URL (권장: {'{segmentId}'} 포함)
              </li>
              <li>
                • LINE_OA_SEGMENT_CREATE_AUDIENCE_RESULT_URL — OA Audience 상태/이름 조회 GET URL (권장:
                {'{segmentId}'}, {'{id}'} 포함)
              </li>
              <li>
                • LINE_OA_SEGMENT_USER_LIST_CSV_URL — 세그먼트 사용자 CSV 생성 POST URL (권장: {'{segmentId}'} 포함).
                일부 세그먼트(전체 친구·캠페인 등)는 보내기 불가 → SGM.1.V.2.10 등
              </li>
              <li>
                • LINE_OA_SEGMENT_USER_LIST_EXPORT_STATUS_URL — CSV 보내기 상태·다운로드 URL GET (권장:
                {'{segmentId}'}, {'{id}'}). 완료 후 결과는 약 3일, 다운로드 URL은 응답 후 약 10분 유효
              </li>
              <li>
                • 쿼리 page·size는 정수, sort는 id|friendCount|updatedAt 과 asc|desc (예: id:asc) — 잘못 넣으면
                SGM.1.V.* 검증 오류
              </li>
              <li className="pt-2 font-medium text-foreground">Group API (Deprecated, /audience/v1/group/groups)</li>
              <li>
                • LINE_OA_GROUP_API_BASE_URL — 호스트 + /audience/v1/group/groups 까지 (끝 슬래시 없음)
              </li>
              <li>
                • LINE_OA_GROUP_X_API_KEY — 없으면 LINE_OA_SEGMENT_X_API_KEY와 동일 키 사용
              </li>
              <li>
                • 목록 sort: id, name, followerCount, updatedAt, source, validUntil + asc|desc (기본 size 20)
              </li>
              <li className="pt-2 font-medium text-foreground">Group API V2 (/audience/v2/group/groups)</li>
              <li>
                • LINE_OA_GROUP_V2_API_BASE_URL — …/audience/v2/group/groups 까지 (끝 슬래시 없음)
              </li>
              <li>
                • LINE_OA_GROUP_V2_X_API_KEY — 없으면 V1·Segment 키 순으로 대체
              </li>
              <li>
                • 목록 sort: id, name, friendCount, updatedAt, source, validUntil. 생성은 201, grouped-users CSV는
                202 후 …/grouped-users/{'{requestId}'}/result 로 상태·URL (결과 약 7일, URL 약 10분)
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={segmentLoading} onClick={testSegmentList}>
                {segmentLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                Segment 목록 테스트
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={groupLoading} onClick={testGroupList}>
                {groupLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                Group 목록 테스트
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={groupV2Loading} onClick={testGroupV2List}>
                {groupV2Loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                Group V2 목록 테스트
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  LINE Developers Console
                </a>
              </Button>
            </div>
            {segmentPreview ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {segmentPreview}
              </pre>
            ) : null}
            {groupPreview ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {groupPreview}
              </pre>
            ) : null}
            {groupV2Preview ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {groupV2Preview}
              </pre>
            ) : null}
          </div>

          {/* Meta (IG/FB) */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1877F2]/10">
                <Facebook className="h-5 w-5 text-[#1877F2]" />
              </div>
              <div>
                <h3 className="font-semibold">Meta Ads (Instagram / Facebook)</h3>
                <p className="text-xs text-muted-foreground">
                  Marketing API → Actual Spent, 도달, 클릭 자동 수집 (ROAS 시트 자동화)
                </p>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 mb-3">
              <li>• META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN</li>
              <li>• 광고 계정 ID 연동 필요</li>
            </ul>
            <Button variant="outline" size="sm" asChild>
              <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Meta for Developers
              </a>
            </Button>
          </div>

          {/* TikTok */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/10">
                <Music2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">TikTok Ads</h3>
                <p className="text-xs text-muted-foreground">
                  TikTok Marketing API → 실비·성과 자동 동기화
                </p>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 mb-3">
              <li>• TIKTOK_ACCESS_TOKEN, TIKTOK_ADS_ACCOUNT_ID</li>
              <li>• OAuth 인증 플로우 구현 필요</li>
            </ul>
            <Button variant="outline" size="sm" asChild>
              <a href="https://business-api.tiktok.com/portal/docs" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                TikTok for Business API
              </a>
            </Button>
          </div>
        </div>
    </MarketingPageShell>
  )
}
