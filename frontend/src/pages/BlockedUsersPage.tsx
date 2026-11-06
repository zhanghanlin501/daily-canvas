/**
 * 已拉黑用户管理页
 *
 * 拉黑是单向记录、双向隔离：你拉黑对方后，双方都看不到彼此的内容，也无法互动。
 * 这里可以随时解除。
 */

import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyBlocks, unblockUser } from '../api/safety'
import LoadingSpinner from '../components/LoadingSpinner'

export default function BlockedUsersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-blocks'],
    queryFn: getMyBlocks,
  })

  const unblockMutation = useMutation({
    mutationFn: (username: string) => unblockUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-blocks'] })
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
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
          <h1 className="text-lg font-medium text-gray-900">已拉黑</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          <p className="mb-6 text-sm text-gray-400">
            拉黑后，你们互相看不到对方的公开创作，也无法点赞、评论、举报对方的内容。解除后立即恢复。
          </p>

          {isLoading && <LoadingSpinner />}

          {data && data.length > 0 && (
            <div className="space-y-3">
              {data.map((item) => (
                <div
                  key={item.user_id}
                  className="flex items-center justify-between border border-gray-100 rounded-lg px-5 py-4"
                >
                  <div>
                    <p className="text-gray-800">{item.username}</p>
                    <p className="text-xs text-gray-400">
                      拉黑于 {new Date(item.blocked_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <button
                    onClick={() => unblockMutation.mutate(item.username)}
                    disabled={unblockMutation.isPending}
                    className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
                  >
                    解除拉黑
                  </button>
                </div>
              ))}
            </div>
          )}

          {data && data.length === 0 && (
            <div className="text-center py-12 text-gray-500">还没有拉黑任何人</div>
          )}
        </div>
      </main>
    </div>
  )
}
