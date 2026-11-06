/**
 * 创作相关 API 接口
 * 提供创作发布、查询等功能
 */

import api from './request'
import type { ApiRequestError } from './request'
import type {
  Post,
  Mood,
  CreatePostParams,
  UpdatePostParams,
  PostsQueryParams,
  PostVisibility,
  PaginatedResponse,
  StatusHistoryEntry,
} from '../types'

/**
 * 获取情绪标签列表
 * @returns 所有可用的情绪标签
 */
export async function getMoods(): Promise<Mood[]> {
  const response = await api.get<Mood[]>('/moods')
  return response.data
}

/**
 * 获取时间线（所有用户的创作）
 * @param params - 分页参数
 * @returns 分页的创作列表
 */
export async function getTimeline(
  params?: PostsQueryParams
): Promise<PaginatedResponse<Post>> {
  const response = await api.get<PaginatedResponse<Post>>('/posts', {
    params: {
      page: params?.page || 1,
      limit: params?.limit || 20,
    },
  })
  return response.data
}

/**
 * 获取当前用户的创作列表
 * @param params - 分页参数
 * @returns 分页的用户创作列表
 */
export async function getMyPosts(
  params?: PostsQueryParams
): Promise<PaginatedResponse<Post>> {
  const response = await api.get<PaginatedResponse<Post>>('/posts/me', {
    params: {
      page: params?.page || 1,
      limit: params?.limit || 20,
    },
  })
  return response.data
}

/**
 * 发布今日创作
 * 每个用户每天只能发布一条
 * @param params - 创作内容
 * @returns 创建的创作
 */
export async function createPost(params: CreatePostParams): Promise<Post> {
  const response = await api.post<Post>('/posts', params)
  return response.data
}

/**
 * 获取今天已经发布的那条创作（若存在）
 * 用于发布页做入口预防，避免用户写完才被拒绝
 * @returns 今天的创作，不存在时返回 null
 */
export async function getTodayPost(): Promise<Post | null> {
  try {
    const response = await api.get<Post>('/posts/today')
    return response.data
  } catch (error) {
    if ((error as ApiRequestError)?.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * 获取指定业务日期的创作（含已删除内容）。
 * 用于补写入口判断「这一天是否已经写过」，404 表示这一天还没有创作。
 */
export async function getPostByDate(date: string): Promise<Post | null> {
  try {
    const response = await api.get<Post>(`/posts/date/${date}`)
    return response.data
  } catch (error) {
    if ((error as ApiRequestError)?.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * 切换创作可见性（公开 / 仅自己可见）
 * 与内容编辑不同，可见性不受 24 小时编辑窗口限制
 * @param id - 创作 ID
 * @param visibility - 目标可见性
 */
export async function setPostVisibility(
  id: number,
  visibility: PostVisibility
): Promise<Post> {
  const response = await api.patch<Post>(`/posts/${id}/visibility`, { visibility })
  return response.data
}

/**
 * 24 小时内容编辑窗口内修改内容 / 情绪。
 * 超过窗口后端返回 409；用户仍可通过可见性接口随时调整公开范围。
 */
export async function updatePost(id: number, params: UpdatePostParams): Promise<Post> {
  const response = await api.patch<Post>(`/posts/${id}`, params)
  return response.data
}

/**
 * 作者软删除：内容进入回收站，30 天内可恢复。
 */
export async function deletePost(id: number): Promise<void> {
  await api.delete(`/posts/${id}`)
}

/**
 * 从回收站恢复作者本人删除的创作。
 */
export async function restorePost(id: number): Promise<Post> {
  const response = await api.post<Post>(`/posts/${id}/restore`)
  return response.data
}

/**
 * 获取当前用户的回收站（只包含作者本人删除的内容）。
 */
export async function getTrashPosts(
  params?: PostsQueryParams
): Promise<PaginatedResponse<Post>> {
  const response = await api.get<PaginatedResponse<Post>>('/posts/trash', {
    params: {
      page: params?.page || 1,
      limit: params?.limit || 20,
    },
  })
  return response.data
}

/**
 * 获取某条创作的状态变更历史（仅作者本人）
 */
export async function getPostStatusHistory(id: number): Promise<StatusHistoryEntry[]> {
  const response = await api.get<StatusHistoryEntry[]>(`/posts/${id}/status-history`)
  return response.data
}

/**
 * 获取单条创作详情
 * @param id - 创作 ID
 * @returns 创作详情
 */
export async function getPost(id: number): Promise<Post> {
  const response = await api.get<Post>(`/posts/${id}`)
  return response.data
}

/**
 * 随机漫步 - 获取一条随机创作
 * 用于探索其他用户的创作
 * @returns 随机选中的一条创作
 */
export async function getRandomPost(excludeId?: number): Promise<Post> {
  const response = await api.get<Post>('/posts/random', {
    params: excludeId ? { exclude_id: excludeId } : undefined,
  })
  return response.data
}
