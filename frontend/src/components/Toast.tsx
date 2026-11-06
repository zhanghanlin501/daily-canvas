/**
 * 页面级提示条：固定在底部，3 秒后自动消失
 */

import { useEffect, useState } from 'react'
import { subscribeToast } from '../utils/toast'

export default function Toast() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    let timer: number | undefined

    const unsubscribe = subscribeToast((next) => {
      setMessage(next)
      if (timer) {
        window.clearTimeout(timer)
      }
      timer = window.setTimeout(() => setMessage(''), 3200)
    })

    return () => {
      if (timer) {
        window.clearTimeout(timer)
      }
      unsubscribe()
    }
  }, [])

  if (!message) {
    return null
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[90vw]">
      <div className="px-4 py-2 bg-gray-900/90 text-white text-sm rounded-full shadow-lg">
        {message}
      </div>
    </div>
  )
}
