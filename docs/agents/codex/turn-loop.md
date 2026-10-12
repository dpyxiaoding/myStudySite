---
label: 回合循环与中断
order: 1
date: 2026-10-12
summary: 一轮怎么跑、几个工具怎么一起调、跑动中插话、按下 Esc 之后、请求出错怎么重试、什么时候停
outline: 2
---

# codex 的回合循环与中断

本篇只讲 codex：一轮任务怎么跑，几个工具怎么一起调，干活时插话和按 Esc 会发生什么，请求出错怎么重试，最后在什么条件下停下。回合循环这个概念见[智能体功能简介](/agents/overview#回合循环与中断)，三家放在一起的比较见[三家差异](/agents/turn-loop)。

本篇的「一轮」采用 codex 官方术语表对 turn 的定义：对话里的一次往来，通常是一条用户提示，加上智能体的回应和动作。一次对话（codex 叫 thread）由很多轮组成。一轮里 codex 通常要请求模型好几次：模型的回复里要用工具，codex 就执行工具、把结果记进历史，再请求一次，直到模型不再要求继续，这一轮才结束。

::: info 依据
- 核对的是发布版 rust-v0.162.1（2026-10-09，提交 `092d3ac`），源码按这个发布版的标签读，文档读取于 2026-10-12。
- 源码全部公开，下文的行为和数值取自源码和源码注释，没有实际运行，详见[本组的依据](/agents/codex/#本组的依据)。文件路径都相对 `codex-rs/`。
- 开发中的功能单独注明。
:::

## 一句话

codex 的循环和别家一样：请求模型，回复里有工具调用就执行，把结果记进历史再请求，直到模型不再要求继续。它的特点在几个细节上：

- **工具边收边跑**：模型的输出还没结束，里面的某个工具调用一完整，就先记进历史、开始执行。
- **插话会截断输出**：干活时回车，话插进当前这一轮。模型正在输出的话，这次输出立刻被截断，codex 带上你的话重新请求。
- **出错不重跑工具**：请求中途出错，先等已经开跑的工具跑完，结果记进历史，再用这份历史重新请求。已经完成的部分不会重做。
- **中断有标记**：按 Esc 之后，历史里加一段 `<turn_aborted>`，告诉模型用户是故意打断的，命令可能执行了一半。

## 你能看到和操作的

终端界面（TUI）里：

| 操作 | 作用 |
| --- | --- |
| `Esc` | 中断这一轮。如果你刚插的话模型还没收到，中断后立刻把这些话作为新的一轮发出 |
| `Ctrl+C` | 有任务在跑时中断，没有时退出 |
| 干活时按回车 | 把话插进当前这一轮，见「跑动中插话」 |
| 干活时按 `Tab` | 把消息、斜杠命令或 `!` 命令排到下一轮 |
| `Shift+←` 或 `Alt+↑` | 编辑最近排队的那条消息 |
| 输入框为空时按两次 `Esc` | 编辑上一条你发的消息，从那里分叉对话 |

这些按键都能在 `/keymap` 里改。

配置项（`config.toml`）：

| 配置 | 作用 |
| --- | --- |
| `model_providers.<id>.stream_max_retries` | 模型输出流中断后最多重试几次，默认 5 |
| `model_providers.<id>.request_max_retries` | 发请求失败最多重试几次，默认 4 |
| `model_providers.<id>.stream_idle_timeout_ms` | 输出流多久没数据算中断，默认 5 分钟 |
| `mcp_servers.<名字>.supports_parallel_tool_calls` | 让这个 MCP 服务器的所有工具都可以并发调用，见「几个工具一起调」 |
| `features.instant_interrupt` | 插话是否立刻截断模型的输出。开发中，默认打开 |
| `agents.interrupt_message` | 中断后是否在历史里加一段给模型看的中断标记，默认打开 |

开发者能用的钩子：

- **UserPromptSubmit**：消息交给模型之前运行，可以拦下，也可以补充上下文。干活时插的话也会经过它。
- **PreToolUse、PermissionRequest、PostToolUse**：每个工具调用的前后。
- **Stop**：模型答完时运行，可以让它接着干，见「什么时候停」。
- **Interrupt**：你中断一轮时运行，只能记录和清理，拦不住中断。子代理的中断不触发它。

用程序驱动 codex 时：

- **app-server**：`turn/start` 开始一轮；`turn/steer` 往进行中的这一轮里插话；`turn/interrupt` 中断。一轮结束时发 `turn/completed`，状态是完成、中断、失败三种之一。
- **`codex exec`**：一次跑一轮，加 `--json` 输出事件流。按 `Ctrl+C` 等于发一次中断。

## 一轮是怎么跑的

### 一个例子

这是 `codex exec` 文档里的例子（有删节）。你让它「summarize the repo structure」（概括一下仓库结构），这一轮里 codex 请求了两次模型：

| 第几次请求 | 模型这次回了什么 | codex 接着做什么 |
| --- | --- | --- |
| 1 | 要跑命令 `bash -lc ls` | 执行命令，把输出记进历史，再请求一次 |
| 2 | 一段文字：「Repo contains docs, sdk, and examples directories.」 | 不用再继续，这一轮结束 |

一轮里出现的每样东西，codex 都叫一个 item（条目）：你的消息、模型的回复、推理、跑的命令、改的文件、工具调用等。上面这一轮在 `--json` 输出里是这样一串事件：`turn.started`（这一轮开始）→ 命令条目开始、完成 → 回复条目完成 → `turn.completed`（这一轮结束，带上用量）。

画成流程图，一轮是这样走的：

<figure class="diagram">
<!--@include: ../figures/codex-turn.svg-->
<figcaption>一轮的七个环节。每请求一次模型就经过 ② ③；还要继续，就经过 ④ ⑤ 再回到 ②；不用继续，从 ③ 走到 ⑥。工具在 ② 里就已经开跑，④ 是等它们全部结束。插话在 ⑤ 之后并入，Esc 能打断 ② 或 ④。</figcaption>
</figure>

### 每次请求前后发生什么

源码里 `run_turn` 函数（`core/src/session/turn.rs`）的注释这样描述这个循环：每次请求，模型要么要求调用工具，要么给出一条回复；要求调工具，就执行它，把结果放进下一次请求发回模型；只给出回复，就把它记进历史，这一轮算完成。具体到每一次请求：

- **请求之前**：把你插的话并进历史，这些话同样经过 UserPromptSubmit 钩子。然后把这一次的上下文和提供给模型的工具一次定下来，源码注释说这是为了让上下文、模型看到的工具和之后的工具调用用同一份视图。
- **请求当中**：流式接收。模型输出里每完成一个条目，就记进历史；如果是工具调用，同时开始执行，不等整条回复结束。
- **请求之后**：等这一批工具全部结束，结果按调用的顺序记进历史。
- **要不要继续**：回复里有工具调用，或者这期间你又插了话，就再请求一次。服务端在完成事件里标了 `end_turn: false`，也会再请求一次。都没有，就运行 Stop 钩子，然后结束这一轮。

两次请求之间，如果上下文已经到了压缩的阈值，codex 先压缩再继续，见[上下文管理](/agents/codex/context#满了怎么压)。

### 一轮由谁开启

| 来源 | 说明 |
| --- | --- |
| 你发的消息 | 没有任务在跑时按回车；app-server 里是 `turn/start` |
| `Tab` 排队的消息 | 一轮结束后自动发出，每次发一条，开启新的一轮 |
| 子代理的来信 | 子代理发来要求开启新一轮的消息时，codex 为它开一轮；中断之后如果还有这种来信等着，也立刻开一轮 |
| 目标续跑 | 用 `/goal` 设了目标、对话又空闲下来时，codex 注入一条续跑提示，开启新的一轮，见「什么时候停」 |
| 外部工具的结果 | app-server 的 `turn/start` 可以带 `toolOutput`，用客户端自己跑的工具结果开启一轮 |

## 几个工具一起调

模型一次回复可以给出好几个工具调用，codex 的请求默认允许这样做。执行时，codex 用一把读写锁决定谁能同时跑（`core/src/tools/parallel.rs`）：

- **能并发的拿读锁**，可以同时跑。哪些工具能并发，由工具自己声明：跑命令的 `exec_command`、往命令里写输入的 `write_stdin`、看图片的 `view_image`、`tool_search`、读 MCP 资源的几个工具都声明了可以。MCP 工具要么工具自己标了只读，要么服务器配置里写了 `supports_parallel_tool_calls = true`。
- **不能并发的拿写锁**，独占执行：要等在跑的工具都结束才开始，它跑的时候别的工具也得等。改文件的 `apply_patch` 和其他没有声明的工具都属于这一类。

所以在 codex 里，几条 shell 命令可以同时跑，改文件则一次只改一处。

结果按模型给出调用的顺序记进历史，不按完成的先后。一个工具普通地失败了，失败信息作为它的结果发回模型，标为失败，不影响同一批的其他调用。

还有一个细节：源码注释提到，工具可能晚于发出它的那次请求才真正开始跑，所以每个工具调用都带着发出它的那次请求的上下文，执行时用的是那一份。

## 跑动中插话

### 终端界面

模型干活时，按回车是插话，按 `Tab` 是排队，两者走不同的路：

| 方式 | 什么时候交给模型 |
| --- | --- |
| 回车（插话） | 在当前这一轮里交给模型，具体时机见下 |
| `Tab`（排队） | 这一轮结束后，作为新的一轮发出 |
| `Tab` 排队的斜杠命令、`!` 命令 | 同上；斜杠命令到真正运行时才解析，菜单和报错那时才出现 |

插的话什么时候进入历史，看模型当时在干什么：

- **模型正在输出**：这次输出立刻被截断。已经完整的条目保留，没写完的丢掉；已经开跑的工具照常跑完。然后 codex 带上你的话重新请求。这个行为由 `instant_interrupt` 控制，标为开发中，但默认打开。
- **工具正在跑**：等这批工具跑完，下一次请求之前并入。
- **一轮刚开始**：先让这一轮的新消息被模型处理一次，你的话下一次再并入。
- **刚自动压缩完、模型的工具调用还没接上**：同样推迟一次，先让模型把工具调用接上。

后两条是源码注释里写明的两个例外。

### 子代理的来信

子代理发给主对话的消息也会插进当前这一轮。模型每输出完一段说明性文字或一段推理，codex 就看一下有没有来信，有就截断这次输出，带上来信重新请求。如果这一轮已经给出了最终答复，晚到的来信留到下一轮，不去延长一个已经显示完的答案。

### app-server

`turn/steer` 往进行中的这一轮里插话，必须带上 `expectedTurnId`，和当前这一轮的 id 对上才行；没有进行中的轮次时请求失败。插话不会产生新的 `turn/started`，也不能顺带改模型、工作目录、沙箱这些设置。

## 按下中断之后

### 中断的顺序

按 Esc 后，codex 按这个顺序收尾（`core/src/tasks/mod.rs`）：

1. **通知任务停下**：给这一轮的任务发取消信号，最多等 100 毫秒让它自己收尾，然后强行终止。
2. **处理在跑的工具**：已经结束的照常交结果；没结束的被终止，结果写成 `aborted by user after 2.3s`（跑命令的写成 `Wall time: 2.3 seconds` 加一行 `aborted by user`）。
3. **在历史里加标记**：写入一段 `<turn_aborted>`，并且先落盘，再发出「这一轮已中止」的事件，因为有的客户端收到事件就会重读记录文件。
4. **运行 Interrupt 钩子**：默认超时 1 秒，最多 3 秒。
5. **发出「这一轮已中止」的事件**：原因是 interrupted。
6. **清掉挂起的东西**：等你回答的审批、权限请求、问题，以及还没并入的插话。
7. **如果有子代理来信在等**，立刻为它开新的一轮。

第 6 步排在第 1 步之后是有意的。源码里同一句注释写了两遍：

> Let interrupted tasks observe cancellation before dropping pending approvals, or an in-flight approval wait can surface as a model-visible rejection before TurnAborted.

意思是：先让被中断的任务看到取消，再丢掉挂起的审批。顺序反过来的话，一个正在等你点头的审批会先被当成「用户拒绝了」交给模型，然后才是「这一轮中止了」。你只是按了 Esc，模型的历史里却多出一次拒绝。

### 模型之后看到什么

- **中断标记**：`<turn_aborted>` 里的原话是「The user interrupted the previous turn on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.」意思是：用户是故意打断上一轮的；正在运行的命令进程可能还在后台跑；被中止的工具或命令可能已经执行了一部分。
- **被中止的工具结果**：就是上一节第 2 步写下的那几行。
- **每个工具调用都有结果**：每次请求前，codex 都会整理一遍历史：缺结果的工具调用补一条内容为 `aborted` 的结果，没有对应调用的结果删掉。进程崩溃后恢复的对话也靠这一步保证历史合法。

### 输入框里的东西

中断后，用 `Tab` 排队的消息不会自动发出，而是合并成一条放回输入框，由你决定要不要发。只有一种情况例外：你刚插的话还没被模型收到，这时按 Esc，codex 中断这一轮，并立刻把这些话作为新的一轮发出，界面提示「Model interrupted to submit steer instructions.」。

### 中止原因

「这一轮已中止」的事件带一个原因，有四种取值：`interrupted`（你中断的）、`replaced`（开始新任务时把当前这一轮顶掉，比如手动压缩、开始评审）、`review_ended`（评审结束）、`budget_limited`（目标的预算用完，界面提示「Goal budget reached - the turn was stopped.」）。

## 出错了怎么办

### 请求失败的重试

重试分两层：发请求失败最多重试 4 次（`request_max_retries`）；请求发出去之后，输出流中途断了，最多重试 5 次（`stream_max_retries`），两个都可以配到 100。转圈的地方显示 `Reconnecting... 2/5`，第一次 WebSocket 重连不显示，免得一闪而过的断线打扰你。

哪些错误重试，看错误的种类（`protocol/src/error.rs`）：

| 情况 | 处理 |
| --- | --- |
| 输出流中断、超时、限流、服务端 5xx、意外的状态码、连接失败 | 重试。服务端给了建议的等待时间就照办，否则指数退避加随机抖动 |
| 服务端过载 | 只在服务端给了建议的等待时间时才重试 |
| 内容过滤拦下 | 先往历史里加一段提示，再重试 |
| 上下文超长、用量额度用完、配额不足、请求无效、登录失效、沙箱错误、触发安全策略 | 不重试，这一轮以失败结束 |

两个特殊处理：

- **断网不计次数**：连接失败时不消耗上面的重试次数，间隔从 5 秒开始翻倍、最长 60 秒，一直重连，界面显示 `Reconnecting... waiting for network`。这个开关（`unbounded_connection_retries`）已经稳定、默认打开；内部会话和 Amazon Bedrock 不走这条路。
- **换传输方式**：用 WebSocket 时重试次数用完，退回 HTTPS，重试次数从零重新算。

### 出错时已经有输出怎么办

前面说过，模型输出里每完成一个条目就记进历史，工具调用一完整就开始执行。所以输出流中途断了的时候：

1. 已经完整的条目都在历史里，没写完的那一个丢掉；
2. 已经开跑的工具照常跑完，结果记进历史；
3. 重试时用的是这份更新过的历史，而不是原来那次请求的内容。

模型在重试的请求里能看到自己刚才发起了哪些工具调用、结果是什么，从那里接着做。已经执行过的工具不会因为重试再跑一遍。

### 这一轮因出错结束

重试用完，或者遇到不重试的错误，这一轮以失败结束：先发一个错误事件，再发 `turn/completed`，状态是失败，带上错误类型，比如 `ContextWindowExceeded`（上下文超长）、`UsageLimitExceeded`（用量额度用完）、`ResponseTooManyFailedAttempts`（重试次数用完）。上游有 HTTP 状态码时一起带上。

如果正在执行一个 `/goal` 目标，一轮因出错结束后目标会被挂起。源码注释写的理由是：防止自动续跑反复出错、白白消耗 token，压缩出错时就容易这样。

### 工具出错不算这一轮出错

工具执行失败、调用被拒绝，都只是这个调用的结果：错误信息作为结果发回模型，标为失败，由模型决定接下来怎么做，这一轮照常继续。

## 什么时候停

### 正常停下

回复里没有工具调用，这期间也没有新的插话，codex 就运行 Stop 钩子：

- 钩子返回 `"decision": "block"` 和一个理由（或者以退出码 2 退出），这个理由会作为一条新的提示交给模型，codex 在同一轮里接着跑。钩子输入里的 `stop_hook_active` 告诉钩子这次已经是续跑出来的。
- 发布版源码的循环里，没有限制 Stop 钩子连续续跑几次，防止无限续跑要靠钩子自己检查 `stop_hook_active`。
- 任何一个 Stop 钩子返回 `"continue": false`，就以它为准，这一轮结束，其他钩子要求续跑也不算。

### 目标

`/goal` 设一个目标（最多 4,000 字符），它既是第一条提示，也是完成的标准：

- 一轮结束、对话空闲时，只要目标还没完成，codex 就注入一条续跑提示，开启新的一轮。续跑提示要求模型先判断上一轮有没有实际进展，没有的话找下一个能做的动作，或者报告卡在哪里。
- 模型认为完成时，调用 `update_goal` 工具把目标标为完成。
- 可以给目标设 token 预算。用完时目标标为 `budget_limited`，codex 提示模型不要再开新工作、尽快收尾。
- 一轮因出错结束时，目标挂起，不再自动续跑。

### 上限

codex 没有步数上限，也没有花费上限：终端界面、`codex exec` 都没有这类参数。默认能用的额度控制只有目标的 token 预算。

开发中、默认关闭的 `rollout_budget` 是另一种：给整个会话（主对话和子代理共用）设一个 token 上限，每用掉一定量（默认是上限的 10%）就在历史里提醒模型还剩多少，用超了，请求以错误结束。

### 原地打转

模型反复调用同一个工具、参数也一样，codex 没有专门的检测，发布版源码里找不到这类逻辑。能起作用的只有：

- 目标的续跑提示要求模型每轮自查有没有进展；一轮出错，目标挂起；
- 自动压缩不设次数限制，源码注释的态度是「只要压缩能把用量压到远低于上限，就不用担心死循环」，见[上下文管理](/agents/codex/context#压坏了怎么办)。

一轮跑多久，最终由人看着、按 Esc 决定。

## 关键数字

| 项目 | 数值 |
| --- | --- |
| 输出流中断的重试 | 默认 5 次，最多可设 100 次 |
| 发请求失败的重试 | 默认 4 次，最多可设 100 次 |
| 输出流空闲超时 | 5 分钟 |
| 断网重连 | 不限次数，间隔 5 秒起翻倍，最长 60 秒 |
| 中断时等任务收尾 | 100 毫秒 |
| Interrupt 钩子超时 | 默认 1 秒，最多 3 秒 |
| 其他钩子默认超时 | 600 秒 |
| Stop 钩子连续续跑 | 不限次数 |
| `/goal` 目标描述 | 最多 4,000 字符 |
| 步数上限、花费上限 | 没有 |

## 来源

源码：[openai/codex](https://github.com/openai/codex) 发布版 rust-v0.162.1（2026-10-09，提交 `092d3ac`）。主要读了：

- `core/src/session/turn.rs`：`run_turn` 主循环、`run_sampling_request` 的重试、`try_run_sampling_request` 的流式处理和工具派发
- `core/src/stream_events_utils.rs`：条目完成时记进历史、派发工具
- `core/src/tools/parallel.rs`：读写锁、中止时的工具结果
- `core/src/tasks/mod.rs`、`core/src/context/turn_aborted.rs`：中断的顺序和 `<turn_aborted>` 标记
- `core/src/session/input_queue.rs`：插话的队列和截断输出
- `core/src/responses_retry.rs`、`protocol/src/error.rs`、`model-provider-info/src/lib.rs`：重试规则和默认值
- `core/src/context_manager/normalize.rs`：给缺结果的工具调用补结果
- `core/src/hook_runtime.rs`：Stop 钩子
- `ext/goal/`：目标的续跑、预算和出错挂起
- `tui/src/keymap.rs`、`tui/src/chatwidget/input_restore.rs`：按键和中断后的输入框
- `protocol/src/protocol.rs`：中止原因
- `features/src/lib.rs`：功能开关的阶段和默认值
- `exec/src/`：`codex exec` 的参数和 `Ctrl+C`

官方文档（learn.chatgpt.com，2026-10-12 读取）：

- [Glossary](https://learn.chatgpt.com/docs/glossary.md)：Turn、Thread，本篇「一轮」的定义出自这里
- [Codex App Server](https://learn.chatgpt.com/docs/app-server.md)：Core primitives、Turns、Turn events、Items、Errors、Manage a thread goal
- [Command line options](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)：Interactive shortcuts、斜杠命令排队
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode.md)：`--json` 事件流的例子
- [Hooks](https://learn.chatgpt.com/docs/hooks.md)：UserPromptSubmit、Stop、Interrupt、超时
- [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)：重试和超时配置
- [Long-running work](https://learn.chatgpt.com/docs/long-running-work.md)：目标

### 没核到的

- 服务端什么时候在完成事件里标 `end_turn: false`。
- `instant_interrupt` 标着开发中，以后的默认值可能变。
- 全部行为和数值来自源码，没有实际运行验证。
