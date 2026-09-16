/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        md: '2rem',
        lg: '3rem',
      },
    },
    extend: {
      colors: {
        paper: {
          50: '#FBF7EE',
          100: '#F5EFE0',
          200: '#EDE3CC',
          300: '#E0D1B3',
          400: '#CBB993',
        },
        ochre: {
          50: '#F5EDE3',
          100: '#E9D7BE',
          200: '#D4B487',
          300: '#B8894F',
          400: '#A06932',
          500: '#8B5A2B',
          600: '#734823',
          700: '#5C3A1D',
        },
        moss: {
          50: '#EDF2EE',
          100: '#CFDBD3',
          200: '#A7BFAF',
          300: '#7DA08C',
          400: '#5A7D6A',
          500: '#3D5A4A',
          600: '#2F4639',
          700: '#23352B',
        },
        lavender: {
          300: '#B8A9C4',
          400: '#A794B4',
          500: '#9B8AA6',
          600: '#7D6E87',
        },
        brick: {
          400: '#B8623A',
          500: '#A0522D',
          600: '#844325',
        },
        ink: {
          700: '#4A3F33',
          800: '#3A2F25',
          900: '#2A2118',
        }
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Songti SC"', 'SimSun', 'serif'],
        sans: ['"PingFang SC"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        hand: ['"Ma Shan Zheng"', '"Noto Serif SC"', 'cursive'],
      },
      boxShadow: {
        'paper': '0 2px 8px rgba(92, 58, 29, 0.08), 0 1px 2px rgba(92, 58, 29, 0.06)',
        'paper-hover': '0 8px 24px rgba(92, 58, 29, 0.12), 0 2px 6px rgba(92, 58, 29, 0.08)',
        'card': '0 4px 16px rgba(92, 58, 29, 0.10), 1px 2px 0 rgba(92, 58, 29, 0.04)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        expand: {
          '0%': { opacity: '0', maxHeight: '0' },
          '100%': { opacity: '1', maxHeight: '1000px' },
        }
      },
      animation: {
        fadeInUp: 'fadeInUp 0.5s ease-out forwards',
        slideDown: 'slideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        expand: 'expand 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};
