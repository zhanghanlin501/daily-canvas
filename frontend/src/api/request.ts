/**
 * API 配置和请求工具
 * 使用 axios 封装 HTTP 请求，统一处理认证和错误
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

// API 基础 URL
// 在开发环境指向本地后端，生产环境可以通过环境变量配置
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  (import.meta as any).env?.VITE_API_URL ||
  '/api'

/**
 * 创建 axios 实例
 * 配置默认参数和拦截器
 */
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

function extractErrorMessage(data: unknown): string | null {
  if (typeof data === 'string') {
    return data
  }

  if (Array.isArray(data)) {
    const messages = data
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (
          item &&
          typeof item === 'object' &&
          'loc' in item &&
          'msg' in item &&
          Array.isArray(item.loc) &&
          typeof item.msg === 'string'
        ) {
          return `${item.loc.join('.')}：${item.msg}`
        }

        return null
      })
      .filter((message): message is string => !!message)

    return messages.length > 0 ? messages.join('；') : null
  }

  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail
    const message = (data as { message?: unknown }).message
    const msg = (data as { msg?: unknown }).msg

    return (
      extractErrorMessage(detail) ||
      (typeof message === 'string' ? message : null) ||
      (typeof msg === 'string' ? msg : null)
    )
  }

  return null
}

/**
 * 请求拦截器
 * 在发送请求前自动添加 JWT Token
 */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('access_token')

    // 如果存在 token，添加到请求头
    // Authorization 头使用 Bearer 方案
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error: AxiosError) => {
    // 请求错误处理
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 * 统一处理响应错误
 */
api.interceptors.response.use(
  (response) => {
    // 正常响应直接返回
    return response
  },
  (error: AxiosError) => {
    // 处理 401 未授权错误（token 过期或无效）
    if (error.response?.status === 401) {
      // 清除本地存储的 token
      localStorage.removeItem('access_token')
      // 可以在这里添加重定向到登录页的逻辑
      window.location.href = '/login'
    }

    // 从错误响应中提取错误信息
    const errorMessage =
      extractErrorMessage(error.response?.data) ||
      error.message ||
      '请求失败'

    // 返回带有错误信息的 Promise
    return Promise.reject(new Error(errorMessage))
  }
)

export default api
