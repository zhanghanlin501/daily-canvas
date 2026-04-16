/**
 * LoadingSpinner 组件
 * 加载状态的显示组件
 */

export default function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center py-12">
      {/* 简单的旋转加载动画 */}
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
    </div>
  )
}