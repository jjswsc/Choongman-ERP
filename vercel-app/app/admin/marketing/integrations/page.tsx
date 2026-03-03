"use client"

import * as React from "react"
import { Settings2, MessageCircle, Facebook, Music2, ExternalLink } from "lucide-react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Button } from "@/components/ui/button"

export default function MarketingIntegrationsPage() {
  const t = useT(useLang().lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Settings2 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold">
            {t("adminMarketingIntegrations") || "마케팅 연동"}
          </h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("adminMarketingIntegrationsDesc") || "LINE OA, Meta(IG/FB), TikTok 등 외부 API 연동을 위한 설정입니다. API 키·채널 정보는 .env에 설정한 뒤 서버를 재시작하세요."}
        </p>

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
              <li>• LINE_OA_CHANNEL_SECRET, LINE_OA_ACCESS_TOKEN</li>
              <li>• Webhook URL 등록 필요 (예: /api/lineWebhook)</li>
            </ul>
            <Button variant="outline" size="sm" asChild>
              <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                LINE Developers Console
              </a>
            </Button>
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
      </div>
    </div>
  )
}
