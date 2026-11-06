import type { ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AuthProvider } from './context/AuthContext'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ComposePage from './pages/ComposePage'
import ExplorePage from './pages/ExplorePage'
import ProfilePage from './pages/ProfilePage'
import AboutPage from './pages/AboutPage'
import MyReportsPage from './pages/MyReportsPage'
import BlockedUsersPage from './pages/BlockedUsersPage'
import PostDetailPage from './pages/PostDetailPage'
import TrashPage from './pages/TrashPage'
import Toast from './components/Toast'

/**
 * 受保护的路由组件
 * 当用户未登录时，重定向到登录页面
 */
function RouteLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center text-sm text-gray-400">
      正在确认登录状态…
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <RouteLoading />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}

/**
 * 公开路由组件
 * 当用户已登录时，重定向到首页
 */
function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <RouteLoading />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

/**
 * App 主组件
 * 定义应用的路由结构
 */
function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-white">
        <Toast />
        <Routes>
        {/* 首页 - 时间线，所有人都可以访问 */}
        <Route path="/" element={<HomePage />} />

        {/* 登录页面 - 仅限未登录用户 */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        {/* 注册页面 - 仅限未登录用户 */}
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />

        {/* 发布创作页面 - 仅限已登录用户 */}
        <Route
          path="/compose"
          element={
            <ProtectedRoute>
              <ComposePage />
            </ProtectedRoute>
          }
        />

        {/* 随机漫步页面 - 仅限已登录用户 */}
        <Route
          path="/explore"
          element={
            <ProtectedRoute>
              <ExplorePage />
            </ProtectedRoute>
          }
        />

        {/* 个人中心页面 - 仅限已登录用户 */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* 我的举报 - 仅限已登录用户 */}
        <Route
          path="/my-reports"
          element={
            <ProtectedRoute>
              <MyReportsPage />
            </ProtectedRoute>
          }
        />

        {/* 已拉黑管理 - 仅限已登录用户 */}
        <Route
          path="/blocked-users"
          element={
            <ProtectedRoute>
              <BlockedUsersPage />
            </ProtectedRoute>
          }
        />

        {/* 回收站 - 仅限已登录用户，只包含作者本人删除的创作 */}
        <Route
          path="/trash"
          element={
            <ProtectedRoute>
              <TrashPage />
            </ProtectedRoute>
          }
        />

        {/* 关于页面 - 所有人都可以访问，用于查看版本与更新 */}
        <Route path="/about" element={<AboutPage />} />

        {/* 创作详情页 - 公开内容所有人可看，非公开内容由后端统一返回 404 */}
        <Route path="/post/:id" element={<PostDetailPage />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}

export default App
