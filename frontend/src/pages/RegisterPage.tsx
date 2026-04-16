/**
 * 注册页面
 * 新用户输入用户名、邮箱和密码进行注册
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth'
import { login, register as registerUser } from '../api/auth'
import type { RegisterParams } from '../types'

interface RegisterFormValues extends RegisterParams {
  confirmPassword: string
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>()

  // 监听密码字段，用于确认密码验证
  const password = watch('password')

  async function onSubmit(data: RegisterFormValues) {
    try {
      setErrorMessage('')
      await registerUser({
        username: data.username,
        email: data.email,
        password: data.password,
      })

      // 注册成功后自动登录
      const loginResponse = await login({
        email: data.email,
        password: data.password,
      })

      // 保存 token 到本地存储
      localStorage.setItem('access_token', loginResponse.access_token)

      // 更新全局用户状态
      setUser(loginResponse.user)

      // 跳转到首页
      navigate('/')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '注册失败')
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
          <p className="text-gray-500">创建你的账号</p>
        </div>

        {/* 注册表单 */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 错误提示 */}
          {errorMessage && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {errorMessage}
            </div>
          )}

          {/* 用户名字段 */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              id="username"
              type="text"
              placeholder="你的用户名"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              {...register('username', {
                required: '请输入用户名',
                minLength: {
                  value: 3,
                  message: '用户名至少3个字符',
                },
                maxLength: {
                  value: 50,
                  message: '用户名最多50个字符',
                },
              })}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-500">{errors.username.message}</p>
            )}
          </div>

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

          {/* 确认密码字段 */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              {...register('confirmPassword', {
                required: '请确认密码',
                validate: (value) =>
                  value === password || '两次输入的密码不一致',
              })}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '注册中...' : '注册'}
          </button>
        </form>

        {/* 登录链接 */}
        <p className="text-center mt-6 text-gray-500">
          已有账号？{' '}
          <Link to="/login" className="text-gray-900 hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </div>
  )
}
