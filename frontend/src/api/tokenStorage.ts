export const ACCESS_TOKEN_KEY = 'access_token'
export const REFRESH_TOKEN_KEY = 'refresh_token'

export interface AuthTokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in?: number
  refresh_expires_in?: number
}

function readStorage(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined' || !value) {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 忽略存储失败，避免影响正常登录
  }
}

export function getAccessToken(): string {
  return readStorage(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string {
  return readStorage(REFRESH_TOKEN_KEY)
}

export function storeAuthTokens(tokens: AuthTokenPair): void {
  writeStorage(ACCESS_TOKEN_KEY, tokens.access_token)
  writeStorage(REFRESH_TOKEN_KEY, tokens.refresh_token)
}

export function clearAuthTokens(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY)
    window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // 忽略清理失败
  }
}
