/**
 * 认证上下文
 * 提供全局的认证状态管理
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'
import type { User } from '../types'
import { getCurrentUser } from '../api/auth'

/**
 * 认证上下文状态接口
 */
interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  setUser: (user: User | null) => void
  logout: () => void
}

/**
 * 创建认证上下文
 * 初始值为 undefined，便于后续检测是否已初始化
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * 认证提供者组件
 * 包裹应用，提供认证状态
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // 用户状态
  const [user, setUser] = useState<User | null>(null)
  // 加载状态
  const [isLoading, setIsLoading] = useState(true)

  /**
   * 初始化认证状态
   * 检查本地存储的 token 是否有效
   */
  useEffect(() => {
    async function initAuth() {
      const token = localStorage.getItem('access_token')

      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        // 验证 token，获取当前用户信息
        const userData = await getCurrentUser()
        setUser(userData)
      } catch (error) {
        // token 无效或过期，清除本地存储
        localStorage.removeItem('access_token')
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  /**
   * 登出函数
   * 清除用户状态和本地存储
   */
  function logout() {
    setUser(null)
    localStorage.removeItem('access_token')
  }

  // 计算是否已认证
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        setUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * 使用认证上下文
 * 在组件中获取认证状态和方法
 */
export function useAuthContext() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }

  return context
}