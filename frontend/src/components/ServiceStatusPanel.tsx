/**
 * 服务状态自查
 *
 * 网络错误的提示里写了「去关于页做一次服务检测」，这里把这件事真正做出来：
 * 展示当前解析到的服务地址与配置来源，允许手动探测健康检查接口，
 * 并在隧道地址失效时主动丢弃缓存、重新获取地址。
 */

import { useEffect, useState } from 'react'
import {
  invalidateRuntimeConfig,
  resolveRuntimeConfig,
  type ResolvedRuntimeConfig,
} from '../config/runtimeConfig'

type ProbeState = 'idle' | 'probing' | 'ok' | 'fail'

const SOURCE_LABELS: Record<ResolvedRuntimeConfig['resolvedFrom'], string> = {
  remote: '远程配置',
  cache: '本地缓存',
  env: '内置地址',
  default: '默认地址',
}

const PROBE_TIMEOUT_MS = 5000

export default function ServiceStatusPanel() {
  const [config, setConfig] = useState<ResolvedRuntimeConfig | null>(null)
  const [probeState, setProbeState] = useState<ProbeState>('idle')
  const [probeMessage, setProbeMessage] = useState('')

  async function loadConfig(forceRefresh: boolean) {
    if (forceRefresh) {
      invalidateRuntimeConfig()
    }

    try {
      const resolved = await resolveRuntimeConfig()
      setConfig(resolved)
      setProbeState('idle')
      setProbeMessage('')
    } catch {
      setProbeState('fail')
      setProbeMessage('服务地址配置读取失败，请检查网络后重试')
    }
  }

  useEffect(() => {
    void loadConfig(false)
    // 只在挂载时读取一次，之后由用户手动刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function probeHealth() {
    if (!config) {
      await loadConfig(true)
      return
    }

    setProbeState('probing')
    setProbeMessage('')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const readinessUrl = `${config.apiBaseUrl}/health/ready`

    try {
      const response = await fetch(readinessUrl, {
        cache: 'no-store',
        signal: controller.signal,
      })

      if (response.status === 404) {
        // 旧版本后端没有就绪检查，退回到存活检查，至少确认服务可达
        const fallback = await fetch(config.healthUrl || `${config.apiBaseUrl}/health`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!fallback.ok) {
          throw new Error(`服务返回 ${fallback.status}`)
        }
        setProbeState('ok')
        setProbeMessage('服务可达（当前后端版本未提供数据库就绪检查）')
        return
      }

      if (response.status === 503) {
        setProbeState('fail')
        setProbeMessage('服务进程在运行，但数据库不可用，请稍后重试或联系管理员')
        return
      }

      if (!response.ok) {
        throw new Error(`服务返回 ${response.status}`)
      }

      setProbeState('ok')
      setProbeMessage('服务正常，数据库可用')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setProbeState('fail')
      setProbeMessage(
        reason.includes('aborted') || reason.includes('abort')
          ? '检测超时：服务可能正在重启或网络不稳定，请稍后重试'
          : `服务暂时不可达（${reason}），请检查网络，或点「重新获取地址」`,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  const address = config?.publicBaseUrl || config?.apiBaseUrl || '读取中…'

  return (
    <div className="max-w-xl mx-auto mb-8 border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-900 text-sm font-medium">服务状态</span>
        <span className="text-xs text-gray-400">
          {config ? SOURCE_LABELS[config.resolvedFrom] : '读取中…'}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3 mb-4">
        <span className="text-gray-500 text-sm shrink-0">服务地址</span>
        <span className="text-gray-900 text-xs break-all text-right">{address}</span>
      </div>

      {probeMessage && (
        <p
          className={`text-sm mb-3 ${
            probeState === 'ok'
              ? 'text-green-600'
              : probeState === 'fail'
                ? 'text-orange-600'
                : 'text-gray-500'
          }`}
        >
          {probeMessage}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={probeHealth}
          disabled={probeState === 'probing'}
          className="flex-1 py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {probeState === 'probing' ? '检测中…' : '检测服务'}
        </button>
        <button
          onClick={() => loadConfig(true)}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
        >
          重新获取地址
        </button>
      </div>
    </div>
  )
}
