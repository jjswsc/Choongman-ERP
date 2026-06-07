"use client"

import {
  DEFAULT_MEMBER_HERO_FOOD,
  DEFAULT_MEMBER_LOUNGE_BG,
  isMemberPortalIsolatedPlateHero,
  MEMBER_PORTAL_BG_STYLE,
  MEMBER_PORTAL_FOOD_ON_TABLE,
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

function AmbienceOverlays({ variant }: { variant: "login" | "app" }) {
  if (variant === "login") {
    return (
      <>
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/48 via-[#08080a]/68 to-[#08080a]/84" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(212,175,55,0.14),transparent_42%)]" />
      </>
    )
  }

  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/38 via-[#08080a]/58 to-[#050506]/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_18%,rgba(212,175,55,0.14),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(239,35,60,0.06),transparent_50%)]" />
    </>
  )
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
  const isolatedPlate = isMemberPortalIsolatedPlateHero(hero)

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
            <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/68 to-[#050506]/92" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(212,175,55,0.1),transparent_55%)]" />
          </>
        )}
      </div>
    )
  }

  if (variant === "app") {
    return (
      <div className={`pointer-events-none absolute inset-0 z-0 ${className}`}>
        <div className="absolute inset-0 bg-[#08080a]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#121218] via-[#08080a] to-[#050506]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,rgba(212,175,55,0.07),transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_100%,rgba(239,35,60,0.04),transparent_55%)]" />
        <AmbienceOverlays variant={variant} />
      </div>
    )
  }

  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}>
      {/* 로그인 — 식당 인테리어 + 히어로 음식 합성 */}
      <div
        className="absolute inset-0 scale-[1.02]"
        style={{
          backgroundImage: `url(${lounge})`,
          backgroundSize: "100% 200%",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div
        className="absolute inset-0"
        style={{ perspective: `${MEMBER_PORTAL_FOOD_ON_TABLE.perspectivePx}px` }}
      >
        <div
          className="absolute left-1/2 z-[1]"
          style={{
            top: MEMBER_PORTAL_FOOD_ON_TABLE.top,
            width: MEMBER_PORTAL_FOOD_ON_TABLE.width,
            transform: `translateX(-50%) rotateX(${MEMBER_PORTAL_FOOD_ON_TABLE.rotateXDeg}deg)`,
            transformOrigin: "center bottom",
          }}
        >
          <div className="relative">
            <div
              className="absolute -bottom-1 left-1/2 z-0 h-5 w-[78%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md"
              aria-hidden
            />
            <img
              src={hero}
              alt=""
              draggable={false}
              className={`relative z-[1] w-full select-none object-contain ${
                isolatedPlate ? "mix-blend-multiply" : "drop-shadow-[0_18px_28px_rgba(0,0,0,0.42)]"
              }`}
              style={
                isolatedPlate
                  ? { filter: "contrast(1.06) saturate(1.1)" }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 top-[42%] h-32 bg-gradient-to-b from-transparent via-[#08080a]/20 to-[#08080a]/55" />

      <AmbienceOverlays variant={variant} />
    </div>
  )
}

export { DEFAULT_MEMBER_LOUNGE_BG, DEFAULT_MEMBER_HERO_FOOD }
