/**
 * 安装失败原因转译
 *
 * 原生插件上报的是 Android 系统原始错误（例如
 * `INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package ... signatures do not match`），
 * 直接展示给用户等于没提示。这里把常见的安装失败码翻译成可执行的中文说明。
 */

interface InstallErrorRule {
  pattern: RegExp
  message: string
}

const INSTALL_ERROR_RULES: InstallErrorRule[] = [
  {
    pattern: /UPDATE_INCOMPATIBLE|signatures do not match|签名/i,
    message: '安装包与原应用的签名不一致，请先卸载旧版，再安装这个安装包',
  },
  {
    pattern: /VERSION_DOWNGRADE|downgrade/i,
    message: '设备上已安装更高的版本，无法用旧版本覆盖，请先卸载后重装',
  },
  {
    pattern: /OLDER_SDK|SDK_INT/i,
    message: '当前系统版本低于安装包要求，请升级系统后再试',
  },
  {
    pattern: /INSUFFICIENT_STORAGE|no space/i,
    message: '存储空间不足，清理空间后重试',
  },
  {
    pattern: /PARSE_FAILED|INVALID_APK|损坏|corrupt/i,
    message: '安装包不完整或已损坏，请重新下载安装包',
  },
  {
    pattern: /USER_RESTRICTED|not allowed to install/i,
    message: '系统限制了应用安装，请在系统设置里允许本应用安装其他应用',
  },
  {
    pattern: /VERIFICATION_FAILURE|verification/i,
    message: '安装包未通过系统校验，请确认来源可信后重试',
  },
  {
    pattern: /requires|authorization|permission/i,
    message: '安装被拒绝，请确认已经允许本应用「安装未知应用」',
  },
]

/**
 * 把原生错误信息转成用户能看懂、能行动的提示。
 * 无法识别时保留原始信息，便于用户反馈时贴给我们排查。
 */
export function describeInstallError(rawMessage?: string | null, fallback = '安装未完成，请重试'): string {
  const message = (rawMessage || '').trim()

  if (!message) {
    return fallback
  }

  for (const rule of INSTALL_ERROR_RULES) {
    if (rule.pattern.test(message)) {
      return rule.message
    }
  }

  return `安装未完成：${message}`
}
