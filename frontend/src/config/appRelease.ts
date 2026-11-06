/**
 * 版本发布清单
 *
 * 清单文件（app-release.json）描述最新版本号、更新说明和安装包地址。
 * 发布新版本时只需要更新这份 JSON，App 不需要重新发版就能知道有更新。
 */

import { resolveRuntimeConfig } from './runtimeConfig'

const rawManifestUrls = (import.meta as any).env?.VITE_APP_RELEASE_URLS || ''

const GITEE_MANIFEST_URLS = [
  // 优先走自己服务的下载目录，保证清单和安装包是同一批发布的
  '/downloads/app-release.json',
  'https://gitee.com/zh_anghanlin/daily-canvas/raw/runtime-config/deploy/app-release.json',
  'https://gitee.com/api/v5/repos/zh_anghanlin/daily-canvas/contents/deploy/app-release.json?ref=runtime-config',
]

const MANIFEST_URLS: string[] = String(rawManifestUrls)
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean)

const RESOLVED_MANIFEST_URLS = MANIFEST_URLS.length > 0 ? MANIFEST_URLS : GITEE_MANIFEST_URLS

const CACHE_KEY = 'daily_canvas_app_release_v1'

export interface AppReleaseManifest {
  versionCode: number
  versionName: string
  releaseNotes: string[]
  apkUrl?: string
  apkPath?: string
  sha256?: string
  size?: number
  forceUpdate?: boolean
  minSupportedVersionCode?: number
  publishedAt?: string
}

export interface AppReleaseResolution {
  manifest: AppReleaseManifest
  apkUrl?: string
  source: string
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function toReleaseNotes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
  }

  return []
}

function normalizeManifest(payload: unknown): AppReleaseManifest | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const versionName =
    typeof record.versionName === 'string' ? record.versionName.trim() : ''
  const versionCode = Number(record.versionCode)

  if (!versionName || !Number.isFinite(versionCode) || versionCode <= 0) {
    return null
  }

  return {
    versionCode: Math.floor(versionCode),
    versionName,
    releaseNotes: toReleaseNotes(record.releaseNotes ?? record.changelog),
    apkUrl: typeof record.apkUrl === 'string' && record.apkUrl.trim() ? record.apkUrl.trim() : undefined,
    apkPath: typeof record.apkPath === 'string' && record.apkPath.trim() ? record.apkPath.trim() : undefined,
    sha256: typeof record.sha256 === 'string' && record.sha256.trim() ? record.sha256.trim() : undefined,
    size: Number.isFinite(Number(record.size)) ? Number(record.size) : undefined,
    forceUpdate: record.forceUpdate === true,
    minSupportedVersionCode: Number.isFinite(Number(record.minSupportedVersionCode))
      ? Number(record.minSupportedVersionCode)
      : undefined,
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : undefined,
  }
}

function decodeBase64Utf8(value: string): string {
  const normalized = value.replace(/\n/g, '')
  const binary = window.atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function parseManifestResponse(response: Response): Promise<unknown> {
  const payload = await response.json()

  if (payload && typeof payload === 'object' && 'content' in payload) {
    const content = typeof (payload as { content?: unknown }).content === 'string'
      ? (payload as { content: string }).content
      : ''
    return JSON.parse(decodeBase64Utf8(content))
  }

  return payload
}

function readCache(): AppReleaseManifest | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }

    return normalizeManifest(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeCache(manifest: AppReleaseManifest): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(manifest))
  } catch {
    // 缓存失败不影响更新检查
  }
}

/**
 * 安装包地址的基地址：清单从哪里取到的，就优先用那个站点的地址下载，
 * 避免运行时公网地址和清单来源不一致时下载失败。
 */
function resolveBaseUrl(manifestUrl: string, publicBaseUrl?: string): string | undefined {
  if (manifestUrl.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin
    }

    return publicBaseUrl
  }

  if (!manifestUrl.startsWith('http')) {
    return publicBaseUrl
  }

  if (publicBaseUrl && manifestUrl.startsWith(publicBaseUrl)) {
    return publicBaseUrl
  }

  // 配置在 Gitee 上的清单，安装包仍然放在自己的服务里
  return publicBaseUrl
}

/**
 * 解析安装包的最终下载地址：绝对地址优先，否则相对基地址拼出完整 URL。
 */
export function resolveApkUrl(
  manifest: AppReleaseManifest,
  baseUrl?: string,
): string | undefined {
  if (manifest.apkUrl) {
    return isHttpUrl(manifest.apkUrl) || !baseUrl
      ? manifest.apkUrl
      : `${baseUrl.replace(/\/+$/, '')}${manifest.apkUrl}`
  }

  if (manifest.apkPath && baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}${manifest.apkPath}`
  }

  return undefined
}

/**
 * 拉取最新版本清单，网络不可用时回退到上次缓存。
 */
export async function fetchLatestRelease(): Promise<AppReleaseResolution | null> {
  const runtimeConfig = await resolveRuntimeConfig()
  const publicBaseUrl = runtimeConfig.publicBaseUrl

  const candidates: string[] = []

  for (const url of RESOLVED_MANIFEST_URLS) {
    if (url.startsWith('/')) {
      if (publicBaseUrl) {
        candidates.push(`${publicBaseUrl.replace(/\/+$/, '')}${url}`)
      }

      // 当前页面同源地址兜底，便于本地调试以及公网地址变化时仍能取到清单
      candidates.push(url)
      continue
    }

    candidates.push(url)
  }

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        continue
      }

      const manifest = normalizeManifest(await parseManifestResponse(response))
      if (!manifest) {
        continue
      }

      writeCache(manifest)
      return {
        manifest,
        apkUrl: resolveApkUrl(manifest, resolveBaseUrl(url, publicBaseUrl)),
        source: url,
      }
    } catch {
      // 当前来源不可用时继续尝试下一个
    }
  }

  const cached = readCache()
  if (cached) {
    return {
      manifest: cached,
      apkUrl: resolveApkUrl(cached, publicBaseUrl),
      source: 'cache',
    }
  }

  return null
}

export function hasNewerVersion(manifest: AppReleaseManifest, versionCode: number): boolean {
  return Number.isFinite(versionCode) && versionCode > 0 && manifest.versionCode > versionCode
}
