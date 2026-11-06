/**
 * 关于 App 页面
 * 展示版本信息、更新说明，并支持应用内下载安装新版本
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_BUILTIN_NOTES, APP_META } from '../config/appMeta'
import { useAppUpdate } from '../hooks/useAppUpdate'
import ServiceStatusPanel from '../components/ServiceStatusPanel'

function formatBytes(value: number | undefined): string {
  if (!value || value <= 0) {
    return ''
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function AboutPage() {
  const navigate = useNavigate()
  const {
    appInfo,
    manifest,
    status,
    progress,
    errorMessage,
    isNative,
    pendingVersionName,
    checkUpdate,
    startDownload,
    cancelDownload,
    installNow,
    requestInstallPermission,
  } = useAppUpdate()

  const autoCheckedRef = useRef(false)

  // 进入页面自动检查一次，用户也可以手动重新检查
  useEffect(() => {
    if (!appInfo || autoCheckedRef.current) {
      return
    }

    autoCheckedRef.current = true
    checkUpdate()
  }, [appInfo, checkUpdate])

  const notes = manifest?.releaseNotes?.length ? manifest.releaseNotes : APP_BUILTIN_NOTES
  const currentVersionText = appInfo ? `v${appInfo.versionName}` : '读取中…'
  const latestVersionText = manifest ? `v${manifest.versionName}` : '-'

  return (
    <div className="min-h-screen bg-white">
      {/* 头部导航 */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="container-max flex items-center justify-between h-16 px-4">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-medium text-gray-900">关于</h1>
          <span className="w-12" />
        </div>
      </header>

      <main className="container-max py-10 px-4">
        {/* 应用信息 */}
        <div className="text-center mb-10">
          <img
            src="/icons/icon-192.png"
            alt="Daily Canvas"
            className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-sm"
          />
          <h2 className="text-xl font-medium text-gray-900">{APP_META.chineseName}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {APP_META.name} {currentVersionText}
          </p>
          <p className="text-gray-500 text-sm mt-3 max-w-xs mx-auto">
            {APP_META.description}
          </p>
        </div>

        {/* 版本与更新 */}
        <div className="max-w-xl mx-auto mb-8 border border-gray-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-500 text-sm">当前版本</span>
            <span className="text-gray-900 text-sm">{currentVersionText}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-500 text-sm">最新版本</span>
            <span className="text-gray-900 text-sm">{latestVersionText}</span>
          </div>

          {/* 更新状态与操作 */}
          <div className="pt-2">
            {/* 网页版没有原生安装能力，直接说明，不再渲染点不动的"立即更新" */}
            {!isNative && (
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-3">
                  当前是网页版，安装更新请在 Android App 内操作
                </p>
                <button
                  onClick={checkUpdate}
                  disabled={status === 'checking'}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {status === 'checking' ? '正在检查更新…' : '重新检查'}
                </button>
              </div>
            )}

            {isNative && status === 'idle' && (
              <button
                onClick={checkUpdate}
                className="w-full py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
              >
                检查更新
              </button>
            )}

            {isNative && status === 'checking' && (
              <button
                disabled
                className="w-full py-2.5 bg-gray-100 text-gray-500 rounded-full"
              >
                正在检查更新…
              </button>
            )}

            {isNative && status === 'latest' && (
              <div className="text-center">
                <p className="text-sm mb-3 text-green-600">已是最新版本</p>
                <button
                  onClick={checkUpdate}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                >
                  重新检查
                </button>
              </div>
            )}

            {isNative && status === 'available' && (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  发现新版本 {latestVersionText}
                  {manifest?.size ? ` · ${formatBytes(manifest.size)}` : ''}
                </p>
                <button
                  onClick={startDownload}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
                >
                  立即更新
                </button>
              </div>
            )}

            {isNative && status === 'downloading' && (
              <div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gray-900 transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                  <span>正在下载 {progress.percent}%</span>
                  <span>{formatBytes(progress.total)}</span>
                </div>
                <button
                  onClick={cancelDownload}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                >
                  取消下载
                </button>
              </div>
            )}

            {isNative && status === 'downloaded' && (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  安装包已下载完成
                  {pendingVersionName ? `（v${pendingVersionName}）` : ''}，可以立即安装
                </p>
                <button
                  onClick={installNow}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors mb-2"
                >
                  立即安装
                </button>
                <button
                  onClick={startDownload}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                >
                  重新下载
                </button>
              </div>
            )}

            {isNative && status === 'needs-permission' && (
              <div>
                <p className="text-sm text-orange-600 mb-3">
                  需要先允许「Daily Canvas」安装应用，授权后返回会自动继续安装
                </p>
                <button
                  onClick={requestInstallPermission}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors mb-2"
                >
                  去授权
                </button>
                <button
                  onClick={installNow}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                >
                  已授权，重试安装
                </button>
              </div>
            )}

            {isNative && status === 'installing' && (
              <p className="text-sm text-gray-600 text-center py-2">
                已调起安装，请按系统提示完成更新
              </p>
            )}

            {/* 用户取消安装后回到应用：给出重试与重新下载两个出口 */}
            {isNative && status === 'install-returned' && (
              <div>
                <p className="text-sm text-orange-600 mb-3">
                  {errorMessage || '安装未完成'}
                </p>
                <button
                  onClick={installNow}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors mb-2"
                >
                  重试安装
                </button>
                <button
                  onClick={manifest ? startDownload : checkUpdate}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                >
                  重新下载安装包
                </button>
              </div>
            )}

            {isNative && status === 'installed' && (
              <div className="text-center">
                <p className="text-sm text-green-600 mb-3">
                  更新完成，重启 App 后生效
                </p>
                <button
                  onClick={checkUpdate}
                  className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                >
                  重新检查
                </button>
              </div>
            )}

            {isNative && status === 'error' && (
              <div className="text-center">
                <p className="text-sm text-red-500 mb-3">
                  {errorMessage || '更新失败，请稍后重试'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={checkUpdate}
                    className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
                  >
                    重新检查
                  </button>
                  {manifest && (
                    <button
                      onClick={startDownload}
                      className="flex-1 py-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
                    >
                      重新下载
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 更新说明 */}
        <div className="max-w-xl mx-auto mb-8">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            {manifest && status !== 'latest' ? `v${manifest.versionName} 更新内容` : '本版本更新内容'}
          </h3>
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note} className="text-sm text-gray-600 leading-relaxed">
                · {note}
              </li>
            ))}
          </ul>
        </div>

        {/* 应用信息明细 */}
        <div className="max-w-xl mx-auto text-sm">
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <span className="text-gray-500">安装包</span>
            <span className="text-gray-700">{appInfo?.packageName || '-'}</span>
          </div>
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <span className="text-gray-500">运行环境</span>
            <span className="text-gray-700">
              {isNative ? 'Android App' : '浏览器'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <span className="text-gray-500">版本号</span>
            <span className="text-gray-700">
              {appInfo ? (appInfo.versionCode > 0 ? appInfo.versionCode : '-') : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3 border-y border-gray-100">
            <span className="text-gray-500">开源仓库</span>
            <a
              href={APP_META.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="text-gray-700 underline decoration-gray-300"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* 服务状态自查：网络异常时用户可以自己确认服务地址与可达性 */}
        <div className="mt-8">
          <ServiceStatusPanel />
        </div>

        <p className="text-center text-xs text-gray-400 mt-10">
          © {new Date().getFullYear()} {APP_META.author}
        </p>
      </main>
    </div>
  )
}
