/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080b',
          900: '#0b0d12',
          850: '#10131a',
          800: '#151923',
          700: '#1d2330',
          600: '#2a3242',
          500: '#3d4759',
        },
        mist: {
          100: '#f2f4f8',
          200: '#dfe4ec',
          300: '#b9c1cf',
          400: '#8b95a8',
          500: '#646e82',
        },
        gold: {
          300: '#e8c882',
          400: '#d9b15e',
          500: '#c79a3f',
          600: '#a87f2c',
        },
        accent: {
          400: '#6ea8ff',
          500: '#4d8dff',
          600: '#3a72db',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)',
        lift: '0 1px 0 rgba(255,255,255,0.06) inset, 0 16px 40px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};
