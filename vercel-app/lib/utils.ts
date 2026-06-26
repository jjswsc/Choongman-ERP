import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** HTML에 삽입할 문자열 이스케이프 (XSS 방지). innerHTML/문자열 템플릿에 사용 */
export function escapeHtml(s: string | null | undefined): string {
  const str = String(s ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** ERP 입고·원가 — 소수 셋째 자리 반올림 */
export function roundErp3(value: number): number {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 1000) / 1000
}

/** DB·입력란용 — 소수 셋째 자리 반올림 후 불필요한 trailing 0 제거 */
export function formatErpCostInputString(n: number | string | null | undefined): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n ?? '').replace(/,/g, ''))
  if (!Number.isFinite(num)) return ''
  const r = roundErp3(num)
  if (Math.abs(r) < 1e-12) return ''
  return r.toFixed(3).replace(/\.?0+$/, '')
}

/** ERP 금액·단가 표시 — 소수점 셋째자리까지 (불필요한 0은 생략) */
export function formatErpNum(n: number | null | undefined): string {
  const v = roundErp3(Number(n ?? 0))
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

/** ERP 단가 입력 — 숫자·소수점만, 소수 셋째 자리까지 */
export function normalizeErpDecimalInput(raw: string): string {
  const cleaned = String(raw || '').replace(/,/g, '').replace(/[^\d.]/g, '')
  if (cleaned === '') return ''
  const firstDot = cleaned.indexOf('.')
  let intRaw: string
  let fracRaw: string
  if (firstDot === -1) {
    intRaw = cleaned
    fracRaw = ''
  } else {
    intRaw = cleaned.slice(0, firstDot)
    fracRaw = cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  fracRaw = fracRaw.slice(0, 3)
  const endsWithDot = cleaned.endsWith('.') && fracRaw === '' && cleaned.includes('.')
  if (intRaw === '' && fracRaw === '') return endsWithDot ? '0.' : ''
  if (intRaw === '' && fracRaw !== '') return `0.${fracRaw}`
  if (fracRaw !== '') return `${intRaw}.${fracRaw}`
  if (endsWithDot) return `${intRaw}.`
  return intRaw
}

/** POS/주문 등에서 사용할 금액 포맷 - 소수점 둘째자리까지 표시 (모바일과 통일) */
export function formatBahtNum(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return '0.00'
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** POS 더치페이 등 좁은 영역: 바트 정수(반올림)·천 단위 구분만 (계산은 내부 소수 유지) */
export function formatBahtWhole(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return '0'
  return Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/** 수량 표시: 정수 수량이면 `.00` 생략 */
export function formatPosQtyCompact(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return '0'
  const r = Math.round(v * 100) / 100
  if (Math.abs(r - Math.round(r)) < 0.001) return String(Math.round(r))
  return r.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** 직원 닉네임/역할 표시 시 "(Part-Time)"을 "(P/T)"로 줄여서 표시 */
export function displayLabelShort(val: string | null | undefined): string {
  const s = String(val ?? '').trim()
  if (!s) return s
  if (s === 'Part-Time') return 'P/T'
  return s.replace(/\s*\(Part-Time\)\s*/gi, ' (P/T)')
}

/** 모바일 사진 업로드 전 압축 (base64 크기 제한 회피). 일부 기기에서 무한 로딩 방지를 위해 단계별 timeout 적용 */
export function compressImageForUpload(file: File, maxWidth = 1024, quality = 0.65): Promise<string> {
  const timeoutMs = 12000
  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
      promise
        .then((v) => {
          clearTimeout(timer)
          resolve(v)
        })
        .catch((e) => {
          clearTimeout(timer)
          reject(e)
        })
    })

  const drawCompressed = (source: CanvasImageSource, width: number, height: number): string => {
    const canvas = document.createElement('canvas')
    let w = width
    let h = height
    if (w > maxWidth || h > maxWidth) {
      if (w > h) {
        h = Math.round((h * maxWidth) / w)
        w = maxWidth
      } else {
        w = Math.round((w * maxWidth) / h)
        h = maxWidth
      }
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(source, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  }

  const tryCompressByImageTag = (): Promise<string> =>
    withTimeout(
      new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          try {
            const dataUrl = drawCompressed(img, img.width, img.height)
            resolve(dataUrl)
          } catch (e) {
            reject(e)
          } finally {
            URL.revokeObjectURL(url)
          }
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('Image load failed'))
        }
        img.src = url
      }),
      timeoutMs,
      'image-compress'
    )

  const tryCompressByBitmap = async (): Promise<string> => {
    if (typeof createImageBitmap !== 'function') {
      throw new Error('createImageBitmap not supported')
    }
    const bmp = await withTimeout(createImageBitmap(file), timeoutMs, 'bitmap-decode')
    try {
      return drawCompressed(bmp, bmp.width, bmp.height)
    } finally {
      try {
        bmp.close()
      } catch {
        // ignore
      }
    }
  }

  const fallbackReadAsDataUrl = (): Promise<string> => {
    if (file.size > 5 * 1024 * 1024) {
      return Promise.reject(new Error('Image too large (max 5MB for fallback)'))
    }
    return withTimeout(
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          if (typeof result === 'string' && result.startsWith('data:')) resolve(result)
          else reject(new Error('FileReader failed'))
        }
        reader.onerror = () => reject(new Error('FileReader error'))
        reader.readAsDataURL(file)
      }),
      timeoutMs,
      'file-reader'
    )
  }

  return tryCompressByImageTag()
    .catch(() => tryCompressByBitmap())
    .catch(() => fallbackReadAsDataUrl())
}
