import type { Config } from "tailwindcss";

// "Transit signage" tokens. T line colors anchor the palette; signal amber is the one accent.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        line: {
          red: "#DA291C",
          orange: "#ED8B00",
          green: "#00843D",
          blue: "#003DA5",
          silver: "#7C878E",
        },
        signal: "#FFB81C", // highlights, "live", totals, active filters
        ink: "#000000", // signage bars, nav, primary text
        fog: "#CDD2D7", // fogged areas
        panel: "#F1F1EF", // soft cards
        muted: "#4A5158", // the lightest grey allowed for small text
        hairline: "#D9DCDF",
        navoff: "#A7ADB3", // inactive nav icon/text (on black only)
        dotoff: "#9AA0A6", // inactive station dot border
        rail: "#B9BEC3", // track between stops not reached yet
        boardline: "#2B3136", // dividers on the black arrival board
        rank: "#6B747B",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
        sheet: "24px",
      },
      boxShadow: {
        card: "0 10px 30px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.18)",
        soft: "0 4px 14px rgba(0,0,0,0.12)",
      },
      height: { nav: "60px" },
      spacing: { nav: "60px" },
    },
  },
  plugins: [],
};
export default config;
