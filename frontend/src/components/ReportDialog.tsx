/**
 * 举报弹层
 *
 * 理由分类由后端提供；「同时拉黑该作者」默认勾选，
 * 一次操作同时解决「举报」和「不想再看到」。
 */

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getReportReasons, reportPost } from '../api/safety'
import type { Post, ReportRecord } from '../types'
import { presentError } from '../utils/errors'

interface ReportDialogProps {
  post: Post
  onClose: () => void
  onSubmitted: (report: ReportRecord) => void
}

export default function ReportDialog({ post, onClose, onSubmitted }: ReportDialogProps) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [blockAuthor, setBlockAuthor] = useState(true)
  const [message, setMessage] = useState('')

  const { data: reasons, isLoading } = useQuery({
    queryKey: ['report-reasons'],
    queryFn: getReportReasons,
    staleTime: 1000 * 60 * 60,
  })

  const submitMutation = useMutation({
    mutationFn: () =>
      reportPost(post.id, {
        reason,
        detail: detail.trim() || undefined,
        block_author: blockAuthor,
      }),
    onSuccess: (report) => onSubmitted(report),
    onError: (error) => setMessage(presentError(error).title + '：' + (error as Error).message),
  })

  function handleSubmit() {
    setMessage('')
    if (!reason) {
      setMessage('请选择举报理由')
      return
    }
    submitMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/30 px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">举报这条创作</h3>
            <p className="mt-1 text-xs text-gray-400 truncate max-w-xs">
              {post.user?.username ? `@${post.user.username}` : '匿名用户'}：{post.content}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="关闭">
            ×
          </button>
        </div>

        {isLoading && <p className="text-sm text-gray-400">正在加载举报理由…</p>}

        <div className="grid grid-cols-2 gap-2 mb-4">
          {reasons?.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setReason(item)}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                reason === item
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {reason === '其他' && (
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value.slice(0, 200))}
            rows={3}
            placeholder="补充说明（选填，最多 200 字）"
            className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        )}

        <label className="flex items-center gap-2 mb-4 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={blockAuthor}
            onChange={(event) => setBlockAuthor(event.target.checked)}
            className="accent-gray-900"
          />
          同时拉黑该作者，之后不再看到 TA 的内容
        </label>

        {message && <p className="mb-3 text-sm text-red-500">{message}</p>}

        <p className="mb-4 text-xs text-gray-400">
          同一内容被 5 名不同用户举报后会暂时隐藏并进入人工复核。恶意举报会被记录。
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {submitMutation.isPending ? '提交中…' : '提交举报'}
          </button>
        </div>
      </div>
    </div>
  )
}
