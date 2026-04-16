/**
 * TypeScript 类型定义文件
 * 集中管理项目中使用的所有类型，提高代码可维护性和类型安全
 */

// ==================== 用户相关类型 ====================

/**
 * 用户信息接口
 */
export interface User {
  id: number
  username: string
  email: string
  created_at: string
}

/**
 * 注册请求参数
 */
export interface RegisterParams {
  username: string
  email: string
  password: string
}

/**
 * 登录请求参数
 */
export interface LoginParams {
  email: string
  password: string
}

/**
 * 登录响应结果
 */
export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

// ==================== 创作相关类型 ====================

/**
 * 情绪标签接口
 */
export interface Mood {
  id: number
  name: string
  emoji: string
  color: string
}

/**
 * 创作内容接口
 */
export interface Post {
  id: number
  user_id: number
  content: string
  mood: string | null
  created_at: string
  updated_at: string
  // 关联的用户信息
  user?: User
  // 关联的情绪信息
  mood_info?: Mood
}

/**
 * 创建创作的请求参数
 */
export interface CreatePostParams {
  content: string
  mood?: string
}

/**
 * 创作列表查询参数
 */
export interface PostsQueryParams {
  page?: number
  limit?: number
}

/**
 * 分页响应结果
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

// ==================== API 响应类型 ====================

/**
 * 通用 API 错误响应
 */
export interface ApiError {
  detail: string
}

/**
 * 认证响应（用于验证 token）
 */
export interface AuthResponse {
  user: User
}