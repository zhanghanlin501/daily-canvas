/**
 * PostCard 组件
 * 展示单条创作：内容、心情标签、作者、日期，以及作者视角的状态徽标。
 * 同时承载内容安全入口：举报 / 拉黑。
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Post } from '../types'
import { useAuth } from '../hooks/useAuth'
import { blockUser } from '../api/safety'
import { showToast } from '../utils/toast'
import ReportDialog from './ReportDialog'

interface PostCardProps {
  post: Post
  /** 作者本人视角：显示状态徽标 */
  ownerView?: boolean
  /** 是否让内容区可点击进入详情页（详情页自身传 false） */
  detailLink?: boolean
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

function appToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const BADGE_STYLES: Record<string, string> = {
  仅自己可见: 'bg-gray-100 text-gray-600',
  审核中: 'bg-amber-50 text-amber-700',
  已隐藏: 'bg-red-50 text-red-600',
  已删除: 'bg-gray-100 text-gray-400',
}

function StatusBadge({ label }: { label: string }) {
  const style = BADGE_STYLES[label] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${style}`}>
      {label}
    </span>
  )
}

export default function PostCard({
  post,
  ownerView = false,
  detailLink = true,
}: PostCardProps) {
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const isOwnPost = !!user && user.id === post.user_id
  const canManage =
    isAuthenticated && !isOwnPost && post.status === 'normal' && post.visibility === 'public'

  const blockMutation = useMutation({
    mutationFn: () => blockUser(post.user?.username || ''),
    onSuccess: () => {
      setMenuOpen(false)
      showToast('已拉黑该作者，TA 的内容不会再出现在你的列表里')
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['randomPost'] })
      queryClient.invalidateQueries({ queryKey: ['my-blocks'] })
    },
    onError: (error: Error) => {
      setNotice(error.message)
    },
  })

  const displayStatus = ownerView ? post.display_status : null
  const showBadge = !!displayStatus && displayStatus !== '正常'
  const isBackfilled = post.post_date !== appToday()

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
      {(showBadge || post.edited_at || isBackfilled || canManage) && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {showBadge && <StatusBadge label={displayStatus as string} />}
            {isBackfilled && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600">
                补写
              </span>
            )}
            {post.edited_at && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                已编辑
              </span>
            )}
          </div>

          {canManage && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                aria-label="更多操作"
              >
                ···
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-8 w-40 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden z-20">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      setReportOpen(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    举报
                  </button>
                  <button
                    onClick={() => blockMutation.mutate()}
                    disabled={blockMutation.isPending || !post.user?.username}
                    className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    拉黑该作者
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
      {detailLink ? (
        <Link to={`/post/${post.id}`} className="block hover:opacity-80 transition-opacity">
          <p className="text-gray-800 text-lg leading-relaxed mb-4 whitespace-pre-wrap">
            {post.content}
          </p>
        </Link>
      ) : (
        <p className="text-gray-800 text-lg leading-relaxed mb-4 whitespace-pre-wrap">
          {post.content}
        </p>
      )}

      {/* 底部信息栏 */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-xs text-gray-500">
              {post.user?.username?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
          <span className="text-gray-600">{post.user?.username || '匿名用户'}</span>
        </div>

        <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
      </div>

      {notice && <p className="mt-3 text-xs text-gray-500">{notice}</p>}

      {reportOpen && (
        <ReportDialog
          post={post}
          onClose={() => setReportOpen(false)}
          onSubmitted={(report) => {
            setReportOpen(false)
            showToast(
              `已收到举报，受理编号 ${report.ticket_no}，可在「我的举报」查看进度`
            )
            queryClient.invalidateQueries({ queryKey: ['timeline'] })
            queryClient.invalidateQueries({ queryKey: ['my-reports'] })
          }}
        />
      )}
    </div>
  )
}
