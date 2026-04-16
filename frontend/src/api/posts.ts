/**
 * 创作相关 API 接口
 * 提供创作发布、查询等功能
 */

import api from './request'
import type {
  Post,
  Mood,
  CreatePostParams,
  PostsQueryParams,
  PaginatedResponse,
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
export async function getRandomPost(): Promise<Post> {
  const response = await api.get<Post>('/posts/random')
  return response.data
}