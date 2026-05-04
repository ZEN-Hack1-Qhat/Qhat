import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F8F6F0",
        ink: "#1A1A1A",
        "ink-soft": "#5A5A5A",
        "ink-pale": "#A09C92",
        line: "#D8D5CD",
        gold: "#C9A548",
        "gold-soft": "#E8D89A",
        purple: "#7B5BAB",
        "emo-joy": "#C9A548",
        "emo-calm": "#5B8C7A",
        "emo-anxiety": "#C27878",
        "emo-confusion": "#7B5BAB",
      },
      fontFamily: {
        mincho: [
          "游明朝",
          "Yu Mincho",
          "Hiragino Mincho ProN",
          "serif",
        ],
        georgia: ["Georgia", "serif"],
        mono: ["Menlo", "monospace"],
      },
      keyframes: {
        bubble: {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.9)" },
          "20%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "80%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-4px) scale(0.95)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.05)" },
        },
        wobble: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(-2px, 1px)" },
          "50%": { transform: "translate(2px, -1px)" },
          "75%": { transform: "translate(-1px, -2px)" },
        },
      },
      animation: {
        bubble: "bubble 2s ease-out forwards",
        "pulse-gold": "pulse 1.2s ease-in-out infinite",
        wobble: "wobble 0.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
