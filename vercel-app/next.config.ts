import type { NextConfig } from "next";
import path from "path";
import { RetryChunkLoadPlugin } from "webpack-retry-chunk-load-plugin";
import withSerwistInit from "@serwist/next";
import { PWA_SHELL_REVISION } from "./lib/pwa-shell-revision";

const vercelAppDir = __dirname;

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false,
  cacheOnNavigation: true,
  /**
   * 매장 Wi-Fi(AIS 등)가 잠깐 끊겼다 붙을 때마다 전체 새로고침되면
   * 홀 태블릿이 /pos/login 스피너에 다시 갇힌다. 배포 갱신은 SwAutoUpdate가 처리.
   */
  reloadOnOnline: false,
  swUrl: "/sw.js",
  scope: "/",
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  additionalPrecacheEntries: [
    { url: "/login", revision: PWA_SHELL_REVISION },
    { url: "/admin/login", revision: PWA_SHELL_REVISION },
    { url: "/pos", revision: PWA_SHELL_REVISION },
    /** POS PWA start_url·오프라인 폴백. 터미널 HTML은 프리캐시하지 않음(배포마다 전 단말 FDT). 오프라인은 /pos 폴백. */
    { url: "/pos/login", revision: PWA_SHELL_REVISION },
    { url: "/m", revision: PWA_SHELL_REVISION },
  ],
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'tesseract.js'],
  /**
   * Vercel Standard 빌드(8GB)에서 Next "Running TypeScript" 단계가 OOM(SIGKILL) 납니다.
   * Vercel에서는 타입체크를 건너뛰고, 로컬/`npx tsc`·GitHub Actions로 검증합니다.
   */
  typescript: {
    ignoreBuildErrors: process.env.VERCEL === "1",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/**" },
    ],
  },
  // API 요청 body 크기 제한 증가 (휴가 진단서/증빙 등 base64 이미지 업로드)
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    proxyClientMaxBodySize: "10mb",
  },
  // outputFileTracingRoot와 turbopack.root 동일하게 맞춤 (Vercel 빌드 경고 해결)
  outputFileTracingRoot: vercelAppDir,
  turbopack: {
    root: vercelAppDir,
  },
  // /app 접속 시 / 로 리다이렉트 (예전 문서의 모바일 앱 URL)
  // 구 FCM 전용 SW URL → Serwist 통합 sw.js
  async redirects() {
    return [
      { source: "/app", destination: "/", permanent: false },
      { source: "/firebase-messaging-sw.js", destination: "/sw.js", permanent: false },
    ];
  },
  /**
   * Grab Developer Portal의 Partner configuration UI가 종종
   * `/<grab-path>/menus`, `/<grab-path>/status` 형태를 기대하는데,
   * 우리 구현 라우트는 `pushGrabMenu`, `pushIntegrationStatus`로 열려 있다.
   * (외부 스펙/포털 입력을 맞추기 위한 얇은 alias)
   */
  async rewrites() {
    return [
      { source: "/api/webhooks/grab/menus", destination: "/api/webhooks/grab/pushGrabMenu" },
      { source: "/api/webhooks/grab/status", destination: "/api/webhooks/grab/pushIntegrationStatus" },
    ];
  },
  // webpack(PostCSS 등) 모듈 해석을 vercel-app 기준으로 (상위 lockfile로 인한 충돌 방지)
  webpack: (config, { isServer, webpack }) => {
    config.context = vercelAppDir;
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(vercelAppDir, "node_modules"),
      "node_modules",
    ];
    // firebase 해석 오류 방지 (모노레포/루트 실행 시 node_modules 경로 이탈)
    config.resolve.alias = {
      ...config.resolve.alias,
      firebase: path.resolve(vercelAppDir, "node_modules", "firebase"),
    };
    // self is not defined 오류 방지 (interception-route-rewrite-manifest 등)
    if (isServer && webpack) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.DefinePlugin({
          self: "globalThis",
        })
      );
    }
    // ChunkLoadError 재시도 (모바일·느린 네트워크에서 layout 청크 로딩 실패 방지)
    if (!isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new RetryChunkLoadPlugin({
          maxRetries: 3,
          retryDelay: 2000,
          cacheBust: `function() { return Date.now(); }`,
          lastResortScript: `
            try {
              if (!sessionStorage.getItem("cm-erp-chunk-recovery")) {
                sessionStorage.setItem("cm-erp-chunk-recovery", String(Date.now()));
                var finish = function () { location.reload(); };
                var jobs = [];
                if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                  jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
                    return Promise.all(rs.map(function (r) { return r.unregister(); }));
                  }));
                }
                if (self.caches && caches.keys) {
                  jobs.push(caches.keys().then(function (keys) {
                    return Promise.all(keys.filter(function (k) {
                      k = String(k).toLowerCase();
                      return k.indexOf("next-static") >= 0 || k.indexOf("serwist") >= 0 || k.indexOf("workbox") >= 0;
                    }).map(function (k) { return caches.delete(k); }));
                  }));
                }
                Promise.all(jobs).then(finish, finish);
              }
            } catch (e) {
              location.reload();
            }
          `,
        })
      );
    }
    return config;
  },
};

export default withSerwist(nextConfig);
