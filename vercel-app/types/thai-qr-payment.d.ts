declare module 'thai-qr-payment' {
  export type QrMatrix = {
    size: number
    modules: boolean[][]
  }

  export function encodeQR(
    payload: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }
  ): QrMatrix

  export function renderCard(
    matrix: QrMatrix,
    options?: {
      theme?: 'color' | 'silhouette'
      merchantName?: string
      amountLabel?: string
    }
  ): string
}
