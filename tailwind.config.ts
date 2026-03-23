import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#000000",
          accent: "#276EF1",
          success: "#05944F",
          warning: "#FFC043",
          error: "#E11900",
          surface: "#F6F6F6",
          "text-secondary": "#545454",
        },
      },
      fontFamily: {
        sans: ['"SF Pro Display"', '"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
