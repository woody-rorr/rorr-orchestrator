import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./login.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0a0b",
          sidebar: "#131316",
          msg: "#16161a",
          input: "#15151a",
          logpanel: "#0d0d10",
          card: "#15151a",
        },
        border: {
          DEFAULT: "#222222",
          subtle: "#1c1c1f",
          input: "#2a2a30",
        },
        text: {
          DEFAULT: "#e6e6e6",
          muted: "#aaaaaa",
          dim: "#666666",
          dimmer: "#555555",
        },
        accent: {
          DEFAULT: "#4e8cff",
          hover: "#3a7ef0",
        },
        user: {
          bubble: "#2a4d8f",
        },
        tag: {
          frontend: "#3a5fb0",
          backend: "#6a4bb0",
          infra: "#2d7d6c",
          web: "#b07a3a",
        },
        success: "#56d364",
        warn: "#ffb454",
        danger: "#ff8a8a",
        toolcall: "#4e8cff",
        mcp: {
          icon: "#8aa4ff",
          iconbg: "#2a2f4a",
        },
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
        xl: "14px",
        "2xl": "16px",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
