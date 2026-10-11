<script setup lang="ts">
// 顶栏搜索框：直接在框里输入，结果在框下方展开，不弹窗。
// 搜索数据用 VitePress 本地搜索建好的索引（config.mts 里 search.provider: 'local'），
// 本组件通过 config.mts 里的 alias 替换默认主题的 VPNavBarSearch.vue。
// @ts-ignore VitePress 提供的虚拟模块，没有类型声明
import localSearchIndex from '@localSearchIndex'
import MiniSearch, { type SearchResult } from 'minisearch'
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useData, useRouter } from 'vitepress'
import { tokenize } from '../search-tokenize'

interface Doc {
  title: string
  titles: string[]
}
type Hit = SearchResult & Doc

const MAX_RESULTS = 12

const { site, theme, localeIndex } = useData()
const router = useRouter()

const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()

/* ---------- 索引：第一次聚焦时才加载 ---------- */
const indexData = shallowRef(localSearchIndex)
const index = shallowRef<MiniSearch<Doc> | null>(null)
let loading: Promise<void> | null = null
const loadFailed = ref(false)

function loadIndex() {
  if (index.value) return Promise.resolve()
  loading ??= (async () => {
    const mod = await indexData.value[localeIndex.value]?.()
    index.value = markRaw(
      MiniSearch.loadJSON<Doc>(mod?.default, {
        fields: ['title', 'titles', 'text'],
        storeFields: ['title', 'titles'],
        tokenize,
        // 输入多个词（含中文被切出的两字组）时要求都出现
        searchOptions: { fuzzy: 0.2, prefix: true, combineWith: 'AND', boost: { title: 4, text: 2, titles: 1 } }
      })
    )
    loadFailed.value = false
  })()
    .catch((err) => {
      // 常见原因：网页打开期间网站发布了新版本，旧的索引文件已经不在了，只能刷新页面
      console.error('搜索索引加载失败', err)
      loadFailed.value = true
    })
    .finally(() => (loading = null))
  return loading
}

// 本地预览时改了文章，索引热更新
if (import.meta.hot) {
  import.meta.hot.accept('/@localSearchIndex', (m) => {
    if (!m) return
    indexData.value = m.default
    index.value = null
    if (focused.value) loadIndex()
  })
}

/* ---------- 搜索 ---------- */
const query = ref('')
const focused = ref(false)
const results = shallowRef<Hit[]>([])
const selected = ref(0)
const open = computed(() => focused.value && query.value.trim() !== '')

watch([query, index], () => {
  const q = query.value.trim()
  if (!q) return (results.value = [])
  if (!index.value) return void loadIndex()
  results.value = index.value.search(q).slice(0, MAX_RESULTS) as Hit[]
  selected.value = 0
  list.value?.scrollTo({ top: 0 })
})

/* ---------- 结果显示：分类名 › 上级标题，命中的字加标记 ---------- */
const sectionNames = computed(() => {
  const map: Record<string, string> = {}
  const walk = (items: any[] = []) =>
    items.forEach((it) => {
      const m = typeof it.link === 'string' && it.link.match(/^\/([^/]+)\/$/)
      if (m) map[m[1]] = it.text
      walk(it.items)
    })
  walk(theme.value.nav)
  return map
})

function crumbs(r: Hit) {
  const section = sectionNames.value[r.id.slice(site.value.base.length).split('/')[0]]
  return section ? [section, ...r.titles] : r.titles
}

// 索引里的标题是转义过的 HTML 文本，先还原成纯文本再切分，不用 v-html
let decoder: HTMLTextAreaElement | undefined
function decode(s: string) {
  if (!s.includes('&') || typeof document === 'undefined') return s
  decoder ??= document.createElement('textarea')
  decoder.innerHTML = s
  return decoder.value
}

const terms = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.length ? { re: new RegExp(`(${words.sort((a, b) => b.length - a.length).map(escapeRe).join('|')})`, 'gi'), set: new Set(words) } : null
})

function parts(s: string) {
  const text = decode(s)
  const t = terms.value
  if (!t) return [{ text, hit: false }]
  return text
    .split(t.re)
    .filter(Boolean)
    .map((p) => ({ text: p, hit: t.set.has(p.toLowerCase()) }))
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ---------- 键盘与焦点 ---------- */
function onFocus() {
  focused.value = true
  loadIndex()
}

// 焦点移出整个搜索区域（点了别处、按 Tab 走开）时收起
function onFocusOut(e: FocusEvent) {
  if (!root.value?.contains(e.relatedTarget as Node | null)) focused.value = false
}

// 点搜索框里图标、空白处时把焦点留在输入框；点下拉结果时输入框不失焦，结果才点得到
function keepFocus(e: MouseEvent) {
  if (e.target !== input.value) e.preventDefault()
}

function onResultClick(e: MouseEvent, r: Hit) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return // 新标签页打开等交给浏览器
  e.preventDefault()
  go(r)
}

function close() {
  focused.value = false
  input.value?.blur()
}

function go(r: Hit | undefined) {
  if (!r) return
  close()
  router.go(r.id)
}

function move(step: number) {
  const n = results.value.length
  if (!n) return
  selected.value = (selected.value + step + n) % n
  nextTick(() => list.value?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing) return // 输入法选字时的回车和方向键不处理
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    move(e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    go(results.value[selected.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

function clear() {
  query.value = ''
  input.value?.focus()
}

// Ctrl K / ⌘ K / 斜杠：跳到搜索框（不在页面上显示提示）
function onGlobalKeydown(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  const editing = el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
  // Chrome 自动填表时发出的按键事件没有 key
  if ((e.key?.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !editing)) {
    e.preventDefault()
    input.value?.focus()
    input.value?.select()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <div ref="root" class="NavSearch" :class="{ open }" @focusout="onFocusOut">
    <div class="box" @mousedown="keepFocus($event), input?.focus()">
      <span class="vpi-search icon" aria-hidden="true" />
      <input
        ref="input"
        v-model="query"
        class="input"
        type="search"
        placeholder="搜索文章"
        aria-label="搜索文章"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="go"
        maxlength="64"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="nav-search-list"
        :aria-expanded="open"
        :aria-activedescendant="open && results.length ? `nav-search-item-${selected}` : undefined"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <button v-if="query" type="button" class="clear" title="清除" aria-label="清除" @click="clear">
        <span class="vpi-delete" aria-hidden="true" />
      </button>
    </div>

    <div v-if="open" class="panel" @mousedown.prevent>
      <ul v-if="results.length" id="nav-search-list" ref="list" class="results" role="listbox">
        <li
          v-for="(r, i) in results"
          :id="`nav-search-item-${i}`"
          :key="r.id"
          role="option"
          :aria-selected="i === selected"
          @mousemove="selected = i"
        >
          <a :href="r.id" class="result" :class="{ selected: i === selected }" tabindex="-1" @click="onResultClick($event, r)">
            <span class="doc-icon" aria-hidden="true" />
            <span class="text">
              <span v-if="crumbs(r).length" class="path">
                <template v-for="(c, j) in crumbs(r)" :key="j">
                  <span v-if="j" class="sep" aria-hidden="true">›</span>
                  <span><template v-for="(p, k) in parts(c)" :key="k"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></span>
                </template>
              </span>
              <span class="title"><template v-for="(p, k) in parts(r.title)" :key="k"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></span>
            </span>
          </a>
        </li>
      </ul>
      <p v-else-if="index" class="empty">没有找到「{{ query.trim() }}」相关的内容</p>
      <p v-else-if="loadFailed" class="empty">搜索数据没加载上，网站可能刚更新过，刷新页面后再试</p>
      <p v-else class="empty">正在加载…</p>
    </div>
  </div>
</template>

<style scoped>
.NavSearch {
  --search-card: var(--vp-c-bg);
  --search-pick: #3451b2;
  --search-tray: var(--vp-c-bg-soft);
  position: relative;
  display: flex;
  flex-grow: 1;
  align-items: center;
  min-width: 0;
  padding-left: 16px;
  white-space: normal;
}
.dark .NavSearch {
  --search-card: #1c2330;
  --search-pick: #3d5bc4;
  --search-tray: var(--vp-c-bg-alt);
}
@media (min-width: 768px) {
  .NavSearch {
    padding-left: 24px;
  }
}
@media (min-width: 960px) {
  .NavSearch {
    padding-left: 32px;
  }
}

/* ---------- 搜索框 ---------- */
.box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 400px;
  height: 38px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-alt);
  cursor: text;
  transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
}
.box:hover {
  border-color: var(--vp-c-brand-1);
}
.box:focus-within {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}
.icon {
  flex: none;
  font-size: 16px;
  color: var(--vp-c-text-3);
}
.box:focus-within .icon {
  color: var(--vp-c-brand-1);
}
.input {
  flex: 1;
  width: 0; /* 不让输入框自带的默认宽度把手机顶栏撑出屏幕 */
  min-width: 0;
  height: 100%;
  font-size: 14px;
  color: var(--vp-c-text-1);
}
.input::placeholder {
  color: var(--vp-c-text-3);
}
.input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  display: none;
}
.clear {
  display: flex;
  flex: none;
  padding: 4px;
  font-size: 16px;
  color: var(--vp-c-text-3);
}
.clear:hover {
  color: var(--vp-c-brand-1);
}

/* ---------- 下拉结果：灰底托盘上排卡片 ---------- */
.panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 480px;
  max-height: min(70vh, 600px);
  padding: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--search-tray);
  box-shadow: 0 20px 48px -12px rgba(15, 23, 42, 0.35);
  outline: none;
}
@media (min-width: 768px) {
  .panel {
    left: 24px;
  }
}
@media (min-width: 960px) {
  .panel {
    left: 32px;
  }
}
/* 手机上铺满整个宽度：.NavSearch 不再作为定位参照，下拉框改为相对整条顶栏定位 */
@media (max-width: 767px) {
  .NavSearch {
    position: static;
  }
  .panel {
    top: 100%;
    left: 0;
    right: 0;
    width: auto;
    max-height: calc(100vh - var(--vp-nav-height));
    max-height: calc(100dvh - var(--vp-nav-height));
    border-width: 1px 0;
    border-radius: 0;
  }
  .input {
    font-size: 16px; /* 小于 16px 时 iOS 聚焦会自动放大页面 */
  }
}

.results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 1px 2px 3px;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.results::-webkit-scrollbar {
  width: 10px;
}
.results::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 10px;
  background: var(--vp-c-divider) padding-box;
}
@supports not selector(::-webkit-scrollbar) {
  .results {
    scrollbar-width: thin;
    scrollbar-color: var(--vp-c-divider) transparent;
  }
}

.result {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--search-card);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  color: var(--vp-c-text-1);
  line-height: 1.45;
  text-decoration: none;
  transition: none;
}
.doc-icon {
  flex: none;
  width: 18px;
  height: 18px;
  background: var(--vp-c-text-3);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6M16 13H8M16 17H8M10 9H8'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6M16 13H8M16 17H8M10 9H8'/%3E%3C/svg%3E") center / contain no-repeat;
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.path {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}
.sep {
  opacity: 0.7;
}
.title {
  font-size: 15px;
  font-weight: 500;
}
mark {
  background: none;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}

/* 选中：整张变靛蓝，文字变白 */
.result.selected {
  background: var(--search-pick);
  box-shadow: none;
  color: #fff;
}
.result.selected .doc-icon {
  background: #fff;
}
.result.selected .path {
  color: rgba(255, 255, 255, 0.8);
}
.result.selected mark {
  color: #fff;
}

.empty {
  margin: 0;
  padding: 18px 12px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  text-align: center;
}
</style>
