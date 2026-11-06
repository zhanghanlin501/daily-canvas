const rawRuntimeConfigUrls = (import.meta as any).env?.VITE_RUNTIME_CONFIG_URLS || ''
const rawApiBaseUrl =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  (import.meta as any).env?.VITE_API_URL ||
  ''

const DEFAULT_RUNTIME_CONFIG_URLS = [
  'https://gitee.com/zh_anghanlin/daily-canvas/raw/runtime-config/deploy/runtime-config.json',
  'https://gitee.com/api/v5/repos/zh_anghanlin/daily-canvas/contents/deploy/runtime-config.json?ref=runtime-config',
]

const RUNTIME_CONFIG_URLS = rawRuntimeConfigUrls
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean)

const RESOLVED_RUNTIME_CONFIG_URLS =
  RUNTIME_CONFIG_URLS.length > 0 ? RUNTIME_CONFIG_URLS : DEFAULT_RUNTIME_CONFIG_URLS

const CACHED_API_BASE_URL_KEY = 'daily_canvas_api_base_url'
const CACHED_PUBLIC_BASE_URL_KEY = 'daily_canvas_public_base_url'

export interface RuntimeConfigPayload {
  apiBaseUrl: string
  publicBaseUrl?: string
  healthUrl?: string
  updatedAt?: string
  source?: string
}

export interface ResolvedRuntimeConfig extends RuntimeConfigPayload {
  resolvedFrom: 'remote' | 'cache' | 'env' | 'default'
  configUrl?: string
}

let resolvedRuntimeConfigPromise: Promise<ResolvedRuntimeConfig> | null = null
let resolvedRuntimeConfigAt = 0

// 远程配置源最长等待时间：网络不通时必须尽快回落，
// 否则「解析服务器地址」会拖住所有接口请求，用户看到的就是"网络错误"。
const REMOTE_CONFIG_TIMEOUT_MS = 4000
// 内存缓存的重新解析间隔：隧道地址切换后，已打开的 App 最迟 5 分钟自动跟上
const RESOLVE_TTL_MS = 5 * 60 * 1000

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function readLocalStorage(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeLocalStorage(key: string, value: string | undefined): void {
  if (typeof window === 'undefined' || !value) {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 忽略写缓存失败，避免影响正常请求
  }
}

function decodeBase64Utf8(value: string): string {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const normalized = value.replace(/\n/g, '')
    const binary = window.atob(normalized)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  return value
}

function normalizeRuntimePayload(payload: Partial<RuntimeConfigPayload>): RuntimeConfigPayload | null {
  const rawApiBaseUrlValue =
    typeof payload.apiBaseUrl === 'string' ? payload.apiBaseUrl.trim() : ''
  const rawPublicBaseUrlValue =
    typeof payload.publicBaseUrl === 'string' ? payload.publicBaseUrl.trim() : ''

  const normalizedPublicBaseUrl = rawPublicBaseUrlValue
    ? normalizeBaseUrl(rawPublicBaseUrlValue)
    : ''

  const normalizedApiBaseUrl = rawApiBaseUrlValue
    ? normalizeBaseUrl(rawApiBaseUrlValue)
    : normalizedPublicBaseUrl
      ? `${normalizedPublicBaseUrl}/api`
      : ''

  if (!normalizedApiBaseUrl) {
    return null
  }

  return {
    apiBaseUrl: normalizedApiBaseUrl,
    publicBaseUrl: normalizedPublicBaseUrl || undefined,
    healthUrl:
      typeof payload.healthUrl === 'string' && payload.healthUrl.trim()
        ? payload.healthUrl.trim()
        : `${normalizedApiBaseUrl}/health`,
    updatedAt: payload.updatedAt,
    source: payload.source,
  }
}

async function parseRuntimeConfigResponse(response: Response): Promise<RuntimeConfigPayload | null> {
  const payload = await response.json()

  if (payload && typeof payload === 'object' && 'content' in payload) {
    const content = typeof payload.content === 'string' ? payload.content : ''
    const decoded = decodeBase64Utf8(content)
    return normalizeRuntimePayload(JSON.parse(decoded) as Partial<RuntimeConfigPayload>)
  }

  return normalizeRuntimePayload(payload as Partial<RuntimeConfigPayload>)
}

async function fetchSingleRuntimeConfig(configUrl: string): Promise<ResolvedRuntimeConfig> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_CONFIG_TIMEOUT_MS)

  try {
    const response = await fetch(configUrl, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) {
      throw new Error(`运行时配置不可用：${response.status}`)
    }

    const payload = await parseRuntimeConfigResponse(response)
    if (!payload || !isHttpUrl(payload.apiBaseUrl)) {
      throw new Error('运行时配置内容不合法')
    }

    writeLocalStorage(CACHED_API_BASE_URL_KEY, payload.apiBaseUrl)
    writeLocalStorage(CACHED_PUBLIC_BASE_URL_KEY, payload.publicBaseUrl)

    return {
      ...payload,
      resolvedFrom: 'remote',
      configUrl,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchRemoteRuntimeConfig(): Promise<ResolvedRuntimeConfig | null> {
  if (RESOLVED_RUNTIME_CONFIG_URLS.length === 0) {
    return null
  }

  // 并行尝试多个配置源，谁先成功用谁，避免串行等待把冷启动拖到十几秒
  return new Promise<ResolvedRuntimeConfig | null>((resolve) => {
    let pending = RESOLVED_RUNTIME_CONFIG_URLS.length
    let settled = false

    RESOLVED_RUNTIME_CONFIG_URLS.forEach((configUrl: string) => {
      fetchSingleRuntimeConfig(configUrl)
        .then((config) => {
          if (!settled) {
            settled = true
            resolve(config)
          }
        })
        .catch(() => {
          pending -= 1
          if (pending === 0 && !settled) {
            settled = true
            // 全部配置源都不可用：回落到本地缓存 / 环境变量 / 相对路径
            resolve(null)
          }
        })
    })
  })
}

function resolveCachedRuntimeConfig(): ResolvedRuntimeConfig | null {
  const cachedApiBaseUrl = normalizeBaseUrl(readLocalStorage(CACHED_API_BASE_URL_KEY))
  const cachedPublicBaseUrl = normalizeBaseUrl(readLocalStorage(CACHED_PUBLIC_BASE_URL_KEY))

  if (!cachedApiBaseUrl || !isHttpUrl(cachedApiBaseUrl)) {
    return null
  }

  return {
    apiBaseUrl: cachedApiBaseUrl,
    publicBaseUrl: cachedPublicBaseUrl || undefined,
    healthUrl: `${cachedApiBaseUrl}/health`,
    resolvedFrom: 'cache',
  }
}

function resolveEnvRuntimeConfig(): ResolvedRuntimeConfig | null {
  const normalizedEnvApiBaseUrl = normalizeBaseUrl(rawApiBaseUrl)

  if (!normalizedEnvApiBaseUrl) {
    return null
  }

  return {
    apiBaseUrl: normalizedEnvApiBaseUrl,
    publicBaseUrl: normalizedEnvApiBaseUrl.replace(/\/api$/, ''),
    healthUrl: `${normalizedEnvApiBaseUrl}/health`,
    resolvedFrom: 'env',
  }
}

async function loadRuntimeConfig(): Promise<ResolvedRuntimeConfig> {
  const remoteRuntimeConfig = await fetchRemoteRuntimeConfig()
  if (remoteRuntimeConfig) {
    return remoteRuntimeConfig
  }

  const cachedRuntimeConfig = resolveCachedRuntimeConfig()
  if (cachedRuntimeConfig) {
    return cachedRuntimeConfig
  }

  const envRuntimeConfig = resolveEnvRuntimeConfig()
  if (envRuntimeConfig) {
    return envRuntimeConfig
  }

  return {
    apiBaseUrl: '/api',
    publicBaseUrl: undefined,
    healthUrl: '/api/health',
    resolvedFrom: 'default',
  }
}

export async function resolveRuntimeConfig(): Promise<ResolvedRuntimeConfig> {
  const isExpired = Date.now() - resolvedRuntimeConfigAt > RESOLVE_TTL_MS

  if (!resolvedRuntimeConfigPromise || isExpired) {
    resolvedRuntimeConfigAt = Date.now()
    resolvedRuntimeConfigPromise = loadRuntimeConfig().catch((error) => {
      // 解析失败不能让整个 App 卡死：清掉缓存，下次请求重新解析
      resolvedRuntimeConfigPromise = null
      resolvedRuntimeConfigAt = 0
      throw error
    })
  }

  return resolvedRuntimeConfigPromise
}

/**
 * 丢弃已解析的地址，让下一次请求重新解析。
 * 请求出现网络错误时调用，这样隧道地址变化后不需要重启 App。
 */
export function invalidateRuntimeConfig(): void {
  resolvedRuntimeConfigPromise = null
  resolvedRuntimeConfigAt = 0
}

export async function resolveApiBaseUrl(): Promise<string> {
  const runtimeConfig = await resolveRuntimeConfig()
  return runtimeConfig.apiBaseUrl
}
