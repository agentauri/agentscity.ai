/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        'xs': '375px',
      },
      colors: {
        city: {
          bg: '#1a1a2e',
          surface: '#16213e',
          border: '#0f3460',
          accent: '#e94560',
        },
        agent: {
          claude: '#ef4444',
          codex: '#3b82f6',
          gemini: '#10b981',
          deepseek: '#f59e0b',
          qwen: '#8b5cf6',
          glm: '#ec4899',
        },
        location: {
          residential: '#4ade80',
          commercial: '#60a5fa',
          industrial: '#fbbf24',
          civic: '#a78bfa',
        },
      },
    },
  },
  plugins: [],
};
