/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cabinet Grotesk"', 'ui-sans-serif', 'system-ui'],
        sans: ['Manrope', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: {
          50: '#F9FAFB',
          100: '#F1F5F4',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        emerald: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#047857',
          700: '#065F46',
          800: '#064E3B',
          900: '#022C22',
        },
        gold: {
          50: '#FEF8E7',
          100: '#FEF3C7',
          400: '#D4A14A',
          500: '#B48B36',
          600: '#8E6B22',
        },
        terracotta: {
          50: '#FEE2E2',
          400: '#DC6B6B',
          600: '#B91C1C',
          700: '#991B1B',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 2px 12px -4px rgba(15, 23, 42, 0.08)',
        card: '0 6px 20px -8px rgba(15, 23, 42, 0.12)',
        sheet: '0 -10px 40px -6px rgba(15, 23, 42, 0.16)',
        emerald: '0 8px 24px -6px rgba(6, 78, 59, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn .35s ease-out both',
        'slide-up': 'slideUp .35s cubic-bezier(.22,.61,.36,1) both',
        'pop': 'pop .25s ease-out both',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(.96)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
      },
    },
  },
  plugins: [],
}
