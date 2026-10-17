import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        brand: {
          50: v('brand-50'), 100: v('brand-100'), 200: v('brand-200'), 300: v('brand-300'),
          400: v('brand-400'), 500: v('brand-500'), 600: v('brand-600'), 700: v('brand-700'),
          800: v('brand-800'), 900: v('brand-900'),
        },
        coral: { 50: v('coral-50'), 100: v('coral-100'), 500: v('coral-500'), 600: v('coral-600') },
        sun: { 50: v('sun-50'), 100: v('sun-100'), 500: v('sun-500'), 600: v('sun-600') },
        sky: { 50: v('sky-50'), 100: v('sky-100'), 500: v('sky-500'), 600: v('sky-600') },
        grape: { 50: v('grape-50'), 100: v('grape-100'), 500: v('grape-500'), 600: v('grape-600') },
        danger: { 50: v('danger-50'), 500: v('danger-500'), 600: v('danger-600') },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', '"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'sans-serif'],
      },
      borderRadius: { xl: '16px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 4px 16px rgb(var(--shadow) / 0.06)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.06), 0 12px 32px rgb(var(--shadow) / 0.12)',
        pop: '0 8px 24px rgb(var(--shadow) / 0.18)',
        press: '0 4px 0 0 rgb(var(--brand-800))',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pop: { '0%': { transform: 'scale(.9)', opacity: '0' }, '60%': { transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } },
        rise: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        floaty: 'floaty 5s ease-in-out infinite',
        pop: 'pop .35s cubic-bezier(.2,1.2,.4,1) both',
        shake: 'shake .4s',
        rise: 'rise .4s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
