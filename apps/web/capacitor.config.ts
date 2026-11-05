import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restaurantpos.app',
  appName: 'Restaurant POS',
  webDir: 'dist',
  // When running on device, point to your production API server
  // For local dev with Android emulator, use: http://10.0.2.2:4000
  server: {
    // androidScheme: 'https',  // uncomment for production
    // url: 'http://10.0.2.2:5173',  // uncomment for live reload during dev
    cleartext: true, // allow HTTP (required for local dev)
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#09090b', // matches the app dark background (zinc-950)
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#09090b',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    buildOptions: {
      signingType: 'apksigner',
    },
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;

