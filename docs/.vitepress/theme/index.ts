// 不带默认主题的英文字体 Inter：正文全用思源黑体，Inter 用不上，却会被每个页面预加载
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { Theme } from 'vitepress'
import { defineComponent, h, onMounted } from 'vue'
// 思源黑体可变字体；粗细保持和以前一致的处理见 ../font-weights.ts
import '@fontsource-variable/noto-sans-sc'
import './custom.css'
import ArticleIndex from './ArticleIndex.vue'

export default {
  extends: DefaultTheme,
  // 页面跑起来后给 <html> 加上 hydrated。在那之前显示的是静态 HTML，custom.css 靠它区分（见「左侧目录」一节）
  Layout: defineComponent({
    setup() {
      onMounted(() => document.documentElement.classList.add('hydrated'))
      return () => h(DefaultTheme.Layout)
    }
  }),
  enhanceApp({ app }) {
    app.component('ArticleIndex', ArticleIndex)
  }
} satisfies Theme
