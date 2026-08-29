/**
 * 브라우저 전용 — 잘 안 읽히는 장을 필요한 영역만 고배율로 다시 그려 판독한다.
 *
 * 왜 필요한가: 지면 전체를 2200px 로 그려서 읽으면 A4 기준 약 150DPI 다. 태국어 라벨은
 * 글자가 커서 읽히지만 7~8pt 로 찍힌 세금계산서 번호·금액은 글자 높이가 10px 안팎이라
 * Tesseract 가 통째로 흘린다. 실제로 35장 표본에서 번호의 절반, 금액의 3분의 1이
 * "판독 결과에 아예 없는" 상태였다.
 *
 * 그렇다고 전면을 600DPI 로 그릴 수는 없다. A4 600DPI 는 4960×7016 = 35MP 로 iOS 사파리의
 * 캔버스 한도를 넘는다. 그래서 머리말 좌·우, 꼬리말 세 영역만 따로 그린다(각 10MP 이하).
 *
 * 영역으로 자르면 라벨과 값이 갈라지는 장이 생기므로, 기존 전면 판독 결과와 **겹쳐서** 쓴다.
 * 표본에서 겹쳐 읽었을 때 공급가·부가세가 24/35 → 31/35 로 올랐다.
 */
import {
  renderTaxInvoiceRegion,
  type TaxInvoiceRegionRect,
} from './purchase-tax-invoice-pdf-client'
import type { TaxInvoiceOcrSession } from './purchase-tax-invoice-ocr-client'
import type { OcrLineBox, OcrPageLayout } from './purchase-tax-invoice-layout'

type PdfDocLike = Parameters<typeof renderTaxInvoiceRegion>[0]

/** 좌표를 모을 공통 기준 폭. 판독 배율이 달라도 레이아웃 모듈은 늘 이 폭을 본다. */
export const TAX_INV_LAYOUT_PAGE_WIDTH_PX = 2480

/** A4 폭 환산 600DPI. 스캔본 텍스트 마스크가 300DPI 라 2배로 그려야 획이 뭉치지 않는다. */
export const TAX_INV_HIRES_PAGE_WIDTH_PX = 4960

/**
 * 머리말은 좌·우로 나눈다 — 한 장에 담으면 캔버스가 15MP 를 넘고, 좌우 단이 붙어 있으면
 * PSM 6 이 줄을 잘못 묶는다. 경계는 겹쳐 두어 라벨과 값이 갈라지지 않게 한다.
 */
export type TaxInvoiceHiresRegionName = 'head-left' | 'head-right' | 'tail'

export const TAX_INV_HIRES_REGIONS: { name: TaxInvoiceHiresRegionName; rect: TaxInvoiceRegionRect }[] = [
  { name: 'head-left', rect: { x0: 0, y0: 0, x1: 0.58, y1: 0.42 } },
  { name: 'head-right', rect: { x0: 0.42, y0: 0, x1: 1, y1: 0.42 } },
  { name: 'tail', rect: { x0: 0.28, y0: 0.52, x1: 1, y1: 0.98 } },
]

/** 필요한 영역만 고른다. 이름이 비거나 모르면 세 영역 전부. */
export function selectTaxInvoiceHiresRegions(
  names?: readonly TaxInvoiceHiresRegionName[]
): typeof TAX_INV_HIRES_REGIONS {
  if (!names?.length) return TAX_INV_HIRES_REGIONS
  const want = new Set(names)
  const picked = TAX_INV_HIRES_REGIONS.filter((r) => want.has(r.name))
  return picked.length ? picked : TAX_INV_HIRES_REGIONS
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

/** 영역 판독 좌표(영역 픽셀) → 공통 페이지 좌표 */
function shiftLines(lines: OcrLineBox[], offsetX: number, offsetY: number, scale: number): OcrLineBox[] {
  const mx = (v: number) => Math.round((v + offsetX) * scale)
  const my = (v: number) => Math.round((v + offsetY) * scale)
  return lines.map((l) => ({
    ...l,
    x0: mx(l.x0),
    y0: my(l.y0),
    x1: mx(l.x1),
    y1: my(l.y1),
    words: l.words.map((w) => ({ ...w, x0: mx(w.x0), y0: my(w.y0), x1: mx(w.x1), y1: my(w.y1) })),
  }))
}

export type HiresLayoutResult = { layout: OcrPageLayout; text: string }

/**
 * 이미 그려 둔 지면 전체 캔버스를 좌표까지 받아 판독한다.
 *
 * 영역으로 자르면 라벨이 왼쪽 단, 값이 오른쪽 단으로 갈라지는 양식이 있어서
 * 전면 판독을 한 장 남겨 둔다. 여기서는 자동 단 나누기(PSM 3)가 낫다.
 */
export async function readTaxInvoicePageLayout(
  canvas: HTMLCanvasElement,
  session: TaxInvoiceOcrSession
): Promise<HiresLayoutResult> {
  const read = await session.recognizeBoxes(canvas, { psm: '3', enhance: true })
  const scale = TAX_INV_LAYOUT_PAGE_WIDTH_PX / Math.max(1, canvas.width)
  return {
    layout: {
      width: TAX_INV_LAYOUT_PAGE_WIDTH_PX,
      height: Math.round(canvas.height * scale),
      lines: shiftLines(read.lines, 0, 0, scale),
    },
    text: read.text,
  }
}

/** PDF 한 장을 영역별 고배율로 판독해 하나의 지면 좌표계로 합친다. */
export async function readTaxInvoicePageHires(
  pdf: PdfDocLike,
  pageNumber: number,
  session: TaxInvoiceOcrSession,
  opts?: { signal?: AbortSignal; pageWidthPx?: number; regionNames?: readonly TaxInvoiceHiresRegionName[] }
): Promise<HiresLayoutResult> {
  const targetWidth = opts?.pageWidthPx || TAX_INV_HIRES_PAGE_WIDTH_PX
  const lines: OcrLineBox[] = []
  const texts: string[] = []
  let height = 0
  for (const region of selectTaxInvoiceHiresRegions(opts?.regionNames)) {
    if (opts?.signal?.aborted) break
    const rendered = await renderTaxInvoiceRegion(pdf, pageNumber, region.rect, targetWidth)
    try {
      const scale = TAX_INV_LAYOUT_PAGE_WIDTH_PX / Math.max(1, rendered.pageWidth)
      height = Math.round(rendered.pageHeight * scale)
      const read = await session.recognizeBoxes(rendered.canvas)
      if (read.text) texts.push(read.text)
      lines.push(...shiftLines(read.lines, rendered.offsetX, rendered.offsetY, scale))
    } finally {
      releaseCanvas(rendered.canvas)
    }
  }
  lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  return {
    layout: { width: TAX_INV_LAYOUT_PAGE_WIDTH_PX, height, lines },
    text: texts.join('\n'),
  }
}

/**
 * 여러 판독을 한 지면에 겹친다. 기준 폭이 다르면 첫 판독에 맞춘다.
 * 겹치는 값은 지우지 않는다 — 같은 번호가 두 번 잡히는 것 자체가 "진짜"라는 근거가 된다.
 */
export function mergeTaxInvoiceLayouts(parts: OcrPageLayout[]): OcrPageLayout | undefined {
  const usable = parts.filter((p) => p.lines.length > 0)
  if (!usable.length) return undefined
  const base = usable[0]
  const lines = usable.flatMap((p, i) => {
    const k = base.width / Math.max(1, p.width)
    if (i === 0 || Math.abs(k - 1) < 0.001) return p.lines
    const s = (v: number) => Math.round(v * k)
    return p.lines.map((l) => ({
      ...l,
      x0: s(l.x0),
      y0: s(l.y0),
      x1: s(l.x1),
      y1: s(l.y1),
      words: l.words.map((w) => ({ ...w, x0: s(w.x0), y0: s(w.y0), x1: s(w.x1), y1: s(w.y1) })),
    }))
  })
  lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  return { width: base.width, height: Math.max(...usable.map((p) => p.height)), lines }
}
