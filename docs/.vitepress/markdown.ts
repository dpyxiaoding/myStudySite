// Markdown 的两处扩展，在 config.mts 的 markdown.config 里启用，写法见 WRITING.md：
// 1. 对读文章里「三家各一段」：::: claude / ::: codex / ::: dsh（本仓作为第四家用 ::: ours）开头，::: 结尾，
//    名字后面可以跟一句说明（比如证据档次），显示成灰色小字；写成「副标题 | 说明」时，副标题加粗跟在名字后面
// 2. 右侧本页目录用短名字：文章开头写 toc，按顺序对应二级标题；正文里的标题照常显示完整文字
import container from 'markdown-it-container'
import type { MarkdownRenderer } from 'vitepress'

const PARTIES: Record<string, string> = { claude: 'Claude Code', codex: 'codex', dsh: 'deepseek-harness', ours: '本仓' }

export function siteMarkdown(md: MarkdownRenderer) {
  for (const [name, label] of Object.entries(PARTIES)) {
    md.use(container, name, {
      render(tokens: any[], idx: number, _options: unknown, env: unknown) {
        const token = tokens[idx]
        if (token.nesting === -1) return '</div>\n'
        const info = token.info.trim().slice(name.length).trim()
        const bar = info.indexOf('|')
        const sub = bar === -1 ? '' : info.slice(0, bar).trim()
        const note = bar === -1 ? info : info.slice(bar + 1).trim()
        // 要带上整页的 env：说明里写站内链接时，链接改写和死链检查都靠它。
        // 不能用 md.renderInline(s, env)：它会经过 VitePress 包在外面的那层，把整页的标题清空
        const inline = (s: string) => md.renderer.renderInline(md.parseInline(s, env)[0].children!, md.options, env)
        return (
          `<div class="party ${name}"><p class="party-title">${label}` +
          (sub ? ` — ${inline(sub)}` : '') +
          (note ? ` <small>${inline(note)}</small>` : '') +
          '</p>\n'
        )
      }
    })
  }

  // 每个二级标题拆成两段：完整标题包上 ignore-header（VitePress 生成目录时跳过它），
  // 后面跟一个隐藏的短名字，目录里显示的就是短名字。条数和二级标题对不上时不处理，目录显示完整标题
  md.core.ruler.push('toc_labels', (state) => {
    const toc = state.env.frontmatter?.toc
    if (!Array.isArray(toc)) return
    const heads = state.tokens.flatMap((t, i) => (t.type === 'heading_open' && t.tag === 'h2' ? [state.tokens[i + 1]] : []))
    if (!heads.length) return
    if (heads.length !== toc.length) {
      console.warn(`${state.env.relativePath}：toc 写了 ${toc.length} 条，二级标题有 ${heads.length} 个，对不上，右侧目录改用完整标题`)
      return
    }
    const html = (content: string) => Object.assign(new state.Token('html_inline', '', 0), { content })
    heads.forEach((inline, i) => {
      const children = inline.children!
      // 标题末尾 VitePress 加的 # 链接留在外面
      let end = children.findIndex((c) => c.type === 'link_open' && c.attrGet('class') === 'header-anchor')
      if (end === -1) end = children.length
      while (end > 0 && children[end - 1].type === 'text' && !children[end - 1].content.trim()) end--
      children.splice(end, 0, html(`</span><span class="outline-label">${md.utils.escapeHtml(String(toc[i]))}</span>`))
      children.unshift(html('<span class="ignore-header">'))
    })
  })
}
