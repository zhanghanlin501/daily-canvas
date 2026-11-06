/**
 * 应用更新状态管理
 *
 * 负责：读取当前版本 → 拉取最新版本 → 下载安装包 → 调起安装。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PluginListenerHandle } from '@capacitor/core'
import {
  AppUpdater,
  isNativeUpdaterAvailable,
  readAppInfo,
  type DownloadCompletedEvent,
  type DownloadProgressEvent,
  type InstallCompletedEvent,
  type InstallReturnedEvent,
  type NativeAppInfo,
} from '../native/appUpdater'
import {
  fetchLatestRelease,
  hasNewerVersion,
  type AppReleaseManifest,
} from '../config/appRelease'
import { describeInstallError } from '../utils/installErrors'

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'downloading'
  | 'needs-permission'
  | 'downloaded'
  | 'installing'
  | 'install-returned'
  | 'installed'
  | 'error'

export interface DownloadProgressState {
  percent: number
  received: number
  total: number
}

const EMPTY_PROGRESS: DownloadProgressState = { percent: 0, received: 0, total: 0 }

export function useAppUpdate() {
  const [appInfo, setAppInfo] = useState<NativeAppInfo | null>(null)
  const [manifest, setManifest] = useState<AppReleaseManifest | null>(null)
  const [apkUrl, setApkUrl] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<AppUpdateStatus>('idle')
  const [progress, setProgress] = useState<DownloadProgressState>(EMPTY_PROGRESS)
  const [errorMessage, setErrorMessage] = useState('')

  const downloadedPathRef = useRef('')
  const listenerHandlesRef = useRef<PluginListenerHandle[]>([])
  const statusRef = useRef<AppUpdateStatus>('idle')

  const isNative = isNativeUpdaterAvailable()

  const changeStatus = useCallback((next: AppUpdateStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  // 读取当前安装包版本
  useEffect(() => {
    let active = true

    readAppInfo().then((info) => {
      if (active) {
        setAppInfo(info)

        if (info.installState === 'completed') {
          changeStatus('installed')
          return
        }

        if (!info.pendingApkPath) {
          return
        }

        // 上次下载完但没装成：重启后仍然能直接继续安装，不必重新下载
        downloadedPathRef.current = info.pendingApkPath
        changeStatus(
          info.installState === 'awaiting_permission' ? 'needs-permission' : 'downloaded',
        )
      }
    })

    return () => {
      active = false
    }
  }, [changeStatus])

  // 监听原生下载/安装事件
  useEffect(() => {
    if (!isNative) {
      return
    }

    let active = true

    async function bindListeners() {
      const handles: PluginListenerHandle[] = []

      handles.push(
        await AppUpdater.addListener('downloadProgress', (event: DownloadProgressEvent) => {
          setProgress({
            percent: Math.max(0, Math.min(100, event.percent)),
            received: event.received,
            total: event.total,
          })
        }),
      )

      handles.push(
        await AppUpdater.addListener('downloadCompleted', (event: DownloadCompletedEvent) => {
          downloadedPathRef.current = event.path
          setProgress((current) => ({ ...current, percent: 100 }))
          if (statusRef.current === 'downloading') {
            changeStatus('downloaded')
          }
        }),
      )

      handles.push(
        await AppUpdater.addListener('installLaunched', () => {
          changeStatus('installing')
        }),
      )

      handles.push(
        await AppUpdater.addListener('installPermissionRequired', () => {
          changeStatus('needs-permission')
        }),
      )

      handles.push(
        await AppUpdater.addListener('installFailed', (event) => {
          setErrorMessage(describeInstallError(event.message, '安装器打开失败，请重试'))
          changeStatus('error')
        }),
      )

      handles.push(
        await AppUpdater.addListener('installReturned', (event: InstallReturnedEvent) => {
          if (event.installed) {
            changeStatus('installed')
            return
          }

          // 用户在系统安装器里点了取消：给出重试入口，而不是停在"已调起安装"
          if (event.path) {
            downloadedPathRef.current = event.path
          }
          setErrorMessage('安装未完成，你可以重试安装，或重新下载安装包')
          changeStatus('install-returned')
        }),
      )

      handles.push(
        await AppUpdater.addListener('installCompleted', (_event: InstallCompletedEvent) => {
          downloadedPathRef.current = ''
          setErrorMessage('')
          changeStatus('installed')
          // 版本号变了，重新读一次，让「当前版本」立刻更新
          readAppInfo()
            .then(setAppInfo)
            .catch(() => undefined)
        }),
      )

      if (active) {
        listenerHandlesRef.current = handles
      } else {
        handles.forEach((handle) => handle.remove())
      }
    }

    bindListeners()

    return () => {
      active = false
      listenerHandlesRef.current.forEach((handle) => handle.remove())
      listenerHandlesRef.current = []
    }
  }, [changeStatus, isNative])

  const checkUpdate = useCallback(async () => {
    setErrorMessage('')
    changeStatus('checking')

    try {
      const resolution = await fetchLatestRelease()
      if (!resolution) {
        setErrorMessage('暂时获取不到版本信息，请检查网络后重试')
        changeStatus('error')
        return
      }

      setManifest(resolution.manifest)
      setApkUrl(resolution.apkUrl)

      const currentVersionCode = appInfo?.versionCode || 0
      if (hasNewerVersion(resolution.manifest, currentVersionCode)) {
        changeStatus('available')
      } else {
        changeStatus('latest')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '检查更新失败')
      changeStatus('error')
    }
  }, [appInfo?.versionCode, changeStatus])

  const startDownload = useCallback(async () => {
    if (!manifest) {
      return
    }

    if (!apkUrl) {
      setErrorMessage('还没有配置安装包下载地址')
      changeStatus('error')
      return
    }

    setErrorMessage('')
    setProgress(EMPTY_PROGRESS)
    changeStatus('downloading')

    try {
      const result = await AppUpdater.downloadAndInstall({
        url: apkUrl,
        fileName: `daily-canvas-${manifest.versionName}.apk`,
        sha256: manifest.sha256,
        versionName: manifest.versionName,
        versionCode: manifest.versionCode,
      })

      if (result?.cancelled) {
        changeStatus('available')
        setProgress(EMPTY_PROGRESS)
        return
      }

      if (result?.path) {
        downloadedPathRef.current = result.path
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message || '下载安装包失败')
      changeStatus('error')
    }
  }, [apkUrl, changeStatus, manifest])

  const cancelDownload = useCallback(async () => {
    if (!isNative) {
      return
    }

    try {
      await AppUpdater.cancelDownload()
    } catch {
      // 忽略取消失败
    }
  }, [isNative])

  const installNow = useCallback(async () => {
    if (!isNative) {
      return
    }

    setErrorMessage('')

    try {
      const result = await AppUpdater.installDownloadedPackage({
        path: downloadedPathRef.current || undefined,
        versionCode: manifest?.versionCode,
      })

      if (result.launched) {
        changeStatus('installing')
      } else {
        setErrorMessage('需要先允许安装应用，授权后会自动继续')
        changeStatus('needs-permission')
      }
    } catch (error) {
      setErrorMessage(describeInstallError(error instanceof Error ? error.message : null, '安装失败，请重试'))
      changeStatus('error')
    }
  }, [changeStatus, isNative, manifest?.versionCode])

  const requestInstallPermission = useCallback(async () => {
    if (!isNative) {
      return
    }

    try {
      await AppUpdater.requestInstallPermission()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '打开设置失败')
      changeStatus('error')
    }
  }, [changeStatus, isNative])

  return {
    appInfo,
    manifest,
    apkUrl,
    status,
    progress,
    errorMessage,
    isNative,
    pendingVersionName: appInfo?.pendingVersionName,
    checkUpdate,
    startDownload,
    cancelDownload,
    installNow,
    requestInstallPermission,
  }
}
