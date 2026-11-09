/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: "#090d16",
          panel: "#111827",
          border: "#1f2937",
          accent: "#10b981",
          amber: "#f59e0b",
          danger: "#ef4444",
          sky: "#38bdf8",
        },
      },
    },
  },
  plugins: [],
};
