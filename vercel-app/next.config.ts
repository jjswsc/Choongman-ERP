import type { NextConfig } from "next";
import path from "path";

const vercelAppDir = __dirname;

const nextConfig: NextConfig = {
  // vercel-app을 프로젝트 루트로 고정 (상위 lockfile 충돌 방지)
  turbopack: {
    root: vercelAppDir,
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
