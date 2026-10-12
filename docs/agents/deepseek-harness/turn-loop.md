---
label: 回合循环与中断
order: 1
date: 2026-10-12
summary: 一轮怎么跑、几个工具怎么一起调、跑动中插话、按下 Esc 之后、请求出错怎么重试、什么时候停
outline: 2
---

# deepseek-harness 的回合循环与中断

本篇只讲 deepseek-harness（下文简称 dsh）：一轮任务怎么跑，几个工具怎么一起调，干活时插话和按 Esc 会发生什么，请求出错怎么重试，最后在什么条件下停下。回合循环这个概念见[智能体功能简介](/agents/overview#回合循环与中断)，三家放在一起的比较见[三家差异](/agents/turn-loop)。

dsh 的术语表（仓库 `docs/glossary.zh.md`，有官方中文版）给了两个词，本篇的「一轮」「一步」就是这两个：

- **轮次**：会话中一次对已接纳输入的排空过程，在模型及其工具停止工作或终止策略介入后结束。
- **步骤**：一次模型请求，以及由模型响应引发的工具执行；一个轮次包含零个或多个步骤。

意思是：你发的消息被接纳后，dsh 一直干到模型和工具都停下（或者被策略叫停），这是一轮；这期间每请求一次模型、执行它要的工具，是一步。

::: info 依据
- 核对的是 0.2.1-alpha.2（2026-10-09 发布），源码读的是 master 分支的提交 `d743267`（2026-10-12 确认仍是最新），仓库自带的文档同步读取。
- 源码全部公开，下文的行为和数值取自源码、包说明和打包配置，没有实际运行，详见[本组的依据](/agents/deepseek-harness/#本组的依据)。文件路径都相对 `packages/`。
- dsh 的一切都是插件，下文的「默认」指 `dsh web` 启动的网页版：基础打包 `base` 加网页打包 `web-app`，会话用默认的 `standard` 预设。
:::

## 一句话

dsh 的循环本身是一个插件（`core/agent-loop`），一轮由一步步组成。它的特点在几个细节上：

- **一步是一个整体**：模型的回复全部成功收到之后，才开始执行里面的工具。请求出错时，这一步整个重发，不会出现「工具已经跑了、回复却失败了」的情况。
- **先记日志，再算请求**：每次发给模型的内容都从会话日志推出来。中断或崩溃之后，日志里每个工具调用都配上一个结果，说清它是没开始、被中止，还是结果未知、不要盲目重试。
- **插话在两步之间领取**：模型答完时如果又收到了插话，这一轮不结束，而是再走一步。
- **原地打转有提醒**：同一个工具、同样的参数连续调用 3、5、8 次时，提醒模型换个做法，但不拦下调用。

## 你能看到和操作的

网页界面里：

| 操作 | 作用 |
| --- | --- |
| 干活时按 `Enter` | 默认排队：等这一轮结束，作为新的一轮发出 |
| 干活时按 `Ctrl+Enter`（Mac 上 `Cmd+Enter`） | 和 `Enter` 相反，默认是插话：插进当前这一轮 |
| 设置里的忙时 `Enter` | 把上面两个键的作用对调 |
| 队列 | 排队的消息可以编辑、删除，或改成插话 |
| 0.5 秒内连按两次 `Esc`，或点停止按钮 | 中断这一轮，排队的消息保留 |

插件配置：

| 配置 | 作用 |
| --- | --- |
| `dsh-agent-loop` 的 `maxParallelToolCalls` | 一步里最多几个工具同时跑，默认 10 |
| 模型提供方插件的 `retryPolicy` | 请求失败怎么重试，默认最多 5 次，见「出错了怎么办」 |
| `dsh-repeat-tool-reminder` 的 `thresholds` | 连续重复调用几次时提醒模型，默认 3、5、8 次 |
| `dsh-goal` 的 `defaultMaxGoalRounds` | 目标最多自动续跑几轮，默认 256 |
| `dsh-client-shortcuts` 的 `stopSequenceMs` | 两次 `Esc` 的最长间隔，默认 500 毫秒 |

开发者能用的扩展点：dsh 没有配置文件式的钩子，要写插件、监听事件。和循环相关的有：

- **`agent/pre-step`**：每一步开始前运行，可以拒绝这一步，也可以改写要交给模型的消息。
- **`agent/request`**：改这一次请求的配置。
- **`agent/request-error`**：请求失败后决定要不要重试，重试插件和压缩插件都挂在这里。
- **`agent/turn-stopping`**：一轮准备结束前的检查点，按顺序逐个运行。
- **`tools/pre-execute`、`tools/execute`、`tools/post-execute`**：工具执行的前、中、后，见「几个工具一起调」。

实验包能读 Claude Code 和 codex 格式的钩子配置，默认不装。

用程序驱动 dsh 时：Agent 对象的 `followup()` 排队，`steer()` 插话，`inject()` 往下一步里加内容但不唤醒，`cancel()` 中断；`dsh headless` 回答一个任务后退出，`--json` 输出事件流。

## 一轮是怎么跑的

### 一个例子

下面是示意，事件名取自仓库的 `docs/agent-lifecycle.zh.md`。假设你让 dsh「跑一下测试」，模型先调 `bash` 跑测试，看到结果后回一段文字，会话日志里依次记下：

| 事件 | 含义 |
| --- | --- |
| `turn/start` | 第 1 轮开始 |
| `step/start`、`user/message` | 第 1 步开始，你的消息进入历史 |
| `assistant/message` | 模型的回复，里面有一个 `bash` 调用 |
| `tool/call`、`tool/result` | 执行 `bash`，记下结果 |
| `step/end` | 第 1 步结束 |
| `step/start`、`assistant/message` | 第 2 步：模型看到测试结果，回一段文字，没有工具调用 |
| `step/end`、`turn/end` | 第 2 步结束，这一轮结束，原因是 `completed` |

这一轮有两步。模型每回复一次就是一步，哪一步的回复里没有工具调用，这一轮就到头了。

画成流程图，一轮是这样走的：

<figure class="diagram">
<!--@include: ../figures/dsh-turn.svg-->
<figcaption>一轮的七个环节。②③④⑤ 是一步；回复里有工具调用，走完 ④ ⑤ 回到 ② 开始下一步；没有工具调用，从 ③ 走到 ⑥。插话在每一步开头领取，Esc 能打断 ③ 或 ④。</figcaption>
</figure>

### 每一步发生什么

按 `docs/agent-lifecycle.zh.md` 和 `core/agent-loop/src/agent.ts`：

- **领取输入**：一轮的第一步，领取所有待处理的插话，加上队列里的一条消息；之后每一步只领取插话。
- **准备**：组装系统提示词和工具，运行 `agent/pre-step`。插件拒绝的话，这一步不开始，这一轮以 `blocked` 结束。压缩插件也在这里检查上下文压力。
- **请求模型**：请求内容由会话日志推出来，dsh 不另外保存一份「当前对话」。流式接收，界面上实时显示。
- **执行工具**：回复全部成功收到、记成 `assistant/message` 之后，才开始执行里面的工具调用。
- **要不要再走一步**：回复里有工具调用，执行完就再走一步（除非某个工具声明这一轮到此结束）。没有工具调用，先运行 `agent/turn-stopping` 检查点；这时如果又收到了插话，再走一步，否则这一轮结束。

有一种例外：模型的输出撞上了 token 上限。dsh 把这条回复里的工具调用全部丢掉、不执行，只保留文字，这一轮以 `max-tokens` 结束；只有这时正好有插话，才会再走一步。

### 一轮由谁开启

dsh 的收件箱有两个列表：排队的消息，每条开启一轮；插话，在下一步开头领取。这两个列表都写进会话日志，进程重启后还在。往里面放消息的有：

| 来源 | 放进哪个列表 |
| --- | --- |
| 你发的消息 | 按 `Enter` 或 `Ctrl+Enter` 决定，见上表 |
| 定时任务到点 | 排队 |
| 后台任务完成 | 排队，通知它的主人 |
| 子代理发来的消息 | 插话或排队，看发送时选的方式 |
| 目标续跑 | 对话空闲时，目标插件排入一条续跑提示，见「什么时候停」 |

一轮结束后，排队列表里还有消息，就接着开下一轮，每轮领取一条。

## 几个工具一起调

模型一次回复可以给出好几个工具调用。能不能并发，由工具自己判断（`core/tools/src/index.ts`）：

- 工具定义里的 `isConcurrencySafe(参数)` 返回 `true`，这次调用才能并发。没有这个函数、函数报错、返回别的值，一律按独占处理。判断时能看到这次调用的参数，所以同一个工具，有的调用可以并发、有的不行。
- 默认能并发的工具：`read`、`read_image`、`web_fetch`、`web_search`、`subagent`、`subagent_fork`。`bash`、改文件、`grep`、`glob`、MCP 工具等都是独占的。

调度器按模型给出的顺序往下排（`core/agent-loop/src/tool-calls.ts`）：

- 遇到独占的调用，单独执行，像一道屏障，前面的都结束才开始，它结束后面的才开始。
- 遇到可并发的，放进一个滚动池，同时最多 10 个；每个调用开始前重新判断一次能不能并发，判断结果变了就停下来等池子排空。
- 文件头注释的原话：派发可以重叠，而策略、结果与结果附带的上下文保持模型顺序。所以执行前的权限检查按顺序过，结果也按调用顺序记进日志，不按完成先后。

每个调用都要走一遍工具流水线（`docs/tool-execution-pipeline.zh.md`）：`tools/pre-execute`（钩子、权限、沙箱）→ 守卫 → `tools/execute`（超时、重试、计量这类环绕逻辑）→ 工具本体 → `tools/post-execute`（接受、拦截、替换结果、补充上下文）→ 记下 `tool/result`。

两个出错的情况：

- **工具超时**：默认装的 `dsh-tool-call-timeout-policy` 插件只管声明了时限的工具。工具声明 `timeoutMs`，并承诺响应取消信号；插件到点发出取消，把结果换成 `TOOL_TIMEOUT` 错误。源码注释强调它不和工具赛跑，也不丢下工具不管。
- **一个工具失败**：失败结果标为错误，照样交给模型，不影响同批其他调用。如果出问题的是调度器本身，它不再派发新的调用，等已经开始的跑完，然后以错误结束这一步。

## 跑动中插话

### 网页界面

模型干活时，消息有两种发法：

| 发法 | 什么时候交给模型 |
| --- | --- |
| 排队（默认按 `Enter`） | 这一轮结束后，作为新的一轮发出 |
| 插话（默认按 `Ctrl+Enter`） | 下一步开头领取，在当前这一轮里交给模型 |

插话只在两步之间生效，不会打断正在进行的模型请求或工具执行。前面说过，模型答完时如果收到了插话，这一轮不结束，再走一步把插话交给模型。

界面的源码注释说，插话是尽力而为：如果这一轮已经关上了，插话就改成排队，开启下一轮。

### 插话和排队都留痕

两个列表的每次变化（加入、领取、编辑、删除）都记进会话日志。插话也会经过 `agent/pre-step`，和其他要交给模型的消息走同一个检查。

## 按下中断之后

### 停下的是什么

网页上连按两次 `Esc`，dsh 以「用户取消」为原因中断这一轮，排队的消息和插话都保留。中断信号同时传给正在进行的模型请求和工具：

| 正在进行的 | 中断后 |
| --- | --- |
| 模型请求 | 停止接收。已经显示给你的那部分回复，记成一条带 `interrupted: true` 的回复留在历史里；一个字都没收到的话，只记一次尝试，不进历史 |
| 已经开始的工具 | 收到取消信号，跑完或停下后交出自己的结果，照常记录 |
| 还没开始的工具 | 补一对调用和结果，结果是 `Error: tool call aborted before dispatch` |
| 这一轮 | 以 `aborted` 结束，带上取消原因 |

保留那半截回复是有意的。包说明（`core/agent-loop/README.zh.md`）的原话：被取消的流则追加带 `interrupted: true` 的锚点并携带已交付前缀，使下一次请求包含用户看到的内容。

中断之后，dsh 不会自己开始下一轮，排队的消息等你下次发消息时，按顺序接着处理。

### 取消原因

中断时要给出原因，有四种：

| 原因 | 谁发出的 |
| --- | --- |
| `user` | 用户 |
| `parent` | 父代理取消子代理 |
| `hook` | 插件，带一句理由 |
| `disposed` | 会话或插件被卸载 |

从旧格式导入、没记原因的记录，单独记成 `legacy`，不留空。

### 模型之后看到什么

源码里没有找到另外加的「用户中断了」这类提示。模型下次请求时看到的是：截断的那半截回复、已经开始的工具交出的结果、还没开始的工具的那条「aborted before dispatch」错误。日志里每个工具调用都有结果，历史始终合法。

### 进程在一轮中间退出

进程崩溃时，日志停在一轮中间。恢复会话时，dsh 补上收尾：给没有结果的工具调用各补一条错误结果，再补上 `step/end` 和 `turn/end`，结束原因记为 `interrupted`（`core/session/src/repair.ts`）。补的结果分两种：

- **调用还没开始**（`TOOL_NOT_STARTED`）：原话是「The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.」意思是：还没开始就被打断了，还需要的话就重试。
- **开始了但结果没记下**（`TOOL_OUTCOME_UNKNOWN`）：原话是「The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.」意思是：结果未知；只读或幂等的操作可以重试，可能有副作用的先核实外部状态或问用户，不要盲目重试。

为了让崩溃时丢的东西尽量少，默认装的 `dsh-session-checkpoint-policy` 插件在每次请求模型、每次派发顶层工具之前，把日志落一次盘。

源码里没有找到恢复后自动重跑那一轮的逻辑，接下来做什么由你决定。

## 出错了怎么办

### 请求失败的重试

重试策略属于各个模型提供方，由 `dsh-llm-retry` 插件执行（`llm/llm/src/retry-policy.ts`、`llm/llm-retry/src/index.ts`）。默认策略：

| 项目 | 默认值 |
| --- | --- |
| 最多重试 | 5 次 |
| 重试哪些错误 | 空回复、限流、服务端错误、超时、传输失败 |
| 间隔 | 从 0.5 秒开始翻倍，最长 10 秒，加减 10% 随机抖动 |
| 服务端给了等待时间 | 照办；但如果超过 10 秒，就不重试了 |

也可以把策略改成 `always`：任何失败都一直重试，直到成功、被取消或插件卸载。

几个细节：

- **整步重发**：失败的那次尝试记成 `assistant/attempt`，不进历史。重试用的是同一份已经组装好的提示词，不再跑 `agent/pre-step`，也不重复记录你的消息。
- **不会重跑工具**：工具要等回复全部成功才开始执行，失败的尝试里一个工具都没跑过，所以重发没有这个顾虑。
- **重试可以取消**：每次重试先在日志里记一条 `llm/retry`，再开始可取消的等待，等完记 `llm/retry-started`。中断时等待立刻结束。
- **计数按步算**：每开始新的一步、每结束一轮，重试次数清零。

### 两种特殊错误

同样挂在 `agent/request-error` 上：

- **上下文超长**：压缩插件先剪掉过大的工具结果，不够再摘要，然后在这一步里重发。只有剪枝或摘要真的生效了才重发，否则保留原来的错误。
- **图片超出额度**：图片插件把最旧的图片换成占位文字，再重发。

### 这一轮因出错结束

重试用完，或者遇到不重试的错误，这一轮以 `error` 结束，记下结构化的失败信息：模型接入层的错误原样记录，其他异常压成一段文字，错误码记为 `UNKNOWN`。

结束前，dsh 给这一步里还没有结果的工具调用补上结果，用的就是上面崩溃恢复那两种（`TOOL_OUTCOME_UNKNOWN`、`TOOL_NOT_STARTED`）。包说明写的理由：让后续请求使用配对完整的工具历史，而不自动重试结果不明的操作。

插件出错也是这样处理。包说明的原话：插件失败结束的是轮次，不是循环。下一条消息来了，照常开始新的一轮。

### 工具出错不算这一轮出错

工具执行失败、被权限拒绝、超时，都只是这个调用的结果，标为错误交给模型，由模型决定接下来怎么做，这一轮照常继续。

## 什么时候停

### 正常停下

这一轮在这几种情况下结束，原因记在 `turn/end` 里：

| 原因 | 情况 |
| --- | --- |
| `completed` | 模型的回复里没有工具调用，收尾检查之后也没有新的插话 |
| `max-tokens` | 输出撞上 token 上限，回复里的工具调用被丢掉 |
| `blocked` | `agent/pre-step` 拒绝了这一步 |
| `aborted` | 被中断，带取消原因 |
| `error` | 出错，带结构化的失败信息 |
| `interrupted` | 进程崩溃后恢复时补记的，运行中不会出现 |
| `forked` | 从别的会话分叉时，源会话那一轮还开着，分叉时补记的 |

这个取值集合可以由插件扩展。源码注释特意写明：`interrupted` 只由恢复流程产生，循环自己从不发出。所以「被取消」和「崩掉了」在日志里是两个值，各有唯一的来源。

### 目标

用 `/goal` 设一个目标后，dsh 会在对话空闲时自动续跑（`goal/goal-round-driver/`）：

- 续跑的每一轮叫一个 Goal Round。目标插件在对话空闲时排入一条 `<goal_round>` 提示，写明目标、第几轮、上限是多少，开启新的一轮。只有真正进入模型历史的续跑才算一轮，你自己发的消息不占额度。
- 默认最多 256 轮，用完时目标记为受阻，原因 `round-limit`。
- 模型完成目标或者报告受阻时，调用 `update_goal`；这样的续跑轮在这一步之后就结束，模型会被要求给你写一段最后的交代。模型要连续 3 轮受阻，才能报告受阻（`blockedAfterConsecutiveRounds`）。
- 这一轮因 `max-tokens` 结束、日志写盘失败、被取消、插件卸载时，续跑都会停下。被取消的续跑不会自动重来。
- 进程重启、恢复或分叉会话后，目标不会自己接着跑，要你明确说继续。

### 上限

dsh 没有步数上限，也没有花费上限，`dsh headless` 也没有这类参数。默认能用的只有目标的轮数上限：它只数轮数，不计 token、钱或时间。

### 原地打转

默认装的 `dsh-repeat-tool-reminder` 插件专门管这件事（`guard/repeat-tool-reminder/`）：

- 同一个工具、完全相同的参数，连续调用到 3、5、8 次时，各在这一批工具结果之后追加一段提醒，交给模型。
- 第一次是温和提醒：「You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again…」（你在用完全相同的参数重复同一个调用，再调之前先仔细看看上次的结果，没做完就换个办法或换个参数）。
- 之后的提醒点名工具、连续次数和参数，并要求不要再用这组参数调用这个工具，换个做法，或者证据够了就收尾。
- 它只提醒，不拦下也不改写调用。
- 提醒里引用的参数最多 500 个字符。包说明的理由：一大段参数会在死循环里一次次跟进后面的请求；这个上限只管提醒的长度，比较是否重复时永远用完整的参数。
- 被排除跟踪的工具不计数，也不打断计数，所以中间穿插一次记录类工具，掩盖不了循环。

## 关键数字

| 项目 | 数值 |
| --- | --- |
| 一步里同时跑的工具 | 最多 10 个 |
| 请求失败重试 | 默认 5 次；间隔 0.5 秒起翻倍，最长 10 秒，抖动 10% |
| 服务端建议的等待时间 | 超过 10 秒就不重试 |
| 重复调用提醒 | 连续 3、5、8 次；引用参数最多 500 字符 |
| 两次 `Esc` 的间隔 | 500 毫秒 |
| 目标自动续跑 | 默认最多 256 轮 |
| 模型报告目标受阻 | 至少连续 3 轮受阻 |
| 步数上限、花费上限 | 没有 |

## 来源

源码：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 0.2.1-alpha.2，master 分支提交 `d743267`。主要读了：

- `core/agent-loop/src/agent.ts`：轮和步的驱动、领取输入、请求、重试入口、`max-tokens`
- `core/agent-loop/src/tool-calls.ts`：独占屏障、滚动池、中止时补结果
- `core/agent-loop/src/constants.ts`、`core/agent-loop/README.zh.md`：并发上限、设计说明
- `core/tools/src/index.ts`：`isConcurrencySafe` 的判定
- `core/session/src/types.ts`：结束原因、取消原因
- `core/session/src/repair.ts`：崩溃后补结果的措辞
- `llm/llm/src/retry-policy.ts`、`llm/llm-retry/src/index.ts`、`llm/llm/src/assembler.ts`：重试策略、`max-tokens` 时丢掉工具调用
- `guard/repeat-tool-reminder/`、`guard/timeout-policy/`：重复提醒、工具超时
- `goal/goal/`、`goal/goal-round-driver/`、`goal/tool-goal/`：目标续跑
- `client/ui-conversation/src/`、`client/shortcuts/src/config.ts`：排队和插话的按键、两次 `Esc`
- `api/session-controller/src/commands.ts`：网页端中断保留收件箱
- `bundle/base/cordis.patch.yml`、`bundle/web-app/presets/standard.patch.yml`：默认装哪些插件

仓库文档：

- `docs/glossary.zh.md`：轮次、步骤，本篇「一轮」「一步」的定义出自这里
- `docs/agent-lifecycle.zh.md`：一轮一步的事件时序
- `docs/tool-execution-pipeline.zh.md`：工具流水线
- `docs/config-catalog.zh.md`：配置项

### 没核到的

- 已经开始的工具被中断时交出什么结果，由各个工具自己决定，没有逐个看。
- 网页界面以外的入口（ACP、SDK）中断时是否保留收件箱，各自的调用不同，没有逐个核对。
- 全部行为和数值来自源码和打包配置，没有实际运行验证。
