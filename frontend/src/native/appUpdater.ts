/**
 * 应用内更新桥接层
 *
 * 原生插件 AppUpdater 只在 Android 壳内注册，网页版访问时会自动降级为只读信息。
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface NativeAppInfo {
  platform: string
  packageName: string
  versionName: string
  versionCode: number
  appName: string
  canInstallPackages: boolean
  pendingApkPath?: string
  /** 已下载待安装的版本名，用于告诉用户"已下载 v1.0.3" */
  pendingVersionName?: string
  /** awaiting_permission / awaiting_result / completed，用于重启后恢复更新状态 */
  installState?: string
}

export interface DownloadProgressEvent {
  percent: number
  received: number
  total: number
}

export interface DownloadCompletedEvent {
  path: string
  size: number
  sha256: string
}

export interface InstallLaunchedEvent {
  path: string
}

export interface InstallFailedEvent {
  message: string
}

export interface InstallReturnedEvent {
  versionCode: number
  path: string
  installed: boolean
}

export interface InstallCompletedEvent {
  versionCode: number
  installed: boolean
}

export interface DownloadAndInstallOptions {
  url: string
  fileName?: string
  sha256?: string
  versionName?: string
  /** 目标版本号，原生侧用它判断安装是否真的成功 */
  versionCode?: number
}

export interface DownloadAndInstallResult {
  path?: string
  size?: number
  sha256?: string
  cancelled?: boolean
}

export interface AppUpdaterPlugin {
  getAppInfo(): Promise<NativeAppInfo>
  downloadAndInstall(options: DownloadAndInstallOptions): Promise<DownloadAndInstallResult>
  cancelDownload(): Promise<{ cancelled: boolean }>
  requestInstallPermission(): Promise<{ granted: boolean }>
  installDownloadedPackage(options?: {
    path?: string
    versionCode?: number
  }): Promise<{ launched: boolean; needsPermission: boolean }>
  addListener(
    eventName: 'downloadProgress',
    listener: (event: DownloadProgressEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'downloadCompleted',
    listener: (event: DownloadCompletedEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'installLaunched',
    listener: (event: InstallLaunchedEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'installPermissionRequired',
    listener: () => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'installFailed',
    listener: (event: InstallFailedEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'installReturned',
    listener: (event: InstallReturnedEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'installCompleted',
    listener: (event: InstallCompletedEvent) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater')

const webVersion = (import.meta as any).env?.VITE_APP_VERSION || '1.0.0'

export function isNativeUpdaterAvailable(): boolean {
  return Capacitor.getPlatform() === 'android'
}

/**
 * 读取当前应用版本。安卓壳内取真实安装包版本，网页版回退到构建版本号。
 */
export async function readAppInfo(): Promise<NativeAppInfo> {
  if (!isNativeUpdaterAvailable()) {
    return {
      platform: Capacitor.getPlatform(),
      packageName: 'com.dailycanvas.app',
      versionName: webVersion,
      versionCode: 0,
      appName: 'Daily Canvas',
      canInstallPackages: false,
    }
  }

  try {
    return await AppUpdater.getAppInfo()
  } catch {
    return {
      platform: 'android',
      packageName: 'com.dailycanvas.app',
      versionName: webVersion,
      versionCode: 0,
      appName: 'Daily Canvas',
      canInstallPackages: false,
    }
  }
}
