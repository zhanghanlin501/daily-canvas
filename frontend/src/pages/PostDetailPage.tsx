/**
 * 创作详情页
 *
 * 作者本人可在这里完成 F14 生命周期闭环：
 * - 发布后 24 小时内编辑内容与情绪；
 * - 随时软删除，进入回收站；
 * - 30 天内从回收站恢复，且恢复后沿用删除前的平台状态。
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deletePost,
  getMoods,
  getPost,
  getPostStatusHistory,
  restorePost,
  updatePost,
} from '../api/posts'
import PostCard from '../components/PostCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../hooks/useAuth'
import { toRequestError } from '../utils/errors'
import { showToast } from '../utils/toast'

const STATUS_TEXT: Record<string, string> = {
  normal: '正常',
  pending: '审核中',
  hidden: '已隐藏',
  deleted: '已删除',
}

const ACTOR_TEXT: Record<string, string> = {
  user: '作者',
  staff: '管理员',
  system: '系统',
}

function remainingRestoreDays(deletedAt?: string | null): number | null {
  if (!deletedAt) {
    return null
  }

  const elapsedDays = Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000)
  return Math.max(0, 30 - elapsedDays)
}

export default function PostDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams<{ id: string }>()
  const postId = Number(id)
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editMood, setEditMood] = useState('')

  const {
    data: post,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId),
    enabled: Number.isFinite(postId) && postId > 0,
    retry: false,
  })

  const isOwner = !!post && !!user && post.user_id === user.id

  useEffect(() => {
    if (!post) {
      return
    }
    setEditContent(post.content)
    setEditMood(post.mood || '')
  }, [post?.id, post?.content, post?.mood])

  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: getMoods,
    enabled: isOwner,
  })

  const { data: history } = useQuery({
    queryKey: ['post-status-history', postId],
    queryFn: () => getPostStatusHistory(postId),
    enabled: isOwner,
  })

  function invalidateLifecycleQueries() {
    queryClient.invalidateQueries({ queryKey: ['post', postId] })
    queryClient.invalidateQueries({ queryKey: ['my-posts'] })
    queryClient.invalidateQueries({ queryKey: ['trash'] })
    queryClient.invalidateQueries({ queryKey: ['trash-summary'] })
    queryClient.invalidateQueries({ queryKey: ['timeline'] })
    queryClient.invalidateQueries({ queryKey: ['today-post'] })
    queryClient.invalidateQueries({ queryKey: ['post-status-history', postId] })
  }

  const editMutation = useMutation({
    mutationFn: () =>
      updatePost(postId, {
        content: editContent,
        mood: editMood || null,
      }),
    onSuccess: (updatedPost) => {
      queryClient.setQueryData(['post', postId], updatedPost)
      invalidateLifecycleQueries()
      setEditing(false)
      showToast('创作已更新，已标记为「已编辑」')
    },
    onError: (mutationError) => {
      showToast((mutationError as Error).message || '更新失败，请稍后重试')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(postId),
    onSuccess: () => {
      invalidateLifecycleQueries()
      showToast('已移入回收站，30 天内可以恢复')
    },
    onError: (mutationError) => {
      showToast((mutationError as Error).message || '删除失败，请稍后重试')
    },
  })

  const restoreMutation = useMutation({
    mutationFn: () => restorePost(postId),
    onSuccess: (restoredPost) => {
      queryClient.setQueryData(['post', postId], restoredPost)
      invalidateLifecycleQueries()
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

  const notFound = !!error && toRequestError(error).status === 404
  const restoreDays = post ? remainingRestoreDays(post.deleted_at) : null

  function handleDelete() {
    if (!window.confirm('删除后内容会进入回收站，30 天内可恢复。确定删除吗？')) {
      return
    }
    deleteMutation.mutate()
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
          <h1 className="text-lg font-medium text-gray-900">创作详情</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          {isLoading && <LoadingSpinner />}

          {notFound && (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">内容不存在，或已被隐藏</p>
              <Link
                to="/"
                className="inline-block px-6 py-2 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50"
              >
                回到首页
              </Link>
            </div>
          )}

          {!!error && !notFound && (
            <div className="text-center py-12">
              <p className="text-gray-700 mb-4">{(error as Error).message}</p>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="px-6 py-2 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50"
              >
                回到首页
              </button>
            </div>
          )}

          {post && (
            <>
              {isOwner && post.status === 'deleted' && (
                <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
                  <p className="text-sm text-amber-800">
                    这条创作在回收站中
                    {restoreDays !== null ? `，还剩 ${restoreDays} 天可以恢复。` : '。'}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => restoreMutation.mutate()}
                      disabled={restoreMutation.isPending}
                      className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {restoreMutation.isPending ? '恢复中…' : '恢复创作'}
                    </button>
                    <Link to="/trash" className="text-sm text-gray-600 hover:text-gray-900">
                      返回回收站
                    </Link>
                  </div>
                </div>
              )}

              {isOwner && post.status !== 'deleted' && (
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="text-xs text-gray-400">
                    {post.can_edit_content
                      ? '发布后 24 小时内可编辑内容，可见性可随时调整'
                      : '内容编辑窗口已过；仍可在个人中心随时调整公开范围'}
                  </p>
                  {!editing && (
                    <div className="flex items-center gap-3 text-sm">
                      {post.can_edit_content && (
                        <button
                          onClick={() => setEditing(true)}
                          className="text-gray-600 hover:text-gray-900 underline underline-offset-2"
                        >
                          编辑内容
                        </button>
                      )}
                      <button
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        className="text-red-500 hover:text-red-600 underline underline-offset-2 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? '删除中…' : '删除'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {editing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!editContent.trim()) {
                      showToast('创作内容不能为空')
                      return
                    }
                    editMutation.mutate()
                  }}
                  className="border border-gray-100 rounded-lg p-6 shadow-sm"
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    编辑内容
                  </label>
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={6}
                    maxLength={500}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                  />
                  <div className="text-right text-xs text-gray-400 mt-1">
                    {editContent.length}/500
                  </div>

                  <label className="block text-sm font-medium text-gray-700 mt-5 mb-2">
                    心情标签（可选）
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {moods?.map((mood) => (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => setEditMood(editMood === mood.name ? '' : mood.name)}
                        className={`px-4 py-2 rounded-full border text-sm transition-all ${
                          editMood === mood.name
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        style={
                          editMood === mood.name
                            ? { backgroundColor: mood.color, borderColor: mood.color }
                            : {}
                        }
                      >
                        {mood.emoji} {mood.name}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="submit"
                      disabled={editMutation.isPending || !editContent.trim()}
                      className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {editMutation.isPending ? '保存中…' : '保存修改'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <PostCard post={post} ownerView={isOwner} detailLink={false} />
              )}

              {/* 作者本人可见的状态变更历史 */}
              {isOwner && history && history.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-sm font-medium text-gray-900 mb-3">状态记录</h2>
                  <ul className="space-y-3">
                    {history
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <li
                          key={`${entry.created_at}-${index}`}
                          className="flex items-start justify-between border border-gray-100 rounded-lg px-4 py-3"
                        >
                          <div>
                            <p className="text-sm text-gray-700">
                              {entry.from_status
                                ? `${STATUS_TEXT[entry.from_status] || entry.from_status} → ${
                                    STATUS_TEXT[entry.to_status] || entry.to_status
                                  }`
                                : `创建为${STATUS_TEXT[entry.to_status] || entry.to_status}`}
                            </p>
                            {entry.reason && (
                              <p className="mt-1 text-xs text-gray-400">{entry.reason}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">
                              {ACTOR_TEXT[entry.actor_type] || entry.actor_type}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {new Date(entry.created_at).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
