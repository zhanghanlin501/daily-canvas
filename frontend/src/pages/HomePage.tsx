/**
 * 首页 - 时间线
 * 展示所有用户的每日创作
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTimeline } from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function HomePage() {
  // 使用 React Query 获取时间线数据
  const { data, isLoading, error } = useQuery({
    queryKey: ['timeline'],
    queryFn: () => getTimeline({ page: 1, limit: 20 }),
  })
  const posts = Array.isArray(data?.items) ? data.items : []

  return (
    <div className="min-h-screen bg-white">
      {/* 头部导航 */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="container-max flex items-center justify-between h-16 px-4">
          {/* Logo */}
          <h1 className="text-xl font-semibold text-gray-900">
            Daily Canvas
          </h1>

          {/* 导航链接 */}
          <nav className="flex items-center gap-6">
            <Link to="/explore" className="text-gray-600 hover:text-gray-900 transition-colors">
              探索
            </Link>
            <Link
              to="/compose"
              className="px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
            >
              今日创作
            </Link>
          </nav>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="container-max py-8 px-4">
        {/* 页面标题 */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-light text-gray-900 mb-2">
            每日画布
          </h2>
          <p className="text-gray-500">
            每天一条创作，发现生活中的小美好
          </p>
        </div>

        {/* 加载状态 */}
        {isLoading && <LoadingSpinner />}

        {/* 错误状态 */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-500">加载失败，请稍后重试</p>
          </div>
        )}

        {/* 创作列表 */}
        {data && posts.length > 0 && (
          <div className="space-y-6 max-w-xl mx-auto">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {data && posts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">还没有人发布创作，来当第一个吧！</p>
            <Link
              to="/compose"
              className="inline-block mt-4 px-6 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
            >
              发布创作
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
