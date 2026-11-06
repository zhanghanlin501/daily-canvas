/**
 * 回收站
 *
 * 只展示作者本人删除的内容；管理端强制删除的内容不会出现在这里。
 * 删除后 30 天内可恢复，恢复后沿用删除前的平台状态。
 */

import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTrashPosts, restorePost } from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { showToast } from '../utils/toast'
import type { Post } from '../types'

function remainingRestoreDays(post: Post): number | null {
  if (!post.deleted_at) {
    return null
  }

  const elapsedDays = Math.floor((Date.now() - new Date(post.deleted_at).getTime()) / 86400000)
  return Math.max(0, 30 - elapsedDays)
}

export default function TrashPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['trash'],
    queryFn: ({ pageParam }) => getTrashPosts({ page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  })

  const posts = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  const restoreMutation = useMutation({
    mutationFn: (postId: number) => restorePost(postId),
    onSuccess: (restoredPost) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      queryClient.invalidateQueries({ queryKey: ['trash-summary'] })
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['today-post'] })
      queryClient.setQueryData(['post', restoredPost.id], restoredPost)
      showToast(
        restoredPost.visibility === 'private'
          ? '已恢复，这条创作仍然仅你自己可见'
          : '已恢复，创作重新出现在时间线'
      )
    },
    onError: (mutationError) => {
      showToast((mutationError as Error).message || '恢复失败，请稍后重试')
    },
  })

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
          <h1 className="text-lg font-medium text-gray-900">回收站</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          <p className="mb-6 text-sm text-gray-400">
            删除的创作会在这里保留 30 天，期间可以随时恢复；超过 30 天后无法恢复。
          </p>

          {isLoading && <LoadingSpinner />}

          {!!error && (
            <div className="text-center py-12">
              <p className="text-gray-700 mb-4">{(error as Error).message}</p>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['trash'] })}
                className="px-6 py-2 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50"
              >
                重新加载
              </button>
            </div>
          )}

          {!isLoading && !error && posts.length > 0 && (
            <div className="space-y-6">
              {posts.map((post) => {
                const daysLeft = remainingRestoreDays(post)
                const expired = daysLeft === 0

                return (
                  <div key={post.id}>
                    <PostCard post={post} ownerView />
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                      <span>
                        {post.deleted_at
                          ? `删除于 ${new Date(post.deleted_at).toLocaleString('zh-CN')}`
                          : '已删除'}
                      </span>
                      {expired ? (
                        <span className="text-gray-400">已超过 30 天，无法恢复</span>
                      ) : (
                        <button
                          onClick={() => restoreMutation.mutate(post.id)}
                          disabled={restoreMutation.isPending}
                          className="text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
                        >
                          {restoreMutation.isPending ? '恢复中…' : '恢复创作'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

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
                {!hasNextPage && <span className="text-sm text-gray-400">已经到底了</span>}
              </div>
            </div>
          )}

          {!isLoading && !error && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">回收站是空的</p>
              <Link
                to="/profile"
                className="inline-block px-6 py-2 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50"
              >
                返回个人中心
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
