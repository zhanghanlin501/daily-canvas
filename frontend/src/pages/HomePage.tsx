/**
 * 首页 - 公开时间线
 *
 * 首屏 20 条 + 触底加载下一页，直到最后一页，历史内容不再"永远看不到"。
 * 失败时给出分类原因与重试按钮。
 */

import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getTimeline } from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { presentError } from '../utils/errors'

export default function HomePage() {
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['timeline'],
    queryFn: ({ pageParam }) => getTimeline({ page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  })

  const posts = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 触底自动加载下一页
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const errorInfo = error ? presentError(error) : null

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="container-max flex items-center justify-between h-16 px-4">
          <h1 className="text-xl font-semibold text-gray-900">Daily Canvas</h1>

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

      <main className="container-max py-8 px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-light text-gray-900 mb-2">每日画布</h2>
          <p className="text-gray-500">每天一条创作，发现生活中的小美好</p>
        </div>

        {isLoading && <LoadingSpinner />}

        {errorInfo && (
          <div className="text-center py-12">
            <p className="text-gray-800 mb-1">{errorInfo.title}</p>
            <p className="text-sm text-gray-400 mb-4">{errorInfo.hint}</p>
            {errorInfo.canRetry && (
              <button
                onClick={() => refetch()}
                className="px-6 py-2 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50"
              >
                重新加载
              </button>
            )}
          </div>
        )}

        {!isLoading && !errorInfo && posts.length > 0 && (
          <div className="space-y-6 max-w-xl mx-auto">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}

            <div ref={sentinelRef} className="h-1" />

            <div className="text-center text-sm text-gray-400 pt-2">
              {isFetchingNextPage && <LoadingSpinner />}
              {!isFetchingNextPage && hasNextPage && (
                <button onClick={() => fetchNextPage()} className="text-gray-500 hover:text-gray-800">
                  加载更多
                </button>
              )}
              {!hasNextPage && `已经到底了，共 ${total} 条公开创作`}
            </div>
          </div>
        )}

        {!isLoading && !errorInfo && posts.length === 0 && (
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

        <div className="text-center mt-16">
          <Link to="/about" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            关于 Daily Canvas
          </Link>
        </div>
      </main>
    </div>
  )
}
