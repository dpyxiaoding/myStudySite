---
label: 模型接入层
group: 协议与接入
order: 2
date: 2026-08-26
summary: 模型接入
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - 分岔总表
  - 对本仓的意义
  - 证据与缺口
  - 落点索引
---

# 模型接入层三家对读

<Badge type="info" text="三家对读 · 第九份" />

把一个模型端点接进 harness，要做的事远不止「填个 baseUrl」。codex、deepseek-harness、Claude Code 在同一条流水线上做了九个决策，四家里有六处互不相同——其中一处的三种答案彼此不兼容，而且三家都写下了理由。

**核验日期** 2026-08-26 · **对读对象** codex · deepseek-harness · Claude Code · **第四列** 本仓（不是被对标方） · **证据档次** 见文末

## 这件事在解决什么

「接一个模型」听起来是一件小事：一个 HTTPS 端点，一个密钥，一份 JSON。难的地方不在这里，在于**失败与差异都发生在你看不见的那一侧**。

把一次请求拆开看，harness 要在六个位置替调用方做决定：这一档配置指向谁（provider）、用哪种报文格式说话（wire）、这个模型的容量和能力是多少（目录与元数据）、密钥怎么进到请求头里（凭证）、上游抖了一下之后做什么（重试与降级）、以及这一次花了多少（计量）。

六个位置里有四个的正确答案取决于对面是谁，而对面不会告诉你。更麻烦的是失败模式：发错一个字段可能返回 HTTP 200、流可能吐到一半停住再也不动、限流可能是「等一会儿就好」也可能是「这个月没了」——三者在传输层看起来都差不多。

所以这一层的设计不是「怎么把请求发出去」，而是**把哪些差异消化在适配器里、哪些必须让上层知道**。三家在这条界线上画得很不一样，而它们的分歧比一致更有信息量。

## 三家是谁，证据到什么档次

| 家 | 可读到什么 | 这一轮实际读了什么 | 档次 |
| --- | --- | --- | --- |
| codex | 全量 Rust 源码 | `model-provider` / `model-provider-info` / `models-manager` / `codex-api` / `core/responses_retry` / `core/session/turn` / `protocol` 四个模块 / `ollama` / `lmstudio` / `config/thread_config/remote` | **档 A**（源码常量与类型定义，非实测） |
| deepseek-harness | 全量 TS 源码 + 一手规格文档 | `packages/llm/` 四份 README（它自己的接缝规格）；`retry-policy.ts` 的默认值回源码核过；适配器实现未逐行读 | **档 A−**（规格档为主，抽验到源码） |
| Claude Code | Agent SDK 源码 + CHANGELOG；CLI 引擎不可读 | Python SDK `types.py`（一手源码）、TS SDK `CHANGELOG.md`（一手行为记录） | **档 B**（协议面与选项面为真，内部分层为推断） |
| 本仓 | 自己的架构正文与实现 | 运行时内核 §5.5 / §9.6 / §9.7 / §9.8，`core-runtime/src/model/` 全部 | **档 A** |

九个维度按**一次请求经过它们的顺序**排：先定档、再认证、再出站、失败之后处置、最后记账。编号在这里承载信息，不是装饰。

### 01 provider 的边界画在哪

「一个 provider」是一个端点、一条路由、一组产品行为，还是一个计费维度？四家给了四个答案。

::: codex
`ModelProviderInfo` 是配置结构（TOML 的 `model_providers.<id>`，内置默认编译进二进制），`ModelProvider` 是运行时 trait。绑定项包括 base_url、env_key、wire_api、query_params、两组 HTTP 头、两个重试上限、流空闲超时、`requires_openai_auth`、`supports_websockets`。但 trait 上还挂着别的东西：`ProviderCapabilities`（namespace_tools / image_generation / web_search / external_web_access / remote_compaction），以及三个「这个 provider 该用哪个模型做审批复核、记忆抽取、记忆合并」的偏好模型。也就是说 codex 的 provider **不只是端点，它是一组产品能力的上界**。整份 provider 配置还能由 gRPC 从远端下发（`RemoteThreadConfigLoader`，5 秒超时）。
:::

::: dsh
provider 不是一个对象，是**接缝上的一条路由**。`ctx.llm.registerAdapter(providers: string[], adapter)` 一次注册一组路由名，全成或全不成；返回的句柄带 `replace(providers)`，候选集先整体校验再原子替换——与别的适配器冲突时旧路由继续服务，替换本身是一个同步段、没有可观测的空窗。路由的独占性归注册表，模型 id 归适配器。
:::

::: claude
provider 是**服务这次调用的那一方**，在结果消息的 `modelUsage[].provider` 上有八个取值：`firstParty` / `bedrock` / `vertex` / `foundry` / `anthropicAws` / `anthropicGoogleCloud` / `mantle` / `gateway`。它出现在*结果里*而不是配置里——SDK 的选项面上只有 `model` 与 `fallback_model`。
:::

::: ours
profile —— 模型 ID、baseUrl、密钥来源、能力表、尺寸的绑定单位。§5.5 写明 `ModelPolicy` 收 profile 而不是裸 model，理由是「拆开传容易配错（把 Claude 的 model 配上 Kimi 的 baseUrl）」。
:::

::: warning 分岔
四家分在不同的轴上：codex 做成「一组行为上界」，dsh 做成「一条可热换的路由」，Claude Code 做成「计费维度」，本仓做成「配置绑定单位」。四家里只有 dsh 允许运行期换路由——它的接缝模型让这件事成本很低，其余三家都是启动期定死。
:::

### 02 wire 协议有几条

同一个 harness 要不要同时说好几种报文格式？

::: codex
一条。`WireApi` 枚举现在只剩 `Responses`；配置里写 `"chat"` 会在反序列化处直接报错，带一句迁移指引和讨论帖链接。这是**从两条减到一条**的结果，不是一开始就窄。
:::

::: dsh
多条，而且是**配置项**。pi-ai 适配器的 `api` 字段取值来自 `supportedProtocols()`：openai-completions、三种 Responses（openai / azure / openai-codex）、anthropic-messages、bedrock-converse-stream 等。为「pi-ai 不认识的私有网关」还准备了一组 `compat` 开关——`thinkingFormat`、`supportsDeveloperRole`、`maxTokensField`、`supportsTemperature`、`supportsStrictMode`——可以落在整条路由上，也可以逐个模型覆盖。它给的理由很实在：对一个不认识的 URL，pi-ai 的探测会当成 OpenAI 本体来发，而大多数 OpenAI 兼容网关至少会拒绝其中一项。
:::

::: claude
对外只有 Anthropic 那一条；上一维那八个 provider 值是同一条 wire 的不同部署与鉴权方式。
:::

::: ours
两条（Anthropic 兼容 / OpenAI 兼容）。§9.7 的原则是**按 wire format 分层，不按厂商分层**，并且「采样参数由各 wire adapter 自己持有，绝不进 `ModelPolicy` 公共字段」——因为两条 wire 在这件事上行为相反，放进公共字段就必然要在循环层分支。
:::

::: warning 分岔
dsh 一家把「网关方言」做成了配置面，其余三家都把它压成一到两条 wire。codex 那条从两条减到一条的路径是一个反向证据：**协议面收窄可能是成熟度信号，不是能力缺失**。
:::

### 03 模型目录从哪来

「这一档有哪些模型可用」这个问题，谁是权威？

::: codex
三段。① 编译进二进制的 `models.json`；② 远端目录（`ModelsEndpointClient::list_models`，带客户端版本号与 ETag）；③ 磁盘缓存 `models_cache.json`，TTL 300 秒。刷新策略是显式的三档枚举：`Online` / `Offline` / `OnlineIfUncached`。
:::

::: dsh
目录来自装的那个 pi-ai 包，配置有三种改法：`models` 整表替换、`modelOverrides` 就地改一个（「改一个模型、留着另外三十七个」是三行编辑）、什么都不写就用装的那份。另有一条**配置期**的 `discoverModels(settingsNs, request)`：拿着端点、协议和一次性凭证去问端点有哪些模型，凭证不存、结果不入库，只作为候选交给配置界面。README 明写：**provider 与 model 元数据是发现面，不是路由白名单**——适配器可以接受不在 `listModels()` 里的模型 id，消费者不许因为「没列出来」而拒绝请求。
:::

::: claude
别名（`sonnet` / `opus` / `haiku` / `inherit`）或完整模型 ID，目录在服务端，客户端不持有。
:::

::: ours
一张静态 `profiles` 表。`limits`（窗口与单次输出上限）是配置值、刻意不做探测（§9.10 末条：「用不到就别测，运行时按实际 usage 反馈调整」）。
:::

::: warning 分岔
分歧点是「目录能不能拒绝一个模型」。codex 与本仓的目录是权威表；dsh 明确拒绝把它当白名单，理由是动态模型和新于本地目录的模型都是常态。
:::

### 04 模型元数据管到哪

一份「这个模型是什么样」的描述，边界在哪里停下？这一维是整份对读里差得最远的一格。

::: codex
`ModelInfo` 约四十个字段，而且绝大多数**不是传输参数，是给装配下指令**：`shell_type` 决定用哪种 shell 工具、`apply_patch_tool_type` 决定用哪种改文件工具、`web_search_tool_type`、三个 `include_*_usage_instructions` 决定系统提示词里放不放 skills / plugins / apps 那几段、`truncation_policy`、`auto_compact_token_limit`（缺省由 `context_window` 的 90% 推出来）、`effective_context_window_percent`（给系统提示词与工具开销留头寸后可用的百分比）、`comp_hash`（压缩兼容性的不透明标识）、`upgrade { model, migration_markdown, retirement_at }`（模型退役时间与迁移文案）、`service_tiers`、`input_modalities`、`tool_mode`、`multi_agent_version`。
:::

::: dsh
`LlmResolvedModelInfo` 只有五样：确切身份、`context`、`defaultMaxTokens`、`reasoning`（可选 effort 列表，标识符是适配器私有的不透明字符串、*不是*核心枚举）、输入模态。缺字段有确切含义而不是零：没有 `context` 就是「容量未知」，没有 `defaultMaxTokens` 就是「输出上限由 provider 自己定」。另外它区分了两件容易混的事——`defaultMaxTokens` 是*部署配置的*每请求输出上限，从目录继承来的那个值是模型的*能力*，后者永远不会自动变成请求默认值。
:::

::: claude
`contextWindow` 与 `maxOutputTokens` 逐模型回报在 `modelUsage` 里——是**结果侧**的事实，不是配置侧的能力表。
:::

::: ours
`capabilities`（能力位，来自实测）与 `limits`（尺寸，来自配置）刻意分成两处：「那张表登记的是能力位（支不支持某件事），而这两个是尺寸。混进去会让『每一位都有读它的地方』那条自检失去判据。」能力表随启动快照落库（§9.8 第 2 条）。
:::

::: warning 分岔
这不是详略之差，是职责边界的差别：**codex 让模型元数据决定 harness 自己怎么装配，dsh 让它只描述容量**。换一个模型，在 codex 里可能换掉 shell 工具的形状和系统提示词的段落，在 dsh 里只换几个容量数字。两条路都自洽，代价不同——codex 的目录必须跟着产品演进，dsh 的目录可以老。
:::

### 05 凭证怎么进请求

密钥从配置到 HTTP 头之间，中间隔着什么？

::: info 三家撞出同一个答案
**配置里存的是密钥的引用，不是密钥**。codex 的 `env_key`、dsh 的 `apiKeyEnv`、本仓的 `ModelProfile.apiKeyEnv` 是同一个形状。codex 留了一个字面量口子 `experimental_bearer_token`，并在字段注释里写明「出于安全原因不鼓励，程序化调用时可能必要」——留口子的同时把它标成了不推荐路径。
:::

::: codex 鉴权面最宽 |
七种 `AuthMode`：ApiKey、Chatgpt、ChatgptAuthTokens、Headers、AgentIdentity、PersonalAccessToken、BedrockApiKey。此外还有 AWS SigV4（`aws.profile` / `region` / 可选的 `auth_refresh` 刷新命令，而该命令被硬性限定只能是 `aws`）与命令式 bearer（`auth.command`）。`validate()` 里是一串互斥检查：aws 不能与 env_key、experimental_bearer_token、auth、requires_openai_auth 任何一个同时出现，也不能与 websockets 同时开。
:::

::: dsh 一条值得抄的判据 |
**「配了引用但解析不到」与「压根没配」是两件事**。配了 `apiKeyEnv` 却取不到值 → `MISSING_CREDENTIAL` 直接失败；完全没写 `apiKeyEnv` → 才交给 provider 自己的环境发现。理由写在 README 里：回落会「拿环境里恰好存在的某个不相干的 key 去认证」。另外每个解析出的 key 在用之前先过一遍 `normalizeApiKey`（去首尾空白，要求非空且全为可打印 ASCII），拒绝时抛 `INVALID_CREDENTIAL`，且错误里**点名路由与引用名、绝不带 key 的任何片段**——为的是把一次配置错误从「一条看不懂的 fetch TypeError」变成一句人话。
:::

::: ours
profile 只记环境变量名，**读取动作不在 core-runtime**（它不碰 `process.env`），由各 app 的 composition root 读出来注入；工具侧的真实凭证按次下发是 M2 的 `CredentialGrant`（§5.3）。
:::

::: tip 同构
「引用而非字面量」三家一致，可当定论。分歧只在鉴权模式的数量上，而那基本由各自要接的云决定，不是设计取舍。dsh 那条「配了却解析不到 ≠ 没配」是三家里唯一明写的，本仓当前没有对应规则。
:::

### 06 重试在哪一层执行

谁拥有「再试一次」这个动作：传输层、适配器、还是 agent 循环？

::: codex 两层，各有上限 |
传输层 `RetryConfig { max_attempts: 4, base_delay: 200ms, retry_429: false, retry_5xx: true, retry_transport: true }`；流层 `stream_max_retries` 默认 5（用户可配，硬顶 100），退避优先用错误自带的 `retry_delay()`、没有才走本地 backoff。还有一档 feature 开关 `UnboundedConnectionRetries`：连接失败时无上限重连，延迟 5 秒起翻倍、封顶 60 秒，界面上显示「Reconnecting... waiting for network」。流空闲超时默认 300_000 ms。
:::

::: dsh 重试根本不在适配器里 |
**一次适配器调用就是一次 provider 尝试，适配器禁用库自带的重试**。重试是一个独立插件 `dsh-llm-retry`，挂在 agent 循环的 `agent/request-error` waterfall 上，每次重试开一个新的编号回合。策略由 provider 路由在*注册时*解析成不可变值，在途失败拿的是当初捕获的那一份——之后路由被替换也不改变它的恢复行为。默认 normal 模式：5 次，可重试码是 `EMPTY_RESPONSE` / `RATE_LIMIT` / `SERVER` / `TIMEOUT` / `TRANSPORT`，退避 500 ms → 10 s、抖动 10%。另有 always 模式无限重试*每一种*失败，README 自己把它列进「已知局限」：鉴权、配额、非法请求、上下文溢出都会一直重下去。流空闲超时默认 300000 ms，且看门狗只在 `next()` 未决时上弦。
:::

::: claude
重试是一条**可观测事件**：`api_retry` 系统消息带 attempt、max retries、delay 与 error status。错误分类经过一次收窄——529 从 `rate_limit` 拆出来叫 `overloaded`，`rate_limit` 现在专指 429。重试耗尽会体现在 `terminal_reason`（`api_error`）与结果上的 `api_error_status`。
:::

::: ours
3 次尝试，**总等待预算 2 秒**，重试 408 / 429 / 529 / 5xx，其余 4xx 一律不重试（「400 参数错、401/403 密钥错、404 档位错、413 太大，重试多少次都是同一个答案，只会把一次配置错误的定位时间拉长」）。`retry-after` 优先于自己的退避，但受预算封顶——上游让等 30 秒时如实报错。预算给得这么紧的理由写在头注释里：「退避的觉本身不带信号，正在睡的那一跳要睡完才停；预算给多少，等于一次 Ctrl+C 最多多等多久。」
:::

::: warning 分岔
**429 这一格四家四个答案**。codex 不重试 429——它映射成 `UsageLimitReached` 或 `RetryLimit`，两者 `is_retryable()` 都是 false，传输层的 `retry_429` 也是关的，改为把限流窗口快照交给界面；dsh 默认重试 5 次；Claude Code 重试并把它做成事件；本仓重试但封在 2 秒总预算里。四种做法背后是四种对「限流意味着什么」的判断。
:::

### 07 重试重放什么

流吐到一半断了，而这半截里已经有一个工具被调用过——重发的请求里，它算不算数？

::: info 三种互不兼容的答案
这是整份对读里唯一一处三家给出**逻辑上不能同时成立**的答案，而且三家都写下了理由。
:::

- **codex**：<Badge type="tip" text="历史" /> <Badge type="tip" text="助手文本" /> <Badge type="tip" text="tool_use ✓已执行" /> <Badge type="danger" text="流断" /> → 重发 <Badge type="tip" text="历史 + 刚才那些结果" />

  从 `sess.clone_history()` 重新构造 prompt，并把失败那次已经执行掉的工具调用挂进去（`executed_tool_calls.attach_pending_to_prompt`）。进度保留，重发的是「往前走了一截」的请求。

- **deepseek-harness**：<Badge type="tip" text="durable 历史" /> <Badge type="info"><s>助手文本</s></Badge> <Badge type="info"><s>tool_use</s></Badge> <Badge type="danger" text="流断" /> → 新编号回合 <Badge type="tip" text="同一份 durable 历史" />

  失败那次尝试**不提交任何普通助手消息或工具副作用**；重试回合在同一份 durable 历史上重建同一个显式 provider/model 请求。失败的 chunk 不进派生消息，重试事件对模型完全不可见。

- **本仓**：<Badge type="tip" text="历史" /> <Badge type="info" text="助手文本" /> <Badge type="info" text="tool_use ✓已吐出" /> <Badge type="danger" text="流断" /> → <Badge type="danger" text="不重试，如实报错" />

  **流一旦开始读，出什么错都不重试**。头注释写明理由：`post` 那层的重试之所以安全，全靠每一次尝试都结束在任何模型事件被吐出去之前；流中途断掉时可能已经吐过 `tool_use`，重发整个请求会把同一个 `tool_use` 再放一遍——「那不是重试一次，是把副作用放两遍」。

图例：<Badge type="tip" text="实线填充" /> = 重发时保留 · <Badge type="info"><s>虚线</s></Badge> = 作废 · Claude Code 这一格没核到

::: warning 分岔
分歧点是同一个：**流中途失败时，已经产生的工具调用算不算数**。codex 说算，所以挂上去继续；dsh 说不算，所以整次尝试作废；本仓说算，而正因为算所以不能重发。三条路各自成立，但它们对「一次尝试」的定义不同——这也是为什么这一格不能靠「谁重试得更多谁更健壮」来比。
:::

### 08 降级换的是什么

重试都用完了还不行，接下来换什么？

::: claude 换模型 |
`system/model_fallback` 消息带 `trigger` 五个取值：`model_not_found`、`permission_denied`、`overloaded`、`server_error`、`last_resort`。选项面上对应 `fallback_model`。四家里只有它把降级做成了一条对客户端可见的协议。
:::

::: codex 换传输 |
重试次数用尽时先试 `try_switch_fallback_transport`——WebSocket 降到 HTTPS，成功就把重试计数清零、重来一轮，并给界面发一条 Warning（「Falling back from WebSockets to HTTPS transport」）。**不换模型。**
:::

::: dsh 不降级 |
retry 插件只重试。always 模式把「永久失败也一直重试」明确列为已知局限，并把成本与延迟的控制推给部署方。没有模型降级链这个概念。
:::

::: ours
`ModelPolicy.fallbacks` 字段在，但今天只保证透传不被吞掉；真实切换排在 M2。路线图 §15.3 写着重估触发条件：「出现第二档可用的真实 profile，或单一档位的可用性成为具体抱怨」。
:::

::: warning 分岔
四家四个位置：换模型 / 换传输 / 不换 / 留了位置还没接线。值得单独记一笔的是 codex 那条——**「降级」不一定指换模型**，这个假设三家里只有一家支持。
:::

### 09 计量与计费两条路径

「这一次花了多少、还剩多少」——谁来回答，答案精确到什么程度，以及它能不能当闸门？

::: codex 读服务端权威 |
从响应头解析限流窗口：`x-codex-primary-used-percent` / `-window-minutes` / `-reset-at`，secondary 同构，并支持多个 limit id 并行（`x-<limit>-...`）。另带 credits 快照与 plan type。也就是说 codex **不自己估算，它读服务器告诉它的余量**，并在撞上 429 时把那份快照送进界面。
:::

::: claude 查价格表，而且当闸门 |
`modelUsage` 逐模型给 inputTokens、outputTokens、cacheReadInputTokens、cacheCreationInputTokens、webSearchRequests、costUSD、contextWindow、maxOutputTokens，外加 `canonicalModel`（查价格表用的规范 id，*可能与请求里那个模型字符串不同*）与 `provider`。两条细节值得单记：① `total_cost_usd` / `costUSD` 在响应报 `inference_geo: "us"` 时会乘 1.1 的数据驻留系数；② `usage` 只算主循环、逐回合，`modelUsage` 是累计的、覆盖整条查询管线的全部调用（压缩、起标题这些辅助调用都在内），**做成本核算要用后者**。而且成本在这里是**闸门**：`max_budget_usd` 超了直接以 `error_max_budget_usd` 结束这次查询。
:::

::: dsh 客户端估算，且明确不当闸门 |
固定启发式（四字符一个 token，加角色、块、请求信封的结构开销）。有 provider usage 就用 provider 的，但只在**规范请求信封完全一致**时复用，否则整份重估。`projectedTokens` 是「下一次请求的 prompt 会花多少」：provider 采样值加上采样之后表面增减部分的启发式重估——只估差量，所以既锚在 provider 上又能立刻反映内容变化。README 专门写了一节说这个占用率**不是账单，也不是闸门**：「harness 里没有任何东西从它做决策，压缩读的是 `measure()`。」它的包表里根本没有价格。
:::

::: ours
§9.6 把「预算」拆成三层加一种：账户额度 / 任务预算 / `max_tokens`，外加装配预算。②层自研、不依赖服务端 `task_budget`，靠会话中途追加 `role:"system"` 的倒计时提示。记账基础是每个 `ModelCall` 分四类 token 累计，理由写得很具体：「缓存读只算 0.1× 成本，混在一起记账会把成本估高一个量级。」①层订阅档看不见余量、接受撞上去；企业档必须自己记账。
:::

::: warning 分岔
分岔的根源是商业模式而不是工程判断：codex 有服务端可问、Claude Code 有价格表可查、dsh 两者都不打算做。本仓的位置最接近 Claude Code（企业侧要能回答「这个租户这个月花了多少」），但当前只有 usage 契约，从 token 到金额那一跳还不存在。
:::

### 附 本地模型算不算一档 provider

把 baseUrl 指向 localhost 就完事了，还是有别的事要做？

::: codex 做成了一段安装流程 |
`--oss` 走 `ollama` 或 `lmstudio` 两个 crate，默认模型 `gpt-oss:20b` / `openai/gpt-oss-20b`。流程是：探测本地服务器可达 → 模型不在本地就拉（带进度上报，TUI 与 CLI 两种 reporter）→ LM Studio 那边还额外在后台 load 一次。ollama 那边有一道版本闸：低于 0.13.4 不支持 Responses API，但版本读不出来时放行（`0.0.0` 也放行）。两处拉取失败都只是 `warn!` 不致命——「上层可能仍然能跑，让它自己去报错」。
:::

::: dsh 本地模型不特殊 |
手写一条路由（`api` + `baseURL` + 一份 `models`）就是了，没有任何安装动作。自建服务器与私有网关在配置里长得一模一样。
:::

::: info Claude Code / 本仓
都没有这一档。
:::

::: warning 分岔
codex 那套「探测 → 拉 → 加载 → 版本闸」是产品决策的产物（要给出一个开箱能跑的离线档），不是架构必需。记下来是因为它划出了一条边界：**provider 抽象的另一端可以延伸到「把模型装上」**。
:::

## 分岔汇总

十格里有九格分岔。第四列是本仓当前的位置，不是目标。

| 维度 | codex | deepseek-harness | Claude Code | 本仓（当前） |
| --- | --- | --- | --- | --- |
| 01 provider 是什么 | 一组产品能力上界 | 接缝上一条可热换的路由 | 计费维度（八个取值） | 配置绑定单位 profile |
| 02 wire 协议 | 一条（Responses，从两条减来） | 多条 + compat 开关，配置面 | 一条（Anthropic） | 两条，按 wire 分层不按厂商 |
| 03 模型目录 | 内置 + 远端 ETag + 磁盘缓存 300 s | 装的包 + 配置覆盖 + 配置期探询 | 服务端，客户端只有别名 | 静态 profiles 表 |
| 04 元数据边界 | 约四十个字段，决定 harness 装配 | 五样，只描述容量 | 结果侧回报窗口与输出上限 | 能力位 + 尺寸，两处分开 |
| 05 凭证形式 | env 引用（留了字面量口子） | env 引用，每次调用解析 | env + 各云 SDK 链 | env 引用，composition root 注入 |
| 05′ 鉴权模式 | 七种 + SigV4 + 命令式 bearer | 一种（可选 credentials 接缝） | API key / 订阅 / 各云 | 一种（API key） |
| 06 重试归属 | 传输 4 次 + 流 5 次；429 不重试 | 独立插件挂 agent 循环；429 重试 5 次 | 引擎内，发 `api_retry` 事件 | 适配器内 3 次，总预算 2 秒 |
| 07 重试重放 | 历史 + 已执行的工具调用 | 整次尝试作废，开新编号回合 | 未核到 | 流开始后一律不重试 |
| 08 降级 | 换传输（WS → HTTPS） | 不降级 | 换模型，五种 trigger | 字段在，切换排 M2 |
| 09 计量 | 读服务端限流头与 credits | 客户端估算，明确不当闸门 | 价格表 → USD，且是闸门 | 四类 token 累计，无价格表 |
| 附 本地模型 | 探测 / 拉取 / 加载 / 版本闸 | 手写一条路由即可 | 无 | 无 |

## 对本仓意味着什么

### 同构，可当定论

两家以上独立撞到同一个答案

- **配置里存引用不存密钥**。三家一致，本仓已经这样，这一格可以从「待确认」里划掉。
- **流空闲超时五分钟**。codex 的 `DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000` 与 dsh 的 `streamIdleTimeoutMs` 默认 300000 是两条独立证据撞到同一个数。这不是巧合——它对应「模型思考很久」与「连接已经死了」之间那条经验分界线。
- **恢复策略要在选中这一档时捕获**。dsh 明写：在途失败拿的是当初捕获的那份策略，之后路由被替换也不改。本仓有同构先例——§9.8 第 2 条「能力表锁进 Run 快照」是同一个道理，只是还没延伸到重试策略。

### 本仓没有

补不补是决策，不是缺陷

- **流空闲看门狗**。核过了：`core-runtime/src/model/` 全部文件里没有任何空闲超时，适配器只带用户的 `AbortSignal`。后果是一条静默的流会一直挂着，直到用户按 Ctrl+C。上一栏那个 300 秒是现成的取值。
- **「配了引用但解析不到」的独立错误码**。当前缺 key 会直接抛，但没有区分「没配」与「配了取不到」——后者的修法是改配置，前者的修法是加配置，混成一条错误会让人找错方向。
- **从 token 到金额那一跳。**§9.6 说企业侧必须能回答租户花了多少，当前只有四类 token 的 usage 契约。Claude Code 的 `canonicalModel` 是一个具体提醒：*请求里写的那个模型字符串不一定是计价用的 id*（别名、provider 私有 id），价格表要按规范 id 查，这一跳要早点在契约里留位置。
- **模型退役与迁移文案**。codex 的 `ModelInfoUpgrade { migration_markdown, retirement_at }` 是产品级的答案。本仓的 profiles 表里停用档只靠注释说明，老 Run 恢复时不会告诉任何人这一档已经停了。

### 三家分歧，要自己判

没有标准解，抄任何一家都是选边

- **重试重放什么**。本仓已经选了最保守的一档，而 codex 选了最激进的。这一格*不要*因为「别人重试得更多」就改：codex 之所以能重放，是因为它有 `executed_tool_calls` 那套挂载机制，那是配套设施不是勇气。要动这一格，先要有等价的机制。
- **模型元数据管到哪**。本仓当前在 dsh 那一档。codex 那一档（元数据决定装配）在 M2 接第二个 provider 时会有诱惑——一旦让 profile 决定「用哪种改文件工具」，profile 表就从配置变成了装配指令，§4 不变量 1（换网关不改循环层）会被从侧面绕开。判据可以很简单：**能力位只许被适配器读，不许被循环层读。**
- **降级换什么。**`fallbacks` 的重估触发条件今天仍然成立，但这一轮多了一个此前没考虑过的选项：codex 的答案是换传输而不换模型。本仓只有一条 HTTPS 传输，所以这条路暂时不存在——记下来是因为它说明「fallbacks 一定是一串模型名」这个假设本身没有被三家共同确认。

## 证据档次与明确没核到的部分

codex 与本仓是档 A（直读源码）；dsh 这一轮以它自己的接缝规格文档为主，`retry-policy.ts` 的默认值回源码核过，其余源码未逐行读，记为档 A−；Claude Code 是档 B——SDK 的 `types.py` 与 CHANGELOG 都是一手材料，但 CLI 引擎内部按规矩不碰。**没有跑起来，所有数值来自源码常量与文档，不是实测。**

- Claude Code 的重试重放语义没核到——`api_retry` 只暴露调度参数，不说重发的是什么。
- Claude Code 的 `fallback_model` 触发之后上下文怎么处理没核到。换模型意味着换窗口与分词器，是否重装配、缓存前缀怎么办，SDK 面上看不出来。
- codex 的 `ProviderCapabilities` 五个能力位各自的消费点没有逐个追。
- dsh 的适配器实现（`llm-deepseek/src/adapter.ts`、`llm-pi-ai/src/*`）没读，它这一份的结论主要来自规格文档；文档与实现不一致的可能性没有排除。
- 三家的价格表来源都没核：codex 的 `models.json` 没打开看有没有价格字段，Claude Code 的查表在 CLI 内部，dsh 明说没有。
- codex 的远端 provider 配置（gRPC `ThreadConfigLoader`）只读到装配入口，下发的字段集与信任模型没追。这块与下一份「凭证与身份」重叠，留到那时一起读。

## 落点索引

下一轮进去可以直接跳到这些位置。行号对应本次核验日期的快照。

| 文件 | 看什么 |
| --- | --- |
| codex-rs/model-provider-info/src/lib.rs:27–34 | 四个默认值与两个硬顶：流空闲 300 s、流重试 5、请求重试 4、上限 100 |
| codex-rs/model-provider-info/src/lib.rs:62–90 | `WireApi` 只剩一条，以及 `"chat"` 的迁移报错 |
| codex-rs/model-provider-info/src/lib.rs:92–150 | `ModelProviderInfo` 全部字段 |
| codex-rs/model-provider-info/src/lib.rs:288–330 | `to_api_provider()`：默认 base_url 按 auth_mode 分岔、`retry_429: false` |
| codex-rs/model-provider/src/provider.rs:52–75 | `ProviderCapabilities` 五个能力位 |
| codex-rs/model-provider/src/provider.rs:141–295 | `ModelProvider` trait 全貌 |
| codex-rs/models-manager/src/manager.rs:29–64 | 缓存文件名、300 s TTL、`ModelsEndpointClient`、三档刷新策略 |
| codex-rs/protocol/src/openai_models.rs:389–479 | `ModelInfo` 四十个字段（本份的第 04 维） |
| codex-rs/protocol/src/auth.rs:9–34 | 七种 `AuthMode` |
| codex-rs/protocol/src/error.rs:364–404 | `is_retryable()` 的封闭分类 |
| codex-rs/codex-api/src/api_bridge.rs:117–150 | 429 → `UsageLimitReached` / `RetryLimit` 的分岔 |
| codex-rs/codex-api/src/rate_limits.rs:22–90 | 限流头族的解析（primary / secondary / 多 limit id / credits） |
| codex-rs/core/src/responses_retry.rs:17–120 | 无上限重连的 5→60 s 阶梯、传输降级、退避 |
| codex-rs/core/src/session/turn.rs:1363–1435 | 重试循环：从历史重建 prompt 并挂上已执行的工具调用 |
| codex-rs/ollama/src/lib.rs:16–60 | `--oss` 的准备流程与 0.13.4 版本闸 |
| codex-rs/lmstudio/src/lib.rs:7–45 | 同上，外加后台 load |
| codex-rs/config/src/thread_config/remote.rs:25–40 | gRPC 下发的 provider 配置（下一份的入口） |
| dsh packages/llm/llm/README.md | `LlmRuntime` 全部公开 API 与语义（本份第 01/03/04 维的主要来源） |
| dsh packages/llm/llm/src/retry-policy.ts:14–24 | 重试默认值：5 次、500 ms→10 s、抖动 10%、五个可重试码 |
| dsh packages/llm/llm-retry/README.md | normal / always 两模式、`llm/retry` 事件、已知局限 |
| dsh packages/llm/token-meter/README.md | 启发式、provider 锚定、`projectedTokens`、「不是闸门」那一节 |
| dsh packages/llm/llm-pi-ai/README.md | 多协议、compat 开关、目录解析、凭证解析的三态 |
| sdk-py types.py:1293–1315 | `ModelUsage`：八个字段 + canonicalModel + provider 八值 |
| sdk-py types.py:2021–2042 | `max_budget_usd` / `model` / `fallback_model` |
| sdk-ts CHANGELOG.md:13 / 98–128 / 351 / 455 | 1.1× 数据驻留系数、`api_error_status`、usage vs modelUsage、model_fallback 五 trigger、429/529 拆分 |
| 本仓 core-runtime/src/model/model-retry.ts | 2 秒总预算的理由、可重试状态集、`retry-after` 封顶 |
| 本仓 core-runtime/src/model/anthropic-wire-adapter.ts:212–247 | 「流开始后一律不重试」及其理由 |
| 本仓 core-runtime/src/model/model-profiles.ts:1–45 | profile 的绑定项，以及能力位与尺寸为何分开 |
| 本仓 运行时内核.md §5.5 / §9.6 / §9.7 / §9.8 | ModelGateway 契约、三层预算、按 wire 分层、能力协商 |

---

三家对读系列第九份。结论是带日期的时效证据，**不直接进架构正文**——要改架构走 ADR。选题清单与固定骨架在 `docs/evidence/三家对读-选题与进度.md`。

核验日期 2026-08-26。
