/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F1E3',
        'paper-warm': '#EFE5CE',
        'paper-deep': '#E8DCBC',
        ink: '#0C0E10',
        'ink-soft': '#1F2226',
        'ink-mid': '#3A3F47',
        muted: '#726A58',
        line: '#D4C9AE',
        gold: '#B8863B',
        'gold-deep': '#8A5F1F',
        'gold-light': '#E4C37A',
        accent: '#7C1E29',
        'accent-warm': '#A63A4A',
        ivory: '#FAF2DE'
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        serif: ['Instrument Serif', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
};
