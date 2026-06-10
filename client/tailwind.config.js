/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces (deep navy in dark mode, airy blue-greys in light mode)
        ink: {
          950: v('ink-950'), 900: v('ink-900'), 850: v('ink-850'),
          800: v('ink-800'), 700: v('ink-700'), 600: v('ink-600'), 500: v('ink-500'),
        },
        // Text
        mist: {
          100: v('mist-100'), 200: v('mist-200'), 300: v('mist-300'),
          400: v('mist-400'), 500: v('mist-500'),
        },
        // Primary accent — light blue / cyan
        gold: {
          300: v('acc-300'), 400: v('acc-400'), 500: v('acc-500'), 600: v('acc-600'),
        },
        accent: {
          400: v('acc2-400'), 500: v('acc2-500'), 600: v('acc2-600'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        glow: '0 0 24px rgb(var(--acc-500) / 0.25)',
      },
    },
  },
  plugins: [],
};
