import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AuthProvider } from './context/AuthContext'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ComposePage from './pages/ComposePage'
import ExplorePage from './pages/ExplorePage'
import ProfilePage from './pages/ProfilePage'

/**
 * 受保护的路由组件
 * 当用户未登录时，重定向到登录页面
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/**
 * 公开路由组件
 * 当用户已登录时，重定向到首页
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()

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
        </Routes>
      </div>
    </AuthProvider>
  )
}

export default App