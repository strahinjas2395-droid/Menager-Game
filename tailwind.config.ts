import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1A1A2E",
        card: "#16213E",
        gold: "#F0A500",
        goldsoft: "#c98d06",
        pitch: "#2E7D32",
        panel: "#0F172A",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      keyframes: {
        fadein: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slidein: {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        fadein: "fadein 0.5s ease-out both",
        slidein: "slidein 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
