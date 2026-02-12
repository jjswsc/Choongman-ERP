import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // self is not defined 오류 방지 (interception-route-rewrite-manifest 등)
    if (isServer) {
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
