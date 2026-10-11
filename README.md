# 学而笔记

个人学习网站，用 [VitePress](https://vitepress.dev/zh/) 构建，发布到 GitHub Pages。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 第一次使用前安装依赖 |
| `npm run dev` | 本地预览，改动保存后自动刷新 |
| `npm run build` | 构建静态网站到 `docs/.vitepress/dist` |
| `npm run preview` | 预览构建结果 |

## 目录结构

```text
├─ docs/                       网站内容
│  ├─ .vitepress/
│  │  ├─ config.mts            网站标题、搜索、页脚等设置
│  │  ├─ articles.ts           分类清单；扫描文章，生成顶部分类和左侧目录
│  │  ├─ search-tokenize.ts    搜索切词规则（中文按相邻两字切，句中的词也能搜到）
│  │  ├─ font-weights.ts       思源黑体可变字体的粗细，保持和以前三个字重时一致
│  │  ├─ markdown.ts           对读文章的「三家各一段」写法、右侧目录的短名字
│  │  └─ theme/
│  │     ├─ index.ts           主题入口：字体、样式、组件注册
│  │     ├─ custom.css         颜色、字体、圆角、示意图等样式
│  │     ├─ NavSearch.vue      顶栏搜索框，结果在框下方展开
│  │     ├─ ArticleIndex.vue   分类首页的目录表（自动生成）
│  │     └─ articles.data.mts  给目录表提供文章清单
│  ├─ index.md                 首页
│  ├─ python/                  Python 入门
│  ├─ agents/                  编程智能体对读（figures/ 里是文章引用的示意图）
│  └─ eng/                     工程笔记（同上）
├─ .github/workflows/deploy.yml  推送到 main 后自动发布
├─ templates/                  新文章模板（不会发布到网站）
├─ WRITING.md                  如何新增文章、常用写法
└─ DEPLOY.md                   如何发布到 GitHub Pages
```

新文章复制 `templates/` 里的模板来写，放进对应分类文件夹，左侧目录和目录表会自动更新，步骤见 [WRITING.md](./WRITING.md)。
