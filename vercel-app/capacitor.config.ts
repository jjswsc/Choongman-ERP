/* eslint-disable @typescript-eslint/no-require-imports -- Node에서 단일 Origin 모듈 재사용 */
const { resolveDeployPublicOrigin } = require('./lib/deploy-public-origin.cjs') as {
  resolveDeployPublicOrigin: () => string
}

const origin = resolveDeployPublicOrigin()
/** 전체 URL을 직접 지정할 때만 사용. 미설정 시 DEPLOY_PUBLIC_ORIGIN 기준으로 /pos/login */
const remotePosUrl = process.env.CAPACITOR_POS_URL?.trim() || `${origin}/pos/login`

const config = {
  appId: 'com.choongman.erp.pos',
  appName: 'Choongman POS',
  webDir: '.next',
  bundledWebRuntime: false,
  server: {
    url: remotePosUrl,
    cleartext: remotePosUrl.startsWith('http://'),
    androidScheme: 'https',
    allowNavigation: ['*.supabase.co', '*.vercel.app', '*.omnifoodtech.com', 'omnifoodtech.com'],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
}

export default config
