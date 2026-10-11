---
title: 企业部署面三家对读
label: 企业部署面
group: 平台能力
order: 3
date: 2026-08-27
summary: 配置分层 / 托管策略 / 遥测 / 成本
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - 九个维度
  - 分岔总表
  - 对本仓的意义
  - 没核到的部分
  - 落点索引
---

# 企业部署面

<Badge type="info" text="三家对读 · 第十三篇 · 核验日期 2026-08-27" />

一个人用和一整个公司用，差的不是功能，是三个别的问题：谁说了算、看得见什么、花了多少。三家都答了，答案的形状差得很远——有一家的管理员压在所有人上面，有一家的企业层在优先级里居然低于用户，还有一家干脆没有管理员这个概念。

<Badge type="tip" text="disabled" /> <Badge type="info" text="feedback-only" /> <Badge type="warning" text="full" />

Claude Code 2.1.247 · codex（codex-rs 全量） · deepseek-harness（全量 + 子系统文档） · 本仓作为第四列 · 九维

## 这件事在解决什么

把一个编程智能体交给一家公司，会立刻冒出三个跟「它好不好用」无关的问题。它们各自有各自的提问人，而且很少是同一个人：

- **谁说了算**——安全团队问的。哪些设置用户能改、哪些不能改、改不了的那些由谁写。
- **看得见什么**——平台团队问的。出了事能不能查，用得好不好能不能量。
- **花了多少**——出钱的人问的。而且他要的口径是*这家公司谈下来的价*，不是厂商标价。

三条各自都有一个不显眼但要命的地方：

- **「谁盖谁」不够用**。管理员真正要的不是「我的值优先」，而是「用户不能选到那个值」。前者是*覆盖*，后者是*收紧*——一个配置系统只做了覆盖，就永远差着一层：用户仍然可以把自己调到策略之外，只要他改的是一个管理员没写过的字段。
- **遥测是产品唯一一处主动把用户的东西发出去的地方**。而在编程智能体里，「用户的东西」恰好是提示词、代码和工具输出。默认发不发、发多细、发给谁，是三个独立的决定。
- **钱的口径要能被公司改写**。标价对内部结算没有意义；要么产品允许公司填自己的价，要么这个数字只能当参考。

本仓在 M2 会同时撞上前两条（上 server、多租户、安全基线），第三条 `§9.6` 已经给了半个答案——企业侧按量档必须自己记账，「因为要能回答『这个租户这个月花了多少』」。这一篇要看的是另外三家把这半个答案补成了什么。

## 三家是谁，证据到什么档次

::: codex 一手源码
读了 `config/` 的层枚举与 4640 行 `config_requirements.rs`、`constraint.rs`、`otel/` 的配置与指标名与事件函数、`analytics/` 的采纳行统计、`features/` 的注册表与生命周期枚举。
:::

::: dsh 一手源码 + 自带文档
`docs/subsystems/` 的 settings / session-telemetry / token-meter / permission-presets 四份，加 `runtime-diagnostics` 的不变量注册表 README。这几份都是从源码类型生成并逐条注释的。
:::

::: claude 压缩源码 + schema 原文
`bin/claude.exe`（2.1.247）里 `grep -a` 出的 668 个环境变量、20 个指标名、托管设置的字段与 `describe()` 原文、以及托管源合并函数里那张「取最严」的字段表。
:::

::: info 企业面是压缩产物最友好的一维。
因为这一层几乎全部由字符串构成：环境变量名、配置字段名、schema 的 `describe()` 说明原文、给管理员看的错误文案。它们没有被压缩器改名，读出来就是原话。唯一涉及控制流的一处我也读到了形状——托管三源的合并函数带着一张 `restrictive` 路径表，对表里的字段取所有来源中最严的一个。除此之外凡是「什么条件下走哪条分支」的地方，下文都标了没核到。
:::

## 九个维度

每一维先给三家的一句话答案，再展开。顺序按「配置怎么定 → 开关怎么管 → 数据怎么出去 → 钱怎么算 → 出事怎么查」排。

### 01 配置有几层 <Badge type="warning" text="分岔" />

「层」这个词在三家那里指的根本不是同一种东西——有一家的其中一层压根不是配置。

- **Claude Code**：托管档（三源）+ SDK 父档 + `--settings` + 用户 + 项目 + 本地 + `--add-dir` 目录，另有 **668 个环境变量**作为事实上的第二套配置系统
- **codex**：**九种**层来源，带精确整数优先级：打包默认 −10 · MDM 0 · system 10 · 企业托管 15 · 用户 20/21 · 项目 25 · 会话 flags 30 · 两种 legacy 40/50
- **deepseek-harness**：**三层**：schema 默认 → `cordis.yml` 的 `base` → 用户档。没有第四层

<small>codex</small> 它的层是*同一份 TOML 的九个来源*，每一个都能被人类可读地报出来：`MDM (com.openai.codex:key)`、`project (/path/.codex/config.toml)`、`enterprise-managed (名字, id)`。带 profile 的用户层比不带的高一分（21 对 20），这样「我切了个 profile」总能盖住我自己的默认值。

<small>CC</small> 它的层散在两处。配置文件那一路有明确的档（`policySettings` 是托管档，`parentManaged` 是 SDK 传下来的父档，再往下是 flag、用户、项目），而且 `settingSources` 能限定「这次只读哪几档」；可另一路是那 668 个环境变量，其中 **59 个是 `CLAUDE_CODE_DISABLE_*`**。环境变量没有层，也没有来源，谁能设进进程谁说了算。

<small>dsh</small> 它的三层里有一层不是配置：`base` 来自 `cordis.yml` 的组合行——也就是「这个部署挂了哪些插件、给每个插件填了什么」。文档把边界划得很清楚：*组合配置留在 `cordis.yml`，一个命名空间只承载用户可编辑的那个子集*。所以用户能看到的设置面，本身就是部署方选出来的。

::: tip 判断
分岔在「层」指什么。codex 的层是同一份文件的九个来源，CC 的层是几份文件加一大堆环境变量，dsh 的层里有一层是**装配**。三种形状对应三种运维方式：改一个值、发一份策略、改一次组合并重启。
:::

### 02 管理员的话凭什么赢 <Badge type="warning" text="分岔" />

这一维有本篇最反直觉的一条事实：codex 的企业托管层，在普通优先级里**低于**用户层和项目层。

- **Claude Code**：托管档压在最上面。三源 `first-wins`（默认）或 `merge`；另有一张字段表，表里的路径**取所有来源里最严的那个**
- **codex**：层栈里企业只排 15。强制力在**另一条通道**——requirements：给的不是值，是允许集
- **deepseek-harness**：没有这一层。对应物是 `cordis.yml`：你根本没挂那个插件

<figure class="diagram">
<!--@include: ./figures/enterprise-1.svg-->
<figcaption>同一件事——一个设置值最后定成什么——三家让管理员在三个不同的位置介入。codex 那一行最值得看：它的企业层在层栈里只排 15，比用户 20 和项目 25 都低，所以在「覆盖」这件事上企业是输的；它的强制力完全不在层栈里，而在右边那道与层栈平行的闸门上。</figcaption>
</figure>

<small>codex</small> 那道闸门叫 requirements，是一条独立的通道：只有四种来源能写它——MDM 托管首选项、企业后端下发的托管层、`system requirements.toml`、以及两种 legacy。它给的不是「设成什么」，而是**允许集**：`allowed_approval_policies`、`allowed_sandbox_modes`、`allowed_permission_profiles`、`allowed_web_search_modes`、`allowed_login_methods`、`allowed_chatgpt_workspaces`。值不在集合里就抛 `ConstraintError`，而错误文案会点名是谁定的：*「\`{field}\` 的值 \`{candidate}\` 不在允许集合 {allowed} 内（由 MDM (域:键) 设定）」*。

<small>CC</small> 它的托管档由三个来源合成，顺序固定为**服务端下发 > MDM（macOS 托管 plist / Windows HKLM 策略键）> `managed-settings.json`**，合成方式可配：`first-wins`（默认，出现的最高优先级来源*单独*构成托管档）或 `merge`（三者深合并，优先级固定）。在这之上还有一张列出具体路径的表——`disableBypassPermissionsMode`、`strictPluginOnlyCustomization`、`disableArtifact`、`isolatePeerMachines` 等等——**这些字段不看来源优先级，取所有来源里最严的那个值**。再加一条兜底：策略文件读不出来时是 `policy_unreadable_fail_close`，*失败关闭*，不是忽略。

<small>dsh</small> 它没有这一层，也没打算有。最接近的是权限预设：`cordis.yml` 里配一张 preset 表（默认两档 `workspace-write` 与 `danger-full-access`）加一个 `defaultPreset`；而文档明说这个服务*本身不做任何强制*——它只是把两个独立的旋钮（沙箱模式与审批策略）打包成客户端的一个选择器，执行、叙述、回放各自照旧读自己的旋钮。配错了在插件加载期就抛。

::: tip 判断
三家其实在回答同一句话——**收紧可以，放宽不行**——但落点完全不同：codex 放在一条与层栈平行的闸门上（层栈只管默认值，闸门管可选域），CC 放在字段级的「取最严」表上（叠加多个来源时安全性单调不减），dsh 放在「你根本没挂那个插件」上。第三种最彻底也最不可运营：改策略要改组合、要重启，而且没有任何东西能告诉用户「这是被管起来了」。
:::

### 03 管理员能锁住什么 <Badge type="tip" text="两家同构 · 一家没有" />

两张字段清单摆在一起，重合度高得不像是各自设计的——因为它们都不是设计出来的，是被同一批采购问卷逼出来的。

- **Claude Code**：MCP 允许/拒绝清单、模型清单与强制、hook 全禁与 HTTP hook 域名白名单、系统提示词追加、`strictPluginOnlyCustomization`、强制登录方式与组织、价格表
- **codex**：**30 个 requirements 字段**：登录、工作区、凭证存储、审批、沙箱、权限档、web 搜索、hooks、MCP、插件、市场、exec 策略、驻留地、网络、文件系统、托管指令
- **deepseek-harness**：无。它的答案是上一维那句：没挂就是没有

<small>两家共有</small> 最值得记的是三种*取值语义*，两家都齐了：

- **允许集**——管理员给一个集合，用户在里面选。codex 的 `allowed_*` 六项；CC 的 `availableModels` + `enforceAvailableModels`、`allowedMcpServers`、`allowedHttpHookUrls`、`httpHookAllowedEnvVars`。
- **只准托管来源**——一个布尔，把整类扩展的非托管来源全部关掉。codex 是 `allow_managed_hooks_only`；CC 是 `allowManagedPermissionRulesOnly` 与 `strictPluginOnlyCustomization`——后者可以只锁指定的面（例如 `["skills", "hooks"]`），被挡掉的是 `~/.claude/{面}/`、项目的 `.claude/{面}/`、`settings.json` 里的 hooks、`.mcp.json`；不挡的是托管来源与插件自带的。文案里写着它跟市场白名单「组合起来就是端到端的管理员控制：插件由市场白名单把关，其余全部在这里挡掉」。
- **往提示词里塞话**——codex 的 `additional_developer_instructions`（注释写明「独立于普通开发者指令」注入），CC 的 `systemPrompt` / `appendSystemPrompt` / `appendSubagentSystemPrompt`。

<small>codex 独有</small> 三样别人没有的：`enforce_residency`（数据驻留地）、`network` 与 `filesystem` 两组托管约束、以及 managed hooks 的 requirements——它不只是允许集，还能*要求*某条 hook 必须加载，加载失败进的是 `required_load_errors` 而不是 warning。

<small>CC 独有</small> 两样：**价格表**（下面第 08 维），以及一条只认托管来源的登录路径——`forceLoginMethod: "gateway"` 加一个云网关 URL，界面文案是「你所在组织的策略要求通过网关登录，但没有配置网关地址，请联系 IT 管理员」。

::: tip 判断
两家同构到可以互相翻译，而这恰恰说明这张清单不是拍脑袋来的。值得抄的不是字段名，是那三种取值语义——**允许集 / 只准托管来源 / 注入**。本仓今天一个都没有，但 M2 的多租户会一次性把三个都要到。
:::

### 04 开关的形态与寿命 <Badge type="warning" text="分岔" />

一个功能开关活几年、怎么退役——这件事听起来是内务，但它决定了三年后有没有人敢删代码。

- **Claude Code**：**668 个环境变量**，其中 59 个 `CLAUDE_CODE_DISABLE_*`。没有生命周期，只有名字
- **codex**：**121 个 Feature**，五档生命周期：开发中 / 实验（带菜单名、说明、公告文案）/ 稳定 / 废弃 / **已移除但保留键**
- **deepseek-harness**：没有 feature flag。开关就是插件挂不挂，加上每个 settings 命名空间自报的 `applies: live | restart`

<small>codex</small> 五档里最值得记的是最后一档 `Removed`——注释写着「这个 flag 已经没用了，但为了向后兼容保留」。**三家里只有它把「开关的退役」也写进了类型**，于是「删掉这个功能」与「让旧配置继续能读」变成两件可以分开做的事。`Experimental` 档更进一步：它自带 `/experimental` 菜单里的显示名、一句菜单说明和一段公告文案，也就是说*怎么把这个开关介绍给用户*也是类型的一部分。

<small>CC</small> 另一种答案：不登记，也不退役。668 个环境变量里能读出整个产品的历史地层——`CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、`CLAUDE_CODE_ALTGR_AS_TEXT`、`CLAUDE_CODE_DISABLE_MOUSE_CLICKS` 和它旁边那个多了一个字母的 `CLAUDE_CODE_DISABLE_MOUSE_CLICKSC`。这种规模下，「这个变量现在还生效吗」只能靠试。

<small>dsh</small> 它连开关这个概念都尽量不要。能配的东西必须是某个插件注册的 settings 命名空间，带 schema、带 `base`、带一个 `validate` 钩子处理 schema 表达不了的跨字段约束，还带一个给界面用的 `applies` 提示——`restart` 档的所有者干脆从不监听变更，于是配置界面可以给它挂一个「重启后生效」的角标。

::: tip 判断
分岔，而且分岔的是「配置面本身是不是一等公民」。dsh 把它做成有 schema、有版本号（`expectedRevision` 乐观并发）、有密文位（`role('secret')` 字段在任何 wire 面上必须被剥掉，只回一个 `{path, set}` 槽位让页面渲染只写输入框）的服务；codex 把它做成有生命周期的注册表；CC 把它做成了 668 个名字。
:::

### 05 遥测有几条管道，默认开不开 <Badge type="warning" text="分岔" />

装上之后不做任何配置，它会往外发东西吗？发给谁？——三家的默认值不一样，而默认值就是绝大多数部署的实际值。

- **Claude Code**：**两条，默认相反**：自家那条默认开（`DISABLE_TELEMETRY` 关），OTel 那条默认关（`CLAUDE_CODE_ENABLE_TELEMETRY` 开）
- **codex**：**两条**：OTel 的默认 exporter 就是内置的 Statsig 端点（debug 构建自动关），外加一条独立的 analytics 管道
- **deepseek-harness**：**一条，默认没有**。遥测是一个可选能力，不挂就不存在

<small>codex</small> 它的默认导出器是硬编码的：`https://ab.chatgpt.com/otlp/v1/metrics`，带一个内嵌的 `statsig-api-key` 客户端密钥。源码注释写明为什么 debug 构建要关掉——「不让本地增量开发与测试跑出尽力而为的 OTEL 流量」。企业要自己收就换 exporter：`OtlpGrpc` 或 `OtlpHttp`，各自带 headers 与 TLS（CA、客户端证书、私钥，即 mTLS），而且 logs / traces / metrics 是**三个独立的 exporter 字段**，可以分别指向不同地方。

<small>CC</small> 形状类似但更铺开：三条 OTLP 通道各有自己的端点、协议、压缩、超时与导出间隔，还额外支持一个 Prometheus exporter（`OTEL_EXPORTER_PROMETHEUS_HOST/PORT`，即拉模式）。有一条实现细节值得单独记——日志里那句「[*3P telemetry] Waiting for remote managed settings before telemetry init」*：第三方遥测初始化会**先等远端托管设置下来**，免得在企业策略生效之前就先发了一批出去。

<small>dsh</small> 它把这件事定义成能力接缝：服务定义（`ctx.sessionTelemetry`）只负责采集点、投影、脱敏瀑布与交接游标，真正的后端是部署自己挂的包（现成的那个就是 OTel JS SDK 的 log pipeline 原样配置）。边界公理写得很硬：*harness 的职责到 `emit()` 为止，批量、重试、排队与丢失策略属于上报 SDK*。不挂后端，采集点就不存在。

<small>还有一条</small> 三家都要处理但只有一家做进了协议的：**用户知不知道自己的会话被共享了**。dsh 要求每个后端通过一个必需的 `sharing` 成员公开自己的策略，取值是封闭的三档 `full` / `feedback-only` / `disabled`，`/feedback` 的确认文案直接渲染它；没挂遥测服务时才显示「未配置」。文档还特意划了界：这个披露说的是*当前策略*，不是投递或留存。

::: tip 判断
分岔在默认值，而默认值暴露的是商业模式。两家厂商产品默认都会发一点东西回自己家（一家显式、一家藏在默认 exporter 里），dsh 默认什么都不发——它连「发给自己」这个概念都没有。可以直接抄的是那句边界公理与那三档披露：**把「我们现在在共享什么」做成一个产品必须回答的问题**，而不是文档里的一段话。
:::

### 06 导出的是什么 <Badge type="warning" text="分岔" />

把三张清单并排看，能一眼看出三家分别在给谁做东西——因为指标名是写给读它的人看的。

- **Claude Code**：**20 个指标**，一半是采纳度：代码行数、提交数、PR 数、活跃时长、会话数、成本
- **codex**：**约 60 个指标**，绝大多数是工程延迟：四个层次的首字时间、SSE/WebSocket 计数与时延、启动分阶段
- **deepseek-harness**：**零个指标**。它导出的是会话日志本身——每条会话事件一比一变成一条 OTel 日志记录

<small>CC</small> 清单原文：`claude_code.token.usage` ·`cost.usage` · `lines_of_code.count` · `commit.count` ·`pull_request.count` · `active_time.total` · `session.count` ·`code_edit_tool.decision` · `tool.blocked_on_user` ·`subagent.spawn` · `compaction` · `mcp.rpc` ·`hook` · `bash.subprocess` · `llm_request` 等。前六个不是工程指标，是**给管理层证明这笔钱花得值**的指标——代码行数、提交、PR、活跃时长，正好是「采纳度报告」的四个栏目。

<small>codex</small> 清单的重心完全在另一头。光是首字延迟就拆了四层：`codex.responses_api_engine_iapi_ttft`、`engine_service_ttft`、`responses_api_overhead`（「排除引擎与客户端工具时间之后的 responses 耗时」）、`responses_api_inference_time`，外加 `turn.ttft` 与 `turn.ttfm` 两个回合级的。再加启动分阶段（`startup.phase.duration_ms`）与预热年龄（`startup_prewarm.age_at_first_turn_ms`）、hook 运行、goal 六个、技能目录被截断了多少字符。**这是给做这个产品的人看的，不是给买它的人看的。**

<small>dsh</small> 它不出指标，出*事实*：ledger 通道把每条会话事件原样投影成一条日志记录（属性刻意最小化——能从 body 里还原出来的一律不重复放进属性），ops 通道只装两个没有日志归宿的信号（`agent-error` 与 `shutdown`），并且*故意不带* `event.seq` 那种身份，好让它们永远不会被当成账本行去求和。投递是尽力而为，游标标记的是「已交接」而不是「已送达」，所以收端要按 `(session.id, event.seq)` 去重；每个 `(turn, step)` 只发第一条 `assistant/chunk`，于是 **seq 出现空洞是常态，不是丢失信号**。

::: tip 判断
分岔，而且这一格最能看出三家的读者是谁。CC 数的是「这个工具值不值」，codex 数的是「这个工具哪儿慢」，dsh 干脆不数——把原始事实交出去，指标由收端自己算。第三条对本仓有直接可比性：我们的事件日志已经是 append-only 且带 seq 的，「日志即遥测」这条路本仓走得通，而且比另造一套指标便宜。
:::

### 07 内容分级：提示词出不出去 <Badge type="tip" text="方向同构 · 三种粒度" />

长度和计数可以发，正文默认不发——这一条三家一致。分岔在于「不发」是靠开关、靠通道，还是靠让部署方自己写规则。

- **Claude Code**：**开关表**：五个内容级开关 + 五个身份维度开关，全是环境变量
- **codex**：**通道分离**：日志目标与 trace-safe 目标是两套；同一个事件在 trace 里永远只有长度与计数
- **deepseek-harness**：**扩展点**：脱敏是一条 waterfall，而 seam 自己*一条规则都不带*

<small>CC</small> 内容五级：`OTEL_LOG_USER_PROMPTS` ·`OTEL_LOG_ASSISTANT_RESPONSES` · `OTEL_LOG_TOOL_CONTENT` ·`OTEL_LOG_TOOL_DETAILS` · `OTEL_LOG_RAW_API_BODIES`。身份五维：`OTEL_METRICS_INCLUDE_ACCOUNT_UUID` ·`SESSION_ID` · `ENTRYPOINT` · `VERSION` ·`RESOURCE_ATTRIBUTES`。两组正交——一组管「发多少内容」，一组管「这条数据能不能追到具体某个人某次会话」，后者同时也是基数控制。

<small>codex</small> 它不靠开关靠通道。同一个 `codex.user_prompt` 事件：在**日志**里带 `prompt`（受 `log_user_prompts` 控制，关掉时写成字面量 `[REDACTED]`，但 `prompt_length` 照留）；在**链路追踪**里永远只有 `prompt_length` 与文本/图片/本地图片三个计数，没有正文这个字段可言。代码层面靠 target 前缀分流（`codex_otel.trace_safe` 与其余）。工具结果另有一道闸：`ToolResultLogConfig.max_bytes` 默认 2048 字节。

> 这条瀑布是服务定义的脱敏扩展点。它**不带任何自己的规则**：没有监听器挂上时，记录原样到达后端——所以导出的数据有多干净，完全取决于这个部署挂了哪些规则。`— dsh session-telemetry/record`

<small>dsh</small> 这句话有两面。好的一面：脱敏只改导出副本，*规范会话日志永不被改写*；一个抛异常的监听器 fail-closed 扣下那一条记录，且永远不会把异常抛回智能体循环。不好的一面它自己也没藏：**挂上后端而不挂规则，等于把整份会话日志原样导出去。**

::: tip 判断
方向三家一致（长度与计数可以出去，正文默认不出去），粒度是三种：**开关表 / 通道分离 / 扩展点**。最值得抄的是 codex 那条通道分离——它不依赖任何人记得去配开关：trace 这一路在*类型上*就没有正文字段，配错了也漏不出去。本仓 §13 已经写了「敏感字段脱敏后才进 span」，但那是一条要求，不是一个结构。
:::

### 08 钱 <Badge type="warning" text="分岔" />

三家里只有一家真的在数钱，而且只有它允许公司把标价改成自己的价——判据是谁在为这笔账负责。

- **Claude Code**：完整成本模型：可被托管设置覆盖的**逐模型价格表**、全局折扣倍率、成本指标、用量提醒
- **codex**：一条日志事件 `codex.turn_cost` 带 `usage.estimated_usd`。全仓 `usd` 只出现在这一处
- **deepseek-harness**：零。token 计量量的是**上下文压力**不是钱；模型目录里的 pricing 字段没有任何消费者

<small>CC</small> 价格表那条规则值得整段读：可以逐模型改价，键可以是内置模型的任意日期与厂商写法，也可以是网关的模型别名；`multiplier` 取值在 `(0, 1]`，**对每一个算出来的成本再乘一遍**（原文举例 0.85 就是标价的 85%），*只认托管来源*——服务端下发、MDM / 操作系统策略、或 `managed-settings.json`。非法的行或倍率会被报告并跳过，其余照常生效。也就是说 `/cost` 与 `claude_code.cost.usage` 报的是*这家公司的钱*，不是标价。

<small>CC</small> 另一头是订阅档的用量。速率限制直接进 API 响应（`rate_limits`，只对订阅用户、且至少有一个窗口时才出现），恢复一条长会话前会先算一笔并劝一句：*「恢复完整会话将消耗你相当一部分用量额度，建议从摘要恢复」*。`DISABLE_COST_WARNINGS` 与 `DISABLE_EXTRA_USAGE_COMMAND` 是给不想看的人的开关。

<small>dsh</small> 它的立场写得非常干脆——模型目录条目里有 pricing 字段，README 里那句是：*「定价与输入模态没有 harness 消费者，跟着安装条目走，或者干脆缺席」*。它的 `token-meter` 名字里有 token，量的却是「下一次请求的提示词会占多少」，用途是压缩与占用显示，不是账单。

::: tip 判断
分岔，判据是**谁在为这笔钱负责**。CC 是订阅与账单的直接卖方，所以它必须把价格做成可被公司改写的东西；codex 记一笔估算就够；dsh 不卖，于是把钱整个留在外面。本仓的位置是第四种：`§9.6` 已经把「账户额度 / 任务预算 / 单次上限」分成三层且指明企业侧按量档必须自己逐笔记账——**我们是那个要回答「这个租户这个月花了多少」的人**，所以 CC 那条「价格表可被托管来源覆盖」对本仓是同类问题的现成答案。
:::

### 09 出事了怎么自证 <Badge type="warning" text="分岔" />

六层配置合出来一个错值，或者某个部署跑歪了——三家给的排查入口分别是行号、命令和断言。

- **Claude Code**：`/doctor`：一次完整体检，**而且能顺手修**；策略读不出来直接失败关闭
- **codex**：配置报错定位到**文件 + 行列范围**，并在错误里带上那一层的人类可读名字
- **deepseek-harness**：一个**运行期不变量注册表**：每个包发一个伴生模块注册自己的检查，默认全开

<small>codex</small> 它把 `serde_path_to_error` 与 `toml_edit` 接起来，于是一次配置校验失败能报出「哪个文件、第几行第几列到第几列、什么问题」，而层的名字是给人看的那种：`MDM (com.openai.codex:键)`、`project (/path/.codex/config.toml)`、`packaged defaults (...)`。在九层栈里，这一条是「能用」与「不能用」的分界。

<small>CC</small> 它把体检做成了一条命令：*「要做完整的、还能顺手修问题的体检，在会话里跑 `/doctor`」*，非交互那一路会「读当前目录的设置文件而不弹信任提示」。清理任务读不到设置时的文案也很实在：*「跳过清理：某个设置文件读不出或解析失败，`cleanupPeriodDays` 可能被设成了一个看不见的值。修好设置文件（见 `/doctor`）以重新启用清理」*。

<small>dsh</small> 它的自证不是日志也不是指标，是**断言**。`ctx.invariants` 是一个注册表，工作区里每个包都发布一个 `./invariant` 伴生模块用自己的 npm 包名注册检查；按正则 allowlist / blocklist 选中，默认 `enabled: true` 且两张名单都为空——也就是*默认全开*。违反抛 `InvariantError`，带稳定的 `code` 与出问题的包名。

::: tip 判断
分岔。dsh 那条最特别：把「这个部署有没有跑歪」变成生产里一直开着的断言，而不是事后翻指标。代价它自己也担着——每个包都要写、都要维护，且默认全开意味着一直在算。这一格对本仓有个现成的对照：我们的 `pnpm run check:*` 是*提交前*的断言，而 dsh 那套是*运行期*的断言，两者不冲突，也不能互相替代。
:::

## 分岔汇总

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| 配置层数 | 托管档 + 父档 + flag + 用户 + 项目 + 本地，另加 668 个环境变量 | 九种来源，整数优先级 | 三层，其中一层是「挂了哪些插件」 | 无配置层概念；`AgentDefinition` 是装配输入 |
| 管理员怎么赢 | 托管档压最上；restrictive 字段取最严；读不出来失败关闭 | **层栈里企业只排 15**；强制力在平行的 requirements 闸门 | 没有管理员档；对应物是组合与重启 | 未定。M2 多租户时第一次需要 |
| 能锁什么 | MCP / 模型 / hooks / 插件面 / 登录 / 价格 | 30 个 requirements 字段，含驻留地与网络文件系统约束 | 无 | 无 |
| 取值语义 | 允许集 · 只准托管来源 · 提示词追加 | 同左，且 hook 可被*要求*必须加载 | — | 审批白名单按命令签名（ADR-0076），是允许集的一种 |
| 功能开关 | 668 个环境变量，无生命周期 | 121 个 Feature，五档含「已移除但保留键」 | 无 flag；schema 化 settings + `applies` | 无 |
| 遥测管道 | 两条，自家默认开、OTel 默认关 | 两条，默认 exporter 是内置 Statsig 端点 | 一条，可选能力，默认没有 | §12 定了 OTel span 覆盖四级；未实现 |
| 导出什么 | 20 个指标，一半是采纳度 | 约 60 个指标，重心在延迟 | 零指标；导出会话日志本身 | 事件日志已 append-only 带 seq，可直接当 ledger |
| 内容分级 | 五个内容开关 + 五个身份维度开关 | 日志 / trace-safe 两套通道，类型上就没有正文 | 一条脱敏 waterfall，seam 不带任何默认规则 | §13「敏感字段脱敏后才进 span」是要求，不是结构 |
| 钱 | 价格表可被托管覆盖 + 全局折扣倍率 + 成本指标 | 一条 `estimated_usd` 日志事件 | 零；pricing 字段无消费者 | §9.6 三层预算；企业侧按量必须逐笔记账 |
| 自证 | `/doctor`，能修 | 配置报错定位到行列 + 层名 | 运行期不变量注册表，默认全开 | `check:*` 是提交前断言，运行期没有 |

## 对本仓意味着什么

本仓在这一层不是空白，但只有原则没有机制：`§12` 定了「OTel span 覆盖 Run/Step/ModelCall/ToolCall，敏感字段脱敏后才进 span」，`§9.6` 定了三层预算与企业侧按量记账，`§13.1` 把审计与遥测分了家。M2 上 server 那一刻，这三条都会从原则变成要写的代码。

### 「收紧」和「覆盖」是两套机制，不能合并 <Badge type="tip" text="同构 · 可当定论" />

codex 用一条与层栈平行的 requirements 闸门，CC 用一张字段级的「取最严」表——两家用了完全不同的实现，但都拒绝把管理员的权威表达成「优先级更高的一层」。理由在 codex 的层号里写得最直白：它的企业层排 15，比用户 20 与项目 25 都低，**因为企业要的根本不是覆盖默认值，是限定可选域**。本仓 M2 做多租户策略时，第一个决定就是这个：别把它做成又一层配置。

### 三种取值语义就是全部：允许集 / 只准托管来源 / 注入 <Badge type="tip" text="同构 · 可当定论" />

两家的字段清单加起来近五十条，但取值只有这三种形状。允许集给用户留选择，布尔收紧把整类非托管来源一次关掉，注入往提示词里加话。本仓已经有一个允许集的实例——ADR-0076 的审批白名单按命令签名精确匹配。M2 要做的不是发明新语义，是把这三种各挑一个字段先落地。

### 「日志即遥测」这条路本仓已经铺了一半 <Badge type="warning" text="本仓没有 · 补不补是决策" />

dsh 不出任何指标，把会话事件一比一映射成 OTel 日志记录交出去，指标由收端算。本仓的事件日志已经是 append-only、带 seq、有信封（§7.0），离那个形状只差一个投影和一条脱敏扩展点。它比另造一套指标便宜得多，代价是收端要会自己算——而如果本仓的企业侧本来就要自建控制台，这个代价是零。**要抄就连它的三条硬约束一起抄**：ops 通道故意不带 seq 身份、每个 (turn, step) 只发第一条 chunk 所以 seq 空洞是常态、游标标记的是已交接不是已送达。

### 脱敏是「一条要求」还是「一个结构」 <Badge type="warning" text="本仓没有 · 补不补是决策" />

§13 那句「敏感字段脱敏后才进 span」今天是一条要求——它靠每个写 span 的人记得。codex 的做法是让它成为结构：trace 这一路在类型上就没有正文字段，同一个事件在日志里带 prompt、在 trace 里只有长度与计数。本仓真上 OTel 之前值得先决定走哪种，因为这决定了 span 的类型怎么定义，而不是决定了要写多少条 review 意见。

### 价格表要不要可被租户覆盖 <Badge type="warning" text="本仓没有 · 补不补是决策" />

§9.6 已经写明企业侧按量档必须逐笔记账「因为要能回答『这个租户这个月花了多少』」。那句话里藏着一个还没回答的问题：*按谁的价*。CC 的答案是价格表加一个 `(0,1]` 的倍率，且只认托管来源。本仓一旦有第二个租户，这个字段就必须存在——差别只在于是现在留位，还是那天改所有记账点。

### 默认发不发 <Badge type="warning" text="三家分歧 · 自己判" />

两家厂商产品默认都往自己家发一点东西，dsh 默认什么都不发。本仓两条产品线的答案很可能不一样：编程侧是自用，企业侧要卖给别人。可以先抄的是 dsh 那三档披露（`full` / `feedback-only` / `disabled`）——**把「现在在共享什么」做成产品必须回答的一个值**，而不是文档里的一段承诺。这条与不变量 5、6 是同一个性质：可见性也要有单一事实源。

### 运行期断言值不值那个成本 <Badge type="warning" text="三家分歧 · 自己判" />

dsh 让每个包都带一个运行期不变量检查，默认全开。本仓的对应物是 `check:*`，但那是提交前的，抓不到「这个部署配歪了」。两者不冲突。要判的是：本仓的不变量（§4 六条）里有几条是能在运行期便宜地断言的——如果只有一两条，那这套注册表就是为抽象而抽象。

## 明确没核到的部分

- **没有把任何一家真的部署到企业环境里跑过**。托管设置、MDM 下发、企业后端 bundle 这几条路径全部是从代码与文案读的，没有一条是实测的。
- **Claude Code 三个托管源具体怎么合并，只核到形状**。我读到了合并函数带一张 `restrictive` 路径表并对表内字段取最严，也读到了 `first-wins` / `merge` 的 schema 说明原文；但每个字段各自的比较顺序（那个 `restrictive` 值除了 `true` 还有 `"disable"` 一档）没有读全。
- **CC 的 20 个指标名是名字，不是维度**。每个指标带哪些标签、什么单位、什么聚合，没核到。「一半是采纳度」这个判断依据的是名字本身。
- **codex 的 `config_requirements.rs` 有 4640 行，我读的是字段表与几个关键函数**。每个字段各自的校验细节、以及多个 requirements 来源如何合成（`RequirementSource::Composite` 那条路径）只读了入口。
- **codex analytics 那条管道我只读了「采纳行」这一块**。它有 1475 行事件定义与 3679 行 reducer，本轮没进去；现在能确证的是：它发送逐次回合的接受/删除行数与一个由 git remote 规范化后哈希出来的 `repo_hash`，而*逐行指纹字段在这条路径上是空数组*——机制存在，这次没启用。
- **dsh 这一轮读的仍是文档与 README，TS 实现没进去**。尤其 `settings` 的密文剥离与 `invariants` 的选中逻辑，都是按文档转述的。
- **三家的审计（不是遥测）这次都没读**。本仓 §12 有一条硬规则「Telemetry 不是 Audit：前者可采样可丢，后者是证据必须完整」，而这一篇从头到尾读的都是前者。另外两家有没有独立的审计链路，没核。

## 落点索引

#### codex · 配置与策略

- `config/src/config_layer_source.rs:6-51` 九种层来源与整数优先级 · `:78-107` 每一层的人类可读名
- `config/src/config_requirements.rs:159-196` 30 个 requirements 字段 · `:906-923` TOML 侧的 `allowed_*` 允许集写法 · `:41-64` 只有四种来源能写 requirements
- `config/src/constraint.rs:7-38` `ConstraintError` 与「由谁设定」的文案 · `:60-110` `Constrained` 的校验器与归一化器
- `config/src/diagnostics.rs:1-40` 配置报错定位到文件与行列范围 · `features/src/lib.rs:41-58` 五档生命周期 · `:90` 121 个 Feature

#### codex · 遥测与分析

- `otel/src/config.rs:9-36` 内置 Statsig 端点与内嵌 key，debug 构建关掉 · `:50-105` 三个独立 exporter 与 mTLS 字段
- `otel/src/targets.rs` 日志目标与 trace-safe 目标的分流 · `otel/src/metrics/names.rs` 约 60 个指标名全文
- `otel/src/events/session_telemetry.rs:992-1032` `user_prompt`：日志带正文（可 `[REDACTED]`）、trace 只带长度与计数 · `:276-292` `codex.turn_cost` 与 `estimated_usd`
- `protocol/src/config_types.rs:29-40` 工具结果日志 2048 字节上限 · `analytics/src/accepted_lines.rs:63-70,105-115` 指纹哈希与 `repo_hash`

#### deepseek-harness · docs/subsystems/

- `settings.md` 三层解析、`applies`、`validate` 与 schema 的分工、`redactSecrets` 与路径操作、`expectedRevision`
- `session-telemetry.md` ledger/ops 双通道、属性最小化、去重与 seq 空洞、三档共享披露、边界公理、脱敏 waterfall「不带任何自己的规则」
- `token-meter.md` 量的是请求压力不是钱 · `permission-presets.md` 预设只打包旋钮、自身不做强制 · `packages/llm/llm-pi-ai/README.md:84` pricing 无消费者
- `packages/runtime-diagnostics/invariants/README.md` 运行期不变量注册表、正则 allow/blocklist、默认全开、`InvariantError`

#### Claude Code · 2.1.247

- `bin/claude.exe` 中 `grep -a` 命中：668 个 `CLAUDE_CODE_*` / `OTEL_*` 环境变量（59 个 `DISABLE_`）· 20 个 `claude_code.*` 指标名
- 托管设置：三源顺序与 `first-wins`/`merge` 的 schema 说明 · `restrictive` 路径表与取最严的合并函数 · `policy_unreadable_fail_close` · `strictPluginOnlyCustomization` 的挡与不挡清单
- 价格表与 `multiplier` 的 `describe()` 原文 · `rate_limits` 的响应字段注释 · 长会话恢复的用量提示 · `/doctor` 的两处文案
- `claude gateway` 的运行期文案：监听地址、OIDC issuer、邮箱域与允许组、「仅客户自路由推理」、要求原生二进制、不支持 Windows

#### 本仓

- `docs/architecture/运行时内核.md` §9.6 三层预算与「企业侧必须自己记账」· ADR-0062 装配预算是第四种
- `docs/架构设计.md` §12「Telemetry 不是 Audit」· §11 L1 平台服务里的遥测位 · `docs/architecture/安全与审计.md` §13 跨切表「OTel span 覆盖 Run/Step/ModelCall/ToolCall，敏感字段脱敏后才进 span」
- `docs/路线图.md` §15.2 计费与订阅 / 多区域 SaaS / 完整企业 IAM 维持不做 · §15.3 量化 SLA 排 M3、正式安全基线排 M2 之后 · M2 的 PG 与租户隔离靠 `Principal.tenantId`

---

三家对读系列 · 第十三篇 · 核验日期 2026-08-27 · 本文是时效证据，不定义 § 锚点、不定义不变量、不构成决定 · 结论进架构正文要走 ADR
