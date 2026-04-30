import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

const rawApiBaseUrl =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  (import.meta as any).env?.VITE_API_URL ||
  ''

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '')
const isHttpOrigin =
  typeof window !== 'undefined' &&
  ['http:', 'https:'].includes(window.location.protocol)

const API_BASE_URL = normalizedApiBaseUrl || '/api'

if (!normalizedApiBaseUrl && typeof window !== 'undefined' && !isHttpOrigin) {
  console.warn(
    '当前运行环境不是 http/https，且未设置 VITE_API_BASE_URL。Android 真机请配置公网 API 地址。'
  )
}

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

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }

    const errorMessage =
      extractErrorMessage(error.response?.data) ||
      error.message ||
      '请求失败'

    return Promise.reject(new Error(errorMessage))
  }
)

export default api
