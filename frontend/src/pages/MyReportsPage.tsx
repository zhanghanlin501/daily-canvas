/**
 * 我的举报
 *
 * 展示每条举报的受理编号、理由与当前状态，形成「举报 → 有回音」的闭环。
 */

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMyReports } from '../api/safety'
import LoadingSpinner from '../components/LoadingSpinner'

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  reviewing: '处理中',
  resolved: '已处理',
  rejected: '不予处理',
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  reviewing: 'bg-amber-50 text-amber-700',
  resolved: 'bg-green-50 text-green-700',
  rejected: 'bg-gray-100 text-gray-400',
}

export default function MyReportsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn: getMyReports,
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
          <h1 className="text-lg font-medium text-gray-900">我的举报</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          {isLoading && <LoadingSpinner />}

          {data && data.length > 0 && (
            <div className="space-y-4">
              {data.map((report) => (
                <div key={report.id} className="border border-gray-100 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">{report.ticket_no}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        STATUS_STYLES[report.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {STATUS_LABELS[report.status] || report.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mb-1">
                    理由：{report.reason}
                    {report.target_author ? ` · @${report.target_author}` : ''}
                  </p>

                  {report.target_excerpt && (
                    <p className="text-sm text-gray-600 mb-3">{report.target_excerpt}</p>
                  )}

                  <p className="text-xs text-gray-400">
                    提交时间：{new Date(report.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data && data.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">还没有举报记录</p>
              <p className="mt-2 text-sm text-gray-400">
                在时间线里长按创作卡片的「···」即可举报
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
