// 思源黑体用可变字体（一个文件含所有粗细，样式文件小很多），但保持以前只有 400/500/700 三个字重时的样子。
// VitePress 的文章标题、加粗、提示框标题用 600 字重。以前没有 600 的文件，浏览器拿 700 来显示；
// 可变字体能画出真正的 600，会比原来细。这里把字体包里每条 @font-face 拆成 100–500 和 700–900 两段，
// 中间空出 600，浏览器找不到 600 就和以前一样往上取 700。两段指向同一个文件，不会多下载。
import type { Plugin } from 'vitepress'

const FULL_RANGE = /font-weight:\s*100 900;/

export function fontWeightsPlugin(): Plugin {
  return {
    name: 'site:font-weights',
    enforce: 'pre', // 在 Vite 处理 CSS 之前改写原文
    transform(code, id) {
      if (!/@fontsource-variable[\\/]noto-sans-sc[\\/]index\.css$/.test(id.split('?')[0])) return
      let count = 0
      const out = code.replace(/@font-face\s*\{[^}]*\}/g, (rule) => {
        if (!FULL_RANGE.test(rule)) return rule
        count++
        return ['100 500', '700 900'].map((w) => rule.replace(FULL_RANGE, `font-weight: ${w};`)).join('\n')
      })
      if (!count) this.warn('思源黑体字体包的写法变了，标题和加粗会比以前细，检查 font-weights.ts')
      return out
    }
  }
}
