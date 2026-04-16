/**
 * 认证相关 API 接口
 * 提供登录、注册、登出等功能
 */

import api from './request'
import type {
  User,
  RegisterParams,
  LoginParams,
  LoginResponse,
  AuthResponse,
} from '../types'

interface LoginTokenPayload {
  access_token: string
  token_type: string
}

/**
 * 用户注册
 * @param params - 注册参数（用户名、邮箱、密码）
 * @returns 新创建的用户信息
 */
export async function register(params: RegisterParams): Promise<User> {
  const response = await api.post<User>('/auth/register', params)
  return response.data
}

/**
 * 用户登录
 * 按后端 OAuth2 表单格式发送凭证，再补取当前用户信息
 * @param params - 登录参数（邮箱、密码）
 * @returns 包含 access_token、token_type 和用户信息的响应
 */
export async function login(params: LoginParams): Promise<LoginResponse> {
  const formData = new URLSearchParams({
    username: params.email,
    password: params.password,
  })

  const tokenResponse = await api.post<LoginTokenPayload>('/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const userResponse = await api.get<AuthResponse>('/auth/me', {
    headers: {
      Authorization: `Bearer ${tokenResponse.data.access_token}`,
    },
  })

  return {
    ...tokenResponse.data,
    user: userResponse.data.user,
  }
}

/**
 * 获取当前登录用户信息
 * 需要携带有效的 JWT Token
 * @returns 当前用户信息
 */
export async function getCurrentUser(): Promise<User> {
  const response = await api.get<AuthResponse>('/auth/me')
  return response.data.user
}

/**
 * 用户登出
 * 清除本地的 token
 */
export function logout(): void {
  localStorage.removeItem('access_token')
}
