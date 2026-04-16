/**
 * 发布创作页面
 * 用户可以发布今日的创作内容
 * 每个用户每天只能发布一条
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { getMoods, createPost } from '../api/posts'
import type { Mood, CreatePostParams } from '../types'

export default function ComposePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePostParams>()

  // 监听内容字段
  const content = watch('content', '')

  // 获取情绪标签列表
  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: getMoods,
  })

  // 创建创作的mutation
  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      // 清空表单
      reset()
      setSelectedMood(null)
      setSuccessMessage('发布成功！')

      // 使 timelines 和 my-posts 缓存失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })

      // 3秒后跳转到首页
      setTimeout(() => {
        navigate('/')
      }, 1500)
    },
    onError: (error: Error) => {
      alert(error.message)
    },
  })

  function onSubmit(data: CreatePostParams) {
    createMutation.mutate({
      ...data,
      mood: selectedMood?.name,
    })
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
          <h1 className="text-lg font-medium text-gray-900">发布创作</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          {/* 成功提示 */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 text-green-600 text-center rounded-lg">
              {successMessage}
            </div>
          )}

          {/* 创作表单 */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* 内容输入区域 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                今日创作
              </label>
              <textarea
                placeholder="分享今天的想法、感受或灵感..."
                rows={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                {...register('content', {
                  required: '请输入创作内容',
                  maxLength: {
                    value: 500,
                    message: '内容不能超过500个字符',
                  },
                })}
              />
              <div className="flex justify-between items-center mt-1">
                {errors.content && (
                  <p className="text-sm text-red-500">{errors.content.message}</p>
                )}
                <span className="text-sm text-gray-400 ml-auto">
                  {content.length}/500
                </span>
              </div>
            </div>

            {/* 情绪标签选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                心情标签（可选）
              </label>
              <div className="flex flex-wrap gap-2">
                {moods?.map((mood) => (
                  <button
                    key={mood.id}
                    type="button"
                    onClick={() =>
                      setSelectedMood(selectedMood?.id === mood.id ? null : mood)
                    }
                    className={`px-4 py-2 rounded-full border transition-all ${
                      selectedMood?.id === mood.id
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={
                      selectedMood?.id === mood.id
                        ? { backgroundColor: mood.color, borderColor: mood.color }
                        : {}
                    }
                  >
                    {mood.emoji} {mood.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="w-full py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || createMutation.isPending ? '发布中...' : '发布'}
            </button>

            {/* 提示文字 */}
            <p className="text-center text-sm text-gray-400">
              每天只能发布一条创作，请珍惜每一次表达的机会
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}