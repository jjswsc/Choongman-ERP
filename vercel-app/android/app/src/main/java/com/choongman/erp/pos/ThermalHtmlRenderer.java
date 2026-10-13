package com.choongman.erp.pos;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * 영수증·주방 HTML을 숨김 WebView로 그려 비트맵으로 만든다 (메인 스레드 전용).
 * 출력 비트맵 폭 = 용지 폭(mm) × 8 dots — 203dpi 열전사 헤드와 1:1.
 */
final class ThermalHtmlRenderer {
    static final int DOTS_PER_MM = 8;
    private static final int INITIAL_HEIGHT_PX = 16;
    private static final int MAX_PAGE_MM = 1000;
    private static final long LAYOUT_SETTLE_MS = 150;

    interface Callback {
        void onRendered(Bitmap page);

        void onError(String reason);
    }

    private ThermalHtmlRenderer() {}

    static void render(
        final Activity activity,
        final String html,
        final String baseUrl,
        final int paperWidthMm,
        final long settleMs,
        final long timeoutMs,
        final Callback callback
    ) {
        final Handler main = new Handler(Looper.getMainLooper());
        final float density = activity.getResources().getDisplayMetrics().density;
        final int cssWidth = Math.round(paperWidthMm * 96f / 25.4f);
        final int viewWidthPx = Math.max(1, Math.round(cssWidth * density));
        final int outWidth = paperWidthMm * DOTS_PER_MM;
        final int maxHeightPx = Math.round(MAX_PAGE_MM * 96f / 25.4f * density);

        final ViewGroup root = (ViewGroup) activity.getWindow().getDecorView();
        final WebView wv = new WebView(activity);
        final boolean[] done = new boolean[] { false };

        final Runnable cleanup = new Runnable() {
            @Override
            public void run() {
                try {
                    root.removeView(wv);
                } catch (Exception ignored) {
                    // ignore
                }
                try {
                    wv.destroy();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        };

        final Runnable timeout = new Runnable() {
            @Override
            public void run() {
                if (done[0]) return;
                done[0] = true;
                cleanup.run();
                callback.onError("render_timeout");
            }
        };

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setTextZoom(100);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setAllowFileAccess(false);
        s.setBlockNetworkImage(false);
        wv.setVerticalScrollBarEnabled(false);
        wv.setHorizontalScrollBarEnabled(false);
        wv.setBackgroundColor(Color.WHITE);
        wv.setFocusable(false);
        wv.setClickable(false);
        wv.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

        final FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(viewWidthPx, INITIAL_HEIGHT_PX);
        // index 0 = POS 화면 뒤. 화면 밖·투명 처리하면 Chromium이 그리기를 생략하는 기기가 있다.
        root.addView(wv, 0, lp);

        wv.setWebViewClient(new WebViewClient() {
            private boolean finished = false;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (finished || done[0]) return;
                finished = true;
                main.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        measureAndCapture();
                    }
                }, Math.max(0, settleMs));
            }

            private void measureAndCapture() {
                if (done[0]) return;
                wv.evaluateJavascript(
                    "(function(){var b=document.body,d=document.documentElement;"
                        + "return Math.max(b?b.scrollHeight:0,d?d.scrollHeight:0);})()",
                    value -> {
                        if (done[0]) return;
                        float cssHeight = 0f;
                        try {
                            cssHeight = Float.parseFloat(String.valueOf(value).replace("\"", ""));
                        } catch (NumberFormatException ignored) {
                            cssHeight = 0f;
                        }
                        if (cssHeight <= 0f) {
                            done[0] = true;
                            main.removeCallbacks(timeout);
                            cleanup.run();
                            callback.onError("render_empty");
                            return;
                        }
                        final int heightPx = Math.max(1, Math.min(maxHeightPx, Math.round(cssHeight * density)));
                        lp.height = heightPx;
                        wv.setLayoutParams(lp);
                        wv.requestLayout();
                        main.postDelayed(() -> capture(heightPx), LAYOUT_SETTLE_MS);
                    }
                );
            }

            private void capture(int heightPx) {
                if (done[0]) return;
                done[0] = true;
                main.removeCallbacks(timeout);
                try {
                    if (wv.getWidth() != viewWidthPx || wv.getHeight() != heightPx) {
                        wv.measure(
                            View.MeasureSpec.makeMeasureSpec(viewWidthPx, View.MeasureSpec.EXACTLY),
                            View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY)
                        );
                        wv.layout(0, 0, viewWidthPx, heightPx);
                    }
                    float scale = outWidth / (float) viewWidthPx;
                    int outHeight = Math.max(1, Math.round(heightPx * scale));
                    Bitmap bmp = Bitmap.createBitmap(outWidth, outHeight, Bitmap.Config.ARGB_8888);
                    Canvas c = new Canvas(bmp);
                    c.drawColor(Color.WHITE);
                    c.scale(scale, scale);
                    wv.draw(c);
                    cleanup.run();
                    callback.onRendered(bmp);
                } catch (Throwable e) {
                    cleanup.run();
                    callback.onError("render_failed:" + e.getClass().getSimpleName());
                }
            }
        });

        main.postDelayed(timeout, Math.max(3000, timeoutMs));
        wv.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null);
    }
}
