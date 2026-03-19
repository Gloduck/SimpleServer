export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        primary: '#249ffd',
        secondary: '#1a88e8',
        neutral: '#f0f4f8',
        dark: '#1e293b',
        github: '#24292f',
        githubBlue: '#0969da'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'Consolas', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace']
      }
    }
  },
  plugins: []
};
