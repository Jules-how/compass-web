import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Switchflow orange accent (placeholder; replace when context/business/brand.md lands).
        sf: {
          orange: '#F97316',
          'orange-dark': '#EA580C',
          'orange-light': '#FED7AA'
        }
      }
    }
  },
  plugins: []
}

export default config
