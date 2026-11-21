import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // T line colors are the palette anchors. Use for lines, quests, progress.
        line: {
          red: "#DA291C",
          orange: "#ED8B00",
          green: "#00843D",
          blue: "#003DA5",
          silver: "#7C878E",
        },
        fog: "#C9CED3",
        ink: "#14181C",
        paper: "#F6F4EF",
      },
    },
  },
  plugins: [],
};
export default config;
