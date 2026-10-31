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
        bg: '#060D0A',
        'bg-elevated': '#0B1612',
        surface: 'rgba(255, 255, 255, 0.04)',
        'surface-2': 'rgba(255, 255, 255, 0.07)',
        'surface-3': 'rgba(255, 255, 255, 0.10)',
        border: 'rgba(110, 231, 183, 0.14)',
        'border-dim': 'rgba(255, 255, 255, 0.08)',
        accent: '#34D399',
        'accent-strong': '#6EE7B7',
        'accent-deep': '#059669',
        'accent-soft': 'rgba(52, 211, 153, 0.12)',
        'accent-glow': 'rgba(52, 211, 153, 0.35)',
        highlight: '#D9F99D',
        text: '#ECF6F0',
        muted: '#9DB5A8',
        danger: '#FF6B6B',
        'danger-soft': 'rgba(255, 107, 107, 0.12)',
        warn: '#F5B544',
        'warn-soft': 'rgba(245, 181, 68, 0.12)',
        info: '#7DC4FF',
        'info-soft': 'rgba(125, 196, 255, 0.12)'
      },
      fontFamily: {
        display: ['var(--font-display)', 'Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Menlo', 'Courier New', 'monospace']
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(52, 211, 153, 0.3)',
        'glow-sm': '0 0 15px -3px rgba(52, 211, 153, 0.25)',
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.45)'
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
