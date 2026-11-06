#!/usr/bin/env node
/**
 * 生成 Daily Canvas 的全套应用图标
 *
 * 图标源是代码里的矢量定义（见 buildIconSvg），因此可以无损输出任意尺寸，
 * Android 自适应图标、传统图标、PWA 图标、桌面图标都从同一份几何生成。
 *
 * 用法：
 *   cd tools && npm install          # 依赖 sharp，已写在 tools/package.json
 *   node tools/render-app-icons.cjs --preview   # 只预览，不写文件
 *   node tools/render-app-icons.cjs             # 覆盖写入 Android / PWA 图标
 *
 * 不想在 tools 里装依赖时，也可以复用别处的 node_modules：
 *   NODE_PATH=/path/to/node_modules node tools/render-app-icons.cjs
 */

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const CANVAS = 512

const INK = '#141414'
const PAPER = '#f7f5f1'

const THEMES = {
  dark: { background: INK, mark: PAPER },
  paper: { background: PAPER, mark: INK },
}

function resolveTheme(name) {
  return THEMES[name] || THEMES.dark
}

// ---------------------------------------------------------------------------
// 几何：一条带笔锋的曲线 + 一个收笔的墨点
// ---------------------------------------------------------------------------

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t
  return {
    x: mt ** 3 * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t ** 3 * p3.y,
  }
}

function cubicDerivative(p0, p1, p2, p3, t) {
  const mt = 1 - t
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  }
}

/**
 * 把一条三次贝塞尔中心线转成「起笔粗、收笔细」的填充笔锋
 */
function brushStroke(p0, p1, p2, p3, widthStart, widthEnd, options = {}) {
  const samples = options.samples || 96
  const power = options.power || 0.85
  const left = []
  const right = []

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples
    const point = cubicPoint(p0, p1, p2, p3, t)
    const derivative = cubicDerivative(p0, p1, p2, p3, t)
    const length = Math.hypot(derivative.x, derivative.y) || 1
    const normalX = -derivative.y / length
    const normalY = derivative.x / length
    const width = widthEnd + (widthStart - widthEnd) * Math.pow(1 - t, power)

    left.push(`${(point.x + (normalX * width) / 2).toFixed(2)},${(point.y + (normalY * width) / 2).toFixed(2)}`)
    right.push(`${(point.x - (normalX * width) / 2).toFixed(2)},${(point.y - (normalY * width) / 2).toFixed(2)}`)
  }

  const polygon = `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`
  const startCap = cubicPoint(p0, p1, p2, p3, 0)
  const endCap = cubicPoint(p0, p1, p2, p3, 1)
  const caps =
    `<circle cx="${startCap.x.toFixed(2)}" cy="${startCap.y.toFixed(2)}" r="${(widthStart / 2).toFixed(2)}"/>` +
    `<circle cx="${endCap.x.toFixed(2)}" cy="${endCap.y.toFixed(2)}" r="${(widthEnd / 2).toFixed(2)}"/>`

  return { path: polygon, caps }
}

const SWOOSH = {
  p0: { x: 148, y: 348 },
  p1: { x: 232, y: 300 },
  p2: { x: 296, y: 214 },
  p3: { x: 352, y: 170 },
}

/**
 * 生成图标 SVG
 *
 * @param {object} options
 * @param {'squircle'|'transparent'} options.background 背景形状，透明用于 Android 自适应图标前景
 * @param {string} options.backgroundFill 背景色
 * @param {string} options.markFill 图形颜色
 * @param {boolean} options.dot 是否带收笔墨点
 * @param {number} options.scale 图形整体缩放
 */
function buildIconSvg(options) {
  const {
    background = 'squircle',
    backgroundFill = INK,
    markFill = PAPER,
    dot = true,
    scale = 1,
    showSwoosh = true,
    baseline = false,
  } = options

  const stroke = brushStroke(SWOOSH.p0, SWOOSH.p1, SWOOSH.p2, SWOOSH.p3, 64, 14)
  const markTransform = `translate(${CANVAS / 2} ${CANVAS / 2}) scale(${scale}) translate(${-CANVAS / 2} ${-CANVAS / 2})`

  const backgroundShape =
    background === 'squircle'
      ? `<rect width="${CANVAS}" height="${CANVAS}" rx="116" ry="116" fill="${backgroundFill}"/>`
      : ''

  const dotShape =
    dot === 'close'
      ? `<circle cx="379" cy="143" r="14" fill="${markFill}"/>`
      : dot
        ? `<circle cx="392" cy="146" r="17" fill="${markFill}"/>`
        : ''

  // 画布基线：一条细横线，暗示“落在画布上的创作”
  const baselineShape = baseline
    ? `<rect x="140" y="392" width="232" height="16" rx="8" fill="${markFill}" opacity="0.9"/>`
    : ''

  const swooshShape = showSwoosh
    ? `<path d="${stroke.path}" fill="${markFill}"/>${stroke.caps.replace(/<circle/g, `<circle fill="${markFill}"`)}`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  ${backgroundShape}
  <g transform="${markTransform}">${swooshShape}${dotShape}${baselineShape}</g>
</svg>`
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

async function renderPng(svg, size) {
  return sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/**
 * 圆形遮罩，用于 ic_launcher_round
 */
async function renderRoundPng(svg, size) {
  const square = await renderPng(svg, size)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  )

  return sharp(square)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function writeFile(targetPath, buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, buffer)
  console.log(`写入 ${path.relative(ROOT, targetPath)} (${buffer.length} 字节)`)
}

const DENSITIES = [
  { name: 'mdpi', legacy: 48, foreground: 108 },
  { name: 'hdpi', legacy: 72, foreground: 162 },
  { name: 'xhdpi', legacy: 96, foreground: 216 },
  { name: 'xxhdpi', legacy: 144, foreground: 324 },
  { name: 'xxxhdpi', legacy: 192, foreground: 432 },
]

async function renderAll() {
  const themeArgIndex = process.argv.indexOf('--theme')
  const themeName = themeArgIndex > -1 ? process.argv[themeArgIndex + 1] : 'dark'
  const theme = resolveTheme(themeName)
  // 默认只用一笔笔锋，加 --dot 才会出现收笔墨点
  const dotOption = process.argv.includes('--dot') ? 'close' : false

  // 完整图标：深色圆角方块 + 米白笔锋
  const fullSvg = buildIconSvg({
    background: 'squircle',
    backgroundFill: theme.background,
    markFill: theme.mark,
    dot: dotOption,
  })
  console.log(`图标主题：${themeName}（背景 ${theme.background}，图形 ${theme.mark}）`)

  // Android 自适应图标前景：只有笔锋，图形缩小到安全区内
  const foregroundSvg = buildIconSvg({
    background: 'transparent',
    markFill: theme.mark,
    scale: 0.66,
    dot: dotOption,
  })

  // PWA / 浏览器图标
  const publicIcons = path.join(ROOT, 'frontend/public/icons')
  await writeFile(path.join(publicIcons, 'icon-512.png'), await renderPng(fullSvg, 512))
  await writeFile(path.join(publicIcons, 'icon-192.png'), await renderPng(fullSvg, 192))
  await writeFile(path.join(publicIcons, 'apple-touch-icon.png'), await renderPng(fullSvg, 180))

  // 矢量源文件
  await writeFile(path.join(ROOT, 'frontend/public/app-icon.svg'), Buffer.from(fullSvg, 'utf8'))

  // 自适应图标背景色需要和主题保持一致
  await writeFile(
    path.join(ROOT, 'frontend/android/app/src/main/res/values/ic_launcher_background.xml'),
    Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${theme.background.toUpperCase()}</color>\n</resources>\n`,
      'utf8',
    ),
  )

  // Android 传统图标 + 自适应图标前景
  const resDir = path.join(ROOT, 'frontend/android/app/src/main/res')
  for (const density of DENSITIES) {
    const dir = path.join(resDir, `mipmap-${density.name}`)
    await writeFile(path.join(dir, 'ic_launcher.png'), await renderPng(fullSvg, density.legacy))
    await writeFile(path.join(dir, 'ic_launcher_round.png'), await renderRoundPng(fullSvg, density.legacy))
    await writeFile(
      path.join(dir, 'ic_launcher_foreground.png'),
      await renderPng(foregroundSvg, density.foreground),
    )
  }

  // 启动图：白底 + 居中的小图标
  const splashSpecs = [
    { file: 'drawable/splash.png', width: 480, height: 320 },
    { file: 'drawable-port-mdpi/splash.png', width: 320, height: 480 },
    { file: 'drawable-port-hdpi/splash.png', width: 480, height: 800 },
    { file: 'drawable-port-xhdpi/splash.png', width: 720, height: 1280 },
    { file: 'drawable-port-xxhdpi/splash.png', width: 960, height: 1600 },
    { file: 'drawable-port-xxxhdpi/splash.png', width: 1280, height: 1920 },
    { file: 'drawable-land-mdpi/splash.png', width: 480, height: 320 },
    { file: 'drawable-land-hdpi/splash.png', width: 800, height: 480 },
    { file: 'drawable-land-xhdpi/splash.png', width: 1280, height: 720 },
    { file: 'drawable-land-xxhdpi/splash.png', width: 1600, height: 960 },
    { file: 'drawable-land-xxxhdpi/splash.png', width: 1920, height: 1280 },
  ]

  for (const spec of splashSpecs) {
    // 只覆盖仓库里已有的启动图，不重新创建被删掉的尺寸
    const target = path.join(resDir, spec.file)
    if (!fs.existsSync(target)) {
      continue
    }

    const logoSize = Math.round(Math.min(spec.width, spec.height) * 0.24)
    const logo = await renderPng(fullSvg, logoSize)
    const splash = await sharp({
      create: {
        width: spec.width,
        height: spec.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: logo,
          left: Math.round((spec.width - logoSize) / 2),
          top: Math.round((spec.height - logoSize) / 2),
        },
      ])
      .png()
      .toBuffer()

    await writeFile(target, splash)
  }
}

async function renderPreview() {
  const variants = [
    { label: 'E', options: { background: 'squircle', backgroundFill: PAPER, markFill: INK, dot: false } },
    { label: 'F', options: { background: 'squircle', backgroundFill: PAPER, markFill: INK, dot: 'close' } },
    { label: 'G', options: { background: 'squircle', backgroundFill: INK, markFill: PAPER, dot: 'close' } },
    {
      label: 'H',
      options: { background: 'squircle', backgroundFill: PAPER, markFill: INK, dot: false, baseline: true },
    },
  ]

  const size = 256
  const tiles = []
  for (const variant of variants) {
    tiles.push(await renderPng(buildIconSvg(variant.options), size))
    // 小尺寸预览，用来检查 48px 下的辨识度
    tiles.push(await renderPng(buildIconSvg(variant.options), 48))
  }

  const canvas = sharp({
    create: {
      width: size * variants.length,
      height: size + 60,
      channels: 4,
      background: { r: 236, g: 236, b: 236, alpha: 1 },
    },
  })

  const composites = tiles.map((tile, index) => {
    const slot = Math.floor(index / 2)
    const isSmall = index % 2 === 1
    return {
      input: tile,
      left: slot * size + (isSmall ? (size - 48) / 2 : 0),
      top: isSmall ? size + 6 : 0,
    }
  })

  const output = await canvas.composite(composites).png().toBuffer()
  const target = '/tmp/app-icon-preview.png'
  fs.writeFileSync(target, output)
  console.log(`预览已生成：${target}`)
}

async function main() {
  if (process.argv.includes('--preview')) {
    await renderPreview()
    return
  }

  await renderAll()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
