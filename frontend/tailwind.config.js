/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        signal: {
          red: "#ef4444",
          yellow: "#eab308",
          green: "#22c55e",
        },
      },
    },
  },
  plugins: [],
};
