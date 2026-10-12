# 智能体

这个分类介绍编程智能体由哪些功能组成，以及 **Claude Code**、**codex**（Rust）、**deepseek-harness**（TypeScript）三家各自怎么实现、哪里相同哪里不同、对自己动手做一个智能体有什么启示。

## 从哪里读起

先读[智能体功能简介](/agents/overview)：8 组 29 项功能，每项讲它是什么、难在哪。

然后是每家一组的功能介绍，按功能简介的清单逐项写，再把三家放在一起比较。每组开头先有一篇全景，把这一家有的东西一页列全：[Claude Code](/agents/claude-code/panorama)、[codex](/agents/codex/panorama)、[deepseek-harness](/agents/deepseek-harness/panorama)。已经写好的功能有两项，每项三家各一篇，再加一篇三家差异：

- 回合循环与中断：[Claude Code](/agents/claude-code/turn-loop)、[codex](/agents/codex/turn-loop)、[deepseek-harness](/agents/deepseek-harness/turn-loop)，[三家差异](/agents/turn-loop)
- 上下文管理：[Claude Code](/agents/claude-code/context)、[codex](/agents/codex/context)、[deepseek-harness](/agents/deepseek-harness/context)，[三家差异](/agents/context)

之后会陆续补上：

- **三家功能介绍的其余各项**
- **三家差异的其余各项**：每个功能一篇，三家并排对照
- **对自建智能体的启示**

::: info 正在整理
下面「智能体内核」「协议与接入」「平台能力」三组是之前写的 16 篇三家对读，每篇讲一个功能，三家逐个维度对照，之后会改写进「三家差异」。部分篇目把我自己的项目 agent-platform 作为第四列一起比较。
:::

<!-- 目录表按各篇文章开头的 group / summary / date 自动生成，新增文章不用改这里 -->
<ArticleIndex summary-label="覆盖的问题" />
