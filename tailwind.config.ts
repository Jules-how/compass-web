import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      // LOCKED depth tokens — prefer shadow-soft on cards; do not retune unless asked.
      boxShadow: {
        soft: '0 1px 2px rgba(15, 18, 23, 0.04), 0 8px 24px rgba(15, 18, 23, 0.04)',
        lift: '0 2px 4px rgba(15, 18, 23, 0.04), 0 12px 32px rgba(15, 18, 23, 0.06)'
      },
      colors: {
        // Switchflow orange accent
        sf: {
          orange: '#E85D2A',
          'orange-dark': '#C94A1F',
          'orange-light': '#F8D9CB'
        },
        compass: {
          ink: '#0f1217',
          muted: '#6b7280',
          line: '#e8e6e3',
          wash: '#f6f4f1',
          sidebar: '#f1efec',
          accent: '#e85d2a'
        }
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: []
}

export default config
