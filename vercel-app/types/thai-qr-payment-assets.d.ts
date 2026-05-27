declare module 'thai-qr-payment/assets' {
  export const COLOR_LOGOS: Record<string, string>
  export const SILHOUETTE_LOGOS: Record<string, string>
  export function colorLogo(name: string): string
  export function silhouetteLogo(name: string): string
}
