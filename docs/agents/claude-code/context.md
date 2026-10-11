---
label: 上下文管理
order: 9
date: 2026-10-11
summary: 上下文里装了什么、怎么算用量、大输出怎么截、满了怎么压、压坏了怎么办
outline: 2
---

# Claude Code 的上下文管理

本篇只讲 Claude Code：它的上下文里装了什么、怎么判断快满了、太大的工具输出怎么处理、满了怎么压缩、压缩出了问题怎么办。上下文窗口、压缩这些概念见[智能体功能简介](/agents/overview#上下文管理与压缩)。

::: info 依据
- 核对的是 Claude Code 2.1.296（2026-10-09 发布），文档读取于 2026-10-11。
- 引擎不公开源码。依据是官方文档、Agent SDK 的 Python 源码（只能看到接口和数据格式）、Anthropic 的两篇工程博客和更新日志，详见[本组的依据](/agents/claude-code/#本组的依据)。
- 文档没写的地方直接写「文档没写」，不做推测，文末列了清单。
:::

## 一句话

Claude Code 的上下文管理围绕一件事设计：**不弄脏缓存前缀**。

模型不记得上一轮，每次请求都要把系统提示词、工具定义、项目指令和全部对话重新发一遍。API 的提示词缓存按前缀匹配：从请求开头逐字比对，和上次相同的部分直接复用，遇到第一处不同，后面全部重新计算。Claude Code 团队在工程博客里说，他们围绕提示词缓存搭建整个 harness，缓存命中率掉下去会当成事故处理。

后面的大部分做法都由这条约束推出来：会变的信息追加成新消息，不去改系统提示词；暂时用不上的工具定义只放名字，不删掉；压缩时发的摘要请求和正常对话共用同一个前缀。压缩由 harness 按阈值触发，或者由人手动触发，模型自己没有压缩上下文的工具。

## 你能看到和操作的

日常用到的命令：

| 操作 | 作用 |
| --- | --- |
| `/context` | 按类别列出占用：系统提示词、内置工具、MCP 工具、自定义子代理、记忆文件、技能、对话消息，以及剩余空间和给压缩预留的空间。超出窗口时顶部出警告，加 `all` 展开每一项 |
| `/compact [说明]` | 立刻压缩。说明写希望摘要保留什么，比如 `/compact focus on the API changes` |
| `/rewind` 里的两个摘要选项 | 选中一条消息，**Summarize from here** 压缩它之后的部分，**Summarize up to here** 压缩它之前的部分，其余原样保留 |
| `/autocompact 500k` | 设自动压缩窗口，也就是对话长到多少自动压缩。按模型分别保存，`/autocompact auto` 恢复默认 |
| `/clear` | 清空上下文开始新对话，旧对话可以用 `/resume` 找回 |
| `/btw 问题` | 问一个旁支问题。只根据已有上下文回答、不能调工具，问答都不进对话历史 |

不用敲命令的入口：

- **CLAUDE.md 里写一节压缩说明**：长期生效。标题随便起，压缩时按意思识别，文档的例子是 `# Compact instructions`。
- **状态栏**：可以配置成一直显示上下文用了多少。
- **恢复旧会话时的提示**：Pro、Max 用户恢复一个闲置超过约一小时、长度超过 10 万 token 的会话时，Claude Code 先问要不要从摘要恢复。这时缓存已经过期，第一轮无论怎么选都要整段重新计算；如果带着全文继续，之后每一轮也都带着全文。

配置项：

| 配置 | 作用 |
| --- | --- |
| `autoCompactWindow`（设置）、`--autocompact`（启动参数）、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`（环境变量） | 自动压缩窗口，10 万到 100 万 token，不超过模型本身的窗口；环境变量优先级最高 |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | 在压缩窗口的百分之几触发，比如 `50`。只能调低，不能调高 |
| `autoCompactEnabled`、`DISABLE_AUTO_COMPACT` | 关掉自动压缩，手动 `/compact` 仍可用 |
| `DISABLE_COMPACT` | 自动和手动压缩都关掉 |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | 把原生 100 万窗口的模型当 20 万窗口用 |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | 走网关或用自定义模型名时，告诉 Claude Code 窗口实际有多大 |

开发者还能用三个钩子接管压缩前后：

- **PreCompact**：压缩前运行，能拦下这次压缩（退出码 2，或返回 `"decision": "block"`）。输入里有触发方式（`manual` 或 `auto`）和 `/compact` 后面写的说明。
- **PostCompact**：压缩后运行，输入里带着生成的摘要全文，适合存档，不能改变压缩结果。
- **SessionStart**：匹配 `compact` 的钩子在压缩后运行，输出会并入压缩后的上下文，适合把必须留住的信息重新放进去。

## 上下文里装了什么

### 每次请求的三层

Claude Code 把请求排成三层，越不常变的越靠前，这样前面几层能一直命中缓存：

| 层 | 内容 | 什么时候变 |
| --- | --- | --- |
| 系统提示词 | 核心指令、工具定义 | 加载的工具定义变了 |
| 项目上下文 | CLAUDE.md、自动记忆、不限路径的规则 | 会话开始，或 `/clear`、`/compact` 之后 |
| 对话 | 你的消息、模型的回复、工具结果 | 每一轮 |

模型和 effort 档位不在提示词文本里，但也影响缓存：换模型，整个请求都要重新计算；换 effort 在多数模型上也一样，Opus 5.5、Sonnet 5.5、Haiku 5.5、Fable 5.1 默认不受影响。

容易误会的一点：CLAUDE.md 和输出风格的说明不在系统提示词里。Claude Code 把它们作为 system reminder 放进对话，在请求里是用户消息中的一段 `<system-reminder>` 标签，部分模型上是一条单独的 `system` 角色消息。

### 一开场就装进去的

文档里的模拟用一组示意数字展示开场时各部分的分量。这不是实测，你自己的会话用 `/context` 看：

| 内容 | 示意 token 数 | 说明 |
| --- | --- | --- |
| 系统提示词 | 4,200 | 行为、工具用法、输出格式的核心指令 |
| 自动记忆 MEMORY.md | 680 | 只加载前 200 行或前 25KB，以先到者为准 |
| 环境信息 | 280 | 工作目录、平台、shell、系统版本、是不是 git 仓库；git 状态另成一块 |
| MCP 工具 | 120 | 默认只列工具名，完整定义要用时再加载 |
| 技能描述 | 450 | 每个技能一行描述，正文用到时才加载 |
| 用户级 CLAUDE.md | 320 | `~/.claude/CLAUDE.md` |
| 项目 CLAUDE.md | 1,800 | 项目根目录的 CLAUDE.md |

### 会话中途追加的

- **工具结果**：读文件、跑命令的输出都进对话，这是窗口被撑满的主要原因。文档模拟里读一个文件是 2,400 token，跑一次测试是 1,200 token，而终端上只显示一行「Read auth.ts」。
- **按路径加载的规则、子目录的 CLAUDE.md**：读写到对应文件时才加载，进的是对话历史。
- **system reminder**：文件在磁盘上被改了的提醒、钩子返回的 `additionalContext`、可用技能列表、提交署名说明等。
- **技能正文**：调用一次就作为一条消息留在对话里，之后不再重读文件；内容完全相同的重复调用只加一句「已加载」。
- **计划模式的说明**：进入计划模式时追加一条说明消息，工具集合不变。

这些中途变化都是往后追加，不改前面。工程博客里说得很直接：时间、文件变化这类会过期的信息，Claude Code 放进下一条用户消息或工具结果里的 `<system-reminder>`，不去更新系统提示词；计划模式也不换工具集，而是把进入、退出计划模式本身做成两个工具。

### 被挡在外面的

- **MCP 工具定义**：默认只发工具名和服务器说明，模型需要时用 ToolSearch 工具找出完整定义。工程博客解释了为什么不直接删掉暂时用不上的工具：工具定义在缓存前缀里，增删一个工具，整段对话的缓存都会失效。
- **过长的技能列表**：预算是窗口的 1%，超出就丢掉一部分技能的描述，名字总是保留；单条描述加使用时机最多 1,536 个字符。写了 `disable-model-invocation: true` 的技能连描述都不进，等你用 `/名字` 调用。
- **子代理的工作过程**：子代理在自己的窗口里干活，它读的文件不进主对话，只有最后的结果回来。文档模拟里子代理读了 6,100 token 的文件，回到主对话的只有 420 token。

### 历史存在哪

会话记录存成 JSONL 文件，路径是 `~/.claude/projects/<项目>/<会话 id>.jsonl`，每行一条消息、工具调用或元数据。从 Agent SDK 的源码能看出它的结构：每条记录有 `uuid` 和指向上一条的 `parentUuid`，连成一条链；压缩时写入一条 `compact_boundary` 记录（带 `logicalParentUuid`，指回被压缩的那一段）和一条标记为 `isCompactSummary` 的摘要消息。

SDK 重建对话时沿 `parentUuid` 往回走，**故意不跟** `logicalParentUuid`。源码注释写明理由：压缩之后摘要已经代替了前面那些消息，再跟过去，内容会重复。所以压缩不删原始记录，只改变之后发给模型的内容。文档也提醒，这个文件格式是内部格式，每个版本都可能变，要读会话数据应该用 `/export` 或 SDK 的接口。

## 怎么知道快满了

### 两个上限

先分清两个数：

- **模型的窗口**：模型一次最多能读多少。Fable 5 系列、Sonnet 5 及以后、Haiku 5.5、Opus 4.7 及以后默认 100 万 token；Opus 4.6、Sonnet 4.6 默认 20 万，选 `[1m]` 版本才是 100 万。
- **自动压缩窗口**：对话长到多少自动压缩，不超过模型的窗口。

没设自动压缩窗口时：

| 情况 | 什么时候自动压缩 |
| --- | --- |
| 原生 100 万窗口的模型 | 约 96.7 万 token，赶在窗口满之前 |
| Opus 4.6、Sonnet 4.6 不带 `[1m]` | 20 万 |
| 设了 `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` | 20 万 |
| 云端会话 | 接近模型上限时 |
| Claude Code 不认识的模型名（比如网关别名） | 按它假定的窗口，可以用 `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 纠正 |

### 为什么要留一块缓冲

压缩本身也占地方：摘要请求要带上整段对话和一条压缩指令，模型还要写出摘要。工程博客里说，因为摘要请求复用对话的前缀，必须预留一块「压缩缓冲」，保证到时候放得下压缩指令和摘要输出。`/context` 里有一行就是这块预留空间。调大单次回复的输出上限（`CLAUDE_CODE_MAX_OUTPUT_TOKENS`）也会挤占可用空间，让自动压缩更早触发。

### 用量怎么算

Claude Code 有三处显示用量，算法各不相同：

- **`/context`**：默认用 API 的 token 计数接口逐类计数。这些计数请求不出现在消息流里，在 Anthropic API 上不收费。网关不提供计数接口时，退回按字符数估算。
- **Agent SDK 的 summary 模式**：用最近一次回复里的用量加本地估算，不发计数请求，各类数字是近似值。
- **状态栏的百分比**：用最近一次 API 回复报告的输入量（普通输入加写缓存、读缓存，不含输出）除以模型的完整窗口。设了自动压缩窗口以后，这个百分比就不再说明离压缩还有多远。

计量出错，压缩时机就会错。更新日志里修过这类问题：顾问模型参与的轮次被按两倍计算，自动压缩在真实窗口的一半就触发了（2.1.273 修复）；最后一条回复报告用量为 0 时，自动压缩没触发，直接报「Prompt is too long」（2.1.288 修复）。

## 单条结果太大怎么办

这一层在压缩之前：工具结果进入对话之前先限制大小，不调模型，纯按长度处理。各工具的规则不同。

### Bash

命令的输出边跑边写进一个工作文件，超过 5 GB 直接杀掉命令。命令结束后，Claude Code 从文件里读回一段，成功和失败分开处理：

| 结果 | 模型收到什么 |
| --- | --- |
| 成功 | 约 3 万字符以内原样给。超过就给文件路径（文件存在会话目录里，超过 64 MiB 的部分截掉），加最多 2,000 字符的开头预览，模型需要时自己去读或搜这个文件 |
| 失败 | 约 1 万字符以内原样给。超过就从开头和结尾各截一段，不给文件路径 |

退出码 1 一般算失败，但 Claude Code 认得几个返回 1 也正常的命令：`grep`、`rg`、`find`、`diff`、`test` 等，以及 `git diff`、`git grep`。

可以调的：`BASH_MAX_OUTPUT_LENGTH` 控制从文件读回多少，默认 3 万字符，最多 15 万；`bashOutputMaxChars` 控制成功结果原样给多少，最多 12.8 万字符（2.1.261 起）。

### Read

- 一次最多返回 2.5 万 token（`CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` 可调）。读整个文件超过这个量时，返回第一页，附一句「PARTIAL view」，说明读了多少、怎么用 `offset` 和 `limit` 接着读。
- 整个文件超过 256 KB 直接拒绝，提示分段读或者用 Grep 搜。
- 2.1.296 起，模型可以传 `allow_large: true` 一次读完整个文件，上限按窗口剩余空间算。
- 图片缩放、压缩后再发；超过 10 页的 PDF 要按页读，一次最多 20 页。

### MCP 工具

| 情况 | 处理 |
| --- | --- |
| 结果超过 1 万 token | 给用户显示警告 |
| 成功结果超过 2.5 万 token（`MAX_MCP_OUTPUT_TOKENS` 可调） | 存到会话的 `tool-results` 目录，对话里换成一条写着文件路径的消息 |
| 文本结果超过 5 万字符 | 不管 token 数，同样存文件 |
| 错误信息超过约 1.1 万字符 | 只留前 5,000 和后 5,000 字符，中间标出删了多少 |

MCP 服务器可以给单个工具声明 `anthropic/maxResultSizeChars`，用它自己的字符上限。

### 图片和 PDF

图片和 PDF 不截断，而是累积到上限时成批删除：下一次请求会超过 API 的数量限制或 Claude Code 的总大小限制时，删掉一批最旧的。删掉的图模型就看不到了，要用得再发一次。删图改动了历史消息，从被删的那条往后都要重新计算缓存；一次删一批，就只慢一轮，不会每发一张截图慢一次。

### 归纳

成功的大结果「全文存文件，给路径和预览」，信息没丢，模型需要时可以再取；失败的大结果只截首尾、不留文件，文档没说为什么这样区分。所有这些都发生在进入对话之前，不需要调模型。

## 满了怎么压

<figure class="diagram">
<!--@include: ../figures/cc-compact.svg-->
<figcaption>一次压缩的八步。第 ③ 步是文档的说法，具体怎么清没有公开；第 ④ 步的做法见下文「发摘要请求」。</figcaption>
</figure>

### 三种触发

Claude Code 会在摘要请求上加一个提示头 `x-claude-code-compaction`（直连 Anthropic API 时默认带，走自建网关要手动打开），它把压缩的触发分成三种：

- **auto**：对话接近自动压缩窗口，提前压缩。
- **manual**：用户执行 `/compact`。恢复旧会话时选「从摘要恢复」，也是直接执行 `/compact`。
- **reactive**：请求已经被 API 以「太长」拒绝，事后补救。

前两种是预防，第三种是撞墙之后的恢复。三者走同一套压缩，区别在出错时怎么处理，见下一节。

### 先清旧的工具输出

文档的说法是：快满时先清掉较早的工具输出，需要的话再对对话做摘要。具体清哪些、清到什么程度，文档没写。

另一个能核实的事实：Claude Code 的请求里带着 API 的 context management 字段，网关兼容文档的功能列表里有它。这是 Anthropic API 的「上下文编辑」功能，在服务端按规则清掉最旧的工具结果，换成一句占位说明，客户端照常保留完整历史。Claude Code 用这个字段做了什么、和上面的「先清工具输出」是不是一回事，文档都没有明说。

### 发摘要请求

摘要请求的构造，文档和工程博客都专门讲过：系统提示词、工具定义、对话历史都和正常对话一模一样，只在最后追加一条用户消息，里面是压缩指令。

为什么这样做：最直接的写法是另起一个「请总结以下内容」的系统提示词、不带工具，但这样请求从第一个 token 起就和缓存对不上，整段对话都要按全价重新计算，而且对话越长、越需要压缩的时候，这次调用越贵。现在的做法让摘要请求几乎就是上一轮请求，缓存直接复用，新增的只有那条压缩指令。

所以缓存还热的时候，`/compact` 的花费远低于上下文大小看上去的量，时间主要花在生成摘要上。离上次请求超过缓存寿命（订阅一小时，API key 五分钟）时就只能整段重新计算，这也是恢复旧会话时压缩最贵的原因。

其他细节：

- 2.1.198 起，摘要请求沿用会话的扩展思考设置。
- 模型过载、不可用或拒绝生成摘要时，换到备用模型重试（2.1.178、2.1.282）。
- 摘要提示词本身没有公开，能影响它的只有 `/compact` 后面的说明和 CLAUDE.md 里的压缩说明。工程博客描述过摘要保留什么：架构决策、没解决的 bug、实现细节；丢掉重复的工具输出和消息。

### 替换历史，再把该留的装回来

摘要替换掉较早的对话。按 Agent SDK 文档的说法，自动压缩会保留最近的往来。

替换之后，Claude Code 把一部分内容重新装回来：

| 内容 | 压缩之后 |
| --- | --- |
| 系统提示词、输出风格 | 照常生效 |
| 项目根目录的 CLAUDE.md、不限路径的规则 | 从磁盘重新读 |
| 自动记忆 | 从磁盘重新读 |
| git 状态 | 重新读一份当前的 |
| 计划模式里写的计划 | 从磁盘装回 |
| 限定路径的规则、子目录的 CLAUDE.md | 和对话一起被摘要掉，之后碰到对应文件时再加载 |
| 读过或改过的文件 | 按最近修改时间重读最多 5 个；超过 5,000 token 的只给路径，显示为 Referenced file |
| 调用过的技能 | 重新附上每个技能最近一次调用的内容，每个只留前 5,000 token，合计不超过 2.5 万；从最近调用的开始装，装不下的旧技能丢掉 |
| 后台命令、后台子代理 | 继续运行，Claude Code 提醒模型哪些还在跑，免得重复启动 |
| 钩子之前加进来的内容 | 和对话一起被摘要 |
| 匹配 `compact` 的 SessionStart 钩子 | 运行，输出并入压缩后的上下文 |

由此有几条实用的推论，文档里也写了：

- 必须在压缩后保留的规则，不要写成限定路径的规则，放进项目根目录的 CLAUDE.md。
- 技能重新附上时只保留开头，最重要的指令要写在 SKILL.md 前面。
- 会话中途改了 CLAUDE.md 不会立刻生效，因为它只在会话开始时读一次；压缩或 `/clear` 之后才读到新内容。

缓存方面：压缩后对话层的缓存必然失效，因为历史变了；系统提示词层继续复用；项目上下文从磁盘重读，只有 CLAUDE.md 和记忆在会话期间没改过才能命中。

### 子代理也会压缩

子代理用和主对话相同的逻辑自动压缩，`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 对它同样生效。2.1.296 起还能在子代理定义里单独设 `autoCompactWindow`，让它比主对话更早压缩。子代理的记录存在单独的文件里，主对话压缩不影响它们。

## 压坏了怎么办

### 压完又立刻满：停下报错

最典型的失效：一个超大的文件或工具输出让窗口压完立刻又满，自动压缩一遍遍触发，每一遍都在调模型。Claude Code 的处理是：连续几次压缩成功、但窗口立刻又被填满后，停止自动压缩，报错 `Autocompact is thrashing: the context refilled to the limit...`，把决定交给人。具体几次，文档没写。

文档给的恢复办法：让模型分段读那个大文件；用 `/compact keep only the plan and the diff` 这类说明把大输出压掉；把大文件的活交给子代理；不需要前文就 `/clear`。如果 `/clear` 之后还报错，看 `/context` 里的 `Messages` 一行：它最大，说明新对话里又出现了大输出；其他各行加起来更大，说明开场装进去的东西太多，要精简 CLAUDE.md、MCP 服务器等。

### 压缩后还是太长

- 压缩后的请求仍然超长时，再压一次，这次保留更少的近期对话（2.1.284 起）。
- 被拒后的补救压缩，一般概括最旧的往来、保留最新的。连一轮完整的往来都概括不了时，原样保留你最新的那条消息，概括它之前的全部；对话不是以你的消息结尾时，整段概括。要带过去的内容里没有模型回复、你自己的文字又不到约 1,000 token 时（比如粘贴了超大内容后发的一句重试），直接放弃，提示 `/clear`。2.1.269 之前，这种情况每一轮都会再报一次错。
- 只有一轮的对话没有前文可压。Claude Code 不去尝试，而是拿 API 报告的 token 数和自己的估算比较，告诉你请求主要被什么占了：是这一轮的内容本身，还是系统提示词、工具定义和附件。
- 请求超过 API 的 32 MB 大小限制时，先删图片和文档再试；没有可删的，就直接报一次错，不再反复重试（2.1.229 起）。
- 压缩因为别的原因失败（模型不可用、认证失败等），报错会写成 `Prompt is too long · automatic compaction failed: <原因>`，要先解决那个原因。

### 钩子拦下压缩的后果

PreCompact 钩子拦下压缩时，结果取决于触发方式：提前触发的，跳过这次压缩，对话照常继续；被拒后补救的，原来的报错直接抛出，这次请求失败。

### 更新日志里修过的几类问题

压缩改写了模型看到的历史，一些状态容易在这一步丢掉或错乱。下面几条都是近期版本修掉的，自己实现压缩时可以对照检查：

- 模型把压缩前自己最后做的几件事当成压缩后才做的，撤回或重做已经完成的工作（2.1.293）。
- 压缩后又启动了一份还在运行的后台命令，比如开发服务器（2.1.271）。现在压缩后会提醒模型哪些后台任务还在跑。
- 子代理已经完成、报告还没被读，主对话就压缩了，报告丢失（2.1.280）。
- 摘要里复述了一个只允许用户调用的技能命令，模型据此调用了它（2.1.292）。
- 云端会话在压缩过程中重启，丢掉了前面的对话（2.1.287）。

压缩中途崩溃时记录文件处于什么状态、有没有类似锁的保护，文档没写。

## 模型能不能自己管

不能直接管。Claude Code 没有给模型压缩、清空或重开上下文的工具，压缩只由 harness 按阈值触发，或者由人用 `/compact`、`/rewind`、`/clear` 触发。

模型能做的是少往上下文里放东西：

- **派子代理**：用 Agent 工具把大量读文件、搜索的活交出去，只拿回结果。
- **分段读、先搜再读**：用 Read 的 `offset`、`limit` 和 Grep；确实需要全文时才用 `allow_large`。
- **按需取回大输出**：Bash 和 MCP 的大结果存在文件里，模型拿到路径后只读需要的部分。
- **按需加载工具定义**：用 ToolSearch 找出要用的 MCP 工具，不一开始全部装进来。

可以对照的一点：同样是改变会话状态，计划模式做成了模型能自己调用的工具（EnterPlanMode），模型判断问题复杂时可以自己进入；压缩却没有做成工具。文档没有解释这个选择。

## 关键数字

| 项目 | 数值 |
| --- | --- |
| 模型窗口 | 20 万或 100 万 token，见「两个上限」 |
| 原生 100 万窗口模型的默认压缩点 | 约 96.7 万 token |
| 自动压缩窗口可设范围 | 10 万到 100 万 token |
| 压缩后重读的文件 | 最多 5 个；单个超过 5,000 token 只给路径 |
| 压缩后重新附上的技能 | 每个 5,000 token，合计 2.5 万 token |
| 技能列表预算 | 窗口的 1%；单条描述最多 1,536 字符 |
| 自动记忆开场加载 | MEMORY.md 前 200 行或前 25KB |
| Bash 输出 | 成功约 3 万字符内原样给，超出给路径和 2,000 字符预览；失败约 1 万字符内原样给；工作文件超过 64 MiB 截断，超过 5 GB 杀掉命令 |
| Bash 读回窗口 | 默认 3 万字符，最多 15 万 |
| Read | 一次 2.5 万 token；整个文件超过 256 KB 拒绝；PDF 一次最多 20 页 |
| Glob | 最多返回 100 个文件 |
| MCP 输出 | 超过 1 万 token 警告；超过 2.5 万 token 或 5 万字符存文件；错误超过约 1.1 万字符只留首尾各 5,000 |
| 提示词缓存寿命 | 订阅 1 小时（用额外用量时 5 分钟）；API key 和云服务商默认 5 分钟 |
| 「从摘要恢复」提示 | 闲置超过约 1 小时，且超过 10 万 token（Pro、Max） |
| API 单次请求大小 | 32 MB |

## 来源

官方文档（code.claude.com，2026-10-11 读取）：

- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)：The context window 一节
- [Explore the context window](https://code.claude.com/docs/en/context-window)：开场内容的示意数字、压缩后保留什么
- [How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)：三层结构、摘要请求的构造、图片成批删除
- [Model configuration](https://code.claude.com/docs/en/model-config)：Extended context、Context window and auto-compaction 两节
- [Tools reference](https://code.claude.com/docs/en/tools-reference)：Bash 和 Read 的输出上限
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)：MCP 输出上限、工具搜索
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)：技能列表预算、压缩后重新附上
- [Hooks reference](https://code.claude.com/docs/en/hooks)：PreCompact、PostCompact、SessionStart
- [Commands](https://code.claude.com/docs/en/commands)、[Interactive mode](https://code.claude.com/docs/en/interactive-mode)、[Checkpointing](https://code.claude.com/docs/en/checkpointing)、[Manage sessions](https://code.claude.com/docs/en/sessions)
- [Environment variables](https://code.claude.com/docs/en/env-vars)、[Customize your status line](https://code.claude.com/docs/en/statusline)、[Glossary](https://code.claude.com/docs/en/glossary)
- [Manage costs effectively](https://code.claude.com/docs/en/costs)、[Troubleshooting](https://code.claude.com/docs/en/troubleshooting)、[Error reference](https://code.claude.com/docs/en/errors)
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)、[Claude Code gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol)
- [How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)、[Agent SDK reference - TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Claude Code changelog](https://code.claude.com/docs/en/changelog)，读到 2.1.296

Agent SDK 源码：[anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) 0.2.165（2026-10-09 的提交 `b6e9d12`），`src/claude_agent_sdk/types.py` 里的 `ContextUsageResponse`，`src/claude_agent_sdk/_internal/sessions.py` 里重建会话链的部分。

工程博客：

- Thariq Shihipar，[Lessons from building Claude Code: Prompt caching is everything](https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything)，2026-04-30
- Anthropic，[Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)，2025-09-29

API 文档：[Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)

### 文档没写、本篇不下结论的

- 摘要提示词的内容。
- 「先清旧的工具输出」具体怎么清、清多少，和请求里的 context management 字段是什么关系。
- 压缩缓冲区有多大，20 万窗口的模型默认在百分之几触发。
- 自动压缩连续失败几次才报 thrashing。
- 手动 `/compact` 是否也保留最近的往来。
- 压缩中途崩溃时记录文件的状态。
