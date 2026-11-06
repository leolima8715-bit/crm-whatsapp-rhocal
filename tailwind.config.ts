import type { Config } from "tailwindcss";

const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        app: c("app"),
        panel: { DEFAULT: c("panel"), hover: c("panel-hover") },
        "panel-hover": c("panel-hover"),
        chat: c("chat"),
        "bubble-in": c("bubble-in"),
        "bubble-out": c("bubble-out"),
        "bubble-text": c("bubble-text"),
        subtle: c("border"),
        primary: c("text"),
        secondary: c("text-secondary"),
        accent: { DEFAULT: c("accent"), hover: c("accent-hover"), text: c("accent-text") },
        "on-accent": c("on-accent"),
        danger: c("danger"),
        warn: c("warn"),
        read: c("read"),
        "system-pill": c("system-pill"),
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        mono: ['"Segoe UI"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
