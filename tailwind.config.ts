import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tred: "#DA291C",
        torange: "#ED8B00",
        tblue: "#003DA5",
        tgreen: "#00843D",
        tsilver: "#7C878E",
        tmattapan: "#DA291C",
      },
    },
  },
  plugins: [],
};
export default config;
