/**
 * App 元信息与内置版本说明
 */

export const APP_META = {
  name: 'Daily Canvas',
  chineseName: '每日画布',
  description: '每天一条创作，记录生活中的小灵感。',
  repositoryUrl: 'https://github.com/zhanghanlin501/daily-canvas',
  author: 'zhanghanlin501',
}

/**
 * 当前安装包自带的版本更新说明，远程清单不可用时作为兜底展示
 */
export const APP_BUILTIN_NOTES: string[] = [
  '新增“关于 App”，可直接查看版本与更新说明',
  '支持应用内检查更新，一键下载并覆盖安装新版本',
]
