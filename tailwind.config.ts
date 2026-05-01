import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        brand: {
          orange: "#ff6b35",
          "orange-light": "#ff8555",
          bg: "#0a0a0f",
          surface: "#0d0d17",
          border: "#1e1e2e",
          muted: "#4a4a5a",
          text: "#e8e6e0",
          dim: "#a8a59e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
