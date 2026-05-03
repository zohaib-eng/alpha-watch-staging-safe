import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alphawatch.app',
  appName: 'Alpha Watch',
  webDir: '../web/out',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true,
    backgroundColor: '#020617'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500
    }
  }
};

export default config;
