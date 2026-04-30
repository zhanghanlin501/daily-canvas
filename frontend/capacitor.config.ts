import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dailycanvas.app',
  appName: 'Daily Canvas',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
