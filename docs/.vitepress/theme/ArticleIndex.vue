<script setup lang="ts">
// 分类首页的目录表：列出所在分类下的文章。有分组时每组一个二级标题加一张表，
// 二级标题会出现在右侧「本页目录」里。哪一列都没有内容时，那一列不显示。
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { data } from './articles.data.mjs'

const props = withDefaults(defineProps<{ section?: string; summaryLabel?: string }>(), {
  summaryLabel: '说明'
})
const { page } = useData()
const dir = computed(() => props.section ?? page.value.relativePath.split('/')[0])

const tables = computed(() => {
  const mine = data.articles.filter((a) => a.section === dir.value)
  const groups: { name?: string; items: typeof mine }[] = []
  const ungrouped = mine.filter((a) => !a.group)
  if (ungrouped.length) groups.push({ items: ungrouped })
  for (const name of data.groups[dir.value] ?? []) {
    groups.push({ name, items: mine.filter((a) => a.group === name) })
  }
  const usedIds = new Set<string>()
  return groups.map((g) => {
    const baseId = g.name && slugify(g.name)
    let id = baseId
    let suffix = 1
    while (id && usedIds.has(id)) id = `${baseId}-${suffix++}`
    if (id) usedIds.add(id)
    return {
      ...g,
      id,
      showSummary: g.items.some((a) => a.summary),
      showDate: g.items.some((a) => a.date)
    }
  })
})

// 与 VitePress 给 Markdown 标题生成锚点的规则一致
function slugify(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}
</script>

<template>
  <p v-if="!tables.length">还没有文章。</p>
  <template v-for="t in tables" :key="t.name ?? ''">
    <h2 v-if="t.name" :id="t.id" tabindex="-1">
      {{ t.name }}
      <a class="header-anchor" :href="`#${t.id}`" :aria-label="`Permalink to “${t.name}”`">{{ '​' }}</a>
    </h2>
    <table>
      <thead>
        <tr>
          <th>文章</th>
          <th v-if="t.showSummary">{{ props.summaryLabel }}</th>
          <th v-if="t.showDate">日期</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in t.items" :key="a.link">
          <td><a :href="withBase(a.link)">{{ a.title }}</a></td>
          <td v-if="t.showSummary">{{ a.summary }}</td>
          <td v-if="t.showDate">{{ a.date }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
