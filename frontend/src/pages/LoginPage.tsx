/**
 * 登录页面
 * 用户输入邮箱和密码进行登录
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth'
import { login } from '../api/auth'
import type { LoginParams } from '../types'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginParams>()

  async function onSubmit(data: LoginParams) {
    try {
      setErrorMessage('')
      const response = await login(data)

      // 保存 token 到本地存储
      localStorage.setItem('access_token', response.access_token)

      // 更新全局用户状态
      setUser(response.user)

      // 跳转到首页
      navigate('/')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登录失败')
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Daily Canvas
          </h1>
          <p className="text-gray-500">欢迎回来</p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 错误提示 */}
          {errorMessage && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {errorMessage}
            </div>
          )}

          {/* 邮箱字段 */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              {...register('email', {
                required: '请输入邮箱',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: '请输入有效的邮箱地址',
                },
              })}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* 密码字段 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              {...register('password', {
                required: '请输入密码',
                minLength: {
                  value: 6,
                  message: '密码至少6个字符',
                },
              })}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '登录中...' : '登录'}
          </button>
        </form>

        {/* 注册链接 */}
        <p className="text-center mt-6 text-gray-500">
          还没有账号？{' '}
          <Link to="/register" className="text-gray-900 hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  )
}