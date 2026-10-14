/**
 * 래스터 인쇄 모드(print.rasterEscPos): Chromium GDI 출력을 못 찍는 드라이버(백지만 나옴)용.
 * Android 앱(CmThermalPrinterPlugin)과 동일 — 80mm × 8dots/mm 로 그린 뒤 왼쪽 2mm부터 72mm(576 dots)를 GS v 0 로 RAW 전송.
 */
const RASTER_PAGE_DOTS = 640;
const RASTER_LEFT_OFFSET_DOTS = 16;
const RASTER_PRINT_DOTS = 576;
const RASTER_BAND_ROWS = 128;
const RASTER_LUMA_THRESHOLD = 160;
/** GPU 캡처 한도(16384px)·고DPI 배율 여유 */
const RASTER_MAX_PAGE_DIP = 8000;
const PAPER_80MM_CSS_PX = (80 * 96) / 25.4;

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.trunc(Number(ms) || 0))));
}

/** @returns {Buffer|null} null 이면 검은 점이 없음 */
function buildEscPosRasterBytes(bgra, width, height, cut) {
  const left = Math.min(RASTER_LEFT_OFFSET_DOTS, Math.max(0, width - 8));
  const cropW = Math.max(8, Math.min(RASTER_PRINT_DOTS, width - left));
  const bytesPerRow = Math.ceil(cropW / 8);
  const rows = [];
  let lastInkRow = -1;
  for (let y = 0; y < height; y++) {
    const packed = Buffer.alloc(bytesPerRow);
    let ink = false;
    const rowBase = y * width * 4;
    for (let x = 0; x < cropW; x++) {
      const i = rowBase + (left + x) * 4;
      if (bgra[i + 3] < 128) continue;
      const luma = (bgra[i + 2] * 299 + bgra[i + 1] * 587 + bgra[i] * 114) / 1000;
      if (luma < RASTER_LUMA_THRESHOLD) {
        packed[x >> 3] |= 0x80 >> (x & 7);
        ink = true;
      }
    }
    rows.push(packed);
    if (ink) lastInkRow = y;
  }
  if (lastInkRow < 0) return null;
  const printRows = lastInkRow + 1;
  const parts = [Buffer.from([0x1b, 0x40])];
  for (let y0 = 0; y0 < printRows; y0 += RASTER_BAND_ROWS) {
    const band = Math.min(RASTER_BAND_ROWS, printRows - y0);
    parts.push(
      Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, band & 0xff, (band >> 8) & 0xff])
    );
    for (let y = y0; y < y0 + band; y++) parts.push(rows[y]);
  }
  /** 절단: ESC J 24(3mm) + GS V 66 0 / 미절단: ESC d 5 */
  parts.push(cut ? Buffer.from([0x1b, 0x4a, 24, 0x1d, 0x56, 0x42, 0x00]) : Buffer.from([0x1b, 0x64, 5]));
  return Buffer.concat(parts);
}

/**
 * 로드·안정화가 끝난 숨김 인쇄 창을 80mm 래스터로 캡처한다.
 * webContents.setZoomFactor 는 호스트(file://) 단위로 남아 다음 무인쇄 레이아웃을 깨므로 CSS zoom 만 쓴다.
 * @param {import("electron").BrowserWindow} win
 * @param {boolean} cut
 */
async function renderHiddenWindowToEscPosRaster(win, cut) {
  const wc = win.webContents;
  win.setContentSize(Math.round(PAPER_80MM_CSS_PX), 50);
  const cssHeight = Number(
    await wc.executeJavaScript(
      "new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const b=document.body,d=document.documentElement;resolve(Math.ceil(Math.max(b?b.scrollHeight:0,d?d.scrollHeight:0)));})))",
      true
    )
  );
  if (!Number.isFinite(cssHeight) || cssHeight <= 0) return { ok: false, reason: "render_empty" };
  const zoom = RASTER_PAGE_DOTS / PAPER_80MM_CSS_PX;
  const heightDip = Math.max(1, Math.min(RASTER_MAX_PAGE_DIP, Math.ceil(cssHeight * zoom)));
  win.setContentSize(RASTER_PAGE_DOTS, heightDip);
  await wc.executeJavaScript(
    `new Promise((resolve)=>{const d=document.documentElement;d.style.zoom='${zoom}';d.style.background='#fff';if(document.body)document.body.style.background='#fff';requestAnimationFrame(()=>requestAnimationFrame(resolve));})`,
    true
  );
  await delayMs(120);
  let image = await wc.capturePage({ x: 0, y: 0, width: RASTER_PAGE_DOTS, height: heightDip });
  if (!image || image.isEmpty()) return { ok: false, reason: "capture_empty" };
  if (image.getSize().width !== RASTER_PAGE_DOTS) {
    image = image.resize({ width: RASTER_PAGE_DOTS, quality: "best" });
  }
  const { width, height } = image.getSize();
  const data = buildEscPosRasterBytes(image.toBitmap(), width, height, cut);
  if (!data) return { ok: false, reason: "render_blank" };
  return { ok: true, data };
}

module.exports = {
  buildEscPosRasterBytes,
  renderHiddenWindowToEscPosRaster,
};
