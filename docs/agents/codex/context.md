---
label: 上下文管理
order: 9
date: 2026-10-11
summary: 上下文里装了什么、怎么算用量、大输出怎么截、满了怎么压、压坏了怎么办
outline: 2
---

# codex 的上下文管理

本篇只讲 codex：它的上下文里装了什么、怎么判断快满了、太大的工具输出怎么处理、满了怎么压缩、压缩出了问题怎么办。上下文窗口、压缩这些概念见[智能体功能简介](/agents/overview#上下文管理与压缩)。

::: info 依据
- 核对的是发布版 rust-v0.162.1（2026-10-09），源码读的是 2026-10-11 的 main 分支（提交 `8c0f701`），文档读取于 2026-10-11。
- 源码全部公开，下文的数值取自源码常量和内置模型清单，没有实际运行，详见[本组的依据](/agents/codex/#本组的依据)。文件路径都相对 `codex-rs/`。
- 开发中、默认关闭的功能单独注明，不算作 codex 的默认做法。
:::

## 一句话

codex 把上下文当成一个**可以整个换掉的窗口**。

压缩一次就开一个新窗口，窗口有编号，前后串成一条链。新窗口里只保留用户说过的话和一份压缩结果，模型的回复和工具输出都不带过去；系统指令、AGENTS.md、权限、环境这些背景按当前状态重新渲染一遍，装进新窗口。能这样重新装，是因为 codex 注入上下文的每一样东西都是有类型、带标记的片段，程序认得出历史里哪一段是什么。

用 OpenAI 自己的接口时，压缩交给服务端做，返回的是一段加密内容，客户端看不到摘要写了什么。

## 你能看到和操作的

日常用到的命令和显示：

| 操作 | 作用 |
| --- | --- |
| `/compact` | 压缩到目前为止的对话，确认后执行。不能带说明 |
| `/status` | 显示当前模型、审批策略、可写目录和 token 用量 |
| 底栏的「xx% context left」 | 一直显示还剩多少上下文。算法见下文「用量怎么算」 |
| `/statusline` | 选择底栏显示哪些项，包括上下文统计 |
| `/new`、`/clear` | 开始新对话；`/clear` 还会先清屏 |
| `/side`（别名 `/btw`） | 开一个临时的旁支对话，记录和主对话分开 |
| `/fork` | 把当前对话复制成一个新对话，换个方向试 |

配置项（`~/.codex/config.toml`）：

| 配置 | 作用 |
| --- | --- |
| `model_context_window` | 告诉 codex 模型窗口有多大 |
| `model_auto_compact_token_limit` | 自动压缩的阈值；不设就用模型默认值，设了也不会超过窗口的 90% |
| `model_auto_compact_token_limit_scope` | 阈值按什么算：`total` 是整个上下文（默认），`body_after_prefix` 只算本窗口开头那块之后新长出来的部分 |
| `compact_prompt`、`experimental_compact_prompt_file` | 替换压缩用的提示词。只对本地摘要生效，服务端压缩用不到它 |
| `tool_output_token_limit` | 单条工具输出存进历史时的 token 上限 |
| `project_doc_max_bytes` | AGENTS.md 最多读多少字节，默认 32 KiB |
| `skills.max_context_tokens` | 技能清单的 token 预算，默认窗口的 2%，最多 1 万 |

开发者还能用三个钩子接管压缩前后：

- **PreCompact**：压缩前运行，收到触发方式（`manual` 或 `auto`）。返回 `continue: false` 时，codex 不压缩，停下这一轮。
- **PostCompact**：压缩后运行，同样收到触发方式。返回 `continue: false` 时，压完就停下。
- **SessionStart**：匹配 `compact` 的钩子在压缩后、下一次请求前运行。回合中途的自动压缩也一样，钩子补充的上下文会直接交给紧接着的那次请求。

## 上下文里装了什么

### 历史是一串 ResponseItem

codex 的对话历史是 OpenAI Responses API 的条目序列（`ResponseItem`）：消息、函数调用、调用结果、推理内容、压缩结果等。历史在内存里维护两条规则：每个调用都有对应的结果，每个结果都有对应的调用；模型不支持的图片、音频内容会被剥掉（`core/src/context_manager/history.rs`）。

### 注入的东西都是带标记的片段

codex 往对话里注入的背景信息不是裸字符串，而是**有类型的片段**。`core/src/context/` 下一共实现了 63 种片段，每种都实现 `ContextualUserFragment`（`context-fragments/src/fragment.rs`），必须给出：

- `role()`：放进 user 还是 developer 角色
- `content_kind()`：稳定的分类名
- `markers()`：开头和结尾的标记
- `body()`：正文

`render()` 把标记和正文拼起来，`matches_text()` 反过来判断历史里某一段是不是这一类。有了这一步，程序才能在历史里认出「这是环境信息」「这是 AGENTS.md」，后面的差分和压缩后重装都靠它。

### 世界状态：开头给全量，之后只给变化

模型需要知道的「当前状态」被拆成 19 个部分，叫世界状态（`core/src/context/world_state/`）：模型、权限、环境、AGENTS.md、协作模式、工具、多智能体模式、插件和应用说明等。每个部分实现两件事：

- 给出一份快照，记下这次告诉了模型什么。
- 和上一份快照比较，只在真的变了的时候产出一个新片段。

所以一个窗口开头会把所有部分完整渲染一遍；之后每一轮只把变了的部分作为新片段追加到历史末尾，不去改前面。比较时，上一份快照有三种情况：找不到（重新完整注入）、在历史里但快照丢了、快照完整可用。片段还分放置方式：放在窗口最前面的前缀、单独一条、可以和别的合并。

### 历史存在哪

每个会话写一个记录文件（rollout，JSONL 格式），放在 `~/.codex/sessions/` 下。两点值得注意：

- 工具输出只在内存里的历史中被截断，记录文件里存的是完整内容（源码注释：「Tool output truncation applies only to live history, preserving full rollout payloads」）。但模型拿不到记录文件，截掉的部分对模型来说就是没了。
- 每次压缩写一条 `Compacted` 记录，里面有摘要、替换后的整段历史、窗口编号和前后窗口的 id。恢复会话时从最近一条 `Compacted` 开始重建。

## 怎么知道快满了

### 三个数

| 数 | 怎么来 | 内置模型的值 |
| --- | --- | --- |
| 模型窗口 | 模型清单里的 `context_window`，可用 `model_context_window` 改，上限是 `max_context_window` | 27.2 万 token，最多可设到 87.2 万 |
| 自动压缩阈值 | 窗口的 90%；配置了 `model_auto_compact_token_limit` 就取两者中较小的（`protocol/src/openai_models.rs`） | 24.48 万 token |
| 可用窗口 | 窗口的 95%，剩下 5% 留给系统提示词、工具和模型输出；用量到这里，不管阈值怎么算都强制压缩 | 25.84 万 token |

阈值的口径可以换。默认 `total` 算整个上下文；`body_after_prefix` 会先记下本窗口开头那块（压缩后装回的背景加保留的消息）有多少 token，之后只算新长出来的部分。可用窗口那条线不受口径影响，始终按整个上下文算。

### 用量怎么算

当前用量 = 上一次 API 回复报告的总 token 数 + 那之后新加进历史的条目的估算（`core/src/context_manager/history.rs`）。估算按 4 字节约 1 个 token，图片按尺寸另算。也就是说，刚拼进去、还没发出去的工具输出，靠估算补上。

底栏的「xx% context left」另有算法：分子分母都先减掉 1.2 万 token 的基线，源码注释说这块包括「提示词、工具和调用压缩所需的空间」，减掉之后，刚开始对话时显示 100%，随着对话变长降到 0%（`protocol/src/protocol.rs`）。

### 什么时候检查

- **回合开始前**：用量超过阈值或可用窗口，先压缩再开始这一轮。
- **回合中途**：每次模型回复后，如果还要继续（模型要调工具，或者有排队的输入），而用量已经到线，就在回合中间压缩，然后接着跑。
- **换模型时**：换到窗口更小的模型、而当前用量已经超过新模型的阈值，或者新旧模型的压缩兼容标识（`comp_hash`）不同，都会先用原来的模型压缩一次，再交给新模型。
- **回合结束后**：代码里还有一个提前压缩的百分比 `model_post_turn_compact_threshold_percent`，默认 0（关闭），官方配置文档里没有列出。

## 单条结果太大怎么办

### 写进历史时统一截断

所有工具输出写进历史时都按模型的截断策略处理（`core/src/context_manager/history.rs`）。内置模型的策略是每条 1 万 token，实际允许再多 20% 给序列化开销；可以用 `tool_output_token_limit` 改。

截断方式是**掐掉中间、保留头尾**，中间换成一个标记，写明删了多少：`…N tokens truncated…`（`utils/string/src/truncate.rs`）。按 token 估算截断，而不是按字节，所以中文、英文的预算一致。

### Shell 命令

执行命令的工具自己先限一次（`core/src/unified_exec/mod.rs`）：

- 命令的输出先进一个 1 MiB 的缓冲区，超出时保留开头一半和结尾一半，丢掉中间。
- 每次调用返回给模型的输出默认最多 1 万 token。模型可以在调用时用 `max_output_tokens` 要更多，但可能被策略压回去。

### 压缩前的补救

服务端压缩的请求本身要带上整段历史，如果历史已经超过窗口，请求就发不出去。codex 会先从最新的条目往回，把工具输出换成截断版，直到估算降到窗口以内；遇到用户消息就停（`core/src/compact_remote_history.rs`）。

### 归纳

codex 的截断是**有损的**：头尾留下，中间删掉，告诉模型删了多少，但不告诉它去哪里找全文。完整输出只在记录文件里，那是给人和恢复会话用的，不是给模型的。

## 满了怎么压

<figure class="diagram">
<!--@include: ../figures/codex-compact.svg-->
<figcaption>一次压缩的八步。第 ③ 步按服务商选实现，默认用 OpenAI 时走服务端压缩。</figcaption>
</figure>

### 三种实现

压缩时先看功能开关，再看服务商支不支持服务端压缩（`core/src/session/turn.rs` 里的 `run_auto_compact`）：

| 实现 | 什么时候用 | 做法 |
| --- | --- | --- |
| 服务端压缩 | OpenAI、Azure、Amazon Bedrock 这类声明支持的服务商。默认用 OpenAI 就是这一种 | 发一个和正常请求一样的请求：同样的系统指令、同样的工具定义、整段历史，末尾追加一个压缩触发项。服务端返回恰好一个压缩条目，内容是加密的 |
| 本地摘要 | 其他服务商 | 在历史末尾追加一条用户消息，内容是摘要提示词，让模型写一份摘要 |
| 换新窗口，不摘要 | 打开实验开关 `token_budget` 时（开发中，默认关闭） | 直接开一个新窗口。源码注释说，它「仍然被建模成一次压缩」，这样钩子和界面看到的生命周期和另外两种一样 |

服务端压缩的请求和正常请求结构一致，只多了末尾的触发项；服务端拿它做了什么、返回的加密内容里写了什么，在客户端看不到。

### 新窗口里留下什么

两种摘要式的实现都只保留**用户自己说过的话**，从最近的往前取，取满预算为止：

| 实现 | 保留的消息 | 预算 |
| --- | --- | --- |
| 服务端压缩 | 用户消息、钩子注入的提示，以及部分智能体之间的消息（单条不超过 1 万 token，下级发来的进度消息和最终答复不留） | 6.4 万 token（`core/src/compact_remote_v2.rs`） |
| 本地摘要 | 用户消息；放不下的那条截断，图片等非文本内容丢掉 | 2 万 token（`core/src/compact.rs`） |

模型的回复、工具调用和工具输出都不保留，它们的信息只能靠压缩结果带过去。保留的消息之后接上压缩结果：服务端压缩是那个加密条目，本地摘要是一条以固定前缀开头的摘要消息。

然后把初始背景装回来：世界状态按「新窗口」完整渲染一遍，前缀部分放在最前面，其余部分插到最后一条真实的用户消息之前。如果已经没有用户消息，就插在摘要之前，让摘要保持在最后。源码注释把这个位置叫做「模型预期的边界」（model-expected boundary）。最后窗口编号加一，写一条 `Compacted` 记录，匹配 `compact` 的 SessionStart 钩子在下一次请求前运行。

本地摘要完成后，界面还会提示：长对话和多次压缩可能让模型不够准确，最好开新对话，保持每个对话短而专注。

### 本地摘要用的提示词

提示词在 `prompts/templates/compact/prompt.md`，全文 9 行：

```text
You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.
```

要求写四样：当前进展和关键决定、重要的背景约束和用户偏好、还剩什么要做、继续工作需要的关键数据。摘要放回历史时，前面加一段固定前缀（`summary_prefix.md`），大意是：另一个模型已经开始解决这个问题，这是它的思路摘要；你还能看到它用过的工具的状态，在已有的工作上继续，避免重复。

### 子代理

子代理在 codex 里是独立的线程，有自己的历史，上下文和压缩都按线程各管各的。

## 压坏了怎么办

### 压缩请求本身超长

- **本地摘要**：请求被以「超出窗口」拒绝时，从历史最前面删掉一条再试，直到只剩一条还不行才报错。源码注释的说法是从开头删，「保留最近的消息」（`core/src/compact.rs`）。
- **服务端压缩**：发请求前先截断末尾的工具输出（见上一节）；返回的压缩条目不是恰好一个时，按严重错误处理。
- 网络和流式错误按退避重试，服务端压缩的重试次数比普通请求少。用原来的模型压缩失败时，允许的话换当前模型再试一次。

### 正常请求被拒

普通回合里，如果 API 以「超出窗口」拒绝请求，codex 把用量记成已满，这一轮以错误结束。下一轮开始前的检查看到用量已满，会先压缩。也就是说，被拒之后不是当场补救，而是交给下一轮的压缩检查（据 `core/src/session/turn.rs` 的代码推断）。

### 死循环：明确不设防

回合中途压缩的地方有一行注释：

> as long as compaction works well in getting us way below the token limit, we shouldn't worry about being in an infinite loop.
>
> —— `core/src/session/turn.rs`

意思是：只要压缩能把用量压到远低于上限，就不用担心死循环。也就是说，codex 意识到了这个风险，选择相信压缩总能腾出足够空间，主流程里没有计数或停机保护。只有自动审查（guardian）那条路径加了「每个模型步骤只重试一次」的限制。

### 钩子停下

PreCompact 返回 `continue: false`，这一轮直接中止，不压缩；PostCompact 返回 `continue: false`，压完后中止。回合结束后的提前压缩如果失败，只记一条警告，已经完成的这一轮保留。

压缩的结果分三种状态记录：完成、失败、中断。

## 模型能不能自己管

默认不能。codex 默认没有给模型压缩或重开上下文的工具，压缩只由阈值检查和用户的 `/compact` 触发。

源码里有一个模型自己开新窗口的工具 `new_context`，但它只在实验开关 `token_budget` 打开时才注册（开发中，默认关闭）。它没有参数，描述是一句话：

> Start a new context window. Does not clear, reset, or otherwise affect environment state.
>
> —— `core/src/tools/handlers/new_context_window_spec.rs`

也就是开一个新窗口，但不动环境：文件、进程都保持原样。模型调用后，下一次继续之前就换窗口。同一个开关下还有一段给模型看的「窗口使用指引」，作为世界状态的一部分注入。

默认情况下，模型能做的是少往上下文里放东西：调用命令时用 `max_output_tokens` 控制输出量；用 `head`、`grep` 这类命令只看需要的部分；把独立的工作交给子代理。

## 关键数字

| 项目 | 数值 |
| --- | --- |
| 内置模型窗口 | 27.2 万 token，可设到 87.2 万 |
| 自动压缩阈值 | 窗口的 90%（27.2 万时为 24.48 万） |
| 可用窗口（强制压缩线） | 窗口的 95% |
| 「context left」的基线 | 1.2 万 token |
| 工具输出写进历史 | 每条 1 万 token，另加 20% 序列化余量 |
| 命令输出缓冲 | 1 MiB，超出保留首尾各一半 |
| 命令单次返回 | 默认 1 万 token |
| 服务端压缩保留的消息 | 6.4 万 token；智能体之间的消息单条不超过 1 万 |
| 本地摘要保留的用户消息 | 2 万 token |
| 摘要提示词 | 9 行 |
| AGENTS.md | 默认最多 32 KiB |
| 技能清单 | 窗口的 2%，最多 1 万 token |
| 世界状态 | 19 个部分 |
| 上下文片段类型 | 63 种 |

## 来源

源码：[openai/codex](https://github.com/openai/codex)，main 分支 2026-10-11 的提交 `8c0f701`（发布版 rust-v0.162.1，2026-10-09）。主要读了：

- `core/src/compact.rs`：本地摘要、保留用户消息、装回初始背景
- `core/src/compact_remote_v2.rs`、`core/src/compact_remote_v2_attempt.rs`、`core/src/compact_remote_history.rs`：服务端压缩
- `core/src/compact_token_budget.rs`、`core/src/tools/handlers/new_context_window_spec.rs`：换新窗口和 `new_context` 工具
- `core/src/session/turn.rs`、`core/src/session/context_window.rs`：触发时机和阈值口径
- `protocol/src/openai_models.rs`、`models-manager/models.json`：窗口、阈值、截断策略
- `core/src/context_manager/history.rs`、`utils/string/src/truncate.rs`、`core/src/unified_exec/mod.rs`：用量估算和截断
- `core/src/context/`、`context-fragments/src/fragment.rs`：片段和世界状态
- `protocol/src/protocol.rs`：「context left」的算法
- `prompts/templates/compact/`：摘要提示词和前缀
- `features/src/lib.rs`：功能开关的默认值

官方文档（learn.chatgpt.com，2026-10-11 读取）：

- [Slash commands in Codex CLI](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)
- [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)
- [Hooks](https://learn.chatgpt.com/docs/hooks.md)

### 没核到的

- 服务端压缩时服务端做了什么，返回的加密内容里有什么。
- 服务端压缩的请求和正常请求结构一样，是否因此命中提示词缓存，没有查 OpenAI 的缓存文档确认。
- 全部数值来自源码，没有实际运行验证。
