import {
  DELIVERY_APP_BRAND,
  DELIVERY_APP_SI_PATHS,
  type DeliveryAppBrandCode,
} from '@/lib/delivery-app-brand'

export type DeliveryAppLogoVariant = 'onDark' | 'onLight'

type DeliveryAppBrandLogoProps = {
  code: DeliveryAppBrandCode
  /** onDark: 흰 로고(그라데이션 버튼), onLight: 브랜드 컬러(밝은 배경) */
  variant?: DeliveryAppLogoVariant
  className?: string
  title?: string
}

function resolveFill(code: DeliveryAppBrandCode, variant: DeliveryAppLogoVariant): string {
  const brand = DELIVERY_APP_BRAND[code]
  return variant === 'onDark' ? brand.onDarkFill : brand.onLightFill
}

/** LINE MAN 수평 워드마크 — LINE CREATIVE 가이드(수평 우선)에 맞춘 단순화 */
function LineManWordmark({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 20"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-hidden
    >
      <text
        x="0"
        y="15.5"
        fill={fill}
        fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontWeight="800"
        fontSize="14.5"
        letterSpacing="-0.2"
      >
        LINE MAN
      </text>
    </svg>
  )
}

export function DeliveryAppBrandLogo({
  code,
  variant = 'onDark',
  className = 'h-8 w-auto',
  title,
}: DeliveryAppBrandLogoProps) {
  const fill = resolveFill(code, variant)
  const label = title ?? DELIVERY_APP_BRAND[code].label

  if (code === 'lineman') {
    return <LineManWordmark fill={fill} className={className} />
  }

  const path = DELIVERY_APP_SI_PATHS[code]
  const defaultSize = code === 'grab' ? 'h-7 w-auto min-w-[4.5rem]' : 'h-8 w-8'

  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className || defaultSize}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path d={path} fill={fill} />
    </svg>
  )
}
