/**
 * 루트 레이아웃 폰트 — 전부 next/font/local (패키지 내 woff2).
 * next/font/google 는 Google 이 확장자 없는 /l/font?kit= URL 을 주면
 * webpack 빌드가 TypeError (reading '1') 로 실패한다 (Next 16.1.x·#99114).
 * 16.4.3+ 수정 전까지 로컬 폰트로 빌드 안정화.
 */
import localFont from "next/font/local"

const WEIGHTS = ["400", "500", "600", "700"] as const

function fontsourceLatin(
  pkg: string,
  filePrefix: string
): { path: string; weight: string; style: "normal" }[] {
  return WEIGHTS.map((weight) => ({
    path: `../node_modules/@fontsource/${pkg}/files/${filePrefix}-latin-${weight}-normal.woff2`,
    weight,
    style: "normal" as const,
  }))
}

function fontsourceLatinAndThai(
  pkg: string,
  filePrefix: string
): { path: string; weight: string; style: "normal" }[] {
  const out: { path: string; weight: string; style: "normal" }[] = []
  for (const weight of WEIGHTS) {
    out.push({
      path: `../node_modules/@fontsource/${pkg}/files/${filePrefix}-latin-${weight}-normal.woff2`,
      weight,
      style: "normal",
    })
    out.push({
      path: `../node_modules/@fontsource/${pkg}/files/${filePrefix}-thai-${weight}-normal.woff2`,
      weight,
      style: "normal",
    })
  }
  return out
}

export const inter = localFont({
  src: fontsourceLatin("inter", "inter"),
  variable: "--font-inter",
  display: "swap",
})

export const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  preload: true,
})

export const ibmPlexSansThai = localFont({
  src: fontsourceLatinAndThai("ibm-plex-sans-thai", "ibm-plex-sans-thai"),
  variable: "--font-ibm-plex-sans-thai",
  display: "swap",
  preload: false,
})

export const notoSansThai = localFont({
  src: fontsourceLatinAndThai("noto-sans-thai", "noto-sans-thai"),
  variable: "--font-noto-sans-thai",
  display: "swap",
  preload: false,
})

export const geistMono = localFont({
  src: fontsourceLatin("geist-mono", "geist-mono"),
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
})

export const orbitron = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/orbitron/files/orbitron-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/orbitron/files/orbitron-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/orbitron/files/orbitron-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/orbitron/files/orbitron-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-orbitron",
  display: "swap",
  preload: false,
})
