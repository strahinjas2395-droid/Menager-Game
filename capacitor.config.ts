import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.footballmanagercontinental.game",
  appName: "Football Manager Continental",
  webDir: "out",
  backgroundColor: "#1A1A2E",
  loggingBehavior: "debug",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#1A1A2E",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#1A1A2E",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#1A1A2E",
    },
  },
};

export default config;
