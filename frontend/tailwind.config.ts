import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#09090b",
          900: "#111114",
          850: "#17171b",
          800: "#1e1e23",
          700: "#2a2a31",
        },
      },
    },
  },
  plugins: [],
};

export default config;
