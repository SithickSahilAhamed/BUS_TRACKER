import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.edu.act.togo',
  appName: 'ACT To Go',
  webDir: 'dist',
  android: {
    // Prevents background-geolocation updates from halting after 5 minutes —
    // see https://github.com/capacitor-community/background-geolocation/issues/89
    useLegacyBridge: true,
  },
};

export default config;
