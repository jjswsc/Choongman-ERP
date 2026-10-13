package com.choongman.erp.pos;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;

import java.io.ByteArrayOutputStream;

/** 렌더된 영수증 비트맵 → ESC/POS 래스터(GS v 0) 바이트. */
final class EscPosRaster {
    /** 일부 열전사 프린터는 GS v 0 한 번에 큰 블록을 받으면 버퍼가 넘친다. */
    private static final int BAND_ROWS = 128;
    private static final int LUMA_THRESHOLD = 160;

    static final byte[] DRAWER_KICK = new byte[] { 0x1B, 0x70, 0x00, 0x19, (byte) 0xFA };

    private EscPosRaster() {}

    /**
     * 80mm 기준으로 그린 페이지에서 헤드가 찍을 수 있는 폭만 잘라내고, 프린터 폭(dots)에 맞춘다.
     * 80mm 프린터: crop 576 → 576 (1:1). 58mm 프린터: crop 576 → 384 (축소).
     */
    static Bitmap fitToPrintHead(Bitmap page, int leftOffsetDots, int cropWidthDots, int printWidthDots) {
        int left = Math.max(0, Math.min(leftOffsetDots, Math.max(0, page.getWidth() - 1)));
        int cropW = Math.max(8, Math.min(cropWidthDots, page.getWidth() - left));
        int outW = Math.max(8, printWidthDots);
        float scale = outW / (float) cropW;
        int outH = Math.max(1, Math.round(page.getHeight() * scale));
        Bitmap out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        c.drawColor(Color.WHITE);
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG);
        c.drawBitmap(page, new Rect(left, 0, left + cropW, page.getHeight()), new Rect(0, 0, outW, outH), p);
        return out;
    }

    /** @return null 이면 인쇄할 내용(검은 점)이 없음 */
    static byte[] build(Bitmap bmp, boolean cut, boolean kickDrawer) {
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        int bytesPerRow = (w + 7) / 8;
        byte[][] rows = new byte[h][];
        int[] line = new int[w];
        int lastInkRow = -1;
        for (int y = 0; y < h; y++) {
            bmp.getPixels(line, 0, w, 0, y, w, 1);
            byte[] packed = new byte[bytesPerRow];
            boolean ink = false;
            for (int x = 0; x < w; x++) {
                int px = line[x];
                if (Color.alpha(px) < 128) continue;
                int luma = (Color.red(px) * 299 + Color.green(px) * 587 + Color.blue(px) * 114) / 1000;
                if (luma < LUMA_THRESHOLD) {
                    packed[x >> 3] |= (byte) (0x80 >> (x & 7));
                    ink = true;
                }
            }
            rows[y] = packed;
            if (ink) lastInkRow = y;
        }
        if (lastInkRow < 0) return null;

        int printRows = lastInkRow + 1;
        ByteArrayOutputStream out = new ByteArrayOutputStream(printRows * bytesPerRow + 64);
        out.write(0x1B);
        out.write(0x40);
        for (int y0 = 0; y0 < printRows; y0 += BAND_ROWS) {
            int band = Math.min(BAND_ROWS, printRows - y0);
            out.write(0x1D);
            out.write(0x76);
            out.write(0x30);
            out.write(0x00);
            out.write(bytesPerRow & 0xFF);
            out.write((bytesPerRow >> 8) & 0xFF);
            out.write(band & 0xFF);
            out.write((band >> 8) & 0xFF);
            for (int y = y0; y < y0 + band; y++) {
                out.write(rows[y], 0, bytesPerRow);
            }
        }
        if (cut) {
            // ESC J 24: 3mm 여유 후 GS V 66 0: 절단 위치까지 급지 + 부분 절단
            out.write(0x1B);
            out.write(0x4A);
            out.write(24);
            out.write(0x1D);
            out.write(0x56);
            out.write(0x42);
            out.write(0x00);
        } else {
            out.write(0x1B);
            out.write(0x64);
            out.write(5);
        }
        if (kickDrawer) {
            out.write(DRAWER_KICK, 0, DRAWER_KICK.length);
        }
        return out.toByteArray();
    }
}
