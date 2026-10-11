---
title: 终端渲染对照：现在 vs 对齐 Claude Code 式
label: 终端渲染对照
order: 3
date: 2026-08-06
summary: 终端渲染对照
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 写文件长这样
  - 规则表
  - 要动什么
---

# 同一段会话，两种渲染

<Badge type="info" text="对标核验 · 2026-08-06" />

左边是 `run-pane.tsx` 现在画出来的样子，右边按 Claude Code 式语法重画。差别不在配色，在结构：现在是「一行一个状态图标」，对齐后是「调用行 `●` + 结果分支 `⎿`」两行制。

- **Claude Code 本体**：v2.1.223 · 仅 claude.exe（267MB） · 无可读源码
- **可读的对标源**：local-ai-assistant<br>src/terminal-render.js
- **已验在活路径上**：interactive-session.js<br>agent-event-renderer.js
- **现状出处**：apps/cli/src/view<br>run-pane.tsx:101-114

<div class="panes">

::: info 现在 — run-pane.tsx
<pre class="term" v-pre><span class="b">●</span> coding.default
  <span class="dim">工作区 D:\dpy\agent\agent-platform</span>
  <span class="dim">回车发送 · Ctrl+C 中断本轮、再按一次退出 · Ctrl+U/Ctrl+D 上下翻</span>

<span class="cy">› </span>把工具调用的样式对齐 Claude Code

先读现在的渲染层，再决定动哪几处。
  <span class="dim">先确认 terminal-render 在不在活的调用链上</span>
  ✓ <span class="b">read_file</span> <span class="gray">(read)</span>
  ✓ <span class="b">grep</span> <span class="gray">(read)</span>
  ✓ <span class="b">run_command</span> <span class="yl">(write)</span>
  ⊘ <span class="b">edit_file</span> <span class="yl">(write)</span><span class="yl"> 已被你拒绝，未执行</span>
  ✗ <span class="b">write_file</span> <span class="yl">(write)</span><span class="rd"> 报错</span>
<span class="mu">⠙</span> 第 5 步 · in 12.4k / out 820</pre>
:::

::: tip 对齐后 — terminal-render.js 式
<pre class="term" v-pre><span class="b">●</span> coding.default
  <span class="dim">工作区 D:\dpy\agent\agent-platform</span>
  <span class="dim">回车发送 · Ctrl+C 中断本轮、再按一次退出 · Ctrl+U/Ctrl+D 上下翻</span>

<span class="cy">› </span>把工具调用的样式对齐 Claude Code

<span class="b">●</span> 先读现在的渲染层，再决定动哪几处。
  <span class="dim">先确认 terminal-render 在不在活的调用链上</span>

<span class="b">●</span> read_file(apps/cli/src/view/run-pane.tsx)
  <span class="gray">⎿</span> <span class="dim">读取 114 行</span>

<span class="b">●</span> grep(SYMBOLS|renderToolResult)
  <span class="gray">⎿</span> <span class="dim">命中 7 处，分布在 3 个文件</span>

<span class="b">●</span> Bash(pnpm run check)
  <span class="gray">⎿</span> <span class="dim">退出码 0 · 58 个测试文件、787 条</span>

<span class="b">●</span> edit_file(apps/cli/src/view/run-pane.tsx)
  <span class="gray">⎿</span> <span class="yl">已拒绝：改用 ⎿ 分支行，别动状态图标</span>

<span class="b">●</span> write_file(docs/decisions/0059-终端渲染对齐.md)
  <span class="gray">⎿</span> <span class="rd">失败：目标路径不在可写根内</span>

<span class="mu">✻</span> <span class="dim">本轮 1m 12s · in 12.4k / out 820</span></pre>
:::

</div>

## 写文件那一步长这样

成功的写操作不是一行「✓ edit_file」，是动作 + 增删统计 + 彩色 diff，超 20 行折叠。这是两套语法差得最远的地方。

::: info 对齐后 — renderDiffLines · 缩进 4 · 上限 20 行
<pre class="term" v-pre><span class="b">●</span> edit_file(apps/cli/src/view/prompt.tsx)
  <span class="gray">⎿</span> <span class="dim">已编辑 · </span><span class="gr">+8</span> <span class="rd">-2</span>
    <span class="gray">@@ -100,4 +100,10 @@</span>
    <span class="dim">       &lt;/Box&gt;</span>
    <span class="rd">-      {busy &amp;&amp; &lt;Text dimColor&gt;{"  跑动中：回车会把这句话…"}&lt;/Text&gt;}</span>
    <span class="rd">-      {hint !== undefined &amp;&amp; &lt;Text color="yellow"&gt;{hint}&lt;/Text&gt;}</span>
    <span class="gr">+      {notice !== undefined &amp;&amp; (</span>
    <span class="gr">+        &lt;Text</span>
    <span class="gr">+          dimColor={notice.tone === "ambient"}</span>
    <span class="gr">+          color={notice.tone === "hint" ? "yellow" : undefined}</span>
    <span class="gr">+        &gt;</span>
    <span class="gr">+          {notice.text}</span>
    <span class="gr">+        &lt;/Text&gt;</span>
    <span class="gr">+      )}</span>
    <span class="dim">     &lt;/Box&gt;</span>
    <span class="dim">… 其余 6 行省略</span></pre>
:::

## 规则表

| 元素 | 现在 | 对齐后 | 出处 |
| --- | --- | --- | --- |
| 助手正文 | 无前缀，顶格 | 粗体 `●` + 空格，续行缩进 2 | renderAssistantText:429 |
| 工具调用 | `✓ 名字 (risk)` | `● 名字(关键参数)`，绝不打裸 JSON | summarizeToolCall:84 |
| 关键参数 | 不显示 | 读写→path(70) · bash→command(60) · grep→query(50) | pickPrimaryArg:94 |
| 工具结果 | 并进图标 | 缩进 2 + 灰 `⎿` + 人读摘要 | renderToolResult:236 |
| 被拒 | `⊘` + 黄字 | 黄 `已拒绝：理由`，不标红 | :249 |
| 失败 | `✗` + 红「报错」 | 红 `失败：原因`（截 120 列） | :256 |
| 策略拦截 | 照常显示 | 一行都不打，只喂回模型 | :252 |
| 回合收尾 | `⠙ 第 N 步 · in/out` | `✻ 本轮耗时 · in/out` | SYMBOLS.crunch:19 |
| 关色降级 | ink 自理 | NO_COLOR > FORCE_COLOR > isTTY，纯文本可断言 | shouldUseColor:29 |

## 要动什么

1. 01 **正文加 `●` 前缀与续行缩进**改 ItemLine 的 say 分支。已做完，3 条用例做过红绿验证。已完成
2. 02 **结果拆成 `⎿` 分支行**查完摘要字段才发现：`tool.result` 只下发 callId / toolName / isError，第二行想说的「读了多少行、退出码」客户端一个字都拿不到。上一版把这步标成「纯渲染」是错的。要扩摘要字段
3. 03 **写操作出 diff** diff 是业务返回，按 §7.2 只能走 payloadRef 二次取，而那个端口现在任何地方都没有。要新端口
4. 04 **调用行显示关键参数**同一堵墙：`tool.requested` 摘要里只有 callId / toolName / risk，入参原文不下发——这正是 §7.2 那条 PII 论据实打实管住的一件事。要扩摘要字段

---

**右栏 `⎿` 行里的内容目前拿不到。**「读取 114 行」「退出码 0」「已拒绝：理由」都是结果正文，而 `tool.result` 在 `EVENT_SENSITIVITY` 里是 sensitive 档，摘要只有 `callId` / `toolName` / `isError`（events.ts:429）。第 02 步的价值全在第二行的内容上，所以它不是排版问题，是契约问题。

右栏是按 `terminal-render.js` 的规则重画的示意，不是真机截图——Claude Code v2.1.223 只分发二进制，它当下的确切样子无法程序化核验。要像素级一致的话，需要你贴一段真机输出来对。
