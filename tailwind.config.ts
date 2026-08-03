import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Paleta de marca FARO aprobada
        "faro-navy": "#1a2744",
        "faro-blue": "#3b82f6",
        "faro-cream": "#f5f0e8",
      },
    },
  },
  plugins: [],
};
export default config;
