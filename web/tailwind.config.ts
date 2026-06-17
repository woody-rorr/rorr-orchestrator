import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./login.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        "accent-ui": {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
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
        DEFAULT: "calc(var(--radius))",
        sm: "calc(var(--radius) - 2px)",
        md: "calc(var(--radius))",
        lg: "calc(var(--radius) + 4px)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
