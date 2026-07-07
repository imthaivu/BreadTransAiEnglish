import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Milu Colors
        background: "#ffffff", // trắng nền chính
        foreground: "#424242", // xám đậm chữ chính
        muted: "#757575", // xám nhạt chữ phụ
        border: "#b3e5fc", // xanh nhạt viền/nền phụ

        primary: {
          DEFAULT: "#2aa7e2", // xanh Milu
          foreground: "#ffffff", // chữ trắng trên nền xanh
        },

        secondary: {
          DEFAULT: "#f9d71c", // vàng chuông
          foreground: "#0f172a",
        },

        accent: {
          DEFAULT: "#e53935", // đỏ cổ áo
          foreground: "#ffffff",
        },
        "spin-wheel-blue": "#a0d8f1",
        "spin-wheel-orange": "#ff9800",
        "spin-panel-bg": "#f9f9f9",
      },
      spacing: {
        "120": "30rem", // 480px
        "112.5": "28.125rem", // 450px
      },
      boxShadow: {
        "spin-wheel": "0 5px 20px rgba(0,0,0,0.2)",
        "spin-panel": "0 4px 10px rgba(0,0,0,0.1)",
      },
      textShadow: {
        "spin-title": "2px 2px 5px #fff",
      },
    },
  },
  plugins: [
    forms,
    plugin(function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          "text-shadow": (value) => ({
            textShadow: value,
          }),
        },
        { values: theme("textShadow") }
      );
    }),
  ],
};
export default config;
