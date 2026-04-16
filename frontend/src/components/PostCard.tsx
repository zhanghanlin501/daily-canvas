/**
 * PostCard 组件
 * 用于展示单条创作内容
 */

import type { Post } from '../types'

interface PostCardProps {
  post: Post
}

/**
 * 格式化日期
 * 将 ISO 日期字符串转换为易读的格式
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return '今天'
  } else if (diffDays === 1) {
    return '昨天'
  } else if (diffDays < 7) {
    return `${diffDays} 天前`
  } else {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
}

export default function PostCard({ post }: PostCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* 情绪标签 */}
      {post.mood && (
        <div className="mb-3">
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-sm"
            style={{
              backgroundColor: post.mood_info?.color || '#f5f5f5',
              color: '#333',
            }}
          >
            {post.mood_info?.emoji} {post.mood}
          </span>
        </div>
      )}

      {/* 创作内容 */}
      <p className="text-gray-800 text-lg leading-relaxed mb-4 whitespace-pre-wrap">
        {post.content}
      </p>

      {/* 底部信息栏 */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        {/* 用户信息 */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-xs text-gray-500">
              {post.user?.username?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
          <span className="text-gray-600">{post.user?.username || '匿名用户'}</span>
        </div>

        {/* 发布日期 */}
        <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
      </div>
    </div>
  )
}