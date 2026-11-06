/**
 * 请求错误分类与文案
 *
 * 之前的实现把「网络不可达」和「服务器 500」都显示成同一句
 * 「请求失败」，用户无法判断该重试、该换网络还是该等一会儿。
 * 这里统一给出分类后的提示与可执行动作。
 */

import type { ApiRequestError } from '../api/request'

export interface ErrorPresentation {
  title: string
  hint: string
  canRetry: boolean
}

export function toRequestError(error: unknown): ApiRequestError {
  if (error instanceof Error) {
    return error as ApiRequestError
  }
  return new Error('请求失败') as ApiRequestError
}

export function presentError(error: unknown): ErrorPresentation {
  const requestError = toRequestError(error)

  if (requestError.isNetworkError) {
    return {
      title: '网络不可达',
      hint: '请检查手机网络，或在「关于」页做一次服务检测',
      canRetry: true,
    }
  }

  if (requestError.isTimeout) {
    return {
      title: '请求超时',
      hint: '服务器响应较慢，请稍后重试',
      canRetry: true,
    }
  }

  const status = requestError.status
  if (status && status >= 500) {
    return {
      title: '服务器暂时不可用',
      hint: '已记录该问题，请稍后重试',
      canRetry: true,
    }
  }

  if (status === 401) {
    return {
      title: '登录状态已失效',
      hint: '请重新登录后再试',
      canRetry: false,
    }
  }

  if (status === 403) {
    return {
      title: '没有权限执行该操作',
      hint: requestError.message,
      canRetry: false,
    }
  }

  if (status === 429) {
    return {
      title: requestError.message || '操作过于频繁',
      hint: '为了账号安全已暂时限制尝试，请稍后再试',
      canRetry: true,
    }
  }

  return {
    title: requestError.message || '请求失败',
    hint: '请稍后重试',
    canRetry: true,
  }
}
