/**
 * 探索页面 - 随机漫步
 * 随机展示一条其他用户的创作，带来发现的乐趣
 */

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getRandomPost, getMoods } from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'
import type { Mood } from '../types'

export default function ExplorePage() {
  const navigate = useNavigate()

  // 获取随机创作
  const {
    data: post,
    isLoading: isPostLoading,
    refetch: fetchRandom,
    isFetching,
  } = useQuery({
    queryKey: ['randomPost'],
    queryFn: getRandomPost,
    enabled: false, // 需要手动触发
  })

  // 获取情绪标签列表（用于显示颜色）
  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: getMoods,
  })

  // 情绪映射
  const moodMap = moods?.reduce((acc, mood) => {
    acc[mood.name] = mood
    return acc
  }, {} as Record<string, Mood>)

  // 获取下一个随机创作
  function handleNext() {
    fetchRandom()
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
          <h1 className="text-lg font-medium text-gray-900">随机漫步</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          {/* 页面说明 */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-light text-gray-900 mb-2">
              探索未知的创作
            </h2>
            <p className="text-gray-500">
              随机发现他人的灵感时刻
            </p>
          </div>

          {/* 加载状态 */}
          {(isPostLoading || isFetching) && (
            <div className="py-12">
              <LoadingSpinner />
            </div>
          )}

          {/* 创作卡片 */}
          {!isPostLoading && !isFetching && post && (
            <div className="mb-8">
              <PostCard
                post={{
                  ...post,
                  mood_info: post.mood ? moodMap?.[post.mood] : undefined,
                }}
              />
            </div>
          )}

          {/* 空状态 */}
          {!isPostLoading && !isFetching && !post && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">还没有人发布创作</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-4">
            <button
              onClick={handleNext}
              disabled={isFetching}
              className="flex-1 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              随机漫步
            </button>
            <button
              onClick={() => navigate('/compose')}
              className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              我也要创作
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
