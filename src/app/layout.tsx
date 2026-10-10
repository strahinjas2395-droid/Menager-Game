import type { Metadata, Viewport } from "next";
import NativeAppShell from "@/components/NativeAppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Manager Continental",
  description: "Build your football dynasty — a full manager game in the browser",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1A1A2E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-navy text-white antialiased">
        <NativeAppShell />
        {children}
      </body>
    </html>
  );
}
