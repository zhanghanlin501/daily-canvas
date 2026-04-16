/**
 * useAuth Hook
 * 提供简洁的认证状态访问接口
 * 是 AuthContext 的简化版本，用于不需要上下文完整功能的场景
 */

import { useAuthContext } from '../context/AuthContext'

/**
 * 返回认证相关状态
 * - user: 当前用户信息
 * - isAuthenticated: 是否已认证
 * - isLoading: 是否正在加载
 * - setUser: 更新当前用户
 * - login: 登录函数别名
 * - logout: 登出函数
 */
export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, logout } = useAuthContext()

  return {
    user,
    isAuthenticated,
    isLoading,
    setUser,
    login: setUser, // 简化命名
    logout,
  }
}
