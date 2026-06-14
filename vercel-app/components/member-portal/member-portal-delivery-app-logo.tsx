import { DeliveryAppBrandLogo } from '@/components/shared/delivery-app-brand-logo'
import type { DeliveryAppBrandCode } from '@/lib/delivery-app-brand'

export function MemberPortalDeliveryAppLogo({
  code,
  className = 'h-8 w-auto shrink-0',
  variant = 'onDark',
}: {
  code: DeliveryAppBrandCode
  className?: string
  variant?: 'onDark' | 'onLight'
}) {
  return <DeliveryAppBrandLogo code={code} variant={variant} className={className} />
}
