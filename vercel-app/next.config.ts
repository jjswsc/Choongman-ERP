import type { NextConfig } from "next";
import path from "path";
import { randomUUID } from "crypto";
import { RetryChunkLoadPlugin } from "webpack-retry-chunk-load-plugin";
import withSerwistInit from "@serwist/next";

const vercelAppDir = __dirname;

const revision =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.COMMIT_SHA?.trim() ||
  randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false,
  cacheOnNavigation: true,
  reloadOnOnline: true,
  swUrl: "/sw.js",
  scope: "/",
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  additionalPrecacheEntries: [
    { url: "/login", revision },
    { url: "/admin/login", revision },
    { url: "/pos", revision },
    /** POS PWA start_url·오프라인 폴백 — 없으면 /pos/login 요청이 캐시에 없어 빈 화면 */
    { url: "/pos/login", revision },
  ],
});

const nextConfig: NextConfig = {
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
        })
      );
    }
    return config;
  },
};

export default withSerwist(nextConfig);
