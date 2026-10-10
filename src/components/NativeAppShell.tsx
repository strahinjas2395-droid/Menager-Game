"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Native-only lifecycle and system-UI integration for the Android package. */
export default function NativeAppShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let backButtonHandle: PluginListenerHandle | undefined;

    void Promise.all([
      StatusBar.setOverlaysWebView({ overlay: false }),
      StatusBar.setStyle({ style: Style.Light }),
      StatusBar.setBackgroundColor({ color: "#1A1A2E" }),
      SplashScreen.hide(),
    ]).catch(() => undefined);

    void App.addListener("backButton", () => {
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      if (path !== "/") window.history.back();
      else void App.exitApp();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else backButtonHandle = handle;
    });

    return () => {
      disposed = true;
      if (backButtonHandle) void backButtonHandle.remove();
    };
  }, []);

  return null;
}
