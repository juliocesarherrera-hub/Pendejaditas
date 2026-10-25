/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: '#121212',
        brand: '#FF6B00',
        secure: '#00C853'
      }
    },
  },
  plugins: [],
}