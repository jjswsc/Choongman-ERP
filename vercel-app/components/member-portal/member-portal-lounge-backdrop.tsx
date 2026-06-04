"use client"

import {
  DEFAULT_MEMBER_HERO_FOOD,
  DEFAULT_MEMBER_LOUNGE_BG,
  MEMBER_PORTAL_BG_STYLE,
  resolveMemberPortalHeroFoodUrl,
  resolveMemberPortalLoungeBackgroundUrl,
} from "@/lib/member-portal-design"

type MemberPortalLoungeBackdropProps = {
  /** CRM에서 전체 배경 URL을 지정한 경우 — 레이어 합성 대신 단일 이미지 */
  customFullBackgroundUrl?: string
  /** 상단 히어로 음식(POS SNOW ONION 등). 비어 있으면 기본 폴백 */
  heroFoodImageUrl?: string
  /** 로그인 화면은 기존처럼 조금 더 어두운 오버레이 */
  variant?: "login" | "app"
  className?: string
}

export function MemberPortalLoungeBackdrop({
  customFullBackgroundUrl = "",
  heroFoodImageUrl = "",
  variant = "app",
  className = "",
}: MemberPortalLoungeBackdropProps) {
  const customFull = String(customFullBackgroundUrl || "").trim()
  const lounge = resolveMemberPortalLoungeBackgroundUrl("")
  const hero = resolveMemberPortalHeroFoodUrl(heroFoodImageUrl)
  const heroFocusY = /pos-menu-images/i.test(hero) ? '62%' : 'center'

  if (customFull) {
    return (
      <div className={`pointer-events-none absolute inset-0 z-0 ${className}`}>
        <div
          className="absolute inset-0 scale-105"
          style={{
            backgroundImage: `url(${customFull})`,
            ...MEMBER_PORTAL_BG_STYLE,
          }}
        />
        {variant === "login" ? (
          <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/62 via-[#08080a]/74 to-[#08080a]/82" />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/42 via-[#08080a]/60 to-[#050506]/88" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(212,175,55,0.16),transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(239,35,60,0.06),transparent_50%)]" />
          </>
        )}
      </div>
    )
  }

  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}>
      {/* 하단: 기존 합성 배경의 식당 인테리어(아래 절반) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${lounge})`,
          backgroundSize: "100% 200%",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* 상단: POS 스노우 어니언 — 기존 치킨 히어로 자리 */}
      <div
        className="absolute inset-x-0 top-0 h-[min(52vh,440px)]"
        style={{
          backgroundImage: `url(${hero})`,
          backgroundSize: "cover",
          backgroundPosition: `center ${heroFocusY}`,
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* 히어로 ↔ 라운지 자연스러운 블렌드 */}
      <div className="absolute inset-x-0 top-[36vh] h-28 bg-gradient-to-b from-transparent via-[#08080a]/35 to-[#08080a]/78" />
      {variant === "login" ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/48 via-[#08080a]/68 to-[#08080a]/84" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_42%)]" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/42 via-[#08080a]/60 to-[#050506]/88" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(212,175,55,0.16),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(239,35,60,0.06),transparent_50%)]" />
        </>
      )}
    </div>
  )
}

export { DEFAULT_MEMBER_LOUNGE_BG, DEFAULT_MEMBER_HERO_FOOD }
