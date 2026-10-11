---
group: 平台能力
order: 4
date: 2026-08-27
summary: MCP 面
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - 十个决策点
  - 分岔总表
  - 对本仓的意义
  - 证据与缺口
  - 落点索引
---

# 接进来的工具算谁的

<Badge type="info" text="三家对读 · 第十四篇 · 核验日期 2026-08-27" />

MCP 把「别人写的工具」变成了配置文件里的一行。那一行背后是一个陌生进程，它自己报名字、自己写说明、还自己声明「我是只读的」。三家都接了这个协议，但在「这句话信不信」上给了三个完全不同的答案——一家照单全收，一家只允许它把自己说得更危险，还有一家把这个问题原样交给了部署方。

<Badge type="info" text="客户端 + 服务端" /> <Badge type="info" text="只做客户端" /> <Badge type="info" text="显式不做服务端" />

Claude Code 2.1.247 · codex（codex-rs 全量） · deepseek-harness（全量 + 包内文档） · 本仓作为第四列 · 十维

## 这件事在解决什么

一把内置工具，从名字到参数到「它会不会删东西」，全是你自己写的。一把 MCP 工具不是——它是一个陌生进程在 `tools/list` 里报上来的一条 JSON：一个名字、一段描述、一份 inputSchema，外加几个可选的自我声明。协议给的就这些。

把这条 JSON 变成「模型可以调的一把工具」，中间至少要有人回答五个问题：

- **它叫什么**。两台 server 都有 `search`，模型看到的名字得能区分；而模型看到的名字又不能原样发回给 server。
- **它进不进模型的视野**。接三台 server 可能就是四十把工具，全塞进去等于把上下文预算交给别人花。
- **它有多危险**。协议里有 `readOnlyHint` / `destructiveHint` / `openWorldHint` 三个字段——*但填这三个字段的是 server 自己*。
- **它起不来的时候算什么**。一个 `npx` 拉起来的子进程，第一次连要装包，可能要三十秒；也可能永远起不来。
- **它能反过来要求什么**。MCP 不是单向的：server 可以问用户问题、可以要求读你的目录列表、甚至可以借你的模型跑一次推理。

前两个是工程问题，做错了顶多难用。第三个和第五个不是——它们是*把一部分决策权交给了一个你没写过的进程*。这一篇要看的就是三家各自把这条界线划在哪儿。

::: info 为什么它对本仓要紧。
本仓的不变量 5 是「能力只能通过 ToolProvider 进入系统」，不变量 6 是「副作用必须走四段式：风险判定 → 审批 → 幂等执行 → 审计留证」。MCP 客户端在 `§12` 已经定了要做——那它就是一个 `ToolProvider`，而它 `list()` 出来的每一把工具都必须填满 `ToolSpec`。问题在于：`ToolSpec` 上有七个字段，`tools/list` 一个都不给。
:::

## 三家是谁，证据到什么档次

::: codex 一手源码
读了 `codex-mcp/` 的连接管理、工具目录、命名归一化、绑定与调用，`rmcp-client/` 的传输、协议版本与 ClientHandler，`config/mcp_types.rs` 与 `mcp_requirements.rs`，以及 `core/src/mcp_tool_call.rs` 的审批与沙箱注入两段。
:::

::: dsh 一手源码 + 包文档
`packages/mcp/mcp-client/` 全部四个源文件（1171 行）与它的 README。README 写得比源码还细，但它是文档不是实现——本文引用它的每一处都在源码里对过。另读了 `core/tools` 的 `ToolDefinition` 与 `tools/pre-execute` 契约。
:::

::: claude 压缩源码 + 实机
`claude.exe`（2.1.247）里 grep 出的配置 schema、标识符与完整英文文案，加上实机跑的 `claude mcp --help` 与各子命令帮助。*可用的是标识符与原文，不可用的是控制流*——单字母变量读不出分支。
:::

三家的证据档次不齐，所以本文的每一条都尽量落到**可引用的原文或可执行的命令**上：codex 与 dsh 引函数名与行为，Claude Code 引它自己写的英文句子与 `--help` 输出。凡是只能从「没搜到」推出来的，都在 `06` 里单独列了。

::: info
本篇是**全新一轮阅读**。此前三份实现细节里几乎没有 MCP——写扩展面那一轮只确认了「它撑得起单独一份」，没读任何一行 MCP 代码。
:::

## 十个决策点

按一个 server 从进门到被调用的顺序排。每一维给三家各一段，末尾一句判断：同构还是分岔。

### ① 一个 server 从哪儿进来 <Badge type="warning" text="分岔" />

谁有资格往会话里塞一台 server？这个问题的答案决定了后面所有安全讨论的起点。

- **Claude Code**：四类来源 × 三个作用域，项目级的那一档**要先批准才连**
- **codex**：`config.toml` 的一节，外加插件可以带自己的一组
- **dsh**：没有「MCP 配置」这回事——一台 server 就是一行插件实例

<small>Claude Code</small> `claude mcp add -s local|user|project` 三个作用域；project 落进仓库里的 `.mcp.json`，而这一档**默认不连**——`claude mcp list` 的帮助原文写着「Unapproved `.mcp.json` servers are shown as ⏸ Pending approval and not connected to」。批准结果写进 `enabledMcpjsonServers`，拒绝写进 `disabledMcpjsonServers`，`enableAllProjectMcpServers` 一次全批，`claude mcp reset-project-choices` 全部清空重来。除这三档外还有三条路：插件带的、`--mcp-config` 侧载的、claude.ai 连接器（在工具表里显示成 `mcp__<id>__<tool>` 这种不透明 id），以及 SDK 进程内的 `type: "sdk"`。

<small>codex</small> `~/.codex/config.toml` 里的 `[mcp_servers.<name>]`，一节里能配十七个字段。多一个别家没有的维度：`environment_id`（默认 `"local"`）——一台 server 可以不属于本机，而属于某个 executor 拥有的远端环境，它的 OAuth 凭证名也因此要跟本地档隔开。插件同样能带 `mcp_servers`，与 skills 平级。

<small>dsh</small> 没有为 MCP 开任何特例。一台 server 就是 `cordis.yml` 里的一行 `name: '@deepseek-ai/dsh-mcp-client'`，`serverName` 是它的一个 config 字段。要接两台就写两行——「一个插件实例连一台 server」是它写在模块头注释里的硬约定。

::: tip 判断
三家在「MCP 是什么」上第一次分岔：Claude Code 当它是**一类有作用域和批准状态的配置项**，codex 当它是**配置文件里的一节**，dsh 当它是**一个普通插件**。只有 Claude Code 认真处理了「仓库里带来的 server」这个威胁面——因为只有它默认在别人的仓库里跑。
:::

### ② 企业能不能管住它 <Badge type="tip" text="两家同构" />

管理员能不能规定「这台机器上只准连这几台 server」？规定错了会发生什么？

- **Claude Code**：allow/deny 两张清单 + 一个能**独占接管**的企业配置文件
- **codex**：三种匹配器的 requirements，一旦设了就是 default-deny
- **dsh**：没有。谁能改 `cordis.yml` 谁说了算

<small>Claude Code</small> 托管设置里有 `allowedMcpServers` 与 `deniedMcpServers`，语义写在 schema 的 describe 里：「If undefined, all servers are allowed. If empty array, no servers are allowed. Denylist takes precedence — if a server is on both lists, it is denied.」再加一个 `allowManagedMcpServersOnly`：开了之后 allowlist 只从托管设置读，但 denylist 仍然从所有来源合并——*用户可以为自己多禁几台，不能为自己多开一台*。最硬的一档是 `managed-mcp.json`：它一存在就「has exclusive control over MCP servers」，其余来源全部被忽略，日志里会逐条说明为什么。

> "allowedMcpServers" was present but invalid; enforcing an empty allowlist (no MCP servers admitted) until it is fixed.

这句是 Claude Code 自己的诊断文案：**清单写坏了不是回退到放行，是收紧到全禁**。对应的 denylist 那句相反——写坏了就丢掉，并明说「its entries cannot be enforced until it is fixed」。两句合起来才是一个完整的 fail-closed：allowlist 坏 → 更严，denylist 坏 → 承认自己更松了。

<small>codex</small> `mcp_servers` requirements 有三种匹配器：`Identity`（命令或 URL 全等）、`Command`（可执行文件全等 + 参数逐个按 exact / prefix / regex 匹配，且个数必须相同）、`Url`（同三种）。正则一律锚定成全值匹配 `\A(?:…)\z`，在加载时就编译校验一次，编译不过直接报配置错。执行方式是 default-deny：`filter_mcp_servers_by_requirements` 遍历所有已配置的 server，不在清单里或匹配不上的一律 `enabled = false` 并挂上 `disabled_reason`——*而那个 reason 带着它来自哪个来源*（MDM、企业托管、系统 requirements 文件），所以 TUI 能告诉用户「这台是被谁禁的」。插件带的 MCP 另走一份 `plugins.<name>.mcp_servers`。

<small>dsh</small> 没有管理员这个角色，这一维在它那里不存在。配置就是一个 YAML 文件，能改文件的人就能加 server；能加 server 就能加任意工具。

::: tip 判断
**两家撞出同一个答案，值得当定论**：① 允许清单以「按启动命令或 URL 匹配」为准，不能只按 server 名字——名字是本地的，可以随便改；② 清单一旦存在就 default-deny；③ 清单自己出错时向严的方向倒。三条都不是显然的，两家独立走到一起。
:::

### ③ 起不来怎么办 <Badge type="warning" text="分岔" />

第一次连一台 `npx` 拉起来的 server 可能要三十秒。这三十秒里模型该干什么？

- **Claude Code**：不等。七档状态 + 一把让模型自己去等的工具
- **codex**：`required` 的必须等到，其余给 1 秒宽限就走
- **dsh**：一定等完 `listTools()`，但失败默认**不算失败**

<small>codex</small> `required = true` 的 server 起不来，`codex exec` 直接退出——`validate_required_servers` 会把所有必需 server 的失败**合并成一条错误**（而不是撞到第一个就返回），因为一次性告诉你三台都没起来比让你修三轮强。其余 server 是尽力而为：`OPTIONAL_MCP_STARTUP_GRACE` 是 *1 秒*，到点还没起来的就从这一轮的工具表里略过，日志写一句「omitting pending optional MCP server」。每台 server 可以自己配 `startup_timeout_sec`，而超时的报错文案直接把要写的配置片段贴给你：

> MCP client for \`x\` timed out after 10 seconds. Add or adjust \`startup_timeout_sec\` in your config.toml:<br>[mcp_servers.x]<br>startup_timeout_sec = XX

还有一条更彻底的：**有缓存的 server 可以根本不连**。`startup_is_dormant() && has_cached_tools()` 成立时，必需性校验直接跳过它，工具照样出现在模型的工具表里，等到真被调用时才建立连接。

<small>Claude Code</small> 同一条路走得更远。server 有**七档状态**：`connected` / `cached` / `failed` / `pending` / `needs-auth` / `disabled` / `unconfigured`，`WaitForMcpServers` 这把工具把七档原样报给模型，措辞是给模型读的：

> Cached (their tools are available now; connects on first call): …<br> Still connecting (try again or proceed without): …<br> Needs authentication (ask the user to run /mcp): …

也就是说启动完全不阻塞第一轮，*「等不等」这个决定被交给了模型*。ToolSearch 找不到工具时也会补一句「Some MCP servers are still connecting … try searching again」。

<small>dsh</small> 相反的取舍：`apply()` 里 `await connection.ready`，插件激活之前一定跑完连接 + `listTools()` + 逐个 `ctx.tools.register()`，所以「组合体开始第一轮时工具一定齐了」是它的硬保证。代价是启动串在那儿。但失败的默认相当松：`failOnStartupError` 默认 **false**——连不上就记一条日志、激活成功、这台 server 零个工具；设成 true 才会让 Cordis 回滚整个插件实例。

::: tip 判断
三家分的是同一个取舍的三个点：**拿启动时间换工具表的确定性**。dsh 全买（等到齐），codex 买一部分（必需的等、其余 1 秒），Claude Code 完全不买（工具后到，模型自己处理）。注意 codex 与 Claude Code 都独立做了「缓存工具表 + 首次调用才连」——这是两家同时到达的一个非显然优化，本仓的 `ToolProvider.list()` 目前没有对应物。
:::

### ④ 连上之后掉了怎么办 <Badge type="warning" text="分岔" />

server 崩了。它那十把工具还留在模型的工具表里吗？谁负责把它拉回来？

- **Claude Code**：给模型发一条「别再搜这些工具了」的系统消息
- **codex**：下一次列工具时顺手重连，没有独立的重连循环
- **dsh**：唯一一家把重连写成有预算的状态机

<small>dsh</small> 指数退避 500ms 起、每次失败翻倍、上限 30s，`maxAttempts: 10`。关键设计在「一次 outage 共用一份预算」——*连上并活过 `maxDelayMs` 才算这次 outage 结束*，预算才重置。模块头注释把理由写清楚了：一个「连上就崩」的服务，如果按「连上即重置」算，会永远重启下去；按「活过稳定窗口才重置」算，它照样会耗尽那 10 次。预算耗尽后注销这台 server 的全部工具、彻底停，只有 HMR 或重启能回来。掉线期间**上一代工具仍然注册着**，调用会失败——README 把这一条明写成「the manual-recovery behavior」，不是遗漏。

<small>codex</small> 没有独立的重连循环。`reconnect_failed_startup()` 挂在每次列工具的路径上——催化剂是「有人来要工具表」，不是定时器。这跟它的 dormant + 缓存设计是一套：连接本来就是按需建立的，那么「重连」和「首次连」就没有区别。

<small>Claude Code</small> `/mcp reconnect` 手动重连，另有一个 `mcp_reconnect_identity_changed`——连接进行中账号变了就取消这次重连。它多做的一件事是**把状态变化说给模型听**：

> … deferred tools are no longer available (MCP server disconnected): …Do not search for them — `ToolSearch` will return no match.

重连成功之后再把名字宣告一遍，措辞是「MCP server reconnected — names announced earlier in this conversation … Load via ToolSearch as before」。这是延迟加载带来的连带责任：工具不在工具表里，模型只能靠对话里的名字去搜，那么名字什么时候作废就必须显式告诉它。

::: tip 判断
只有 dsh 把重连当成一个独立的、有终止条件的状态机来写。另外两家把它挂在别的动作上——这不是省事，是它们的工具表本来就是**按次重建**的，而 dsh 的工具是**一次注册长期存在**的。谁需要重连状态机，取决于工具表是快照还是长驻。本仓的 `list(ctx)` 是按次调用的，靠近前者。
:::

### ⑤ 名字归谁 <Badge type="tip" text="同构" />

两台 server 都有一把叫 `search` 的工具。模型看到的是什么？

- **Claude Code**：`mcp__<server>__<tool>`，且这个名字就是权限规则的匹配对象
- **codex**：同形状。冲突时按原始身份的 SHA-1 加后缀
- **dsh**：同形状。冲突靠结构禁止，哈希只在归一化有损时用

三家独立收敛到同一个字符串：`mcp__<serverName>__<rawName>`。dsh 的 README 甚至直接写明这是刻意对齐的——「the same server-qualified shape Claude Code and Codex use」。三家也都坚持同一条不变量：**发回给 server 的永远是 raw name，模型看到的名字从不回解析**。

<small>codex</small> 命名空间与工具名分成两截（`callable_namespace` / `callable_name`），冲突检测跑两遍：先看命名空间撞不撞，再看命名空间内的工具名撞不撞。撞了就把「原始身份」（server 名 `\0` 命名空间 `\0` connector id `\0` 工具名）做 SHA-1，取前 12 位十六进制当后缀。总长度上限 128 字节，超了就先截断名字再贴哈希，实在放不下就截命名空间。最后还有一个 `used_names` 集合兜底，带着 attempt 计数重算哈希直到唯一——*三层保险*。另外 `mcp__` 前缀现在是可关的：feature flag `NonPrefixedMcpToolNames`，或者用 `non_prefixed_mcp_tool_servers` 逐 server 豁免。

<small>dsh</small> 预算 64 字符（DeepSeek 的函数名合同），SHA-256 前 12 位，但触发条件不同：**只在归一化有损时才加哈希**——即替换了非法字符或发生了截断。它不靠哈希去重，靠结构不让冲突发生：

- `serverName` 在活着的实例之间全局唯一，重复的那个实例**加载即失败**并给出可执行的错误话术。
- 一台 server 在 `tools/list` 里列了两个同名工具，整份工具表判非法。
- 外部注册占了本 server 的命名空间，**整代回滚**——不留半套，并大声报错。

<small>Claude Code</small> 同形状，多一件事：*这个名字是权限系统的第一等公民*。规则里可以写 `mcp__*`、`mcp__<server>__*`（二进制里有 `isServerLevelDisallowed` 这个判定），也可以精确到单把工具。SDK 侧另有 `CLAUDE_AGENT_SDK_MCP_NO_PREFIX` 可以整个去掉前缀。

::: tip 判断
**本篇最干净的一处同构，可以当定论直接用**。但去重策略分成两派，各有代价：*哈希兜底*（codex）永远能生成一个名字，代价是模型看到 `foo_a1b2c3d4e5f6` 这种名字；*结构禁止*（dsh）名字永远可读，代价是配置错了直接起不来。本仓两条路都能走，但选哪条要跟「工具表出错时 Run 是否继续」的口径一致。
:::

### ⑥ 它的工具怎么进模型视野 <Badge type="warning" text="分岔" />

接三台 server 可能是四十把工具。全部塞进上下文，还是让模型自己找？

- **Claude Code**：默认**不进**——藏在 ToolSearch 后面，server 可以申请常驻
- **codex**：按 `_meta.ui.visibility` 过滤，另有白/黑名单
- **dsh**：全量注册，没有可见性这一层

<small>Claude Code</small> MCP 工具默认是 deferred 的：不在工具表里，模型要靠 `ToolSearch` 找。server 有两个私有 `_meta` 键可以影响这件事：`anthropic/alwaysLoad` 要求这把工具常驻，`anthropic/searchHint` 给检索加提示词。还有一层别家没有的兜底——**inputSchema 过不了 Anthropic API 校验的工具会被单独丢掉**：

> Tool "x": its input schema would be rejected by the Anthropic API (…). Other tools from this server remain available.

一把工具的 schema 有问题，坏的只是那一把，不是整台 server。此外还有两个 `_meta` 键落在别处：`anthropic/maxResultSizeChars`（结果截断预算）与 `anthropic/requiresUserInteraction`（后者会把这把工具推进必问审批那一档，见 ⑦）。

<small>codex</small> 按 MCP ext-apps 规范读 `_meta.ui.visibility`：没有这个字段的工具默认可见，有这个字段但不含 `"model"` 的**不进模型的工具表**——但 binding 里仍然保留着它的调用句柄，也就是「界面能用、模型看不见」。另有逐 server 的 `enabled_tools`（白名单）与 `disabled_tools`（黑名单），语义写在类型注释里：白名单先筛，黑名单后减。

codex 在这一维还多一件三家里独一份的事：**工具表带版本号**。每次目录变化 `tool_catalog_revision` 加一，而每一次调用都是按某个 revision *预备*好的；真正发出去之前会再对一次版本，对不上就直接拒：

> tool call rejected because the catalog changed after \`server/tool\` was prepared

<small>dsh</small> 全量注册到 `ctx.tools`，没有可见性过滤、没有延迟加载。它在这一维处理的是另一件事：`outputSchema` 里出现它不支持的 JSON Schema 词汇时，退回无约束的 `JsonValue`，而不是拒绝这把工具。

::: tip 判断
分岔的根源不在 MCP，在各家的上下文预算策略：Claude Code 有 ToolSearch 这层地基，MCP 工具就顺理成章地成了它的第一批住户。**本仓没有这层地基**——`AgentDefinition.tools` 的 `ToolSelector` 是装配期一次性选定的，没有「运行期按需加载工具」这个概念。接 MCP 时这会立刻变成一个真实约束。
:::

### ⑦ 谁来判它有多危险 <Badge type="warning" text="三家全分" />

协议里有三个自我声明字段。填它们的是 server 自己。这句话客户端信几分？

- **Claude Code**：读，但默认取假；真正的闸是按名字写的权限规则
- **codex**：照单全收——`readOnlyHint: true` 直接免审批
- **dsh**：不判。把这个位置留成一个你自己挂的监听器

<small>codex</small> `requires_mcp_tool_approval` 这个函数是全篇最值得逐行读的十行：

- `destructiveHint == true` → 要审批，立即返回。
- `readOnlyHint == true` → **不要审批**，立即返回。
- 两个都没说 → `destructive_hint.unwrap_or(true) || open_world_hint.unwrap_or(true)`，也就是**默认要审批**。

第二条是关键：*一台 server 只要在 `tools/list` 里给自己填上 `readOnlyHint: true`，它的工具就不再弹审批*。上面还叠了四档可配模式（`auto` 按上面这套判 / `prompt` 一律问 / `writes` 只放只读 / `approve` 一律放），可以逐 server 配也可以逐工具配，合并时按「两种策略取更严的那个」的表来算。

但 codex 有一处很讲究的自我防卫：从缓存里取出来的工具表，在交给模型之前会把 `annotations.read_only_hint` **抹成 `None`**。理由顺着上面那三条就能推出来——抹成 None 之后第二条不再命中，第三条的 `unwrap_or(true)` 接管，结果是要审批。*缓存里那句「我是只读」不算数*：它是上次连接时说的，这次连都没连。

<small>Claude Code</small> 同样读这三个字段，但默认反过来：`isReadOnly()` 和 `isConcurrencySafe()` 都是 `annotations?.readOnlyHint ?? false`——没说就当不是只读、不能并发。而真正决定弹不弹审批的不是这三个字段，是按 `mcp__<server>__<tool>` 写的 allow / deny / ask 规则，加上 `anthropic/requiresUserInteraction` 这个 `_meta` 键——标了它的工具即使有 allow 规则命中也照样走交互。

它对第一方 MCP 还多一层，那一层的写法值得抄：本地有一张硬编码的 `{ readOnly, destructive }` 表，与 server 的声明**取交集**——只读要两边都说只读（`&&`），危险只要有一边说危险就是危险（`||`）。结果是：*server 只能把自己说得更危险，不能说得更安全*。

<small>dsh</small> MCP 桥里没有 risk / approval / permission 任何一个概念——不是遗漏，是分层。dsh 的审批是 `tools/pre-execute` 这个 waterfall 事件上的一个监听器，返回 `allow` / `deny` / `ask`，而 `next()`（不表态）等于 allow。bash 工具是自己在实现里调 `ctx.approval.request()` 的。所以结论是准确的但要说全：**出厂状态下经 MCP 进来的工具走 allow**，除非部署方自己挂一个盯着 `mcp__*` 的 `tools/pre-execute` 监听器。这个位置是留出来的，只是出厂不挂。

<figure class="diagram">
<!--@include: ./figures/mcp-1.svg-->
<figcaption>同一句自我声明，三条命运。codex 那条线上没有任何一处把这句话降级；Claude Code 只允许它往严的方向走；dsh 干脆不让它参与决策。</figcaption>
</figure>

::: tip 判断
**这是本篇唯一一处本仓不能照抄的维度，而且本仓已经有答案了。**`ToolProvider.assessRisk(call, ctx)` 是*逐次调用、由平台判*的，`ToolSpec.minRisk` / `maxRisk` 只是静态上下界；`§5.2` 那条「`risk` 判不了参数一律向上取整按最坏处理」在 MCP 上恒成立——因为对一把陌生工具的参数，本仓永远判不出来。结论直接推出来：**经 MCP 进来的工具在本仓不可能落进「自动放行」那一档**，除非有人为某台 server 显式配置。codex 那条 `readOnlyHint: true → 免审批` 与本仓的红线正面冲突。
:::

### ⑧ 凭证怎么给它 <Badge type="warning" text="分岔" />

一台远端 server 要授权。token 从哪来、存哪儿、由谁刷新？

- **Claude Code**：`mcp login` + 配置里的 `mcpOAuth`，另有 needs-auth 缓存
- **codex**：完整 OAuth 栈：动态注册、刷新锁、RFC 8707、钥匙串
- **dsh**：没有 OAuth。但唯一一家**洗过子进程环境变量**

<small>codex</small> `rmcp-client/` 里 OAuth 相关的代码超过 4000 行：授权服务器发现、动态客户端注册、刷新锁（`refresh_lock.rs` / `refresh_transaction.rs`，防并发刷新把 refresh token 用废）、RFC 8707 的 `resource` 参数、可配 `client_id` 与固定 `callback_port`（给那些要预注册 redirect URI 的 provider）。凭证进系统钥匙串还是文件由 `mcp_oauth_credentials_store_mode` 定。CLI 面是 `codex mcp login/logout`。

非 OAuth 的路子也铺了三条，而且每条都刻意不让密钥进配置文件：`bearer_token_env_var` 存的是**环境变量名**（注释原话：the actual secret value must be provided via the environment），`env_http_headers` 同理，还有一个 `http_headers_helper` 可以跑本地命令算出动态 header——*连它的注释都在劝退*：「The command may be visible to local process inspection; do not embed credentials.」最后一档是 `auth = "chatgpt"`：把当前 ChatGPT 会话直接借给 server，但有两道闸——必须是可信第一方来源，且必须是本地环境。

<small>Claude Code</small> `claude mcp login`，带 `--client-id` / `--client-secret`（从 `MCP_CLIENT_SECRET` 环境变量读，或交互输入）/ `--callback-port`，还有 `--no-browser` 给 SSH 会话用（打印授权 URL、粘回重定向 URL）。token 落在配置的 `mcpOAuth` 段，按 server 存 accessToken / refreshToken / expiresAt / scope。另有一个 `mcp-needs-auth-cache.json`——记住哪台需要登录，省得每次启动都去撞一次 401。

<small>dsh</small> 没有 OAuth。stdio 就是 `env`，HTTP 就是 `headers`，两者的值在 YAML 里用 `!!js process.env.X` 取。但它做了一件另外两家都没做的事：**stdio 子进程拿到的环境是洗过的**——`scrubbedParentEnv()` 会去掉名字看起来像凭证的变量和所有 `DSH_*`，然后才叠上你显式给的那几个。`examples/mcp-memory` 的 README 把这条明写进了使用建议：某个可选功能需要另一个密钥，就往这一行的 `config.env` 加变量名，别把密钥写进 YAML。

::: tip 判断
三家的差距在这一维最容易被误读成「成熟度」。其实是场景差异：codex 与 Claude Code 都要接**面向公众的托管 server**（GitHub、Sentry、自家连接器），OAuth 是必需品；dsh 面向的是「你自己跑的 server」，环境变量够用。*但 dsh 的 env 洗白是普适的*——那是一条与场景无关的默认，另外两家反而没做。
:::

### ⑨ server 能反过来要求什么 <Badge type="warning" text="递减线" />

MCP 不是单向的。server 能问用户问题吗？能读你的目录吗？能借你的模型吗？

- **Claude Code**：全开：问用户、借模型、要目录、订阅资源、注入提示词
- **codex**：只开一扇：问用户（elicitation）
- **dsh**：`{ capabilities: {} }`——一扇都不开

<small>Claude Code</small> 它的客户端把 MCP 的反向通道基本开满了：

- `elicitation/create`，而且有**两种模式**：`form`（表单）与 `url`（把用户送去一个网页完成）。
- `sampling/createMessage`——*server 可以借用你的模型跑一次推理*。
- `roots/list` + `notifications/roots/list_changed`——server 能拿到你的工作目录清单（有一条诊断说明某个 staging root 会被从中略去）。
- `resources/subscribe` + `notifications/resources/updated`——资源级订阅。
- `prompts/list` / `prompts/get`，MCP prompt 直接变成斜杠命令；`prompts/list_changed` 会触发刷新，刷新失败则「keeping previous commands」。
- server instructions **进提示词**。

最后一条还有个尾巴：那段 instructions 以及工具描述、参数描述、检索提示，都可以被一份**远端下发的 override** 改写（`tengu_official_plugin_prompt_overrides`，按 server 名分别覆盖，schema 校验不过就退回内置文案）。也就是说「模型看到的关于这台 server 的说明」有三个可能的作者：server、Anthropic、以及内置文案。

<small>codex</small> 它的 `ClientHandler` 实现里只覆盖了 `create_elicitation` 一个请求方法，外加几个通知处理器（cancelled / progress / logging / resource_updated）；`create_message` 与 `list_roots` 没有覆盖，走 rmcp 的默认（等于不支持）。elicitation 这一扇也不是白开的：它接进了 codex 自己的审批体系——`mcp_permission_prompt_is_auto_approved` 决定这次问答是弹给用户还是自动答复，还有一条 strict auto-review 的拒绝话术：

> Automated review of this operation failed. Do not proceed without asking the user for explicit approval.

资源它读得了（`list_resources` / `read_resource`），但不订阅；prompts 不接；server instructions 不进提示词，只当**命名空间的描述**——也就是模型在延迟加载的工具列表里看到的那句「这一组工具是干什么的」。

<small>dsh</small> `new Client({ name: 'dsh-mcp-client', … }, { capabilities: {} })`——客户端能力声明是空对象，一扇门都不开。instructions 读都不读。它对 MCP 的定位很明确：**一个只出不进的工具进货渠道**。

::: tip 判断
这一维是三家差距最大的地方，而且差距的方向和「谁更完整」无关，和**信任模型**有关。`sampling/createMessage` 尤其值得单独标出来：它让一个第三方进程能触发你的模型调用，花你的 token、进你的对话历史。本仓要接 MCP 时，这一扇门的默认必须是*关*——它同时撞 `§9.6` 的预算归属和 `§13` 的注入面。
:::

### ⑩ 自己当 server 吗 <Badge type="warning" text="两做一不做" />

反过来：让别人把你当成一把工具调用。

- **Claude Code**：`claude mcp serve`，一个子命令
- **codex**：有，但文件第一行自称 Prototype
- **dsh**：显式拒绝：ACP 那侧收到 `mcpServers` 直接报参数非法

<small>codex</small> `codex-rs/mcp-server` 的头注释就一句：`//! Prototype MCP server.` 它对外暴露一把 `codex` 工具，入参是 prompt + model + cwd + approval_policy + sandbox + 一份能覆盖 `config.toml` 的 config 对象。有意思的是审批怎么走——它**用 elicitation 反向问回调用方**（`ExecApprovalElicitRequestParams` / `PatchApprovalElicitRequestParams`）。也就是说 ⑨ 里那扇它只开了一半的门，在自己当 server 时是它唯一的审批通道。

<small>Claude Code</small> `claude mcp serve` 直接起，帮助里只有 `--debug` / `--verbose` 两个开关。

<small>dsh</small> 不做，而且是显式拒绝的：它作为 ACP agent 时，客户端在 `session/new` 里传 `mcpServers` 会被 `throw invalidParams('mcpServers is not supported')` 顶回去——*不接受由调用方指定的 MCP server*。

::: tip 判断
本仓与 dsh 同侧，而且是明写过的：`路线图 §15.3`「MCP **服务器**（我们对外提供工具）不做。但 MCP **客户端**（接第三方工具）要做」。这一维读完不需要改这个决定——但 dsh 那条 `invalidParams` 提醒了一件本仓还没想过的事：*「不做 server」和「不接受别人指定 server」是两件事*，后者是一条要主动写出来的拒绝。
:::

## 分岔汇总

第四列是本仓——「现状」指今天的契约与文档已经定了的，「待定」指接 MCP 时必须现场回答的。

| 决策点 | Claude Code | codex | dsh | 本仓 |
| --- | --- | --- | --- | --- |
| ① 从哪儿进来 | 四类来源 × 三作用域；`.mcp.json` 要批准 | `config.toml` 一节 + 插件带的；有 environment 概念 | 一行插件实例，无特例 | 待定。作用域至少要与 `AgentDefinition` 对齐 |
| ② 企业管控 | allow/deny + 独占接管；清单坏了收紧 | 三种匹配器，default-deny，带禁用来源 | 无 | 待定（M2 安全基线）。两家同构可直接采 |
| ③ 起不来 | 不等，七档状态交给模型 | required 必等，其余 1 秒宽限 | 等到齐，但失败默认不算失败 | 待定。`list()` 是按次调用的，偏「不等」那派 |
| ④ 掉线 | 手动重连 + 告知模型名字作废 | 列工具时顺手重连 | 有预算的退避状态机 | 待定 |
| ⑤ 命名 | `mcp__s__t`，权限规则认这个名字 | 同左；冲突 SHA-1 后缀，128 字节上限 | 同左；结构禁止冲突，64 字符上限 | 现状可直接用：`ToolSelector` 按 provider + name 选 |
| ⑥ 进模型视野 | 默认 deferred；坏 schema 只丢那一把 | 按 `_meta.ui.visibility`；工具表带 revision | 全量注册 | 现状：装配期一次选定，无运行期加载 |
| ⑦ 谁判风险 | 读 annotations 但默认取假；闸在权限规则 | server 说了算；`readOnlyHint` 直接免审批 | 不判，留成 `pre-execute` 监听器 | 现状且不改：`assessRisk` 逐次调用由平台判 |
| ⑧ 凭证 | `mcp login` + `mcpOAuth` + needs-auth 缓存 | 完整 OAuth 栈 + 钥匙串 + 三种非 OAuth 通道 | env / headers；子进程环境洗白 | 现状有更强的形状：`CredentialGrant` 按次下发（§5.3） |
| ⑨ 反向能力 | elicitation + sampling + roots + 订阅 + prompts | 只有 elicitation | 零 | 待定。sampling 默认必须关 |
| ⑩ 自己当 server | `claude mcp serve` | 有，自称 prototype | 不做且显式拒收 | 现状：§15.3 明写不做 |

## 对本仓意味着什么

### 三条不用再想的 <Badge type="tip" text="同构 · 可当定论" />

- **模型可见名一律 `mcp__<server>__<tool>`，raw name 只上线不上屏**。三家独立收敛，没有第二种形状值得考虑。
- **企业允许清单按启动命令 / URL 匹配，不按 server 名**。名字是本地的、可以随便改；两家都走了这条，而且都是 default-deny。
- **一台 server 的失败不该掀翻会话**。三家都做了降级，只是档次不同（略过 / 零工具 / 报状态）。本仓 `ToolProvider.list()` 抛异常今天会怎样，是接 MCP 之前要先确认的一件事。

### ToolSpec 有七个字段，`tools/list` 一个都不给 <Badge type="warning" text="本仓没有 · 补不补是决策" />

这是全篇对本仓最直接的一条。`ToolSpec` 上必填的是：`minRisk` / `maxRisk` / `reconcilable` / `declaresResourceClaims` / `timeoutMs`，可选的还有 `idempotency` / `parallelSafe` / `scopes`。MCP 给的只有 name / description / inputSchema，加三个可选的自我声明。

这几个字段被写成必填是有案底的：`timeoutMs` 那条注释里写着「默认不生效的防线」这笔学费本仓付过一次，字段声明了两个里程碑而执行路径上没人读它。所以桥接 MCP 时**不能给默认值糊过去**，只能给一组诚实的最坏值：

- `maxRisk` 取最高档，`minRisk` 跟着走——因为陌生工具的参数判不出来（§5.2）。
- `declaresResourceClaims: false`——它是子进程或远端服务，边界对它无效，和 `bash` 同一档。
- `reconcilable: false`——MCP 协议里*没有幂等键这个概念*，也没有「按键反查这次到底成没成」的方法。
- `timeoutMs` 由我们定，不由 server 定；三家的默认分别是 60 秒（dsh）与逐 server 可配（codex）。

第三条要单独说：**不变量 6 的第三段（幂等执行）在 MCP 上没有对应物**。这不是本仓的缺口，是协议的。写清楚它比补一个假的对账接口重要。

### 工具表在一次 Run 中途变了，本仓没有说法 <Badge type="warning" text="本仓没有 · 补不补是决策" />

MCP 有 `notifications/tools/list_changed`，三家都接了它。本仓的 `list(ctx)` 是按次调用的，形状上兼容——但「模型基于旧工具表发出的调用，在新工具表下还算不算数」这件事没有定义。codex 的答案是现成的：**工具表带 revision，调用按 revision 预备，对不上就拒**，错误话术都写好了。这条落进本仓要动的是 `ToolInvocation` 那一段，属于契约面变更，按 `§7.3` 走。

### 三个必须自己拍的 <Badge type="warning" text="三家分歧 · 要自己判" />

- **谁判风险——本仓已有答案，不要改。**`assessRisk` 逐次调用由平台判，是三家之外的第四种做法，而且它恰好是唯一一种不把决策权交出去的。codex 那条 `readOnlyHint: true → 免审批` 与本仓红线正面冲突，照抄等于让第三方 server 自己决定要不要过审批。*唯一可借鉴的是 Claude Code 的取交集写法*：server 的声明只能让风险**变高**，不能变低。
- **反向能力开到哪**。elicitation 与本仓的 `waiting_input` 形状接近，可以考虑；`sampling/createMessage` 默认必须关——它让第三方进程花本仓的 token、写本仓的对话历史，同时撞 §9.6 与 §13。`roots/list` 是把工作区结构交出去，同样默认关。
- **起不来阻不阻塞**。本仓是 server 侧、Run 是持久对象，与三家的 CLI 场景不同：一个 Run 可能在 server 起不来的时候恢复。「required」这个语义要落在 `AgentDefinition` 上（这个 Agent 少了这台 server 就不该跑）还是落在装配上，是接 MCP 时的第一个设计题。

### 两条不属于 MCP 但值得记的 <Badge type="info" text="顺手捡到的" />

- **子进程环境要洗**。dsh 的 `scrubbedParentEnv()` 在拉起任何 stdio server 之前去掉名字像凭证的变量和所有自家前缀变量。这与 MCP 无关，是所有「拉子进程」的默认。本仓的 `bash` 工具值得对一遍。
- **dsh 把「记忆」整个外包给了 MCP。**`examples/mcp-memory` 是三份默认关闭的配置，各接一个第三方记忆服务，README 明确划界：DSH 不下载、不初始化、不选模型、不迁移数据，只负责拉起进程和暴露工具。这解释了此前那个悬着的分岔——dsh 的包分组里没有记忆包，*不是它不做记忆，是它认为记忆不该是 harness 的一部分*。

## 证据档次与明确没核到的

**档次不齐，引用时要分开看**。codex 与 dsh 的每一条都能回到具体文件与函数；Claude Code 的结论来自二进制里的完整英文原文（配置 schema 的 `describe`、诊断文案、工具说明）与实机 `--help`——*标识符和文案是原文，控制流不是*。凡是写「Claude Code 会……」的地方，依据都是它自己写给用户或写给模型的那句话，不是我读出来的分支。

**明确没核到的：**

- codex 的 `connectors` crate 与 `codex_apps` 那条第一方路径，只读了它与普通 MCP 分岔的地方（命名归一化、缓存、硬刷新），没读 `AppToolPolicyEvaluator` 自己的策略评估。
- codex 的 `mcp_skill_dependencies.rs`——skill 声明 MCP 依赖并提示安装。只见到文件名和它构造 `McpServerConfig` 的两处，没读逻辑。
- codex 给 server 注入沙箱状态那条（`codex/sandbox-state-meta` 能力协商，把 permission profile 和 sandbox cwd 塞进 `_meta` 交给 server 自己执行）——读到了注入的那一段，**没核 server 侧到底怎么用它**，所以本文没把它当成一条结论写进十维。这可能是三家里最特别的一个设计，值得单开一次。
- Claude Code 的 `subscriptions/listen` 与 `tasks/*` 只见到方法名与两条超时文案；缓存的工具表存在哪个文件没找到（本机没有配置任何 MCP server，无法从落盘文件反推）。
- dsh 的 `tools.ts` 只逐行读了命名与调用两段，图片批次准入 / 附件持久化那一段只读了 README 的描述。
- 三家的 MCP 服务端一侧都只读了入口与工具定义，没读实现。

**一处需要说明的负向判断。**「codex 不支持 sampling 和 roots」这条不是靠 grep 零命中得出的：它的反向能力全部收在 `rmcp-client` 的 `ClientHandler` 实现里（`logging_client_handler.rs`），那个 impl 里只有 `create_elicitation` 一个请求方法被覆盖，其余走 SDK 默认。读的是那个文件本身，不是搜索结果。

## 落点索引

#### codex · codex-rs/

- `codex-mcp/src/connection_manager.rs` — 连接集合、复用判定、OAuth 凭证变化时的重建
- `codex-mcp/src/connection_manager/required.rs` — 必需 server 的合并式失败报告
- `codex-mcp/src/connection_manager/startup.rs` — 启动失败话术、超时提示、ChatGPT auth 的两道闸
- `codex-mcp/src/connection_manager/tool_catalog.rs` — `tool_is_model_visible`、1 秒宽限、缓存工具剥离 `read_only_hint`
- `codex-mcp/src/tools.rs` — 命名归一化、冲突哈希、128 字节预算、白/黑名单
- `codex-mcp/src/binding.rs` — `PreparedMcpCall` 与 catalog revision 校验
- `codex-mcp/src/mcp/mod.rs` — `McpConfig` 全字段、审批自动通过判定
- `config/src/mcp_types.rs` — server 配置十七字段、两种传输、四档审批模式
- `config/src/mcp_requirements.rs` + `core/src/config/mod.rs` — 三种匹配器与 default-deny 执行点
- `core/src/mcp_tool_call.rs` — `requires_mcp_tool_approval`、沙箱状态注入
- `rmcp-client/src/logging_client_handler.rs` — 客户端反向能力的全部实现面
- `rmcp-client/src/protocol_mode.rs` — 2025-06-18 与 2026-07-28 两档协议版本
- `mcp-server/src/` — 自己当 server 的那一侧（`lib.rs` 头注释一句话定性）

#### deepseek-harness · packages/

- `mcp/mcp-client/README.md` — 行为契约写得比源码细，但要与源码对读
- `mcp/mcp-client/src/index.ts` — 配置 schema、命名空间预留、启动阻塞语义
- `mcp/mcp-client/src/connection.ts` — 重连预算状态机、稳定窗口重置
- `mcp/mcp-client/src/tools.ts` — `publicToolName`、结果映射、outputSchema 退化
- `mcp/mcp-client/src/transport.ts` — `scrubbedParentEnv()` 的用法
- `core/tools/src/index.ts` — `tools/pre-execute` 的三态决策与「不表态即放行」
- `acp/acp/src/index.ts` — 拒收调用方指定的 `mcpServers`
- `../examples/mcp-memory/` — 把记忆整个外包给 MCP 的三份配置与划界说明

#### Claude Code · 实机与二进制

- `claude mcp --help` / `add` / `login` / `serve` — 作用域、传输、OAuth 参数、批准状态话术
- `bin/claude.exe` — `allowedMcpServers` / `deniedMcpServers` / `allowManagedMcpServersOnly` 的 schema describe
- `bin/claude.exe` — `managed-mcp.json` 独占接管、`disableSideloadFlags`、Remote Control 会话的启动配置约束
- `bin/claude.exe` — `WaitForMcpServers` 七档状态文案、`RefreshMcpTools`、ToolSearch 的 MCP 提示
- `bin/claude.exe` — 四个私有 `_meta` 键与 `anthropic/permissionDisplay`

#### 本仓 · 要一起改的落点

- `packages/contracts/src/tools.ts` — `ToolSpec` 七字段、`ToolProvider.assessRisk` / `reconcile`、`ToolSelector`
- `docs/架构设计.md §4` — 不变量 5（能力只经 ToolProvider）与不变量 6（四段式）
- `安全与审计 §5.2 / §5.3 / §5.6` — 风险分层、`CredentialGrant`、审批
- `运行时内核 §5.5` — 网关；`执行与恢复 §5.10 / §7.3` — 幂等与契约演进
- `docs/路线图.md §15.3` — 「MCP 服务器不做、客户端要做」那一行

---

三家对读第十四篇 · 核验日期 2026-08-27 · 时效证据，不定义 § 锚点、不定义不变量、不构成决定 ·结论进架构正文要走 ADR
