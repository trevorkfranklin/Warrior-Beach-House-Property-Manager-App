/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          700: '#1a2942',
          800: '#12203a',
          900: '#0a1628',
        },
      },
    },
  },
  plugins: [],
};
