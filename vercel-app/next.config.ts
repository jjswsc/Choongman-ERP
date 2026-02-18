import type { NextConfig } from "next";
import path from "path";

const vercelAppDir = __dirname;

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
  async redirects() {
    return [{ source: "/app", destination: "/", permanent: false }]
  },
  // webpack(PostCSS 등) 모듈 해석을 vercel-app 기준으로 (상위 lockfile로 인한 충돌 방지)
  webpack: (config, { isServer, webpack }) => {
    config.context = vercelAppDir;
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(vercelAppDir, "node_modules"),
      "node_modules",
    ];
    // self is not defined 오류 방지 (interception-route-rewrite-manifest 등)
    if (isServer && webpack) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.DefinePlugin({
          self: "globalThis",
        })
      );
    }
    return config;
  },
};

export default nextConfig;
