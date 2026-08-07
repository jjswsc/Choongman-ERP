"use client"

import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { BookOpen } from "lucide-react"

/** 입고 관련 모든 프로세스를 직원용 설명서 형태로 정리 (로그인 언어로 표시) */
export function InboundGuideContent() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="rounded-xl border bg-card p-6 max-w-3xl space-y-6 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">{t("inGuideTitle")}</h2>
      </div>
      <p className="text-muted-foreground">{t("inGuideIntro")}</p>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide1Title")}</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>{t("inGuide1_1")}</li>
          <li>{t("inGuide1_2")}</li>
          <li>{t("inGuide1_3")}</li>
          <li>{t("inGuide1_4")}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide2Title")}</h3>
        <div className="bg-muted/50 rounded-lg p-4 text-muted-foreground space-y-1">
          <p>{t("inGuide2_1")}</p>
          <p>{t("inGuide2_2")}</p>
          <p>{t("inGuide2_3")}</p>
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide3Title")}</h3>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>{t("inGuide3_1")}</li>
          <li>{t("inGuide3_2")}</li>
          <li>{t("inGuide3_3")}</li>
          <li>{t("inGuide3_4")}</li>
          <li>{t("inGuide3_5")}</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide4Title")}</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>{t("inGuide4_1")}</li>
          <li>{t("inGuide4_2")}</li>
          <li>{t("inGuide4_3")}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide5Title")}</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>{t("inGuide5_1")}</li>
          <li>{t("inGuide5_2")}</li>
          <li>{t("inGuide5_3")}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide6Title")}</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>{t("inGuide6_1")}</li>
          <li>{t("inGuide6_2")}</li>
          <li>{t("inGuide6_3")}</li>
          <li>{t("inGuide6_4")}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide7Title")}</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>{t("inGuide7_1")}</li>
          <li>{t("inGuide7_2")}</li>
          <li>{t("inGuide7_3")}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">{t("inGuide8Title")}</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>{t("inGuide8_1")}</li>
          <li>{t("inGuide8_2")}</li>
          <li>{t("inGuide8_3")}</li>
        </ul>
      </section>
    </div>
  )
}
