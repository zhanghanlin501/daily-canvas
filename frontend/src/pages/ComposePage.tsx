/**
 * 发布创作页面
 *
 * - 入口即预防：所选日期已经写过时，直接展示那条创作与下一步动作。
 * - 支持补写：今天及前 3 天，严格保持每天一条。
 * - 本地草稿：内容、情绪、日期、可见性自动保存在本机，断网重开仍在。
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { createPost, getMoods, getPostByDate } from '../api/posts'
import { useAuth } from '../hooks/useAuth'
import type { CreatePostParams, Mood, PostVisibility } from '../types'
import { presentError, toRequestError } from '../utils/errors'

const BACKFILL_WINDOW_DAYS = 3
const DATE_LABELS = ['今天', '昨天', '前天', '3 天前']

function appToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function appDateWithOffset(offsetDays: number): string {
  const [year, month, day] = appToday().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

interface DateOption {
  date: string
  label: string
}

function buildDateOptions(): DateOption[] {
  return [0, -1, -2, -3].map((offset, index) => ({
    date: appDateWithOffset(offset),
    label: DATE_LABELS[index],
  }))
}

export default function ComposePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const dateOptions = useMemo(buildDateOptions, [])
  const today = dateOptions[0].date
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [visibility, setVisibility] = useState<PostVisibility>('public')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorHint, setErrorHint] = useState('')
  const [draftLoadedKey, setDraftLoadedKey] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePostParams>({ defaultValues: { content: '' } })

  const content = watch('content', '')

  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: getMoods,
  })

  const { data: selectedPost, isLoading: isPostLoading } = useQuery({
    queryKey: ['post-by-date', selectedDate],
    queryFn: () => getPostByDate(selectedDate),
  })

  const draftKey = user ? `daily-canvas:draft:v1:${user.id}:${selectedDate}` : ''
  const lastDateKey = user ? `daily-canvas:draft:v1:${user.id}:last-date` : ''
  const isBackfill = selectedDate !== today

  // 恢复上次选择的日期；否则刷新后内容虽然还在，用户却要自己点回补写日期。
  useEffect(() => {
    if (!lastDateKey) {
      return
    }

    try {
      const savedDate = window.localStorage.getItem(lastDateKey)
      if (savedDate && dateOptions.some((option) => option.date === savedDate)) {
        setSelectedDate(savedDate)
      }
    } catch {
      // 本地存储不可用时保持默认「今天」
    }
  }, [lastDateKey, dateOptions])

  useEffect(() => {
    if (!lastDateKey) {
      return
    }

    try {
      window.localStorage.setItem(lastDateKey, selectedDate)
    } catch {
      // 忽略本地存储异常
    }
  }, [lastDateKey, selectedDate])

  // 切换日期或用户时，恢复该日期在本机保存的草稿。
  useEffect(() => {
    if (!draftKey) {
      return
    }

    let draft: {
      content?: string
      mood?: string
      visibility?: PostVisibility
    } | null = null

    try {
      const raw = window.localStorage.getItem(draftKey)
      draft = raw ? JSON.parse(raw) : null
    } catch {
      draft = null
    }

    reset({ content: draft?.content || '' })
    setSelectedMood(
      draft?.mood ? moods?.find((mood) => mood.name === draft?.mood) || null : null
    )
    setVisibility(draft?.visibility || 'public')
    setDraftLoadedKey(draftKey)
  }, [draftKey, moods, reset])

  // 输入变化自动保存草稿；清空后删除本地记录。
  useEffect(() => {
    if (!draftKey || draftLoadedKey !== draftKey) {
      return
    }

    const draft = {
      content,
      mood: selectedMood?.name || '',
      visibility,
    }

    try {
      if (!draft.content && !draft.mood) {
        window.localStorage.removeItem(draftKey)
      } else {
        window.localStorage.setItem(draftKey, JSON.stringify(draft))
      }
    } catch {
      // 本地存储不可用时不影响发布主流程
    }
  }, [content, selectedMood, visibility, draftKey, draftLoadedKey])

  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: (post) => {
      reset({ content: '' })
      setSelectedMood(null)
      setSuccessMessage(
        post.visibility === 'private'
          ? '已保存，仅你自己可见'
          : isBackfill
            ? `补写成功，已归到 ${selectedDate}`
            : '发布成功！'
      )

      try {
        window.localStorage.removeItem(draftKey)
        // 发布成功后清掉「上次日期」，下次进发布页从今天开始，
        // 不会落在刚补写完、已经写过的那一天。
        window.localStorage.removeItem(lastDateKey)
      } catch {
        // 忽略本地存储异常
      }

      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['post-by-date', selectedDate] })

      // 直接去个人中心看着刚发的那条，形成闭环
      window.setTimeout(() => navigate('/profile'), 1200)
    },
    onError: (error) => {
      const requestError = toRequestError(error)
      const presentation = presentError(error)
      setErrorHint(
        requestError.status === 409
          ? '这一天已经写过一条了，去个人中心看看或调整它的可见性。'
          : requestError.status === 400
            ? (error as Error).message
            : `${presentation.title}：${presentation.hint}`
      )
    },
  })

  function onSubmit(data: CreatePostParams) {
    setErrorHint('')
    createMutation.mutate({
      ...data,
      mood: selectedMood?.name,
      visibility,
      post_date: selectedDate,
    })
  }

  function handleDateChange(date: string) {
    setSuccessMessage('')
    setErrorHint('')
    setSelectedDate(date)
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
          <h1 className="text-lg font-medium text-gray-900">发布创作</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="container-max py-8 px-4">
        <div className="max-w-xl mx-auto">
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 text-green-600 text-center rounded-lg">
              {successMessage}
            </div>
          )}

          {/* 日期选择：今天及前 3 天可补写 */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">选择要写的日期</p>
            <div className="grid grid-cols-4 gap-2">
              {dateOptions.map((option) => (
                <button
                  key={option.date}
                  type="button"
                  onClick={() => handleDateChange(option.date)}
                  className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                    selectedDate === option.date
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-sm">{option.label}</span>
                  <span className="block text-[11px] opacity-70 mt-0.5">
                    {option.date.slice(5)}
                  </span>
                </button>
              ))}
            </div>
            {isBackfill && (
              <p className="mt-2 text-xs text-amber-700">
                你正在补写 {selectedDate} 的创作；最多可补写最近 {BACKFILL_WINDOW_DAYS} 天。
              </p>
            )}
          </div>

          {!successMessage && isPostLoading && (
            <div className="py-10 text-center text-sm text-gray-400">正在检查这一天…</div>
          )}

          {/* 所选日期已经写过：直接给出出口 */}
          {!successMessage && !isPostLoading && selectedPost && (
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-medium text-gray-900">
                  {selectedPost.status === 'deleted'
                    ? '这一天的创作在回收站'
                    : isBackfill
                      ? '这一天已经写过了'
                      : '今天已经写过了'}
                </h2>
                {selectedPost.display_status && (
                  <span className="text-xs text-gray-500">{selectedPost.display_status}</span>
                )}
              </div>
              <p className="text-gray-700 whitespace-pre-wrap mb-4">{selectedPost.content}</p>
              {selectedPost.status === 'deleted' ? (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-5">
                  这一天的创作已被删除，但发布名额仍被占用；删除不会释放该日期。
                  可以到回收站恢复它，或选择其他日期补写。
                </p>
              ) : (
                <p className="text-xs text-gray-400 mb-5">
                  每天只能发布一条。你仍然可以随时把它改成「仅自己可见」或重新公开。
                </p>
              )}
              <div className="flex gap-3">
                {selectedPost.status === 'deleted' ? (
                  <Link
                    to="/trash"
                    className="flex-1 py-2 text-center bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                  >
                    去回收站恢复
                  </Link>
                ) : (
                  <Link
                    to={`/post/${selectedPost.id}`}
                    className="flex-1 py-2 text-center bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                  >
                    查看这条创作
                  </Link>
                )}
                <Link
                  to="/"
                  className="flex-1 py-2 text-center border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  看看别人的
                </Link>
              </div>
            </div>
          )}

          {/* 未发布：正常表单 */}
          {!successMessage && !isPostLoading && !selectedPost && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isBackfill ? `补写 ${selectedDate}` : '今日创作'}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  谁能看到
                </label>
                <div className="flex gap-3">
                  {(
                    [
                      { value: 'public', label: '公开', desc: '出现在时间线里' },
                      { value: 'private', label: '仅自己可见', desc: '只有你能看到' },
                    ] as { value: PostVisibility; label: string; desc: string }[]
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVisibility(option.value)}
                      className={`flex-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                        visibility === option.value
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {errorHint && <p className="text-sm text-red-500">{errorHint}</p>}

              <button
                type="submit"
                disabled={isSubmitting || createMutation.isPending}
                className="w-full py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting || createMutation.isPending
                  ? isBackfill
                    ? '补写中...'
                    : '发布中...'
                  : isBackfill
                    ? '补写'
                    : '发布'}
              </button>

              <p className="text-center text-sm text-gray-400">
                内容会自动保存在本机；正式发布前每天只能有一条创作。
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
