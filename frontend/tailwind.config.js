/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 扩展主题配置
      colors: {
        // 主色调 - 深灰黑
        primary: '#1a1a1a',
        // 背景色 - 纯白
        background: '#ffffff',
        // 辅助背景 - 浅灰
        'bg-secondary': '#f5f5f5',
        // 文字色 - 中灰
        text: '#333333',
        // 次要文字 - 浅灰
        'text-secondary': '#999999',
      },
      // 字体配置
      fontFamily: {
        // 使用系统默认无衬线字体
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      // 间距配置
      spacing: {
        // 极简间距
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
}