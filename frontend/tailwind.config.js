/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: { 0: "#0f0f0e", 1: "#1a1a19", 2: "#242422", 3: "#2f2f2c" },
        line: "#383835",
        ink: { 1: "#f0efec", 2: "#c3c2b7", 3: "#8f8e86" },
        series: "#3987e5",
        // Filled controls: white text passes AA (5.4:1 / 6.6:1 on hover).
        action: { DEFAULT: "#256abf", hover: "#1c5cab" },
        // Status fills/icons (graphics, ≥3:1) and status TEXT steps (≥4.5:1 on their tints).
        status: { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b", unknown: "#8f8e86" },
        "status-text": { good: "#4cc24c", warning: "#fab219", critical: "#ef7b7b", unknown: "#c3c2b7" },
        // Crew identity in multi-astronaut trend charts (validated categorical slots 1–3, dark).
        crew: { 1: "#3987e5", 2: "#d95926", 3: "#199e70" },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
