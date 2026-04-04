const remotePosUrl =
  process.env.CAPACITOR_POS_URL?.trim() || 'https://choongman-erp.vercel.app/pos/login'

const config = {
  appId: 'com.choongman.erp.pos',
  appName: 'Choongman POS',
  webDir: '.next',
  bundledWebRuntime: false,
  server: {
    url: remotePosUrl,
    cleartext: remotePosUrl.startsWith('http://'),
    androidScheme: 'https',
    allowNavigation: [
      '*.supabase.co',
      '*.vercel.app',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
}

export default config
