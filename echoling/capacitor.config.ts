import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.echoling.roguetamer',
  appName: 'ECHOLING',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b0b1a',
    allowMixedContent: false,
  },
};

export default config;
