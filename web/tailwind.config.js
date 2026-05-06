/** @type {import('tailwindcss').Config} */

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#7B2FFF',
        secondary: '#00C9FF',
        accent: '#FF2E9F',
        brand: { // Keeping for backward compatibility temporarily if needed, but aliasing to new system
          bg: '#13141C',
          primary: '#7B2FFF',
          secondary: '#00C9FF',
          primary: '#7B2FFF',
          secondary: '#00C9FF',
          accent: '#7C3AED', // Vivid Purple from icon
          peach: '#FDBA74', // Peach from icon
        },
        bg: {
          base: '#13141C',
          surface: '#1C1D27',
          elevated: '#252631',
        },
        border: {
          DEFAULT: '#363742',
          subtle: '#2A2B36',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#B8B8C8',
          tertiary: '#78788C',
          disabled: '#4E4E5C',
        },
        success: '#00FF9C',
        warning: '#FFB800',
        error: '#FF3D5C',
        info: '#00A8E8',
      },
      backgroundImage: {
        'gradient-border': 'linear-gradient(135deg, #00C9FF 0%, #7B2FFF 100%)',
        'gradient-fill': 'linear-gradient(135deg, rgba(0,201,255,0.15) 0%, rgba(123,47,255,0.15) 100%)',
        'brand-gradient': 'linear-gradient(135deg, #7C3AED 0%, #D946EF 50%, #FDBA74 100%)', // Purple -> Fuchsia -> Peach
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};
