/**
 * 루트 레이아웃 폰트 — 전부 next/font/local (패키지 내 woff2).
 * next/font/google 는 Google 이 확장자 없는 /l/font?kit= URL 을 주면
 * webpack 빌드가 TypeError (reading '1') 로 실패한다 (Next 16.1.x·#99114).
 * next/font 는 src 경로가 컴파일 타임 리터럴이어야 함(헬퍼 함수 반환값 불가).
 */
import localFont from "next/font/local"

export const inter = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
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
  src: [
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-thai-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-sans-thai",
  display: "swap",
  preload: false,
})

export const notoSansThai = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-noto-sans-thai",
  display: "swap",
  preload: false,
})

export const geistMono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/geist-mono/files/geist-mono-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
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
