import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#6d28d9", dark: "#5b21b6", light: "#ede9fe" },
      },
    },
  },
  plugins: [],
};
export default config;
