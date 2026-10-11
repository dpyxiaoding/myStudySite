import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { articlesPlugin, buildNav, buildSidebar } from './articles'
import { fontWeightsPlugin } from './font-weights'
import { siteMarkdown } from './markdown'
import { tokenize } from './search-tokenize'

// GitHub Actions 中从仓库名推导 Pages 路径；本地开发保留项目默认仓库名。
const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
const base = repo
  ? repo.toLowerCase() === `${owner}.github.io`.toLowerCase()
    ? '/'
    : `/${repo}/`
  : '/myStudySite/'

export default defineConfig({
  lang: 'zh-CN',
  title: '学而笔记',
  description: '记录我学过的每一样东西',
  base,
  cleanUrls: true,
  lastUpdated: true,

  // 手机浏览器顶栏的颜色：浅色用主色，深色用深色底色（跟随系统，不跟网页上的切换按钮）
  head: [
    ['meta', { name: 'theme-color', content: '#3451b2', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#12161d', media: '(prefers-color-scheme: dark)' }]
  ],

  vite: {
    plugins: [articlesPlugin(), fontWeightsPlugin()],
    build: {
      // 字体文件一律单独存放，不塞进样式文件：小的中文字体分片平时用不到，塞进去反而每次都要下载
      assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
      // 搜索索引单独一个文件（2026-10 约 1.8 MB），第一次点搜索框才下载；默认 500 kB 就报警，放宽到 2.5 MB 再提醒
      chunkSizeWarningLimit: 2500
    },
    resolve: {
      alias: [
        // 顶栏搜索换成自己的 NavSearch.vue：直接在框里输入，结果在下方展开，不弹窗
        {
          find: /^.*\/VPNavBarSearch\.vue$/,
          replacement: fileURLToPath(new URL('./theme/NavSearch.vue', import.meta.url))
        }
      ]
    }
  },

  markdown: {
    lineNumbers: false,
    container: {
      tipLabel: '提示',
      warningLabel: '注意',
      dangerLabel: '警告',
      infoLabel: '说明',
      detailsLabel: '详细信息'
    },
    // 三家各一段的 ::: claude / codex / dsh，以及右侧目录的短名字（见 markdown.ts）
    config: siteMarkdown
  },

  themeConfig: {
    // 右上角的「内容分类」和左侧目录都由 articles.ts 扫描各分类文件夹自动生成，新增文章不用改这里
    nav: buildNav(),
    sidebar: buildSidebar(),

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '更新于', formatOptions: { dateStyle: 'medium' } },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    langMenuLabel: '语言',
    notFound: {
      title: '页面不存在',
      quote: '这个地址没有内容，可能已经移动或删除。',
      linkText: '回到首页'
    },

    // 本地搜索：VitePress 负责建索引，搜索框和结果列表是 theme/NavSearch.vue
    search: {
      provider: 'local',
      options: {
        // 中文按相邻两字切词，句子中间的词也能搜到（规则见 search-tokenize.ts）
        miniSearch: { options: { tokenize } },
        // 标题里隐藏的目录短名字（markdown.ts）不进搜索结果的标题
        _render(src, env, md) {
          const html = md.render(src, env)
          if (env.frontmatter?.search === false) return ''
          return html.replace(/<span class="outline-label">.*?<\/span>/g, '')
        }
      }
    },

    footer: {
      message: '托管于 GitHub Pages',
      copyright: '© 2026 学而笔记'
    }
  }
})
