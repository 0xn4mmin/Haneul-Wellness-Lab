import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.haneulwellness.lab',
  appName: '하늘 웰니스 랩',
  // bundled mode: the built web app (dist/) ships inside the native package
  webDir: 'dist',
  // serve the bundle over https://localhost so it's a secure context
  // (Supabase auth, crypto, IndexedDB all require this)
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: { contentInset: 'always' },
  backgroundColor: '#060B17',
}

export default config
