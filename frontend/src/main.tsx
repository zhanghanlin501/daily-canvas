import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// 创建 React Query 客户端实例
// React Query 用于管理服务端状态，包括缓存和自动更新
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 默认 stale 时间（数据被认为过期前的时间）
      staleTime: 1000 * 60 * 5, // 5 分钟
      // 默认缓存时间
      gcTime: 1000 * 60 * 30, // 30 分钟
    },
  },
})

// 渲染 React 应用
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* BrowserRouter 提供 React Router 的路由功能 */}
    <BrowserRouter>
      {/* QueryClientProvider 提供 React Query 的上下文 */}
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
