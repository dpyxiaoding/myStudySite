// 文章清单：扫描各分类文件夹里的 md，读开头的说明（frontmatter）和一级标题。
// 右上角分类、左侧目录（config.mts）和分类首页的目录表（ArticleIndex.vue）都由它生成，
// 新增文章只要把 md 放进对应文件夹，不用改这里。只有新开一个分类时才在 SECTIONS 里加一项。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DefaultTheme, Plugin } from 'vitepress'

export interface Section {
  /** 文件夹名，也是网址的第一段 */
  dir: string
  /** 右上角「内容分类」和左侧目录顶部显示的名字 */
  title: string
  /** 左侧目录里指向分类首页的那一项 */
  indexLabel: string
  /** 分组在左侧目录里的先后；没列出的新分组按出现顺序排在后面 */
  groups?: string[]
}

export const SECTIONS: Section[] = [
  { dir: 'python', title: 'Python 入门', indexLabel: '课程介绍' },
  {
    dir: 'agents',
    title: '编程智能体对读',
    indexLabel: '系列说明与目录',
    groups: ['智能体内核', '协议与接入', '平台能力']
  },
  { dir: 'eng', title: '工程笔记', indexLabel: '目录' }
]

export interface Article {
  section: string
  /** 站内链接，如 /agents/context */
  link: string
  title: string
  /** 左侧目录里显示的名字 */
  label: string
  group?: string
  order?: number
  date?: string
  summary?: string
}

const DOCS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 读取目录生成所需的 YAML 标量字段；正文 frontmatter 仍由 VitePress 完整解析。 */
function readFrontmatter(src: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src)
  if (!m) return { data: {}, body: src }
  const data: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    let value = kv[2].trim()
    if (value.startsWith("'")) {
      const end = value.indexOf("'", 1)
      if (end !== -1 && (!value.slice(end + 1).trim() || value.slice(end + 1).trimStart().startsWith('#'))) {
        value = value.slice(1, end).replace(/''/g, "'")
      }
    } else if (value.startsWith('"')) {
      let end = 1
      let escaped = false
      for (; end < value.length; end++) {
        if (escaped) escaped = false
        else if (value[end] === '\\') escaped = true
        else if (value[end] === '"') break
      }
      if (end < value.length && (!value.slice(end + 1).trim() || value.slice(end + 1).trimStart().startsWith('#'))) {
        try {
          value = JSON.parse(value.slice(0, end + 1)) as string
        } catch {
          value = value.slice(1, end)
        }
      }
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    data[kv[1]] = value
  }
  return { data, body: src.slice(m[0].length) }
}

/** 正文里第一个一级标题，跳过代码块 */
function firstHeading(body: string): string | undefined {
  let fence: string | undefined
  for (const line of body.split(/\r?\n/)) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1]
      else if (f[1].startsWith(fence)) fence = undefined
      continue
    }
    if (fence) continue
    const h = /^#\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) return h[1].replace(/\s*\{#[^}]*\}$/, '')
  }
}

function readArticle(section: string, file: string): Article {
  const src = fs.readFileSync(path.join(DOCS_DIR, section, file), 'utf-8').replace(/^﻿/, '')
  const { data, body } = readFrontmatter(src)
  const slug = file.replace(/\.md$/, '')
  const title = data.title || firstHeading(body) || slug
  const order = Number(data.order)
  return {
    section,
    link: `/${section}/${slug}`,
    title,
    label: data.label || title,
    group: data.group || undefined,
    order: data.order && Number.isFinite(order) ? order : undefined,
    date: data.date || undefined,
    summary: data.summary || undefined
  }
}

/** 排序：写了 order 的按 order，其余排在后面按日期从早到晚，最后按文件名 */
function compare(a: Article, b: Article) {
  const ao = a.order ?? Infinity
  const bo = b.order ?? Infinity
  if (ao !== bo) return ao - bo
  const ad = a.date ?? '9999'
  const bd = b.date ?? '9999'
  if (ad !== bd) return ad < bd ? -1 : 1
  return a.link < b.link ? -1 : a.link > b.link ? 1 : 0
}

export function scanArticles(): Article[] {
  const list: Article[] = []
  for (const s of SECTIONS) {
    const dir = path.join(DOCS_DIR, s.dir)
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.md') && file !== 'index.md') list.push(readArticle(s.dir, file))
    }
  }
  return list.sort(compare)
}

/** 某个分类下的分组，按 SECTIONS 里写的顺序，新分组按出现顺序接在后面 */
export function groupsOf(section: Section, articles: Article[]): string[] {
  const seen = articles.filter((a) => a.section === section.dir && a.group).map((a) => a.group!)
  return [...new Set([...(section.groups ?? []).filter((g) => seen.includes(g)), ...seen])]
}

export function buildNav(): DefaultTheme.NavItem[] {
  return [
    {
      text: '内容分类',
      activeMatch: `^/(${SECTIONS.map((s) => s.dir).join('|')})/`,
      items: SECTIONS.map((s) => ({ text: s.title, link: `/${s.dir}/`, activeMatch: `/${s.dir}/` }))
    }
  ]
}

export function buildSidebar(articles = scanArticles()): DefaultTheme.SidebarMulti {
  const sidebar: DefaultTheme.SidebarMulti = {}
  for (const s of SECTIONS) {
    const mine = articles.filter((a) => a.section === s.dir)
    const item = (a: Article) => ({ text: a.label, link: a.link })
    sidebar[`/${s.dir}/`] = [
      // 没写 group 的文章直接排在分类首页下面
      { text: s.title, items: [{ text: s.indexLabel, link: `/${s.dir}/` }, ...mine.filter((a) => !a.group).map(item)] },
      ...groupsOf(s, articles).map((g) => ({
        text: g,
        collapsed: false,
        items: mine.filter((a) => a.group === g).map(item)
      }))
    ]
  }
  return sidebar
}

/**
 * 本地预览时，文章新增、删除或改了标题和分组，就重新生成左侧目录并推给浏览器，不用重启。
 * VitePress 自己只在配置文件变化时才重算侧边栏。
 */
export function articlesPlugin(): Plugin {
  const articleRE = new RegExp(`^(${SECTIONS.map((s) => s.dir).join('|')})/[^/]+\\.md$`)
  let site: { themeConfig: DefaultTheme.Config } | undefined
  return {
    name: 'site:articles',
    configResolved(config) {
      site = (config as unknown as { vitepress?: { site: typeof site } }).vitepress?.site
    },
    configureServer(server) {
      const refresh = (file: string) => {
        const rel = path.relative(DOCS_DIR, file).split(path.sep).join('/')
        if (!site || !articleRE.test(rel)) return
        try {
          const sidebar = buildSidebar()
          if (JSON.stringify(sidebar) === JSON.stringify(site.themeConfig.sidebar)) return
          site.themeConfig.sidebar = sidebar
          const mod = server.moduleGraph.getModuleById('/@siteData')
          if (mod) server.reloadModule(mod)
        } catch (err) {
          server.config.logger.error(`左侧目录更新失败：${(err as Error).message}`)
        }
      }
      server.watcher.on('add', refresh).on('unlink', refresh).on('change', refresh)
    }
  }
}
