import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Sepia / gold palette for the "in loving memory" framing.
        parchment: {
          50: "#fbf6ec",
          100: "#f4ebd8",
          200: "#e7d6b1",
          300: "#d4ba83",
          400: "#bd9a59",
          500: "#a17e3f",
          600: "#7e6230",
          700: "#5b4624",
          800: "#3a2c17",
          900: "#1f170c",
        },
        gold: {
          50: "#fdf7e2",
          100: "#faecb6",
          200: "#f4d97a",
          300: "#ecbf3b",
          400: "#d9a219",
          500: "#b58210",
          600: "#8d630c",
          700: "#65460a",
          800: "#3d2a06",
          900: "#1d1402",
        },
        ink: {
          DEFAULT: "#2a1f12",
          soft: "#5b4624",
          muted: "#7e6230",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(58,44,23,0.06), 0 8px 24px rgba(58,44,23,0.08)",
        ring: "0 0 0 1px rgba(161,126,63,0.25)",
      },
      borderRadius: {
        xl: "0.85rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "fade-in": "fadeIn 280ms ease-out both",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
