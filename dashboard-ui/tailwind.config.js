/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./landing.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/landing/**/*.{js,jsx,ts,tsx,css}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f17",
        primary: { DEFAULT: "#6aa5ff", 600: "#5b8ef0", 700: "#4d7bd9" },
        accent: { DEFAULT: "#c084fc" }
      },
      boxShadow: { glow: "0 10px 30px rgba(0,0,0,.45)" },
      backgroundImage: {
        "radial-fade":
          "radial-gradient(1200px 800px at 10% -10%, rgba(106,165,255,.28), transparent 60%), radial-gradient(1200px 800px at 110% 10%, rgba(192,132,252,.28), transparent 60%)"
      },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        fadeIn: { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        pulseSoft: { "0%,100%": { opacity: .7 }, "50%": { opacity: 1 } }
      },
      animation: { float: "float 7s ease-in-out infinite", "fade-in": "fadeIn .8s ease-out both", "pulse-soft": "pulseSoft 2.8s ease-in-out infinite" }
    }
  },
  plugins: []
};
