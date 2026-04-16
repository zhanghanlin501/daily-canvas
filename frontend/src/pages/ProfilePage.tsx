/**
 * 个人中心页面
 * 展示用户信息和自己发布的创作列表
 */

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { getMyPosts } from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  // 获取当前用户的创作列表
  const { data, isLoading } = useQuery({
    queryKey: ['my-posts'],
    queryFn: () => getMyPosts({ page: 1, limit: 50 }),
  })
  const posts = Array.isArray(data?.items) ? data.items : []

  // 处理登出
  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 头部导航 */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="container-max flex items-center justify-between h-16 px-4">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-medium text-gray-900">个人中心</h1>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            登出
          </button>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="container-max py-8 px-4">
        {/* 用户信息卡片 */}
        <div className="max-w-xl mx-auto mb-8">
          <div className="bg-gray-50 rounded-lg p-6">
            {/* 用户头像 */}
            <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl text-gray-400">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* 用户名 */}
            <h2 className="text-xl font-medium text-gray-900 text-center mb-1">
              {user?.username}
            </h2>

            {/* 邮箱 */}
            <p className="text-gray-500 text-center mb-4">
              {user?.email}
            </p>

            {/* 统计信息 */}
            <div className="flex justify-center gap-8 text-center">
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {data?.total || 0}
                </p>
                <p className="text-sm text-gray-500">创作</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('zh-CN')
                    : '-'}
                </p>
                <p className="text-sm text-gray-500">加入日期</p>
              </div>
            </div>
          </div>
        </div>

        {/* 我的创作列表 */}
        <div className="max-w-xl mx-auto">
          <h3 className="text-lg font-medium text-gray-900 mb-4">我的创作</h3>

          {/* 加载状态 */}
          {isLoading && (
            <div className="py-12">
              <LoadingSpinner />
            </div>
          )}

          {/* 创作列表 */}
          {data && posts.length > 0 && (
            <div className="space-y-6">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {/* 空状态 */}
          {data && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">还没有发布任何创作</p>
              <button
                onClick={() => navigate('/compose')}
                className="px-6 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
              >
                发布第一条创作
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
