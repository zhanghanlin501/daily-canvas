/**
 * 个人中心页面
 *
 * - 作者视角：每条创作带明确状态徽标
 * - 可见性随时可改（不受 24 小时内容编辑窗口限制）
 * - 我的创作支持加载更多，超过 50 条也能看到更早的内容
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { getMyPosts, getTrashPosts, setPostVisibility } from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'
import type { Post, PostVisibility } from '../types'

function VisibilityToggle({ post }: { post: Post }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (target: PostVisibility) => setPostVisibility(post.id, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
    },
  })

  if (post.status === 'deleted') {
    return null
  }

  const next: PostVisibility = post.visibility === 'public' ? 'private' : 'public'

  return (
    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
      <button
        onClick={() => mutation.mutate(next)}
        disabled={mutation.isPending}
        className="text-gray-500 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
      >
        {mutation.isPending
          ? '调整中…'
          : next === 'private'
            ? '设为仅自己可见'
            : '重新公开'}
      </button>
      {mutation.isError && (
        <span className="text-red-500">{(mutation.error as Error).message}</span>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['my-posts'],
    queryFn: ({ pageParam }) => getMyPosts({ page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  })

  const posts = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0

  const { data: trash } = useQuery({
    queryKey: ['trash-summary'],
    queryFn: () => getTrashPosts({ page: 1, limit: 1 }),
  })

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-white">
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

      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto mb-8">
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl text-gray-400">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>

            <h2 className="text-xl font-medium text-gray-900 text-center mb-1">
              {user?.username}
            </h2>

            <p className="text-gray-500 text-center mb-4">{user?.email}</p>

            <div className="flex justify-center gap-8 text-center">
              <div>
                <p className="text-2xl font-semibold text-gray-900">{total}</p>
                <p className="text-sm text-gray-500">累计创作</p>
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

            <p className="mt-4 text-center text-xs text-gray-400">
              仅自己可见的创作计入你的累计创作，但不计入任何公开统计
            </p>
          </div>
        </div>

        <div className="max-w-xl mx-auto">
          <h3 className="text-lg font-medium text-gray-900 mb-4">我的创作</h3>

          {isLoading && (
            <div className="py-12">
              <LoadingSpinner />
            </div>
          )}

          {!isLoading && posts.length > 0 && (
            <div className="space-y-6">
              {posts.map((post) => (
                <div key={post.id}>
                  <PostCard post={post} ownerView />
                  <VisibilityToggle post={post} />
                </div>
              ))}

              <div className="text-center pt-2">
                {isFetchingNextPage && <LoadingSpinner />}
                {!isFetchingNextPage && hasNextPage && (
                  <button
                    onClick={() => fetchNextPage()}
                    className="px-6 py-2 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50"
                  >
                    加载更多
                  </button>
                )}
                {!hasNextPage && posts.length > 0 && (
                  <span className="text-sm text-gray-400">已经到底了</span>
                )}
              </div>
            </div>
          )}

          {!isLoading && posts.length === 0 && (
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

        <div className="max-w-xl mx-auto mt-12 space-y-1">
          <button
            onClick={() => navigate('/trash')}
            className="w-full flex items-center justify-between py-4 border-t border-gray-100 text-left"
          >
            <span className="text-gray-700">回收站</span>
            <span className="text-gray-400 text-sm">
              {trash && trash.total > 0 ? `${trash.total} 条可恢复` : '30 天内可恢复'}
              {' ›'}
            </span>
          </button>

          <button
            onClick={() => navigate('/my-reports')}
            className="w-full flex items-center justify-between py-4 border-t border-gray-100 text-left"
          >
            <span className="text-gray-700">我的举报</span>
            <span className="text-gray-400 text-sm">受理进度 ›</span>
          </button>

          <button
            onClick={() => navigate('/blocked-users')}
            className="w-full flex items-center justify-between py-4 border-t border-gray-100 text-left"
          >
            <span className="text-gray-700">已拉黑</span>
            <span className="text-gray-400 text-sm">管理名单 ›</span>
          </button>

          <button
            onClick={() => navigate('/about')}
            className="w-full flex items-center justify-between py-4 border-t border-gray-100 text-left"
          >
            <span className="text-gray-700">关于 Daily Canvas</span>
            <span className="text-gray-400 text-sm">版本与更新 ›</span>
          </button>
        </div>
      </main>
    </div>
  )
}
