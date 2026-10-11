---
group: 协议与接入
order: 1
date: 2026-08-26
summary: 协议与传输
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - ① 传输
  - ② 帧的形状
  - ③ 握手
  - ④ 推送多少
  - ⑤ 反向请求
  - ⑥ 取消与生命周期
  - ⑦ 背压与断线
  - ⑧ 契约来源
  - ⑨ 契约演进
  - 分岔总表
  - 对本仓的意义
  - 证据与缺口
  - 落点索引
---

# 进程之间那条线

<Badge type="info" text="Evidence · 三家对读" /> <Badge type="info" text="agent-platform · 证据 · 2026-08-26" />

**agent 的内核不长在界面里。界面要通过一条线跟它说话——而这条线一旦有第二个人接上，它就变成了一份不能随便改的合同**。三家怎么定这份合同、怎么升级它、以及两家为什么干脆拒绝签它。最后一问正好给本仓 §7.3 那笔账结清。

- **0** dsh 自家协议做的版本协商
- **2** codex 生成的客户端类型有几个口味
- **3** dsh 同一运行时上并存的线协议
- **−32001** codex 给「过载」留的错误码

## 先说清楚，这件事在解决什么

只要 agent 的内核和界面不在同一个进程里，中间就有一条线。这条线上的问题看着都是工程琐事，实际上每一条都在定同一件事：**两边各自升级的时候，谁负责不崩。**

**第一，线本身是单向的还是双向的**。事件从内核流向界面是单向的，很自然。但审批不是——内核跑到一半要问「这条命令能不能执行」，它需要从内核发起、由界面回答。这一下就把「一条事件流」变成了「一条双向 RPC」，而这两者的复杂度差着一个量级：双向就要有请求 id、要有超时、要能取消、要处理「对方还没回答就断线了」。

**第二，往线上推多少**。推得少，界面画不出发生了什么；推得多，敏感内容就跟着出去了——工具入参在企业场景里可能是客户姓名和金额，而订阅这条流的可能不止一个人。而且高频增量会把慢客户端压垮，于是又冒出背压问题：队列满了是丢消息、阻塞、还是报错。

**第三，也是最难的一条：这份合同怎么升级**。内核发布了新版本，界面还是老的；或者反过来。加一个字段安全吗？改一个枚举呢？删一个方法呢？**失效的方式还特别阴险——不是崩溃，是误读**。老客户端拿新形状按旧字段名解析一遍，不报错，只是读出来的东西是错的。

第三条上，三家的答案分歧最大：一家承诺前向兼容，一家干脆不承诺、改用「按版本生成客户端类型」，还有一家在自己的 README 里白纸黑字写着「预发布姿态，不做兼容承诺」。

九个维度：① 传输 → ② 帧的形状 → ③ 握手与能力协商 → ④ 往线上推多少 → ⑤ 反向请求 → ⑥ 取消与生命周期 → ⑦ 背压、过载、断线 → ⑧ 契约从哪来 → ⑨ 契约怎么演进

## 三家是谁，证据到什么档次

::: claude Anthropic · 档 A（SDK 侧）/ 档 B（CLI 侧）
- SDK 那一半是**这一份里质量最高的证据**：传输实现、控制帧的封闭联合、超时值都能逐行读到
- CLI 那一半只能读文档：`system/init` 的 capabilities 数组、`--bare`、退出码语义
- 但这一维恰好是 SDK 侧最完整的一维——因为 SDK 本来就只干三件事：**拼命令行、收发 NDJSON、跑那条控制通道**

来源：`sdk-py/_internal/transport/subprocess_cli.py` · `types.py`
:::

::: codex OpenAI · 全量 Rust 源码
- `app-server-protocol` 单是类型就 28,000 行，v1 / v2 两套命名空间并存
- `app-server-transport` 下四种传输并列，各一个模块
- 协议演进的机制是**一个 derive 宏加一个 inventory 注册表**——这是这一轮新读到的，之前两份盘点都没记

来源：`codex-rs/app-server-protocol/` · `app-server-transport/`
:::

::: dsh DeepSeek · 上游自述（档 A−）
- 它**同时有三套线协议**：自家 SDK 的 JSON-RPC、外部标准 ACP、以及给 Web 用的 Typert RPC
- 这一维我读的是它自己的包 README，不是逐行源码——**标 A− 而不是 A**。好在这些 README 里有「已知限制与欠账」一节，把没做的事写得比做了的还清楚
- 那一节正是这份对读里最有价值的部分

来源：`packages/sdk/` · `packages/acp/` · `packages/typert/`
:::

::: info 本仓（agent-platform）这一次不是旁听席。
§7.0 信封、§7.2 敏感度、§7.3 契约演进这三节当初是自己推的、没有对标样本（`evidence/claude-code.md` 原话）。此前那轮判过「§9.8 能力协商被证明推对了」，而 §7.3 被两份单家盘点各判过一次「走的是别人都不走的更贵的路」。**前一句要读窄**：§9.8 谈的是模型网关 ↔ provider，与本文这条客户端 ↔ 服务端的线不是同一根轴（见 ③ 那条注）。**这一份的任务之一就是把那笔账结掉**——不是复述结论，是看看三家并排之后它还成不成立。
:::

## ① 传输：谁跟谁连，连几种

一条管子还是四条？这个数字决定了协议本身要不要考虑连接、鉴权和多客户端。

::: claude 一条 stdio，就一条 | 档 A
- 父进程派生 `claude` 子进程，stdio 上跑 NDJSON——一行一条消息
- 出站 `--output-format stream-json --verbose`，入站再加 `--input-format stream-json` 才双向
- 单条 JSON 帧上限 1MB（可配），超了**抛错**；孤儿进程靠一个全局子进程集合 + `atexit` 发 SIGTERM 兜住
- 残留尾巴分两种：漏了换行（照收）、写到一半被切断（丢弃并记 debug）

来源：`_internal/transport/subprocess_cli.py`
:::

::: codex 四种并列 | 档 A
- `stdio`（默认，行分隔 JSON）· `unix_socket` ·`websocket`（实验，且明确标注不可用于生产）·`remote_control`
- Unix socket 那一档带一整套本地约定：控制 socket 路径（`$CODEX_HOME/app-server-control/`）与一个**启动锁文件**，防止两个实例抢同一个 socket
- 四条传输共用同一套协议类型——传输是可换的，协议不是

来源：`app-server-transport/src/transport/mod.rs`
:::

::: dsh 三套协议，各自的传输 | 档 A−
- 自家 SDK：stdio 上的换行分隔 JSON-RPC。README 有一节标题就叫 **「stdout 就是协议」**——部署方不许挂 stdout logger，诊断信息一律走 stderr
- ACP：同样 stdio，「stdout 保留给协议帧」
- Typert：HTTP 一元 RPC，依赖方向 `remotes → gateway → connection → webserver`

来源：`packages/sdk/server/README.md` · `packages/api/README.md`
:::

::: tip 同构 · 可当定论
本地那一档三家一模一样：**stdio + 一行一条 JSON + stdout 只跑协议**。没有一家为本地场景引入端口。这一条本仓 §3.3 已经独立推出来了——「本地 CLI 不应该为了自己调用而拉起一个 HTTP 服务，多一个端口、多一份鉴权代码、多一类『端口被占用』的故障，换不到任何东西」。三家的做法是这句话的三份背书。
:::

## ② 帧的形状：是不是 JSON-RPC

有一个现成的标准摆在那儿。三家里两家看了一眼，拿走了形状，扔掉了那个版本字段。

::: claude 不是 RPC，是两种帧叠在一起 | 档 A
- 同一条 stdio 上跑两种帧：**普通消息**（单向 CLI→SDK，即对话流）与 **`control_request` / `control_response`**（双向）
- 控制帧是一个封闭联合，响应只有两种 subtype：`success`（带 `response`）与 `error`（带字符串）
- 每条控制请求带 `request_id`，SDK 侧为每条派生一个任务，**默认 60 秒超时**。`initialize` 走的是**另一个可配旋钮**（默认同样是 60 秒）——留这个旋钮是为了让调用方能把它调长，注释给的理由是要等 MCP server 起来

来源：`types.py:2435（控制帧封闭联合）`
:::

::: codex 拿形状，不要版本字段 | 档 A
- `rpc.rs` 的**第一句话**就是免责声明，见下方引用
- 四种消息：Request / Notification / Response / Error。`id` 是 string 或 integer 的无标签联合
- Request 上可以挂一个 **W3C Trace Context**——分布式追踪直接进了协议帧，不是靠约定俗成的 header

来源：`app-server-protocol/src/rpc.rs:1-2`
:::

::: dsh 唯一一家真按 JSON-RPC 2.0 来的 | 档 A−
- 判帧规则写得很死：有 `id` 且有 `method` 是请求，**只有 `id`** 是响应，**只有 `method`** 是通知
- **畸形 JSON 行直接忽略**，不报错也不断连
- 错误码照标准来：缺 handler 回 `-32601`，handler reject 回 `-32603` 带错误消息。错误响应会让挂起的 `request()` 以一个保留了线上 `code` 与 `data` 的异常 reject

来源：`packages/sdk/protocol/README.md（Transport 一节）`
:::

> 「我们不做真正的 JSON-RPC 2.0，因为我们既不发送、也不要求 `"jsonrpc": "2.0"` 这个字段。」
>
> —— `codex` · `app-server-protocol/src/rpc.rs 的头两行`

::: warning 分岔 · 而且分岔的位置很有意思
三家里只有 dsh 真按标准来，而它恰好是三家里唯一一个**要跟外部生态互通**的——它同时实现了 ACP 这个别人定的协议，所以自家协议也顺手保持了标准形状。另外两家的客户端都是自己写的，于是「借用形状、扔掉版本字段」就成了自然选择。

codex 那句免责声明值得记：**它把「我像 JSON-RPC 但我不是」这件事写成了文件的第一句**，而不是留给别人去发现。本仓的 `EventEnvelope` 是单向事件流不是 RPC，同样需要这样一句——否则接入方会按 RPC 的预期来找请求 id。
:::

## ③ 握手：新旧两边怎么互相认

界面比内核新，或者反过来。握手那一帧要交换什么，才能让双方知道对方能干什么？

::: claude 一个字符串数组，不认识就忽略 | 档 B（文档）
- `system/init` 带一个 `capabilities` 字符串数组（如 `interrupt_receipt_v1`）
- 文档把用法明说了：**用它做特性检测，不要比较版本字符串，不认识的值忽略**
- 反方向也有一次性握手：SDK 的 `initialize` 帧一次传完 hook 配置、subagent 定义、skill 过滤等——**握手先于一切，之后不能改**

来源：`claude-code 文档` · `types.py:2381（initialize 帧）`
:::

::: codex 不谈版本，谈字段级能力 | 档 A · 这一轮新读到
- `initialize` 带 `clientInfo`（名字/标题/版本）与 `capabilities`，后者是**五个具名开关**，不是自由字符串数组
- 其中 `experimentalApi: bool` 是主角：**请求里带了实验字段而没开这个位，直接拒**，错误消息是稳定的 `<方法>.<字段> requires experimentalApi capability`
- 还有一个 `optOutNotificationMethods`：客户端可以按**精确方法名**关掉高频通知

来源：`app-server-protocol/src/protocol/v1.rs:27-65`
:::

::: dsh 一套不谈，一套谈，且运行时决定 | 档 A−
- 自家 SDK：**完全没有版本协商**。握手只带 `serverInfo.version`（`0.0.1`，**客户端不校验**）。README 把这条列在「已知限制」第一行
- ACP：`initialize` 协商版本。而且能力广告是**运行时条件性**的——只有挂了持久附件存储、*且* 配置的那个 provider/model 解析出显式图片输入，才广告图片能力
- 其余能力（session / editor / terminal / 文件系统 / MCP）**一律不广告**，因为这个适配器只做自动化，不做 UI 集成

来源：`packages/sdk/protocol/README.md` · `packages/acp/acp/README.md`
:::

::: warning 分岔 · 但不是「有 / 没有」那么简单
表面上是三档：Claude Code 有开放式能力协商、codex 只有具名开关、dsh 自家协议什么都没有。但读进去之后，**真正的分歧在「协商的粒度」而不是「有没有协商」**。

Claude Code 协商的是**特性**（一个字符串代表一整块行为）；codex 协商的是**字段**（`turn/start.environments` 这一个字段能不能用）；dsh 的 ACP 协商的是**运行时事实**（这台机器上此刻装没装附件存储）。粒度越细，越能在不破坏老客户端的前提下往前推进——而这正好接上下一节。
:::

::: info 本仓在这一维上是空的，而且是有理由的空。
§3.3 定的是 CLI **进程内直调**，两端在同一个进程里，**没有握手这一帧可言**；M2 才第一次真有 `apps/server`。所以本仓今天只有被动的那一半：§7.0 的「未知 `type` 与未知 `schemaVersion` 安全忽略」加「MAJOR 相等才可解析」。

需要点名纠正一处，因为本文初版把它写错了：**§9.8「网关的能力协商」不是这一格的落点**。它谈的是**模型网关 ↔ provider**——按 profile 白名单过滤出站字段、不支持时发 `capability.unsupported`、能力表锁进 Run 快照——与这里的**客户端 ↔ 服务端**不是同一根轴。两者共享同一条原则（未知能力安全失败、不静默降级），但共享原则不等于共享落点；把 §9.8 当成本仓对这道题的答案，会掩盖「本仓其实还没回答过它」这个事实。
:::

## ④ 往线上推多少

界面要画出「正在发生什么」，就得要细节。细节里混着不该广播的东西。这个取舍谁来做？

::: claude 默认推，个别开关关 | 档 A / B
- 主对话逐增量走 `stream_event`
- 子代理的过程**默认只转工具调用**（够做一个进度心跳），`forwardSubagentText` 打开才转文本与思考块
- 没有按内容分级的机制——过滤的单位是「消息类型」

来源：`types.py:2158-2168`
:::

::: codex 三层结构，客户端自己退订 | 档 A
- thread / turn / **item** 三层，item 是持久化的一等实体（命令执行、文件变更、MCP 调用、网页搜索…各是一种 item）
- 生命周期 `item/started` → `item/<kind>/delta` → `item/completed`，文档明说 **`item/completed` 是权威状态，delta 只是投影**
- 出站还有一道自动过滤：带实验内容的通知，对没开 `experimentalApi` 的连接**静默跳过**——不是报错，是这条通知对它不存在

来源：`app-server/src/transport.rs:102-122`
:::

::: dsh 同一个运行时，两个相反的极端 | 档 A−
- 自家 SDK：`session.event` 是「**运行时里每一个 session，不过滤**」。README 顺手承认了后果——**整份会话日志信封上线，于是会话词汇表成了线协议的一部分**
- ACP：**只发已提交的消息**。原始增量、推理、工具活动、计划、标题、用量**全部不上线**
- 而且它把理由写下来了：这是拿逐 token 延迟换一个干净的自动化结果，**未提交的 provider 分片与重试尝试因此不可能泄露半截文本**

来源：`packages/sdk/protocol/README.md` · `packages/acp/acp/README.md`
:::

::: warning 分岔 · 且本仓在这一维比三家都严
三家的过滤单位分别是**消息类型**（Claude Code）、**方法名 + 能力位**（codex）、**协议选型**（dsh：想要全量就用 SDK 协议，想要干净就用 ACP）。**没有一家做内容级的敏感度分级。**

本仓 §7.2 的四档（`public` / `internal` / `sensitive` / `secret`）加上「`sensitive` 只下发 `payloadRef` + 摘要、`secret` 永不进事件流」，在三家里没有对应物。这既是本仓的独有资产，也是独有成本——它让本仓的事件契约比三家都大一圈：多了两个信封字段、一条二次读取通道、一张摘要白名单表。**这笔成本在第五节要单独记一条。**
:::

::: info codex 那句「`item/completed` 是权威状态，delta 只是投影」本仓 §7.0 没有对应的一句。
没有这句话，客户端会合理地认为「把所有 delta 拼起来 = 最终内容」。**但它不是一条可以直接抄的规则**——本仓事件流里没有那条权威事件，而且 ADR-0056 已经反向定过「客户端的视图是事件流的纯 fold」。为什么、以及能写的那个对偶长什么样，见第五节 C 的第二条。
:::

## ⑤ 反向请求：内核要问界面

审批把单向事件流变成双向 RPC。这个「反向」放在哪儿——同一条线上，还是另开一条？

::: claude 同一条线，三个反向请求 | 档 A
- CLI → SDK 三种：`can_use_tool`（审批）·`hook_callback`（hook 回调）· `mcp_message`（进程内 MCP）
- **取消是显式的一帧**。SDK 侧捕获取消异常后**不写响应**，代码注释写明理由：CLI 已经通过 `control_cancel_request` 放弃了这个请求
- 值得注意的反面事实：**大多数工具调用不产生任何控制帧**——反向请求是例外路径，不是常规路径

来源：`types.py:2435` · `_handle_control_request`
:::

::: codex 同一条线，取值域比「批/驳」宽得多 | 档 A
- 命令执行审批可回五种：`accept` / `acceptForSession` / `decline` / `cancel` / `acceptWithExecpolicyAmendment`（批准并顺手改一条策略规则）
- 文件变更审批可带 `grantRoot`——批准的同时扩一个目录
- 还有两个更远的：`tool/requestUserInput`（实验，1–3 个问题、选项支持自由输入）与 `mcpServer/elicitation/request`（结构化表单或 URL 流程）

来源：`codex.md「审批的服务端反向请求」表`
:::

::: dsh 自家协议里是一个死能力 | 档 A−
- 自家 SDK 的 README 原话：**「服务端→客户端请求是死能力——传输支持，但服务器从不发一条」**；Python SDK 里那个响应端「留着给将来的审批流」
- ACP 里活着：`session/request_permission`，一次性的 allow / reject，**而且明说客户端可以自动作答**
- 这与它子代理那一套是一致的：委派出去的子代理 `approvalPolicy` 钉死成 `never`，**本来就不该有人问**

来源：`packages/sdk/protocol/README.md（已知限制第三条）`
:::

::: warning 分岔 · 本仓走了第四条路
本仓 **明确不给传输层开反向入口**：`AgentTransport` 只有 `startRun()`，返回一个 `AsyncIterable<EventEnvelope>`，没有 `decide()`。inline 审批的等待信号走 `ApprovalGateway` 这个**另外的端口**，实现住在客户端一侧，由 composition root 注入（ADR-0047）。

理由是三条约束叠出来的：`core-runtime` 不能知道确认框长什么样（不变量 3）；M1 的 CLI 是一条单向的 `for await`，没有反向入口；`async` 档要跨进程等三天，一个进程内的 `await` 撑不住。**dsh 的自家协议在形状上与本仓一致**——传输支持但不用——区别是它把这条记在「欠账」里，本仓把它记在「决定」里。
:::

## ⑥ 取消与生命周期

用户按了 Ctrl-C。这个动作要穿过那条线传到内核，然后呢？

::: claude 分得最细的一家 | 档 A / B
- 控制帧里有 `interrupt` 与 `stop_task` 两个
- 信号语义分开：**SIGTERM 退 143、在途 turn 留成未完成、resume 时接着跑；SIGINT 或 SDK 的 `interrupt()` 才是「结束这一轮」**
- 输出流排空最多等 30 秒

来源：`claude-code.md（headless 与 stream-json 协议）`
:::

::: codex turn 层有中断，落终态 | 档 A
- `turn/interrupt` 落一个 `interrupted` 终态——中断本身是一个**被记录的结果**，不是一个消失
- 另有 `turn/steer`：往在途 turn 追加输入而**不新建 turn**。「改主意」与「打断」是两个方法
- 连接层面，退出与断连各有自己的清理路径

来源：`codex.md（turn 三方法）`
:::

::: dsh 自家协议没有，ACP 里写得最细 | 档 A−
- 自家 SDK：**线上既没有 cancel 也没有 session close**。客户端放弃一轮的办法是**关掉运行时进程**——README 把这条明明白白列进「已知限制」
- ACP 的 `session/cancel` 则按阶段分了两套语义：还没进 Agent inbox 时只标记并中止准入、**不去动无关的 Agent 工作**；已经进了就取消对应 Agent 并等它静默
- 而且承诺了一条：取消之后**不会有迟到的用户消息被发布**，这一轮结算成 `cancelled`

来源：`packages/sdk/server/README.md` · `packages/acp/acp/README.md`
:::

::: warning 分岔 · 而且分岔的是「同一家的两套协议之间」
dsh 这一格最值得看：**同一个运行时，一套协议连取消都没有，另一套把取消的阶段语义写了整整一段**。这不是自相矛盾——是两套协议服务两种客户端。SDK 协议假定客户端就是「起一个进程、喂几条提示、读完就退出」；ACP 假定对面是一个长期运行的编辑器。

对本仓的意义在于：**取消语义的复杂度不由内核决定，由客户端的形态决定**。本仓当前只有一档取消——一个 `ExecutionContext.signal` 一路传到工具、审批网关与模型网关（最后一段由 ADR-0089 补上），**没有 SIGTERM / SIGINT 那样的语义分档，也没有「追加输入而不打断」这一档**。M2 上 HTTP+SSE、第二种客户端接进来那天，这一格要重新问一次。
:::

## ⑦ 背压、过载、断线

界面读得比内核写得慢。或者干脆断了。这两件事在协议里有没有名字？

::: claude 一个常量，两条流两种脾气 | 档 A
- 同一个 1MB 常量用在两处，**行为相反**：消息帧（stdout 的 JSON）超限**抛错**；诊断流（stderr）超限**不报错，把它当半行冲出去**
- 后者的注释给了理由：**一个从不发换行符的生产者，不能让缓冲无界增长**——诊断信息宁可断句也要出得来
- 没读到显式的背压机制；stdio 的天然阻塞就是背压。断线也没有重放语义：这条线一断，进程也就结束了

来源：`subprocess_cli.py:1092（抛）· :927（冲）`
:::

::: codex 过载是一个协议错误码 | 档 A · 这一轮新读到
- 任务之间用有界通道，容量 **128**，注释写明这是吞吐与内存之间的平衡、「对一个交互式 CLI 来说足够了」
- 入站满了且这条是**请求** → 回 `-32001 Server overloaded; retry later.`
- 连这条过载响应都排不进去 → **丢掉并打一条 warning**。非请求的事件则退回阻塞式发送，让背压自然传导

来源：`app-server-transport/src/transport/mod.rs:52, 233-257`
:::

::: dsh 按 session 一个在途槽 | 档 A−
- ACP：**每个 session 一个在途 prompt 槽**，第二条要等——用并发度而不是队列长度做限流
- 每 session 的投递是**串行**的，理由写下来了：附件读取是异步的
- 一条硬规则：committed 图片缺失或损坏时**让这次 prompt 失败，而不是发一个占位符**

来源：`packages/acp/acp/README.md`
:::

::: warning 分岔 · 断线这一格三家都是空的
过载：只有 codex 把它做成了一个客户端能识别、能据此重试的**协议错误码**。另外两家靠传输层的天然阻塞。

**断线重连三家都没有**——因为三家的本地档都是「进程没了，会话也就没了」。本仓 §7.0 那一整套 SSE 续传语义（每条带 `id:`、重连发 `Last-Event-ID`、服务端从事件存储重放该 Run 之后的事件、客户端仍按 `eventId` 去重）**在三家里没有对应物**。理由也很清楚：本仓的 Run 会跨进程 suspend/resume，会话动辄几十分钟，「用户合上笔记本再打开」是常态不是边缘情况——路线图 §15.4 把「事件 envelope + SSE 断线续传」列进了**一条都不能少**的底线。

也就是说这一格不是「本仓多做了一件三家没做的事」，而是**三家压根不在这道题的考场上**：一个不会跨进程恢复的会话，本来就不需要重放游标。
:::

<figure class="diagram">
<!--@include: ./figures/protocol-1.svg-->
<figcaption>三种结构不是三种规模，是三条正交的轴。Claude Code 在<strong>一条线上叠帧类型</strong>，codex 在<strong>一套协议下换传输</strong>，dsh 在<strong>一个运行时上挂多套协议</strong>。最后那条最容易被忽略：dsh 的三套协议对同一份会话内容做了三种<em>相反</em>的过滤，因为它们各自面对的客户端不同——这说明「往线上推多少」不是一个可以一次定死的全局参数。</figcaption>
</figure>

## ⑧ 契约从哪来：手写还是生成

协议类型有两处：服务端一份、客户端一份。它们靠什么保持一致？

::: claude 手写，加一道版本门 | 档 A
- SDK 侧的类型是手写的（Python `TypedDict` / TS 接口），与 CLI 侧靠约定对齐
- 一道下限门：`MINIMUM_CLAUDE_CODE_VERSION = "2.0.0"`，低于就告警
- 两个 SDK 都**内置一份原生 Claude Code 二进制**，找不到才回落到 PATH——这实际上把「版本对不上」的概率压到很低

来源：`_internal/transport/subprocess_cli.py`
:::

::: codex Rust 类型是唯一源，导出两个口味 | 档 A · 这一轮新读到
- `generate-ts` / `generate-json-schema` 从 Rust 类型导出客户端类型
- 关键的一处：**默认导出会把实验字段过滤掉**（`filter_experimental_ts`），带上 `experimental_api` 标志才产出完整版
- 实验字段清单靠 `inventory` 在编译期收集，每条带一个 `ExperimentalField { type_name, field_name, reason }`

来源：`app-server-protocol/src/export.rs:120-135`
:::

::: dsh 从 TS 源码类型反推整张图 | 档 A−
- Typert 把源码类型树转成**与编译器无关**的 `FaceModel` + `TypeGraph`，之后的渲染器**再也拿不到 TypeScript AST**
- 发出的是 Zod schema，且类型标成 `z.ZodType<SourceType>`——schema 与源类型的一致性由编译器守
- 两条「宁可失败」的规则：**不支持的 Zod 投影直接失败，不做扁平化也不弱化源类型**；`check` 模式在缺注解、私有跨包引用、无法无损保留的声明合并上一律报错

来源：`packages/typert/generator/README.md`
:::

::: tip 同构 · 可当定论
虽然三家手段不同，但都遵守同一条：**契约只有一个源，另一侧要么由它生成、要么由一道门禁盯住**。没有一家允许「两边各写一份、靠人保持同步」。

本仓的对应物是 `contracts/` 作为唯一跨包契约源加上 `check:shapes` 的形状检查——手写 + 门禁那一档，与 Claude Code 同形。**dsh 那两条「宁可失败也不降级」值得单独抄**：当生成器遇到表达不了的类型时，弱化成 `unknown` 是最省事的做法，也是最危险的——它把一处编译期错误换成了一处运行时误读。
:::

## ⑨ 契约怎么演进 —— 结账

加字段、改枚举、删方法。三家的答案，以及本仓那笔挂了两轮的账。

::: claude 承诺前向兼容 | 档 B
- 能力靠 `system/init` 的字符串数组检测，文档明说**不认识的值忽略**
- 也就是说：新增能力对老客户端是安全的，**兼容责任在协议设计，不在客户端版本管理**
- 这一档没读到删除或收窄时的处理方式

来源：`claude-code.md（stream-json 协议）`
:::

::: codex 把契约面切成两半 | 档 A · 这一轮才看清全貌
- **稳定核心**：不承诺跨版本兼容，客户端类型按 CLI 版本生成，对不上就是校验错
- **实验边缘**：字段上打 `#[experimental("turn/start.environments")]`，没开能力位就入站拒、出站跳、默认不出现在生成的类型里
- 退役也看得见：`thread/rollback` 已标 Deprecated 并注明将被移除，实验方法 `revert` 顶上——**弃用与替代同时在线**

来源：`codex-experimental-api-macros/` · `experimental_api.rs`
:::

::: dsh 把不做的理由写在 README 里 | 档 A−
- 自家 SDK 的原话：**「没有协议版本协商——握手只带 `serverInfo.version`（`0.0.1`，客户端不校验）；预发布姿态，不做兼容承诺。」**
- 整个仓库的姿态也一致：`AGENTS.md` 明写**没有外部消费者时宁可要正确的地基，也不要兼容垫片**
- 但 ACP 那一档是协商版本的——**因为那份协议不是它定的**

来源：`packages/sdk/protocol/README.md（已知限制第一条）`
:::

### 那笔账：本仓 §7.3 走的是不是一条冤枉的贵路

两份单家盘点各判过一次「不抄」，理由写得都对，但都只看到了半张图。三家并排之后，账目要改成三笔。

- **第一笔：原判成立，而且理由比原来更硬**。两家「不承诺」各自有前提，**而这两个前提本仓一个都不成立**。codex 敢不承诺，是因为它的会话是自己读的 JSONL rollout，**压根不存在「老客户端读新事件」这个场景**；dsh 敢不承诺，是因为它自认处在预发布姿态、**还没有外部消费者**。本仓两条都对不上：已经在持久化 checkpoint 和事件，§15.4 底线写着未知枚举前向兼容。所以这不是「我们比人家保守」，是**约束不同**——同一道题，我们和他们做的根本不是同一份卷子。
- **第二笔（新增）：codex 并不是「不做协商」，它做的是另一种协商**。它把契约面切成稳定核心与实验边缘两半，边缘那半按**字段**粒度用能力位管住。这个机制与本仓的兼容承诺**不冲突**——§7.3 管的是「已经进契约的东西怎么改」，而 codex 这一层管的是「还没定型的东西怎么先发出去」。**但这笔账不能记成「本仓今天有个空缺」**，那样就把时间点搞错了：ADR-0010 的重估触发条件写着「出现第一份真实用户数据（按路线图是 M2 试点）→ 此后不再有『数据可删掉重来』这个前提，两档合并，所有落库形状一律按 §7.3 的 breaking 治理」；§7.3 自己也把正式的兼容基线记成「等 `contracts/` 有第一个外部消费者再上」。**也就是说本仓现在整个契约面就是实验档**——codex 需要那套机制，是因为它已经在稳定期里还要往前推，而本仓还没进稳定期。真正的缺口在**那一刻**：两档合并时如果没有一个实验档接着，等于契约面一次性全部冻结。
- **第三笔：§7.2 的敏感度分级是本仓独有的，成本也要记在这本账上**。三家没有一家做内容级分级——dsh 甚至在自家协议里把整个运行时的所有 session 不过滤地推出去，并顺手承认「会话词汇表因此成了线协议的一部分」。本仓多出来的那套（两个信封字段、一条二次读取通道、一张摘要白名单表）不是三家里谁的对照物，是**为企业侧那条产品线单独付的钱**。它该不该在编程侧那条线上也全额付，是一个值得单独问的问题。

::: warning 结账 · 一句话
**贵路没走错，但账少记了一笔，而且那一笔是记在将来的。**§7.3 的兼容承诺对本仓是对的，理由现在有三家的对照撑着；少的那一笔是「实验契约面」——不是今天缺（今天整个契约面都在实验档），是 ADR-0010 那个到期日缺一个去处。

codex 的机制也只能搬一半：它的执行力来自**客户端在握手里声明能力位**，而本仓压根没有握手（见 ③ 那条注）。能搬过来的是**标注**那一半——让「这个字段还没定型」在代码里是一个看得见、编译期盯得住的事实，而不是只有作者自己知道。
:::

## 分岔汇总

第四列是本仓当前的位置。dsh 一列凡是两套协议答案不同的，用「SDK / ACP」分开写。

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| ① 传输 | stdio ×1 | stdio / uds / ws / remote | stdio ×2 + HTTP | 进程内直调 + HTTP SSE |
| ② 帧 | 两种帧叠一条流 | 类 JSON-RPC，无版本字段 | **真 JSON-RPC 2.0** | 单向事件信封 |
| ③ 协商粒度 | 特性（字符串数组） | **字段**（具名能力位） | SDK 无 / ACP 版本+运行时事实 | **无握手**；被动前向兼容（§7.0） |
| ④ 过滤单位 | 消息类型 | 方法名 + 能力位 | 选哪套协议 | **内容敏感度四档** |
| ⑤ 反向请求 | 同一条线，3 个 | 同一条线，取值域宽 | SDK 死能力 / ACP 有 | **另一个端口**（ADR-0047） |
| ⑥ 取消 | interrupt + stop_task；<br>信号语义分开 | `turn/interrupt` 落终态；<br>另有 steer | SDK 无 / ACP 分阶段 | 一档 `signal`，无分档 |
| ⑦ 过载 | 1MB 行上限 | **−32001 错误码** | 每 session 一个在途槽 | 未定 |
| ⑦ 断线重放 | 无 | 无 | 无 | **SSE + Last-Event-ID** |
| ⑧ 契约来源 | 手写 + 版本下限门 | Rust 生成，两个口味 | 源码类型推导（Typert） | 手写 + `check:shapes` |
| ⑨ 兼容承诺 | 前向兼容 | 核心不承诺 + 边缘门控 | 明写不承诺 | **前向兼容 + MAJOR 相等** |
| ⑨ 实验契约面 | 没读到 | 字段级能力门 | 无（整个仓库都是实验期） | **空缺** |

## 对本仓意味着什么

### A · 三家撞出同一个答案，可以当定论

- **本地档不起端口**。三家的本地传输都是 stdio + 一行一条 JSON，且 stdout 只跑协议帧、诊断走 stderr。本仓 §3.3 独立推出了同一条，现在有三份背书。**顺带一条可以直接抄的运维约定**：dsh 把「部署方不许挂 stdout logger」写成了 README 的一节标题——本仓 M2 起 `apps/server` 那天，同样的坑在等着。
- **契约只有一个源**。要么生成、要么门禁，没有一家允许两边各写一份。本仓 `contracts/` + `check:shapes` 已经在这条线上。
- **生成器遇到表达不了的类型，要失败而不是弱化**。dsh 的 Typert 明写「不支持的 Zod 投影直接失败，不做扁平化也不弱化源类型」。弱化成 `unknown` 省事，代价是把一处编译期错误换成一处运行时误读——这与本仓 ADR-0075「JSON 表达不了的值落库前就拒绝，不静默改写」是同一条规则的两个实例。

### B · 本仓有而三家没有，成本要认

- **内容敏感度分级（§7.2**）。三家零对照。它换来的是「工具入参不主动广播」「大体量载荷不进广播面」「二次取那一次独立的权限校验」这三件——而这三件都是企业侧那条产品线要的。**编程侧那条线是不是也要全额付这笔钱，值得单独问一次。**
- **断线重放（§7.0 的 SSE 续传**）。同样零对照，因为三家的会话都随进程结束。本仓的 Run 会跨进程 suspend/resume，这一条是刚性的。已知的潜伏问题也记在原处：**失效游标退化成从头重放会撞上历史里的 `run.suspended` 而提前结束**，M2 上 SSE 时必须回答。
- **反向请求不进传输层（ADR-0047**）。三家有两家半是把反向请求塞在同一条线上的。本仓拆成 `ApprovalGateway` 端口，收益是传输层保持单向、`async` 档能跨进程等三天；代价是**每接一种新客户端，就要为它写一个 Gateway 实现**。M2 的最小审批页是第一次付这笔钱。

### C · 要拍板的两条

::: info 只写清楚代价和牵动面，不写建议。
两条都是新决策。**两条都不能照抄外面那句话**——第一条的执行机制在本仓没有挂载点，第二条的前提在本仓不成立，各自为什么见条目内。
:::

- **第一，M2 那一刻要不要有一个「实验契约面」接着**。问的**不是**「今天缺不缺」——今天整个契约面都在实验档（ADR-0010）。问的是两档合并那一刻：所有落库形状一次性转入 §7.3 的 breaking 治理之后，还想不想留一个可以放「这个字段还没想好」的位置。codex 的答案是字段上打一个属性、给一个稳定的理由 id、默认从生成的客户端类型里滤掉、没声明能力位就入站拒绝、出站静默跳过；**但后半截在本仓没有地方挂——没有握手，就没有能力位**，能搬的只有标注那一半。**代价是多一个「不是所有客户端都看得见同一份协议」的事实**，而这与 §7.0「未知 `type` 安全忽略」是同一个方向、更强的一步。牵动面是 §7.3 的受治理契约面清单与 **ADR-0010 的重估触发条件**——**不是 §9.8**（本文初版写错了那一处，理由见 ③ 那条注）。
- **第二，「增量拼起来等不等于最终内容」这一句要不要写进 §7.0**。本仓 §7.0 定了 `sequence`、去重、重放、未知版本，唯独没有这一句。**但这一条不能照抄 codex，它的前提在本仓不成立**：「`item/completed` 是权威状态、delta 只是投影」要有一条权威事件才立得住，而本仓事件流里没有那一档——`model.delta` 逐段发出去，累加出来的正文进的是**对话日志**（§6.1 / `ConversationReader`），不是事件。<br><br> 而且本仓已经反向定过一次：§7.1 `conversation.injected` 那一行的原话是「**客户端的视图是事件流的纯 fold**（ADR-0056）」。照抄 codex 那句会与它直接对撞，所以能写的是它的**对偶**——说清楚 fold 权威到什么程度，而不是宣布 fold 不权威。**分岔口是具体的**：§7.0 自己写着「当前供游标的只有接管路径且它算的是真实末尾」，接管订阅从游标之后推，**前面的 `model.delta` 不重放，fold 天生不完整**，而对话日志是全的。不写的代价与 §7.0 已经处理过的「未知 `schemaVersion`」同类：**失效方式是误读而不是崩溃**。

## 证据档次与明确没核到的部分

::: info 档 A · 直接读到源码
- codex：`rpc.rs`、`experimental_api.rs`、实验字段 derive 宏、`export.rs` 的过滤、`transport/mod.rs` 的过载路径、`v1.rs` 的 initialize 类型、`message_processor.rs` 与 `transport.rs` 的两处能力门
- Claude Code：SDK 传输实现全部、控制帧封闭联合、超时与取消语义
:::

::: info 档 A− · 上游自述，未逐条对源码复核
- dsh 这一份**全部**来自它自己的包 README（`sdk/protocol` · `sdk/server` ·`acp/acp` · `typert/generator` · `api`）
- 这些 README 有「已知限制与欠账」一节，自曝程度很高——但它仍是自述。凡是本文引 dsh 的行为承诺，**都没有跑起来验过，也没有逐条对源码复核**
:::

::: info 这一轮明确没核
- codex 的 `remote_control` 传输只看了模块名与导出，鉴权与设备登记没读；`app-server-daemon` 完全没进
- codex v1 与 v2 命名空间的**共存策略**——老客户端调 v1 方法时服务端怎么映射，没跟到
- dsh 的 `typert/registry` 与 `loader` 运行时侧没读；`api/gateway` 的实际 RPC 形状没读
- 三家的 **鉴权**都没读：codex 有 `transport/auth.rs`，dsh 的 HTTP 那一档必然有，本文一句没提
:::

::: info 一处口径要说明。
「Claude Code 承诺前向兼容」这句话的依据是文档里那句「用 capabilities 做特性检测、不要比较版本字符串、不认识的值忽略」，**它是关于新增的承诺，不是关于删除与收窄的承诺**。Claude Code 删一个能力、收窄一个枚举时怎么办，本轮没有可引的依据——汇总表里那一格写「前向兼容」是就已知部分而言，不要当成完整的兼容政策。
:::

## 落点索引

下一轮要接着读，从这些位置进去。行号按 2026-08-24 那次取的源码树。

#### codex

- `codex-rs/app-server-protocol/src/rpc.rs:1-60` — 那句免责声明与四种消息
- `codex-rs/app-server-protocol/src/experimental_api.rs` — 实验字段的 trait 与 inventory 注册表
- `codex-rs/codex-experimental-api-macros/src/lib.rs` — `#[derive(ExperimentalApi)]` 的展开
- `codex-rs/app-server-protocol/src/export.rs:120-135` — 生成类型时过滤实验字段
- `codex-rs/app-server-protocol/src/protocol/v1.rs:27-65` — initialize 的五个能力位
- `codex-rs/app-server-protocol/src/protocol/v2/` — 三层协议全部类型（34 个模块）
- `codex-rs/app-server/src/message_processor.rs:889-895` — 入站实验字段拒绝
- `codex-rs/app-server/src/transport.rs:102-122` — 出站实验通知静默跳过 + 逐方法退订
- `codex-rs/app-server-transport/src/transport/mod.rs:22-56` — 通道容量、错误码、socket 路径约定
- `codex-rs/app-server-transport/src/transport/mod.rs:233-257` — 过载响应与它自己排不进去时的退路

- **deepseek-harness**（本轮读的是 README，源码待核）
- `packages/sdk/protocol/README.md` — 线类型全表 + 三条已知限制
- `packages/sdk/server/README.md` — 「stdout 就是协议」、initialize 的就绪边界
- `packages/acp/acp/README.md` — 协议契约表、取消的阶段语义、只发已提交的理由
- `packages/typert/generator/README.md` — FaceModel / TypeGraph 与两条「宁可失败」
- `packages/api/README.md` — `remotes → gateway → connection → webserver`
- `待核源码：packages/sdk/protocol/src/transport.ts` · `types.ts`

#### Claude Code（SDK）

- `sdk-py/src/claude_agent_sdk/_internal/transport/subprocess_cli.py` — 传输全部机制
- sdk-py/src/claude_agent_sdk/types.py:2435 起 — 控制帧封闭联合
- `sdk-py/src/claude_agent_sdk/types.py:2381-2387` — initialize 握手帧

#### 本仓

- docs/architecture/执行与恢复.md §7.0 — Envelope、sequence、SSE 续传、未知版本
- docs/architecture/执行与恢复.md §7.2 — 四档敏感度、摘要白名单、模型复述那条路
- docs/architecture/执行与恢复.md §7.3 — 什么算 breaking、三个方向的兼容保证
- docs/架构设计.md §3.3 — CLI 不起 HTTP server、`AgentTransport` 的形状
- `docs/decisions/0047-inline-审批的等待信号走端口不走传输层.md`
- `docs/decisions/0029-事件-payload-按类型分版本.md`

---

核验日期 2026-08-26。本文是带日期的时效证据，**结论不直接进架构正文**——改架构走 ADR。源码树取自 2026-08-24 的快照，行号随上游变动会失效，以符号名为准。
