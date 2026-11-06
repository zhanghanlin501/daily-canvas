import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { invalidateRuntimeConfig, resolveApiBaseUrl } from '../config/runtimeConfig'
import {
  type AuthTokenPair,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  storeAuthTokens,
} from './tokenStorage'

export const AUTH_UNAUTHORIZED_EVENT = 'daily-canvas:auth-unauthorized'

/**
 * 带状态码的请求错误。
 * 拦截器把 axios 错误统一成 Error，同时保留 HTTP 状态码与「网络不可达」标记，
 * 让调用方能区分「网络断了」「服务器出错」「业务校验失败」。
 */
export interface ApiRequestError extends Error {
  status?: number
  isNetworkError?: boolean
  isTimeout?: boolean
}

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

let refreshPromise: Promise<string | null> | null = null

const api: AxiosInstance = axios.create({
  baseURL: '/api',
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

async function requestNewAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return null
  }

  try {
    const baseURL = await resolveApiBaseUrl()
    const response = await axios.post<AuthTokenPair>(
      `${baseURL}/auth/refresh`,
      { refresh_token: refreshToken },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      },
    )

    storeAuthTokens(response.data)
    return response.data.access_token
  } catch {
    clearAuthTokens()
    return null
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = requestNewAccessToken().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken()
    const isAbsoluteUrl = !!config.url && /^https?:\/\//i.test(config.url)

    if (!isAbsoluteUrl) {
      config.baseURL = await resolveApiBaseUrl()
    }

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
  async (error: AxiosError) => {
    const requestUrl = error.config?.url || ''
    const isAuthRequest = AUTH_ENDPOINTS.some((endpoint) => requestUrl.endsWith(endpoint))
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (error.response?.status === 401 && !isAuthRequest) {
      if (originalRequest && !originalRequest._retry) {
        originalRequest._retry = true
        const accessToken = await refreshAccessToken()

        if (accessToken) {
          if (!originalRequest.headers) {
            originalRequest.headers = {} as InternalAxiosRequestConfig['headers']
          }
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api.request(originalRequest)
        }
      }

      clearAuthTokens()
      if (typeof window !== 'undefined' && !requestUrl.endsWith('/auth/logout')) {
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
      }
    }

    const errorMessage =
      extractErrorMessage(error.response?.data) ||
      error.message ||
      '请求失败'

    const requestError: ApiRequestError = new Error(errorMessage)
    requestError.status = error.response?.status
    requestError.isNetworkError = !error.response
    requestError.isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'

    // 网络不可达往往意味着隧道地址已经变了：丢掉缓存的地址，下次请求重新解析
    if (requestError.isNetworkError || requestError.isTimeout) {
      invalidateRuntimeConfig()
    }

    return Promise.reject(requestError)
  }
)

export default api
