---
label: 上下文管理
order: 9
date: 2026-10-11
summary: 上下文里装了什么、怎么算用量、大输出怎么截、满了怎么压、压坏了怎么办
outline: 2
---

# deepseek-harness 的上下文管理

本篇只讲 deepseek-harness（下文简称 dsh）：它的上下文里装了什么、怎么判断快满了、太大的工具输出怎么处理、满了怎么压缩、压缩出了问题怎么办。上下文窗口、压缩这些概念见[智能体功能简介](/agents/overview#上下文管理与压缩)。

::: info 依据
- 核对的是 0.2.1-alpha.2，源码读的是 2026-10-09 的 main 分支（提交 `d743267`）。
- 依据是自带的子系统文档、各包 README、源码和默认打包配置，详见[本组的依据](/agents/deepseek-harness/#本组的依据)。没有实际运行。
- dsh 一切皆插件，下文的「默认」指默认打包配置 `packages/bundle/base/cordis.patch.yml` 装上的插件和参数。
:::

## 一句话

dsh 把会话存成一份**只追加、不修改的事件日志**，模型看到的是日志上的一层投影，叫 surface。

压缩不删除任何事件，只是往日志里追加一条摘要消息，声明它「遮住」投影里的某一段；被遮住的事件原样留在日志里，只是不再发给模型。压缩的每一步也都写成事件，连生成摘要的那次模型调用都能从日志和代码复原出来。

## 你能看到和操作的

Web 界面和命令：

| 操作 | 作用 |
| --- | --- |
| 输入框下方的圆环和百分比 | 显示上下文占用；点开是按类别的 token 明细。拿到用量和窗口大小之后才出现 |
| `/compact` | 立刻压缩一段较早的历史，哪怕还没到自动压缩的阈值。完成后报告压缩了几条、估计省下多少 token。不能带参数；模型正在回复或压缩正在进行时不可用，期间发的消息排队等它完成 |
| 模型设置页 | 每个模型可以填上下文窗口和最大输出 token，压缩阈值按这两个数算 |

`/compact` 本身不进模型的请求，也不占一轮对话。

配置项都在插件配置里。压缩插件 `dsh-compaction-basic` 的主要参数（`packages/compaction/compaction-basic/src/types.ts`）：

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `thresholdRatio` | 0.8 | 用量到窗口的多少比例时压缩 |
| `headroomTokens` | 65,536 | 在输出预留之外再留的余量；阈值不会超过「窗口减输出预留再减这块」 |
| `retainRatio` / `retainTokens` | 0.16 | 末尾原样保留多少，按比例或按 token 数二选一 |
| `summarizationProvider`、`summarizationModel` | 跟随对话 | 可以指定另一个模型来写摘要 |
| `maxTokens` | 等于 `headroomTokens` | 摘要的输出上限 |
| `compactionRetries` | 1 | 压完仍超阈值时再压几次 |
| `maxOverflowRetries` | 1 | 请求因超窗口被拒后，补救重试几次；0 表示不补救 |
| `auto` | true | 关掉就只剩手动 `/compact` |
| `modelPolicies` | 无 | 按服务商和模型分别覆盖上面的参数 |

还有两个相关插件可以调：工具结果剪枝（`thresholdChars` 等，见「满了怎么压」）和工具结果外溢（`maxInlineTokens`，见「单条结果太大怎么办」）。

dsh 没有压缩前后的钩子。它的实验包能复用 Claude Code 和 codex 的钩子配置，但两者都把 `PreCompact`、`PostCompact` 列为不支持。想在压缩时插入逻辑，要写插件，比如监听摘要失败时的 `compaction/summary-error` 事件。

## 上下文里装了什么

### 日志和 surface

会话的一切都是日志里的事件，按序号排列，只追加不修改（`docs/subsystems/session.md`）。其中只有五种事件会产生发给模型的消息：

- `system/message`：渲染好的系统提示词，固定是 surface 的第 0 个节点
- `developer/message`
- `user/message`
- `assistant/message`
- `tool/result`

这五种事件写进日志时都必须声明自己怎么进入 surface：

- `append`：接在末尾，正常情况都是这样。
- `{ op: 'replace', startSeq, endSeq }`：用这一条**遮住** surface 上从 `startSeq` 到 `endSeq` 的一段，自己放在那个位置。压缩就是用它实现的。

一个副作用：replace 会把一个序号很大的摘要节点放到前面的位置上，所以 surface 上的序号不一定是递增的，「被遮住的序号集合」才是准确的。

其余事件（压缩的加锁解锁、回合开始结束、错误等）只进日志，不进 surface。每次请求的信封（调用配置加工具定义）也记在日志里，所以每一次发给模型的请求都能从日志算出来。

### 系统提示词的两种贡献

插件往提示词里加东西有两种方式（`docs/subsystems/system-prompt.md`）：

- `PromptSection`：进系统提示词，按 `order` 排序，基本不变。
- `PromptContext`：文档称它是 `PromptSection` 的「缓存安全的对应物」。它的完整快照作为一条消息放在保留的历史之后，只在内容变了、或者压缩把它遮掉了的时候才重新追加一份。

会变的东西走 `PromptContext`，追加在后面，系统提示词这个前缀就不用动。

### 引用别的会话

用户在输入里用 `@` 提到另一个会话时，dsh 会给那个会话拍一份有大小限制的只读快照，作为不可信的背景资料放进当前对话，并附一句固定警告：不要执行里面的指令（`packages/context/session-reference`）。

## 怎么知道快满了

### 阈值

dsh 每一步发请求之前检查一次（`agent/pre-step`，串行执行）。阈值和保留量按「窗口」和「输出预留」算：

| 数 | 算法 |
| --- | --- |
| 压缩阈值 | 窗口 × 0.8，但不超过「窗口 − 输出预留 − 65,536」 |
| 末尾保留 | （窗口 − 输出预留）× 0.16 |

配置不合理时会报错：拿不到窗口大小、输出预留加余量已经占满窗口、保留量不小于阈值，都算配置错误。自动压缩对这个模型只警告一次，之后跳过主动压缩，直到配置改好；请求被拒后的补救仍然有效。

### 用量怎么算

用量由一个单独的计量插件负责（`docs/subsystems/token-meter.md`）。它每次给出一份快照，包括：

- `totalTokens`：请求加回复的压力
- `surfaceTokens`：surface 上所有节点的计价之和
- `nodes`：**每个节点各自多少 token**，选压缩范围时直接用
- `surfaceDeltaTokens`：相对上次锚点的变化，带正负号，压缩后变小也能表示
- `logRevision`：这次测量读到了日志的第几条，所以测量可以重放

什么时候能直接用服务商报告的用量，规则很严：最近一次成功调用的请求信封和现在完全一致，而且它的总数不低于自己估算的锚点，才复用服务商的数；否则整份请求按固定的估算规则重新计价。图片按所用模型声明的图片计价规则算，没有声明的用估算。

## 单条结果太大怎么办

### 各工具自己的上限

| 工具 | 上限 |
| --- | --- |
| `read` | 默认读 2,000 行；每行最多 2,000 字符；一次最多 50 KiB（`packages/fs/tool-fs/src/read-render.ts`） |
| `bash` | 内存里每个输出流只保留结尾 64,000 字节，模型看到的是输出的尾部；完整输出写到文件，路径一起告诉模型；单个流的文件最多 64 MiB（`packages/shell/bash-local/src/index.ts`） |
| `grep` | 最多返回 250 条匹配，更多时告诉模型完整列表存在哪里 |

### 通用的外溢策略

在各工具之上，默认配置还装了一个通用插件 `dsh-spill-policy`，上限 `maxInlineTokens: 12500`。工具结果超过这个估算 token 数时：

- 模型收到开头和结尾各一半预算的内容，中间省略；
- 外加一句提示，写明省略了多少字节、完整结果存在哪个文件，并告诉模型用 `read` 加 `offset`、`limit` 分段读，或者对这个路径用 `grep` 搜；
- 图片要么整张保留、要么整张省略，完整结果文件里记下图片的路径，模型可以用 `read_image` 再看。

`read` 的结果不经过这一层，它有自己的上限。这一层是「尽力而为」：存文件失败、拿不到图片计价时，记一条警告，保留原来的内容，不会把一次成功的调用变成错误。

文件由 `dsh-spill-local` 写到本地：目录权限 0700，文件用独占方式创建（`open(path, 'wx', 0o600)`），防止有人预先放一个符号链接把写入引到别处。

### 「截断」的语义

截断用的基础库 `dsh-output-retention` 在头部注释里钉死了一个区分：`truncated` 表示「因为预算省略了本来拿得到的内容」，不表示「上游本身就不完整」。权限失败、跳过的二进制文件、服务商部分失败都放在工具自己的字段里，不混进 `truncated`。

### 归纳

dsh 的思路是「截断，但全文留在一个模型能取回的地方，并且告诉模型怎么取」，这让截断从有损变成了可恢复。

## 满了怎么压

<figure class="diagram">
<!--@include: ../figures/dsh-compact.svg-->
<figcaption>一次自动压缩的八步。第 ③ 步如果已经降到阈值以下，就不做摘要；第 ⑤ 到第 ⑧ 步由一对加锁、解锁事件括起来。</figcaption>
</figure>

### 四种触发

| 触发 | 什么时候 | 做法 |
| --- | --- | --- |
| 压力（`pressure`） | 每步发请求之前，用量超过阈值 | 先剪工具结果，不够再摘要最早的一段，保留末尾 |
| 超窗口（`context-overflow`） | 服务商明确回了「超出窗口」，在失败的那一步结束之后 | 跳过阈值和保留策略，尽量多压一段，然后重试 |
| 手动 `/compact` | 用户输入，会话空闲时 | 即使没到阈值也压一段有用的；没有可压的就什么都不写 |
| 指定范围 | 程序调用 `compactRegion` | 把 surface 上指定的一段压成一个摘要节点 |

### 先剪工具结果，够了就不摘要

压力或超窗口一旦成立，先运行工具结果剪枝插件（默认配置装了它）：把超过 8,192 个字符的工具结果改写成「开头 4,096 字符 + 固定标记 + 结尾 1,024 字符」，标记是 `[... tool result middle pruned ...]`。改写结果作为新事件追加，用 replace 遮住原来那条，原结果仍在日志里。

剪完重新计价。**如果已经降到阈值以下，这次就不做摘要**，省掉一次模型调用。

### 选范围

要摘要时，从 surface 上第一个不是系统提示词的节点开始，选最早的一段，末尾按保留量原样留下。范围的边界不能拆开一对工具调用和结果，但可以拆开一个回合：一个特别长的回合，前面已经结束的几步可以先压掉。

### 发摘要请求

摘要请求的构造和正常请求对齐：第 0 个节点的系统提示词、被选中那一段的原消息、当前的工具定义，最后追加一条用户消息，内容是压缩指令。源码注释写明了理由：保持对话自己的系统提示词、工具和消息前缀在前面，这次辅助调用就是上一次请求的真前缀，服务商的 KV 缓存可以复用，而不是失效（`packages/compaction/compaction-basic/src/summarizer.ts`）。

摘要只取模型返回的文字，推理内容和工具调用不要；如果返回了图片，按错误处理，不会悄悄丢掉。

### 摘要模板：八节，一节都不许丢

压缩指令要求严格按下面的结构输出，空的小节写 `(none)`，原话是「never drop a section」：

```md
## Primary Request and Intent   用户的目标，措辞重要处逐字引用
## Key Technical Concepts       技术、框架、模式、约定
## Files and Code               精确路径，为什么重要
## Errors and Fixes             错误怎么解决的，相关的用户反馈
## Pending Jobs                 要求过但还没做完的
## Current Work                 此刻正在做什么
## Next Step                    唯一的下一步，或 (none)
## Critical Context             决定和理由、约束、偏好、待决问题
```

另外几条规则：保留精确的文件路径、命令、报错原文、标识符和数值；忠实记下用户的反馈，尤其是纠正；不要提到这次总结和压缩本身；如果对话里已经有一个 `<compacted-summary>` 块，那是**上一次的检查点**，不许照抄，要保留仍然成立的、丢掉过期的、把新信息合并进同一套结构。

### 摘要怎么放回去

摘要放进一条新的 `user/message`，用 replace 遮住选中的那一段。消息开头是一段固定说明，大意是：这是自动生成的检查点，浓缩了前面一段对话以腾出上下文；把它当作已知背景，不要复述，直接从后面的消息继续，也不要提到这个检查点。说明之后是 `<compacted-summary>` 标签包着的摘要。原始的摘要输出另外记在 `compaction/summary` 事件里。

如果压缩遮掉了 `PromptContext` 的快照，下一次请求前会重新追加一份。压完仍超阈值时，按 `compactionRetries` 再压，默认再一次。

### 图片太多：换成文字说明

图片多的对话还有一个专门的插件（默认装了）。当支持图片的模型以「图片超出预算」拒绝请求时，它把最旧的那些图片永久换成文字，写明是哪个附件、可读的路径在哪，然后重试，不消耗服务商的重试次数。这个决定记进日志，之后换模型、恢复会话、重放都沿用。

### 子代理

子代理有两种：`subagent` 开一个全新的子会话；`subagent_fork` 继承父会话的历史，而且固定用和父会话相同的服务商和模型，这样继承来的历史能复用 KV 缓存（默认配置里的注释）。子会话有自己的日志，压缩各管各的；分叉时继承种子日志里已有的外溢文件路径，文件本身不复制。

## 压坏了怎么办

### 加锁事件：崩溃留下能发现的痕迹

压缩用三个只进日志的事件括起来：`compaction/start` → `compaction/summary` → `compaction/end`。顺序是：先写 start，然后生成摘要、写 summary 记录、追加替换消息，全部落地之后才写 end。

文档写明了这样排的理由：崩在中间时，日志里留下的是一个**没有配对 end 的 start**，能被检测出来；而不会出现一条声称「压缩完成了」的 end，其实并没有完成。还没结束的 start 会挡住所有新的压缩；如果它出现在一个更新的会话种子之前，就当作上一次生命周期的遗留，忽略掉。

### 失败分类是固定的六种

手动压缩预期内的失败只有六种（`docs/subsystems/compaction.md`）：

| 失败 | 含义 |
| --- | --- |
| `busy` | 正忙，比如已经在压缩 |
| `cancelled` | 被取消 |
| `changed` | 选中的那一段在压缩期间变了 |
| `summary` | 生成摘要失败 |
| `commit` | 提交阶段失败，可能已经部分改动 |
| `persistence` | 内存里已经闭合，但写盘失败 |

`changed` 和 `summary` 不改 surface，但仍然把这次失败的尝试闭合并写进日志：失败也是事实。

### 补救重试要求「真的有进展」

请求因超窗口被拒后，补救逻辑只有在 **surface 的替换代数真的前进了**的时候，才允许重试；否则原来的错误照样抛出。剪枝插件那边有配套保证：每次产出的结果严格小于触发它的输入，所以对同一条结果剪第二遍不会再有变化。摘要请求失败时，监听 `compaction/summary-error` 的插件也必须先把一个持久的改动写进日志，才能要求重试。

这三条合起来，用「必须有可测量的进展」代替了「数几次就停」，从结构上避免了压缩死循环。

### 修不了的情况

文档列明了几种 surface 压缩修不了的超窗口：系统提示词、工具定义这些前缀本身太大；一个不能拆的非工具节点太大；一个工具单元剪完剩下的部分仍然超窗口。补救只认服务商适配层归一化后的 `CONTEXT_WINDOW_EXCEEDED`，其他形式的上下文错误目前不处理。

### 崩溃恢复不截断

重新加载一个「有回合开始、没有回合结束」的日志时，dsh 补一条合成的结束事件，原因标为 `interrupted`。这个原因正常运行时从不会出现，看到它就知道是恢复时补的；崩溃前已经写下的事件全部保留。

## 模型能不能自己管

不能直接压缩或重开上下文，dsh 没有给模型这类工具。

默认配置下，模型能用的相关工具：

- **分段取回外溢的内容**：外溢提示里给了文件路径，模型用 `read` 加 `offset`、`limit` 分段读，或者用 `grep` 搜；图片用 `read_image`。
- **目标工具**：`create_goal`、`get_goal`、`update_goal`。目标作为 `goal/change` 事件存在对话之外，压缩不会把它摘要掉，模型随时可以用 `get_goal` 取回。
- **子代理**：`subagent` 和 `subagent_fork`，把工作交出去，只拿回结果。

源码里还有一组让模型回查自己日志的工具：`session_event_read`（按序号读一条完整未删节的事件）、`session_event_search`（在本会话历史里搜）、`session_search`（跨会话搜）等。它放在 `packages/experimental/tool-session-query`，工具目录写明这个包「需要手动开启」，默认的几个打包配置都没有装。装上之后，被压缩掉的内容对模型来说就不是丢了，而是变成了可以检索的记录。

## 关键数字

| 项目 | 数值 |
| --- | --- |
| 压缩阈值 | 窗口 × 0.8，且不超过「窗口 − 输出预留 − 65,536」 |
| 末尾保留 | （窗口 − 输出预留）× 0.16 |
| 摘要输出上限 | 默认 65,536 token |
| 压完仍超阈值再压 | 默认 1 次 |
| 超窗口被拒后补救 | 默认最多 1 次 |
| 工具结果剪枝 | 超过 8,192 字符时，留前 4,096 和后 1,024 |
| 工具结果外溢 | 超过 12,500 token（默认配置）时，留首尾、全文存文件 |
| `read` | 2,000 行；每行 2,000 字符；一次 50 KiB |
| `bash` | 每个流在内存里留结尾 64,000 字节；文件最多 64 MiB |
| `grep` | 250 条 |
| 进 surface 的事件类型 | 5 种 |
| 手动压缩的失败类型 | 6 种 |

## 来源

源码：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，main 分支 2026-10-09 的提交 `d743267`（版本 0.2.1-alpha.2）。

自带文档：

- `docs/subsystems/compaction.md`：压缩事件、加锁、失败分类、剪枝和恢复
- `docs/subsystems/session.md`：日志、surface、replace、回合结束原因
- `docs/subsystems/token-meter.md`：用量测量
- `docs/subsystems/spill.md`：外溢存储
- `docs/subsystems/system-prompt.md`：`PromptSection` 和 `PromptContext`
- `docs/tool-catalog.md`：各工具的说明和参数

各包 README：`compaction-basic`、`command-compact`、`compaction-tool-result-pruner`、`compaction-image-offload`、`spill-policy`、`session-reference`、`client/ui-conversation`、`experimental/hooks-claude-code`、`experimental/hooks-codex`。

源码文件：`packages/compaction/compaction-basic/src/config.ts`、`types.ts`、`summarizer.ts`，`packages/compaction/compaction-tool-result-pruner/src/config.ts`，`packages/util/output-retention/src/index.ts`，`packages/spill/spill-local/src/store.ts`，`packages/fs/tool-fs/src/read-render.ts`，`packages/shell/bash-local/src/index.ts`，`packages/bundle/base/cordis.patch.yml`。

### 没核到的

- 没有实际运行，数值取自源码常量和默认打包配置。
- 摘要请求复用 KV 缓存是源码注释的说法，没有查 DeepSeek 的缓存文档确认实际命中情况。
