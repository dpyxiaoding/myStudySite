// 给 ArticleIndex.vue 用的文章清单：构建时读一次，本地预览时 md 有增删改会自动重读
import { defineLoader } from 'vitepress'
import { SECTIONS, groupsOf, scanArticles, type Article } from '../articles'

export interface Data {
  articles: Article[]
  /** 每个分类下的分组顺序 */
  groups: Record<string, string[]>
}

declare const data: Data
export { data }

export default defineLoader({
  watch: ['../../*/*.md', '../../*/*/*.md'],
  load(): Data {
    const articles = scanArticles()
    return {
      articles,
      groups: Object.fromEntries(SECTIONS.map((s) => [s.dir, groupsOf(s, articles)]))
    }
  }
})
