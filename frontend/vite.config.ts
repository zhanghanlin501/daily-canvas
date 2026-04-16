import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vite 配置文件
// 详细说明请参考：https://vitejs.dev/config/
export default defineConfig({
  // 使用 React 插件，支持 JSX
  plugins: [react()],

  // 路径别名配置
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // 开发服务器配置
  server: {
    // 端口号
    port: 3000,
    // 自动打开浏览器
    open: true,
    // 代理配置，解决跨域问题
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  // 构建配置
  build: {
    // 输出目录
    outDir: 'dist',
    // 开启 gzip 压缩
    chunkSizeWarningLimit: 1000,
  },
})