import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#1a1a1a",
          elevated: "#242424",
          muted: "#2d2d2d",
        },
        border: {
          DEFAULT: "#333",
          muted: "#404040",
        },
        accent: {
          DEFAULT: "#6366f1",
          muted: "#818cf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
