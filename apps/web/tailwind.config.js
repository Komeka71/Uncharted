/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: '#040806',
        surface: 'rgba(255, 255, 255, 0.03)',
        'surface-2': 'rgba(255, 255, 255, 0.06)',
        'surface-3': 'rgba(255, 255, 255, 0.09)',
        border: 'rgba(43, 227, 127, 0.16)',
        'border-dim': 'rgba(255, 255, 255, 0.08)',
        accent: '#2BE37F',
        'accent-soft': 'rgba(43, 227, 127, 0.12)',
        'accent-glow': 'rgba(43, 227, 127, 0.35)',
        text: '#E8F5EC',
        muted: '#8AA394',
        danger: '#FF5C6C',
        'danger-soft': 'rgba(255, 92, 108, 0.12)',
        warn: '#F5B544',
        'warn-soft': 'rgba(245, 181, 68, 0.12)',
        info: '#5BB8FF',
        'info-soft': 'rgba(91, 184, 255, 0.12)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Courier New', 'monospace']
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(43, 227, 127, 0.3)',
        'glow-sm': '0 0 15px -3px rgba(43, 227, 127, 0.25)',
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.5s infinite ease-in-out',
        'spin-slow': 'spin 8s linear infinite'
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' }
        }
      }
    }
  },
  plugins: []
};
