/**
 * 极简全局提示
 *
 * 举报 / 拉黑这类操作会让当前卡片从列表里消失，
 * 提示信息不能再挂在卡片内部（卡片没了提示也没了），所以放到页面级。
 */

type ToastListener = (message: string) => void

const listeners = new Set<ToastListener>()

export function showToast(message: string): void {
  listeners.forEach((listener) => listener(message))
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
