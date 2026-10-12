---
label: 回合循环与中断
order: 1
date: 2026-10-12
summary: 一轮怎么跑、几个工具怎么一起调、跑动中插话、按下 Esc 之后、请求出错怎么重试、什么时候停
outline: 2
---

# Claude Code 的回合循环与中断

本篇只讲 Claude Code：一轮任务怎么跑，几个工具怎么一起调，干活时插话和按 Esc 会发生什么，请求出错怎么重试，最后在什么条件下停下。回合循环这个概念见[智能体功能简介](/agents/overview#回合循环与中断)，三家放在一起的比较见[三家差异](/agents/turn-loop)。

本篇的「一轮」采用 Claude Code 官方术语表对 turn 的定义：Claude 在一次会话里的一次完整回答，从你发出一条消息开始，到 Claude 回答完结束，中间可以调用任意多次工具。一次会话由很多轮组成：你在同一个会话里先让它修测试、再让它写提交说明，就是两轮。一轮里 Claude 通常要回复好几次：回复里要用工具，Claude Code 就执行工具、把结果发回去，Claude 再接着回复，直到某次回复不再调用工具，这一轮才结束。

::: info 依据
- 核对的是 Claude Code 2.1.296（2026-10-09 发布），文档读取于 2026-10-12。
- 引擎不公开源码。依据是官方文档、Agent SDK 的 Python 源码（只能看到接口和数据格式）和更新日志，详见[本组的依据](/agents/claude-code/#本组的依据)。
- 文档没写的地方直接写「文档没写」，不做推测，文末列了清单。
:::

## 一句话

Claude Code 的循环本身很简单：Claude 回复，回复里有工具调用就执行，把结果发回去让 Claude 接着回复，直到某次回复不再调用工具。功夫都花在循环的边上：

- **插话不打断**：你在它干活时补的话先排队，等手上这批工具跑完就交给模型，不用等整个任务做完。
- **出错看进度**：请求中途失败时，看回复已经流到了哪儿。还没给出完整的内容就重发；已经给出了完整的工具调用就不重发，因为重发可能把同一批工具执行两次。
- **停下有原因**：每次停下都记一个原因，SDK 里有 19 种取值，「你按了 Esc」和「接口出错」分得清，Esc 还分「断在模型输出时」和「断在执行工具时」两种。

## 你能看到和操作的

交互界面里：

| 操作 | 作用 |
| --- | --- |
| `Esc` | 停下当前的回复或正在跑的工具，已经做完的保留；有排队的消息就接着发出去。在权限确认框上按 `Esc` 等于选「No」 |
| `Ctrl+C` | 有任务在跑时同样是中断；没有时第一次清空输入框，第二次退出 |
| 干活时敲字回车 | 不打断，消息进队列，见「跑动中插话」 |
| `Ctrl+Enter` 或 `Ctrl+X Ctrl+S` | 立刻发出排队的消息（2.1.275 起） |
| 在输入框第一行按 `Up` | 把排队的消息取回输入框修改 |
| 输入框为空时按两次 `Esc` | 打开回退菜单，把代码和对话退回到之前某一点 |
| `/model`、`/effort` | 干活时也立刻生效，从这一轮的下一次请求开始用新设置 |
| `/fast` | 干活时切换，从下一轮开始生效 |

非交互运行（`claude -p`）和环境变量：

| 配置 | 作用 |
| --- | --- |
| `--max-turns`、`CLAUDE_CODE_MAX_TURNS` | 一轮里最多允许 Claude 几次带工具调用的回复，到了报错退出。默认不限，只在 `-p` 模式下有效 |
| `--max-budget-usd` | 估算花费到这个数就停。默认不限，只在 `-p` 模式下有效 |
| `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` | 最多几个只读工具和子代理同时跑，默认 10 |
| `CLAUDE_CODE_MAX_RETRIES` | 请求失败最多重试几次，默认 10 |
| `API_TIMEOUT_MS` | 单次请求超时，默认 10 分钟 |
| `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | Stop 钩子最多连续拦几次，默认 8 |
| `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` | 进程在一轮中间退出后，恢复会话时自动接着跑 |

开发者能用的钩子：

- **UserPromptSubmit**：每轮开始前运行，可以拦下这条消息，或者给它补充上下文。不只你打字的消息会触发，定时任务、后台子代理回报、别的会话发来的消息开启的轮次也会。
- **PreToolUse、PostToolUse、PostToolUseFailure**：每个工具调用的前后。
- **PostToolBatch**：一批工具全部跑完、Claude 下一次回复之前运行一次，可以补充上下文，也可以让循环在这里停下。
- **Stop**：模型答完时运行，可以拦下，让它接着干。用户中断时不运行。
- **StopFailure**：这一轮因接口出错结束时，代替 Stop 运行，只能记录和通知，改变不了结果。

Agent SDK 里对应的接口：`interrupt()` 中断当前一轮（只在流式输入模式下可用）；一轮进行中发消息时用 `priority` 指定交付时机；结果消息的 `subtype` 和 `terminal_reason` 记录这一轮怎么结束的。

## 一轮是怎么跑的

### 一个例子

这是 Agent SDK 文档里的例子。你说「修好 auth.ts 里失败的测试」，这一轮里 Claude 回复了四次：

| 第几次回复 | Claude 这次回复了什么 | Claude Code 接着做什么 |
| --- | --- | --- |
| 1 | 要用 Bash 跑 `npm test` | 跑命令，三个测试失败，结果发回 Claude |
| 2 | 要用 Read 读 `auth.ts` 和 `auth.test.ts` | 读出两个文件，内容发回 Claude |
| 3 | 要用 Edit 改 `auth.ts`，再用 Bash 重跑测试 | 依次执行，测试全过，结果发回 Claude |
| 4 | 只有一段文字：「修好了，三个测试都过了」 | 没有工具要执行，这一轮结束 |

前三次回复里都有工具调用，Claude Code 执行完就把结果发回去，Claude 接着回复；第四次回复里没有工具调用，这一轮结束，控制权交还给你。一轮里 Claude 回复几次，事先不知道，由它一路决定。

画成流程图，一轮是这样走的：

<figure class="diagram">
<!--@include: ../figures/cc-turn.svg-->
<figcaption>一轮的七个环节。Claude 每回复一次就经过 ② ③；回复里有工具调用，经过 ④ ⑤ 再回到 ②，Claude 接着回复；某次回复里没有工具调用，从 ③ 走到 ⑥。插话在 ⑤ 并入，Esc 能打断 ② 或 ④。</figcaption>
</figure>

### 每次回复前后发生什么

- **Claude 回复**：Claude Code 带上系统提示词、工具定义和全部历史请求模型，流式接收回复。回复可以只有文字、只有工具调用，或者两者都有。SDK 把每个内容块（一段文字、一个工具调用）各发成一条消息。
- **执行工具**：回复里的每个工具调用先过 PreToolUse 钩子和权限检查，再执行。被拒绝的调用不执行，Claude 收到一条拒绝说明作为这个调用的结果，通常会换个办法，或者说明做不了。
- **发回结果**：这一批工具的结果作为下一条消息发回去，Claude 再回复一次。

工具不一定等整条回复结束才开始跑：钩子文档提到，工具调用可能在模型还在输出时就已经执行完。具体从哪一刻开始执行，文档没写。

Claude 某次回复里没有工具调用，这时先运行 Stop 钩子，钩子不拦，这一轮就结束。SDK 最后发一条结果消息（ResultMessage），带上最终的文字、用量、花费和会话 id。

### 一轮由谁开启

不只是你敲回车。下面这些都会开启新的一轮：

| 来源 | 说明 |
| --- | --- |
| 你发的消息 | 包括一轮结束时还在排队的消息，按你敲的顺序自动发出 |
| 排队的命令和 `!` 命令 | 一轮结束后逐个运行；`!` 命令的输出进对话后，模型默认会接着回应 |
| 后台任务完成 | 后台命令、后台子代理跑完，Claude Code 注入一条通知开启一轮；几个同时完成的可以合成一轮回应 |
| 定时任务、`/loop` | 到点注入提示词 |
| 别的会话发来的消息、MCP channel 消息 | 同样作为注入的一轮 |
| `/goal` | 每轮结束后由另一个模型判断条件是否满足，没满足就再开一轮 |
| 用量额度恢复 | 订阅用户在交互会话里撞上额度后，Claude Code 等到额度恢复，让模型从停下的地方接着做，不重发你上一条消息（2.1.234 起） |
| 进程重启 | 设了 `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` 时，接着跑上次没跑完的一轮，见「按下中断之后」 |

SDK 用结果消息上的 `origin` 区分这些轮次：回应你自己消息的那一轮，`origin` 为空或是 `{"kind": "human"}`；后台任务通知、定时任务等注入的轮次是 `task-notification`。

## 几个工具一起调

模型一次回复可以给出好几个工具调用。Claude Code 按工具的性质决定并发还是串行：

- **只读的并发**：Read、Glob、Grep，以及标了只读的 MCP 工具，可以同时跑。同时在跑的只读工具和子代理合计最多 10 个，`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` 可调。
- **会改状态的串行**：Edit、Write、Bash 逐个执行，避免互相冲突。Bash 整个归在串行一类，文档没有按命令内容区分。
- **自定义工具默认串行**：用 SDK 写的工具，在 annotations 里标上 `readOnlyHint` 才能并发。这个字段名沿用 MCP SDK。

两个钩子在并发时的区别：PostToolUse 每个工具触发一次，并发的调用也并发触发；PostToolBatch 在整批结束、下一次请求之前只触发一次，拿到的是这一批每个调用的参数和发给模型的结果。依赖「这一批整体」的检查适合放在后者，比如看这批读了哪些文件，提醒模型该跑哪些测试。

一批工具的结果按什么顺序发回、其中一个失败会不会影响同批其他调用，文档没写。

## 跑动中插话

### 交互界面

模型干活时敲字回车，消息不打断这一轮，而是进队列，显示在对话里。模型还没开始处理的消息显示成灰色。什么时候交给模型，看排队的是什么：

| 排队的是 | 什么时候交给模型 |
| --- | --- |
| 普通消息 | 正在跑的这批工具全部结束后，在同一轮里交给 Claude，它下一次回复时就能看到，及时调整方向。一轮结束时还在排队的，按顺序自动发出 |
| 斜杠命令、`!` 命令 | 等这一轮结束，再按顺序逐个运行 |
| `/status` 这类命令 | 不排队，立刻运行 |
| `/model`、`/effort` | 不排队，从这一轮的下一次请求开始生效 |

所以插话只落在两个位置：一批工具跑完、Claude 下一次回复之前，或者一轮结束之后。正在流式输出的回复和正在执行的工具都不会被它打断。

不想等的时候：

- **`Ctrl+Enter`**（2.1.275 起）立刻发出排队的消息。这时模型如果在跑 shell 命令、子代理这类能挪到后台的活，这些活转到后台继续跑，模型在同一轮里读到你的消息；如果模型只是在写回复，或者手上的活挪不到后台，就中断这一轮，接着发你的消息。2.1.281 之前一律中断。
- **`Esc`** 中断这一轮，排队的消息马上发出去；输入框里的草稿不会跟着发出。
- **在输入框第一行按 `Up`**，把排队的消息和命令取回输入框，改完再发。

### SDK

在一轮进行中发消息，可以用 `priority` 指定时机（TypeScript SDK 文档）：

| 取值 | 效果 |
| --- | --- |
| `next` | 默认值。和交互界面一样：这批工具跑完后在同一轮里交给模型；这一轮先结束就开启下一轮 |
| `later` | 等这一轮结束，作为新的一轮发出 |
| `now` | 带 `origin: {"kind": "human"}` 时（2.1.286 起），能挪到后台的活转到后台，模型在同一轮里读到消息，可挪的包括 shell 命令、子代理、MCP 工具调用，2.1.287 起还有 WebFetch 和 WebSearch；挪不了就中断这一轮。不带这个 origin 时直接中断 |

另外两个相关的点：

- `shouldQuery: false` 只把消息加进记录、不触发模型调用，它会并进下一条触发调用的消息。适合把你在别处跑的命令输出塞进对话，不为它花一次模型调用。
- 几条消息挨得很近时，Claude Code 可能把它们并成一轮回应。结果消息里的 `user_message_uuids` 列出这一轮回应了哪几条，最多 64 条。

## 按下中断之后

### 停下的是什么

`Esc`（有任务在跑时按 `Ctrl+C` 也一样）停下当前的回复或正在跑的工具，模型等你的下一句话，已经做完的工作保留。具体到各个部分：

| 正在进行的 | 中断后 |
| --- | --- |
| 流式输出的回复 | 截断。SDK 里这条助手消息带 `aborted: true`，没有 `stop_reason`，内容可能停在半个词 |
| 正在跑的工具 | 取消，这个调用的结果里写明它被中断了。SDK 文档说，用 `interrupt()` 取消的工具不触发 PostToolUseFailure 钩子 |
| 正在等 PreToolUse 钩子回复的调用 | 取消，不再执行。2.1.208 之前，这时工具仍可能执行 |
| 权限确认框 | `Esc` 等于选「No」，拒绝这次调用 |
| 后台子代理弹来的权限确认 | `Esc` 只拒绝这一次调用，子代理继续跑 |
| 前台子代理启动的后台命令 | 随这个子代理的运行一起结束，被中断也一样 |
| Stop 钩子 | 不运行 |
| 排队的消息 | 马上发出去 |

### 模型之后看到什么

文档没有给出中断后写进历史的原文，能确定的有三点：

- **留一个标记**：记录文件里会留一条以 `[Request interrupted by user` 开头的文字。Agent SDK 列会话标题时，用一个正则把它和 `<tick>`、`<goal>` 等一起当作自动生成的内容跳过（`_internal/sessions.py`）。
- **每个工具调用都要有结果**：API 要求历史里的 `tool_use` 和 `tool_result` 一一配对，对不上就整个请求返回 400，报错里写着 `orphaned tool_result`、`duplicate tool_use ID` 之类，文档给的恢复办法是用 `/rewind` 退回出错之前。2.1.218 修过两个相关问题：工具被中断后多出几条「[Request interrupted by user]」；工具在回复中途中止时，记录里留下一个没有配对结果的 `tool_use`。
- **中断不是拒绝**：2.1.296 修了一个问题：会话关闭打断了一个工具调用，恢复后的子代理却被告知「用户拒绝了这次调用」。这两件事对模型的含义完全不同：被拒绝，它会认为用户不同意、换个方向；其实用户什么都没说。

### SDK 里怎么体现

- `interrupt()` 发一个控制请求 `{"subtype": "interrupt"}`，只在流式输入模式下可用。被中断的那一轮照样有结果消息，`terminal_reason` 是 `aborted_streaming`（断在模型输出时）或 `aborted_tools`（断在执行工具时）。权限回调返回拒绝并带上 `interrupt=True`，效果相同。
- 2.1.205 起，TypeScript SDK 的 `interrupt()` 返回一张回执，列出中断那一刻还在排队的消息（`still_queued`）。这些消息在中断之后接着处理，几条可能并成一轮；回执在被中断那一轮的结果消息之前到达。2.1.219 起，直接走控制协议的客户端可以在请求里加 `cancel_queued: true`，把它们一并取消。
- Python SDK 的 `interrupt()` 不清空消息缓冲：被中断那一轮已经产生的消息，包括它的结果消息，要先读完，才轮到下一条消息的回复。

### 拦截点上的中断

钩子和权限检查是拦截点。在拦截点上被中断，只能按「没通过」处理，不能放行。2.1.296 修了一个问题：UserPromptSubmit 钩子运行时按 Esc，会让还没经过检查的提示词直接发给模型。SDK 的回调钩子超时也按同样的思路处理：UserPromptSubmit 上的回调超时，就拦下这条提示词，因为它可能是一道策略闸门（2.1.208 起）。

### 进程在一轮中间退出

进程崩溃、机器重启、VS Code 重载扩展，都可能让一轮停在中间。这个开关主要给 SDK 用：设了 `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1`，恢复这个会话时 Claude Code 不重发原来的提示词，而是发一句 `Continue from where you left off.` 让模型接着做（`CLAUDE_CODE_RESUME_PROMPT` 可改）。接着跑的这一轮带 `resume_reason`（比如 `interrupted_turn`），和被打断的那次区分开。

`CLAUDE_CODE_RESUME_INTERRUPTED_TURN_MAX_AGE_MS` 限定多久以前的记录还能自动接着跑，免得拿一条过时的提示词重跑。没设这个值时，只有一种情况有期限：上次请求因接口出错而中断的，6 小时内才接着跑。2.1.285 修过一个问题：已经因为 `--max-turns` 正常停下的轮次，被当成中断又跑了一遍。

## 出错了怎么办

### 请求失败：看回复流到了哪儿

模型请求出错时，Claude Code 自动重试，默认最多 10 次，间隔按指数增长，转圈的地方显示 `Retrying in Ns · attempt x/y`。能不能重试，要看出错时这次回复已经完成了多少：

| 出错时回复到了哪 | 处理 |
| --- | --- |
| 还没流出任何内容 | 服务端错误、过载、超时、临时限流（429）、断线都重试 |
| 思考完了，还没开始文字或工具调用 | 服务端错误、断线最多再发两次；卡住不动的流最多重发一次。2.1.284 之前，服务端错误在这时直接结束这一轮 |
| 已经完成一段文字或一个工具调用，或者思考完后已经开始写 | **不重发**，因为重发可能把同一批工具调用执行两次。保留已完成的部分，执行已经完整的工具调用，从它们的结果接着跑，并提示 `The response above may be incomplete` |
| 整个回复已经完成 | 没什么要重试的，正常结束这一轮 |

断线的规则宽一些：只要连思考在内什么都还没完成，即使已经开始流出文字，也照样重发。

这张表的分界线是「有没有完整的内容已经交出去」。完整的工具调用一交出去就会被执行，这时重发同一个请求，模型可能再给一遍同样的调用，同一条命令就跑了两次。2.1.199 之前，回复中途遇到服务端错误时，已经流出来的部分整个丢掉，整轮报错。

被截断之后怎么续：交互界面里回一句 `continue`，模型从最后一个完整的内容块接着写；没写完的最后一块，在这一轮结束时丢掉。非交互运行（`-p`、SDK、云端会话）里，如果被截断的回复只有文字、没有工具调用，Claude Code 自动让模型接着写，最多连续 3 次（2.1.246 起）；子代理同样会自动续写（2.1.257 起）。

### 几种特殊情况

- **输入加输出上限超过窗口**：原样重发还会被拒，所以降低这次请求的输出上限再试；降无可降时，改为压缩上下文。
- **不重试的**：证书校验失败，重试也没用，第一次就报出来让你修；组织的策略检查拒绝了这次请求，拒绝针对的是内容，换模型也不重发；网关返回的消费上限 429，不是临时限流。
- **卡住的流**：20 秒没有数据，转圈处提示 `Waiting for API response`，之后按上表的规则中止和重发。迟迟收不到响应头的请求有单独的首字节期限，超时重发一次，还不行就报 `No response from API`。单次请求的总超时是 `API_TIMEOUT_MS`，默认 10 分钟。
- **主模型过载或不可用**：配了备用模型链（`--fallback-model` 或设置里的 `fallbackModel`），就按顺序换模型，最多 3 个。切换只管这一轮，下一条消息仍先试主模型；鉴权、计费、限流、请求太大这几类错误不触发切换。
- **用量额度用完**：订阅用户在交互会话里，Claude Code 等额度恢复后自动继续；连续再撞上，最多自动重来两次，之后停下。
- **无人值守**：设 `CLAUDE_CODE_RETRY_WATCHDOG=1`，429 和 529 无限重试，其他临时错误的默认重试次数提到 300 次，大约三小时。

### 这一轮因出错结束

重试用完，或者遇到不重试的错误，这一轮就结束了：运行 StopFailure 钩子而不是 Stop。钩子收到错误类型（`rate_limit`、`overloaded`、`server_error`、`max_output_tokens` 等 12 种），只能记日志、发通知。

SDK 的结果消息有一处容易看错：因接口错误结束的一轮，`subtype` 仍然是 `success`，`is_error` 为 true，`api_error_status` 记着失败请求的 HTTP 状态码。源码注释特意写明这个字段「可以安全记录，不含消息内容」。

### 工具出错不算这一轮出错

工具执行失败、调用被权限拒绝，都只是这次执行工具的结果：错误信息或拒绝说明作为工具结果发回模型，由模型决定接下来怎么做，循环照常继续。

模型给出解析不了的工具调用，也有次数上限：停止原因里有一个 `malformed_tool_use_exhausted`，具体几次文档没写。2.1.281 修过一个问题：模型交替给出解析不了的工具调用和被输出上限截断的回复时，这一轮会无限重试，连 `--max-turns` 也拦不住。

子代理的请求最终失败时，主对话收到 `Agent terminated early due to an API error`；如果子代理已经写出了文字，主对话收到这段部分输出，并标明不完整（2.1.199 起，之前错误文本会被当成子代理的结果交回）。

## 什么时候停

### 正常停下

Claude 某次回复里没有工具调用，就是它认为做完了。这时运行 Stop 钩子：

- 钩子返回 `"decision": "block"` 和一个理由（或者以退出码 2 退出），模型带着这个理由接着干，这一轮继续。
- 为了防止钩子和模型反复拉扯，连续续跑 8 次后，下一次拦截被忽略，这一轮结束；模型每调一次工具，计数清零。`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` 可调，设成 0 取消上限。钩子输入里的 `stop_hook_active` 告诉钩子这次已经是续跑出来的，免得拦在一个永远达不到的条件上。
- SDK 的回调钩子超时，算它没表态，模型照常停下。
- `/goal` 是内置的快捷方式，相当于一个只在本会话生效、由模型判断的 Stop 钩子：每轮结束后由另一个模型对照条件检查对话内容，没满足就再开一轮，满足了或者判断做不到，就清除目标。要限制它跑多久，文档的办法是在条件里写上「或者 20 轮后停」这样的话。

### 上限

- **`--max-turns`** 数的是一轮里 Claude 带工具调用的回复次数，不带工具调用的那次不算。参数名里的 turn 不是本篇说的一轮。上面修测试的例子里设成 2，Claude 会在改代码之前停下。到了上限就报错退出，结果是 `error_max_turns`。流式输入时，还在排队的消息不并进这一轮，而是开新的一轮，重新计数。
- **`--max-budget-usd`** 数 Claude Code 本地估算的美元花费，子代理的也算。到了结果是 `error_max_budget_usd`；2.1.217 起，不能再派子代理（报 `Budget limit reached`），还在跑的后台子代理被停掉。

两个都只在 `-p` 模式下有效，默认都不限。交互界面没有这两种上限，靠人看着、按 Esc。

花费上限有个细节：一次回复花了多少，要等它结束、拿到接口返回的用量才能算，所以每次回复之后才检查。撞线的那次回复照样完成、照样计费，再加上那一刻还在跑的子代理停下之前花的钱，实际花费会超出上限，文档建议留出余量。估算可能和账单不一致。用 `--continue`、`--resume` 回到旧会话时，之前几次运行的花费不算进去；流式输入的会话里花费跨消息累计，`/clear` 后重新计。

### 钩子叫停

- 任何钩子返回 `"continue": false`，Claude Code 在钩子运行后整个停下，`stopReason` 显示给用户并留在对话里。PreToolUse、PostToolUse 返回它时，即使模型还在输出，也会停。
- PostToolBatch 钩子返回 `"decision": "block"` 或 `"continue": false`，循环在 Claude 下一次回复之前停下。

### 停止原因

SDK 的结果消息用两个字段记录这一轮是怎么结束的：

- **`subtype`**，5 种：`success`、`error_max_turns`、`error_max_budget_usd`、`error_during_execution`（出错中断，比如请求被取消）、`error_max_structured_output_retries`（结构化输出重试用完）。
- **`terminal_reason`**，更细，TypeScript SDK 文档列了 19 种：`completed`、`max_turns`、`tool_deferred`、`aborted_streaming`、`aborted_tools`、`hook_stopped`、`stop_hook_prevented`、`background_requested`、`blocking_limit`、`rapid_refill_breaker`、`prompt_too_long`、`image_error`、`model_error`、`api_error`、`malformed_tool_use_exhausted`、`budget_exhausted`、`structured_output_retry_exhausted`、`tool_deferred_unavailable`、`turn_setup_failed`。文档解释了其中几个：`completed`、`max_turns` 和两种中断。其余只给了名字，本篇不逐个猜。

`terminal_reason` 为空有三种情况：Claude Code 版本太旧；本地命令（比如 `/usage`）不进循环；会话致命失败后补发的错误结果。

### 原地打转

模型反复调用同一个工具、参数也一样，文档没写 Claude Code 有专门的检测。能起作用的是这几道闸：

- `-p` 模式的 `--max-turns` 和花费上限；
- Stop 钩子连续续跑 8 次的上限；
- 压缩死循环的熔断：压完立刻又满，几次之后停止自动压缩并报错，见[上下文管理](/agents/claude-code/context#压坏了怎么办)；
- 解析不了的工具调用有次数上限；
- 用量额度的自动继续最多连续重来两次。

交互界面默认没有这类上限，一轮跑多久，最终由人决定。

## 关键数字

| 项目 | 数值 |
| --- | --- |
| 同时跑的只读工具和子代理 | 最多 10 个 |
| 请求失败重试 | 默认 10 次，最多可设 15 次；无人值守模式默认 300 次，429、529 不限 |
| 只完成了思考时的重发 | 服务端错误、断线最多 2 次；卡住的流最多 1 次 |
| 非交互运行里自动续写被截断的回复 | 最多连续 3 次 |
| 单次请求超时 | 10 分钟 |
| 无数据提示 | 20 秒（顾问模型参与时 90 秒） |
| 备用模型链 | 最多 3 个 |
| Stop 钩子连续续跑 | 最多 8 次 |
| UserPromptSubmit 钩子默认超时 | 30 秒 |
| 用量额度自动继续 | 连续最多再来 2 次 |
| `/goal` 条件长度 | 最多 4,000 字符 |
| 自动接着跑因接口出错中断的一轮 | 6 小时内 |
| 并成一轮回应的消息 | `user_message_uuids` 最多 64 条 |
| `-p` 模式的 `--max-turns`、花费上限 | 默认不限 |

## 来源

官方文档（code.claude.com，2026-10-12 读取）：

- [Glossary](https://code.claude.com/docs/en/glossary)：Turn、Agentic loop 两条，本篇「一轮」的定义出自这里
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)：The agentic loop、Interrupt and steer 两节
- [Interactive mode](https://code.claude.com/docs/en/interactive-mode)：快捷键、Queue messages while Claude works、Wait for a usage limit to reset
- [How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)：循环的过程、修测试的例子、并发、上限、结果类型
- [Agent SDK reference - TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)：`priority`、`interrupt()` 回执、`terminal_reason`、`user_message_uuid`、`resume_reason`
- [Agent SDK reference - Python](https://code.claude.com/docs/en/agent-sdk/python)：`interrupt()`、`ResultMessage` 各字段
- [Intercept and control agent behavior with hooks](https://code.claude.com/docs/en/agent-sdk/hooks)：回调超时和中断
- [Hooks reference](https://code.claude.com/docs/en/hooks)：生命周期、UserPromptSubmit、PostToolBatch、Stop、StopFailure、JSON 输出
- [Keep Claude working toward a goal](https://code.claude.com/docs/en/goal)
- [Error reference](https://code.claude.com/docs/en/errors)：Automatic retries、The response above may be incomplete、Tool use or thinking block mismatch 等节
- [Model configuration](https://code.claude.com/docs/en/model-config)：Fallback model chains
- [CLI reference](https://code.claude.com/docs/en/cli-reference)、[Run Claude Code programmatically](https://code.claude.com/docs/en/headless)、[Environment variables](https://code.claude.com/docs/en/env-vars)、[Tools reference](https://code.claude.com/docs/en/tools-reference)、[Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code changelog](https://code.claude.com/docs/en/changelog)，读到 2.1.296

Agent SDK 源码：[anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) 0.2.165（2026-10-09 的提交 `b6e9d12`），`src/claude_agent_sdk/types.py` 里的 `ResultMessage`、`MessageOrigin`、`ClaudeAgentOptions.max_turns`，`src/claude_agent_sdk/client.py` 和 `_internal/query.py` 里的 `interrupt()`，`_internal/sessions.py` 里跳过中断标记的正则。

### 核对时发现的文档不一致

`max_turns` 的说明有三处不一致。本篇正文按 Agent SDK 文档的例子写：它数的是带工具调用的回复次数。

- Agent SDK 讲循环的文档，把一次「带工具调用的回复加上执行工具」也叫 turn，`max_turns` 按这个数。
- CLI 文档把它叫 agentic turns。
- Python SDK 源码的注释写的是「一个 turn 由一条用户消息和一次助手回复组成」。

### 文档没写、本篇不下结论的

- 一批工具的结果按什么顺序发回；其中一个失败会不会影响同批其他调用。
- 工具从回复流到哪一刻开始执行。
- 中断后写进历史的原文，只知道有以 `[Request interrupted by user` 开头的标记。
- 回复因为输出上限被截断时，循环怎么处理。
- 有没有检测重复工具调用的机制。
- 解析不了的工具调用最多容忍几次。
- `terminal_reason` 大部分取值的含义。
