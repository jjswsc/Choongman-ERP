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
        <div className="absolute inset-0 bg-gradient-to-b from-[#faf7f2]/55 via-[#faf7f2]/72 to-[#f3ebe0]/88" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(212,175,55,0.18),transparent_42%)]" />
      </>
    )
  }

  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-[#faf7f2]/35 via-[#faf7f2]/55 to-[#f3ebe0]/82" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_18%,rgba(212,175,55,0.1),transparent_55%)]" />
    </>
  )
}

function AppCleanBackground({ lounge: _lounge }: { lounge: string }) {
  return (
    <>
      <div className="absolute inset-0 bg-[#f6f3ee]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-[radial-gradient(ellipse_90%_60%_at_50%_0%,rgba(212,175,55,0.08),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#faf8f4] via-[#f6f3ee] to-[#f1ece3]" />
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

  // 앱(로그인 후) 화면.
  // - 관리자가 「접속 후 배경」을 비워 두면 참고 시안처럼 깨끗한 라이트 배경(기본).
  // - 이미지를 올리면 그 배경을 쓰되, 콘텐츠 가독성을 위해 밝은 막을 덧씌운다.
  if (variant === "app") {
    if (!customFull) {
      return (
        <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}>
          <AppCleanBackground lounge={lounge} />
        </div>
      )
    }
    return (
      <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}>
        <div
          key={customFull}
          className="absolute inset-0 scale-105"
          style={{
            backgroundImage: `url("${customFull.replace(/"/g, '\\"')}")`,
            ...MEMBER_PORTAL_BG_STYLE,
          }}
        />
        {/* 사진 위에 밝은 막 — 참고 시안 톤을 유지하면서 본문 가독성 확보 */}
        <div className="absolute inset-0 bg-[#f6f3ee]/78" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#faf8f4]/85 via-[#f6f3ee]/72 to-[#f1ece3]/90" />
      </div>
    )
  }

  if (customFull) {
    return (
      <div className={`pointer-events-none absolute inset-0 z-0 ${className}`}>
        <div
          key={customFull}
          className="absolute inset-0 scale-105"
          style={{
            backgroundImage: `url("${customFull.replace(/"/g, '\\"')}")`,
            ...MEMBER_PORTAL_BG_STYLE,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#faf7f2]/10 via-transparent to-[#f3ebe0]/20" />
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

      <div className="absolute inset-x-0 top-[42%] h-32 bg-gradient-to-b from-transparent via-[#faf7f2]/28 to-[#f3ebe0]/62" />

      <AmbienceOverlays variant={variant} />
    </div>
  )
}

export { DEFAULT_MEMBER_LOUNGE_BG, DEFAULT_MEMBER_HERO_FOOD }
