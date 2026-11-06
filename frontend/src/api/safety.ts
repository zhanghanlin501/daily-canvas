/**
 * 内容安全相关 API：举报、拉黑
 */

import api from './request'
import type { BlockedUser, ReportParams, ReportRecord } from '../types'

/**
 * 举报一条创作
 * @param postId - 创作 ID
 * @param params - 举报理由、补充说明、是否同时拉黑作者
 */
export async function reportPost(
  postId: number,
  params: ReportParams
): Promise<ReportRecord> {
  const response = await api.post<ReportRecord>(`/posts/${postId}/report`, {
    block_author: true,
    ...params,
  })
  return response.data
}

/**
 * 举报理由分类，由后端提供，避免前后端枚举漂移
 */
export async function getReportReasons(): Promise<string[]> {
  const response = await api.get<string[]>('/reports/reasons')
  return response.data
}

/**
 * 我的举报记录与受理状态
 */
export async function getMyReports(): Promise<ReportRecord[]> {
  const response = await api.get<ReportRecord[]>('/reports/me')
  return response.data
}

/**
 * 拉黑某个用户（幂等）
 */
export async function blockUser(username: string): Promise<void> {
  await api.post(`/users/${encodeURIComponent(username)}/block`)
}

/**
 * 解除拉黑（幂等）
 */
export async function unblockUser(username: string): Promise<void> {
  await api.delete(`/users/${encodeURIComponent(username)}/block`)
}

/**
 * 我已拉黑的用户列表
 */
export async function getMyBlocks(): Promise<BlockedUser[]> {
  const response = await api.get<BlockedUser[]>('/blocks/me')
  return response.data
}
