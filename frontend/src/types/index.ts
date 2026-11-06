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
 * 公开用户信息：出现在时间线等公开接口中，不包含邮箱。
 */
export interface PublicUser {
  id: number
  username: string
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
  refresh_token: string
  token_type: string
  expires_in?: number
  refresh_expires_in?: number
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
  post_date: string
  created_at: string
  updated_at: string
  edited_at?: string | null
  /** 作者软删除时间：进入回收站后写入 */
  deleted_at?: string | null
  /** 是否由作者本人删除；管理端强制删除的内容不会进入作者回收站 */
  deleted_by_author?: boolean | null
  /** 作者意图：公开 / 仅自己可见 */
  visibility: PostVisibility
  /** 平台裁定：正常 / 审核中 / 已隐藏 / 已删除 */
  status: PostStatus
  /** 只有作者本人请求时返回，可直接用于徽标展示 */
  display_status?: string | null
  /** 内容编辑窗口是否仍在 24 小时内（可见性切换不受此限制） */
  can_edit_content?: boolean | null
  // 关联的用户信息
  user?: PublicUser
  // 关联的情绪信息
  mood_info?: Mood
}

export type PostVisibility = 'public' | 'private'
export type PostStatus = 'normal' | 'pending' | 'hidden' | 'deleted'

/**
 * 创建创作的请求参数
 */
export interface CreatePostParams {
  content: string
  mood?: string
  visibility?: PostVisibility
  /** 创作归属日期；不传表示今天，传过去日期表示补写 */
  post_date?: string
}

/** 24 小时内容编辑窗口内的修改参数；可见性有独立接口 */
export interface UpdatePostParams {
  content?: string
  mood?: string | null
}

/**
 * 创作列表查询参数
 */
export interface PostsQueryParams {
  page?: number
  limit?: number
}

// ==================== 内容安全相关类型 ====================

export interface ReportParams {
  reason: string
  detail?: string
  block_author?: boolean
}

export interface ReportRecord {
  id: number
  ticket_no: string
  target_type: string
  target_id: number
  reason: string
  detail?: string | null
  status: 'pending' | 'reviewing' | 'resolved' | 'rejected'
  created_at: string
  target_excerpt?: string | null
  target_author?: string | null
  block_created?: boolean
}

export interface BlockedUser {
  user_id: number
  username: string
  blocked_at: string
}

export interface StatusHistoryEntry {
  from_status?: string | null
  to_status: string
  reason?: string | null
  actor_type: 'user' | 'staff' | 'system'
  actor_id?: number | null
  created_at: string
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
