---
title: 扩展面三家对读
label: 扩展面
group: 平台能力
order: 2
date: 2026-08-27
summary: hooks / 技能 / 斜杠命令 / 插件与市场
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

# 扩展面

<Badge type="info" text="三家对读 · 第十二篇 · 核验日期 2026-08-27" />

hooks、技能、斜杠命令、插件市场——别人往你内核上挂东西的那一面。前十一篇里三家各推各的；这一篇是唯一一处发生了协议趋同：Claude Code 的 `hooks.json` 成了事实格式，codex 照抄了一个子集，deepseek-harness 干脆把两家的配置都当输入格式做了桥。趋同的是格式，分岔的是权力。

<Badge type="tip" text="managed" /> <Badge type="tip" text="trusted" /> <Badge type="warning" text="modified" /> <Badge type="info" text="untrusted" />

Claude Code 2.1.247 · codex（codex-rs 全量） · deepseek-harness（全量 + 子系统文档） · 本仓作为第四列 · 九维

## 这件事在解决什么

「扩展面」是个含糊的词，因为它至少装着四种性质完全不同的东西，而它们在三家的目录里常常挨在一起，看上去像一类：

- **拦截点**——在生命周期的某一处插一段别人的代码。它能拦、有时能改、有时能往上下文里塞话。
- **技能**——一包「这类活该怎么干」的指令。平时只占一行描述，命中了才读全文。
- **斜杠命令**——人打一行字直接触发某件事。它到底是不是一条模型消息，三家的答案不一样。
- **插件与市场**——把上面三样打成一个包，让第二个人装得上。

把这四样凑在一起，难的地方就出来了，而且不读代码也看得懂：

- **它们都要挤进同一个上下文窗口**。每多一个常驻描述，正事就少一分预算——而扩展是「装上就不再想起」的东西，成本会悄悄长。
- **它们是别人写的代码，在你的机器上跑**。更要命的是 hook 恰好装在权限判定*前面*：一个能在 `PreToolUse` 上放行的扩展，等于一把绕过审批的钥匙。
- **一旦出现第二个用户，配置就有了层级**。系统、企业托管、用户、项目、会话、插件——层级一多就必须回答：谁能盖谁，谁只能收紧，谁能授予。

这一篇比前十一篇多一件事可做：三家在这一层**互相读对方的配置文件**。codex 有一整个 crate 专门把 Claude Code 的 hooks、命令、记忆、MCP、subagent、连同已装的插件市场一起搬过来；deepseek-harness 反过来写了两个桥，直接跑用户现成的 `.claude/hooks.json` 与 `.codex/hooks.json`。所以这一列的证据不只是「我读到了什么」，还有「另外两家读它读出了什么」。

## 三家是谁，证据到什么档次

::: codex 一手源码
读了 `hooks/` 整个 crate（发现、信任、分发、输出解析、十一个事件模块）、`ext/skills` 的加载与渲染与选择器、`skills/` 的 frontmatter 解析、`plugin/` 与 `core-plugins/` 的清单，以及 `external-agent-migration/` 的 Claude Code 档。
:::

::: dsh 一手源码 + 自带文档
这一轮主要读三份 README（共享协议库、两个桥）加 `docs/subsystems/` 的 skills 与 commands，再加 `.agents/notes/` 里那份「拦截扩展点」的决策笔记——它把「为什么每个扩展点的权力不一样」整段写下来了。
:::

::: claude 压缩源码 + 交叉验证
`bin/claude.exe`（2.1.247）里 `grep -a` 出的事件名、frontmatter 键、插件组件目录清单、`/plugin` 子命令帮助与技能计量文案。控制流仍不可读。
:::

::: info 这一维上 Claude Code 那一列反而是交叉验证最强的。
另外两家各自独立地把它的格式写成了自己的类型：dsh 的桥 README 逐条列出 *Claude Code 现在 30 个事件里它支持哪 7 个*、每个事件的哪些字段没实现；codex 的迁移器逐条列出它认得 `.claude/` 下的哪些目录。两份都是外部视角的规格核对，一处对不上就会留下 TODO 或警告。所以下文凡是标了「三家一致」的协议细节，都不是我从一堆字符串里推的。
:::

## 九个维度

每一维先给三家的一句话答案，再展开。顺序按「一个扩展怎么进来 → 它凭什么被执行 → 它能改什么 → 它怎么传给下一个人」排。

### 01 扩展面由几种东西组成 <Badge type="warning" text="分岔" />

「装一个扩展」这句话，在三家那里装的分别是什么？数量差了一个数量级，而方向出奇地一致。

- **Claude Code**：十一种组件目录：`commands/` `skills/` `agents/` `hooks/` `themes/` `output-styles/` `monitors/` `workflows/` 加三个清单文件
- **codex**：清单里四类资源（skills / hooks / mcpServers / apps）加一份 commands 清单；命令被**迁移成技能**
- **deepseek-harness**：一种。原生 hook 不是一个包，就是一个订阅了生命周期事件的普通插件

<small>CC</small> 它的插件识别规则可以直接从错误文案里读出来：一个目录要被认成插件，得有 `.claude-plugin/`，或者顶层有 `commands/`、`skills/`、`agents/`、`hooks/`、`themes/`、`output-styles/`、`monitors/`、`workflows/`、`SKILL.md`、`.mcp.json`、`.lsp.json` 之一。十一种里最值得注意的是最后几种——主题、输出风格、后台监视器、工作流都算扩展组件，说明它把「产品外壳」也开放出去了。

<small>CC</small> 更关键的一条藏在 `/plugin init` 的帮助里：脚手架落在 `~/.claude/skills/<name>/`，然后「auto-loads next session as `<name>@skills-dir`」。**技能目录本身就是插件**——两个概念已经在合流，只是名字还留着两个。

<small>codex</small> `PluginManifestPaths` 只有四个字段：`skills`、`mcp_servers`、`apps`、`hooks`；命令走另一份清单，并且有一个专门的迁移器把命令 `.md` 变成 `SKILL.md`，名字加 `source-command` 前缀、上限 64 字符。也就是说 codex 的答案是**命令不是一类东西，它是技能的一种来源**。

> 「native hooks」不是一个包——一个原生 hook 就是一个订阅了规范生命周期事件的普通 Cordis 插件。所以真正的产品是一套*强大且类型良好的规范事件 API*；两个桥只是把外部 shell hook 协议翻译到同一套 API 上的翻译器。`— dsh 拦截扩展点决策笔记`

::: tip 判断
分岔，但三家在往同一个方向走：**把「命令」并进「技能」**。CC 让技能目录直接当插件，codex 让命令迁移成技能，dsh 从另一头到了同一处——它只有插件这一种东西，技能和命令都是插件注册出来的。三家都不再把扩展类型当成一张要不断加行的表。
:::

### 02 从哪儿发现，谁盖谁 <Badge type="warning" text="分岔" />

同名的技能出现两次，谁赢？这道题看起来是实现细节，其实决定了「项目能不能改掉用户的配置」。

- **Claude Code**：`.claude/skills` 与 `.claude/commands` 两个目录 × 项目/用户，加插件目录，加**从 claude.ai 同步下来**的技能
- **codex**：配置层栈从低到高逐层扫（打包默认 → system → managed → user → project → session），且技能可以长在**远端执行器**上
- **deepseek-harness**：六档 rank 表（100 项目 → 600 内置），registry 再按 host + 每个 scope 分层；provider 可以是远程

<small>dsh</small> 它的 rank 表是三家里唯一明码写出来的：`100` `<项目>/.dsh/skills` ·`200` `<项目>/.agents/skills` ·`300` 配置里的自定义目录 ·`400` 用户 dsh 根 · `500` 用户 agents 根 · `600` 随包内置。项目根是「最近的含 `.git` 的祖先」，没有就用当前 cwd。但 rank 只在*同一层内*决胜——跨层是「离得最近的那一层整个赢」，因为 registry 本身还按 host + agent scope 分了层。

<small>codex</small> 它的发现不走本地文件系统 API，走 `ExecutorFileSystem`。结果是技能有三种来源：主机文件、*执行器包*、*编排器包*，而且提示词按来源分了三套写法——主机技能给的是可展开的短路径，执行器与编排器技能给的是不透明定位符，要用 `skills.read` 去读，提示词里专门写了一句「不要把 `skill://` 当成文件系统路径」。扫描有硬上限：递归深度 6、每根 2000 个目录 / 20000 个条目、并发 64。

<small>CC</small> 除了两个本地目录，它还有一路别人没有的来源：**从 claude.ai 同步下来的技能**（文案里有「synced from claude.ai loaded but never invoked」）。也就是说扩展的分发路径里有一条是账号级的，不经过仓库也不经过磁盘约定。

::: tip 判断
分岔。真正的差别不是目录数量，是**扩展被允许长在哪台机器上**：只有 codex 把「这个技能属于远端执行环境」做进了寻址与提示词，只有 CC 有一条从云端账号下来的路。dsh 是纯本地 + 可插 provider——形状最规整，但今天只有本地实现。
:::

### 03 默认信不信任 <Badge type="warning" text="分岔" />

我 clone 了一个仓库，它的 `.claude/hooks.json` 里写着一条 `PreToolUse` 命令。我打开这个目录，它会不会跑？

- **Claude Code**：会。文档自己写着：不带 `--bare` 的 `-p` 会跑项目 `.claude/settings.json` 里的 hooks、连 `.mcp.json` 里的 server，**即使这个目录从没被信任过**，且不弹信任框
- **codex**：不会。hook 有**四态信任**，未信任与「信任过但被改过」的会被列出来，但不进执行集合
- **deepseek-harness**：会。桥读一个进程级 `configPath`，没有信任层——README 自己把这条写成了已知缺口

<small>codex</small> 四态是 `Managed` / `Trusted` / `Modified` / `Untrusted`。判定只有三行：托管来源直接 `Managed`；否则比对存下来的 `trusted_hash`——相等是 `Trusted`，不等是 `Modified`，没有是 `Untrusted`。随后只有 `Managed` 与 `Trusted`（或显式 bypass）才会被推进 `handlers`；其余的照样出现在 `hooks list` 里，但不会执行。**「发现」与「执行」在这里是两件事。**

<small>codex</small> 哈希算的不是源码文本，是*归一化后的配置身份*（事件名 + matcher 组 + 规范化过的 handler），源码注释写明了理由：让来自 `config.toml` 与来自 `hooks.json` 的等价 hook 收敛到同一个信任身份。后果很具体——把一条 hook 从 TOML 搬到 JSON 不会掉信任，而改一个命令行参数会立刻掉回 `Modified`。

<small>codex</small> 谁能盖章也是写死的：只有 user 层与会话 flag 层能写 hook 状态。注释原话是「project、managed 与 plugin 层可以*发现* hook，但它们不能写用户的 hook 状态」——**一个仓库不能给自己的 hook 盖章**。企业侧还有两把：`allow_managed_hooks_only` 让托管层直接忽略用户/项目/会话的全部 hook；托管 requirements 还能*要求*某条 hook 必须加载，加载失败进的是 `required_load_errors`——不是 warning。

<small>CC</small> 它把同一个问题放在了别处：设置分层加两个开关——`--safe-mode`（把 CLAUDE.md、技能、插件、hooks、MCP、自定义命令与 agent、输出风格、工作流、主题、键位*全部*关掉，用来排查坏配置）与 `--bare`（跳过全部自动发现，为的是 CI 里每台机器结果一致）。安装环节另有一条供应链规则值得抄：市场条目若设了 `headersHelper`，就必须内联完整清单（`strict: false`，把 commands/agents/hooks/mcpServers 都列出来），否则 Claude Code 拒绝运行这个 helper——理由原文是「so users can review what it ships before the command runs」。

::: tip 判断
本篇最大的一处分岔，而且是可以直接抄的那种形状。codex 是三家里唯一把「默认不执行」做成前置条件的，并且用三件小事把它撑住了：归一化身份哈希、只有用户层能盖章、托管层能强制要求。CC 与 dsh 在这一格上是同一个答案：**发现即生效**。
:::

### 04 拦截点有几个，各自能干什么 <Badge type="warning" text="分岔" />

事件表的长度差了四倍多。但把三家的表叠在一起，交集稳定在五个点上——而三家对「这五个点各自有多大权力」的答案完全不同。

- **Claude Code**：**31 个事件**，二进制里全部命中。从 `Setup` 到 `WorktreeRemove`，覆盖会话、工具、任务、压缩、目录、审批六类
- **codex**：**11 个**（源码 `HOOK_EVENT_NAMES`；官方文档只列了 10）。其中 9 个的 matcher 有意义
- **deepseek-harness**：**7 个规范扩展点**加两个受限位置，而且它们**按授权分级**——不是同一种返回值

<small>CC</small> 31 个：`SessionStart` `Setup` `UserPromptSubmit` `UserPromptExpansion` `PreToolUse` `PermissionRequest` `PermissionDenied` `PostToolUse` `PostToolUseFailure` `PostToolBatch` `Notification` `MessageDisplay` `SubagentStart` `SubagentStop` `TaskCreated` `TaskCompleted` `Stop` `StopFailure` `TeammateIdle` `InstructionsLoaded` `ConfigChange` `CwdChanged` `DirectoryAdded` `FileChanged` `WorktreeCreate` `WorktreeRemove` `PreCompact` `PostCompact` `Elicitation` `ElicitationResult` `SessionEnd`。

<small>codex</small> 11 个：`PreToolUse` `PermissionRequest` `PostToolUse` `PreCompact` `PostCompact` `SessionStart` `SessionEnd` `UserPromptSubmit` `SubagentStart` `SubagentStop` `Stop`。源码里还单列了一张「哪些事件的 matcher 字段有意义」的表——9 个，因为 `UserPromptSubmit` 与 `Stop` 根本没有可匹配的主体。

<small>dsh</small> 它不给事件表，给的是一条工具调用管线上**六种不同的权力**：`tools/pre-execute` 是策略瀑布（允许 / 拒绝 / 询问）；`ctx.tools.guard()` 在整条瀑布之后，**只能拒，永远不能强制放行**——理由是这样监听顺序就无法复活一个被终局不变量禁止的操作；`tools/execute` 是环绕层（超时、重试、计量），可以换 `signal` 但不能删掉它；`tools/post-execute` 能改内容、能换值、能挂上下文；`finalizeContent` 只能改 `content`，改不了 `isError` 与错误身份；`tools/result` 只能看。加上 `agent/session-start`（只能观察，挡不住启动）、`agent/pre-step`（能整批拒绝）、`agent/turn-stopping`（只能通过 steer 要下一步）。

<figure class="diagram">
<!--@include: ./figures/extensions-1.svg-->
<figcaption>管线用的是 dsh 的分段，因为只有它把每一段的权力单独定了类型。外部 hook 协议（Claude Code、codex 与 dsh 的两个桥都是它）只够得到其中两个位置；其余五个位置只有同进程的原生插件能到。最左边那一格是后面第 06 维的伏笔——入参在那里就封存了，而两家的 hook 协议都试图在下一格改它。</figcaption>
</figure>

<small>交集</small> 把三家叠起来，稳定的交集是五个点：`SessionStart` · `UserPromptSubmit` · `PreToolUse` ·`PostToolUse` · `Stop`。这不是我挑的——dsh 的两个桥独立地各自支持这五个（Claude Code 桥多接了两个 subagent 点），而它们的取舍是照着「哪些点在自家管线上有对应的授权位置」做的。

::: tip 判断
事件表的*长度*是分岔（31 / 11 / 7），交集却窄得惊人。真正值得抄的不是长度，是 dsh 那句「不是每个扩展都该有同样的权力」——它把「能拒」「能环绕」「能改结果」「只能看」拆成了四种不同的返回类型，于是监听器的注册顺序不再能决定安全结论。
:::

### 05 一个 hook 到底是什么东西 <Badge type="warning" text="分岔" />

配置里写下一条 hook，运行时被启动的是什么：一个进程、一次 HTTP 请求、一次工具调用，还是一次模型推理？

- **Claude Code**：**五种** handler：shell 命令 · HTTP POST · MCP 工具调用 · **prompt（单轮 LLM 判定）** · agent（子智能体判定，实验）
- **codex**：**两种**：command 与 mcp_tool。另有一类跑在执行器里的 hook，一律异步且不进用户可见的报告
- **deepseek-harness**：原生插件是**同进程的 TS 函数**——有类型返回、没有序列化边界；桥只跑 shell command，其余四种解析后跳过并告警

<small>CC</small> 后两种是「用模型当 hook」：`prompt` 起一轮 LLM 判定，`agent` 直接派一个子智能体来判。这把 hook 从「一段确定性的脚本」变成了「一次可以讲道理的裁决」——代价是每次触发都要付一次推理，收益是它能判脚本判不了的东西（比如这条命令的*意图*）。三家里只有它做了这一步。

<small>codex</small> 源码里留着一段值得记的 TODO：执行器作用域的 handler 目前被排除在用户可见的 hook 报告之外（事件、摘要、遥测），「因为唯一支持的一方 hook 就是与执行器作用域执行耦合的」，而且它们*总是异步执行*。TODO 说等所有 hook 都变成执行器作用域之后，「用户可见性」与「阻塞性」这两件事需要各自独立决定。**这正是本仓将来要踩的那个坑的名字。**

<small>超时</small> 三家的取值是同一条来源的三种落法：codex 命令 hook 默认 600 秒（下限 1 秒），唯独 `SessionEnd` 例外——默认 1 秒、上限 3 秒，超了会 clamp 并告警，理由不用解释：进程正在退出。dsh 的参考默认同样是 10 分钟（`DEFAULT_HOOK_TIMEOUT_MS`，注释里写明这就是 CC 的默认值），并且它诚实地记了一笔：CC 的 `UserPromptSubmit` 有自己的 30 秒超时，桥没实现，用的还是 600 秒。

::: tip 判断
分岔。CC 是唯一把「让模型来判」也做成 handler 类型的；另外两家的 hook 都还是「跑一个进程 / 调一个工具」。而 dsh 那句「原生插件能做到桥能做的一切，而且更强——没有序列化边界、有完整 `ctx`、返回是类型化的」点出了另一件事：**hook 协议本身是一种降级**，它存在的理由是兼容别人已经写好的脚本，不是因为它是更好的扩展方式。
:::

### 06 hook 说了算多少 <Badge type="tip" text="协议同构 · 一处分岔" />

退出码、标准输出、多个 hook 同时命中——这一套三家几乎一字不差。分岔只有一处，而那一处恰好是最要紧的：能不能改写工具入参。

- **Claude Code**：exit 2 阻断；JSON 可回 `permissionDecision` / `additionalContext` / `systemMessage` / `continue:false` / `updatedInput`
- **codex**：同一套 exit code 与 stdout 契约；`updatedInput` **必须与 `permissionDecision: allow` 同时出现**，否则报错
- **deepseek-harness**：同一套；`updatedInput` **解析了但不执行**，并把拒绝的理由写成了一份独立提案

<small>同构</small> 三条，三家一致到可以互换配置文件：**exit 2 是阻断**，stderr 就是理由；**其他非零码是非阻断错误**，动作照常；**多个 hook 命中同一点时按 deny > ask > allow 折叠**。dsh 的 `mergeHookOutputs` 原样实现了这条折叠（外加 `continue:false` 一旦出现就粘住、阻断理由用空行拼接、additionalContext 按序累加），codex 的审批阶梯里 hooks 排在第一步且明确「返回 allow 不跳过后面的 deny 与 ask」。

<small>分岔</small> 改写入参这一处，三家给了三个不同的答案。dsh 的理由最完整，值得整段引：

> `PreToolDecision` 不能改写参数。历史与审计调用在执行*之前*就已经落库，UI 呈现读的也是同一份入参，所以 registry 在策略开始之前就把参数封了。一次合法的改写必须在身份创建之前同时更新历史、审计、呈现与执行——那份契约属于另一份提案。

codex 走的是中间路线：`updatedInput` 可以有，但它在输出解析器里被绑死在放行上——没有配 `permissionDecision: allow` 就报「PreToolUse hook returned updatedInput without permissionDecision:allow」；`PermissionRequest` 事件上这个字段是保留字段，直接拒。换句话说：**你可以改它，但你必须同时为它负责**。

<small>Stop</small> 「阻断停止」三家都有，而且都会把回合拉回来再跑一步。差别在护栏：codex 在 hook 给不出续跑提示时发一条 Warning 并*忽略*这次阻断；dsh 的桥把 `stop_hook_active` 恒置为 false 且没做连续阻断上限，后果它自己写在 README 里——一个无条件阻断的 Stop hook 会把每一步都强制续上，除非它自己限制自己。

<small>codex</small> 还有一条别人没有的：hook 塞回来的上下文有**token 预算**。默认 2500 token，超了就把全文写到临时目录 `<temp>/hook_outputs/<thread_id>/`，模型看到的换成头尾预览加一条回去取全文的路径——和它处理超长工具输出用的是同一套截断策略。

::: tip 判断
协议层同构到可以互换配置文件；分岔只在「能不能改写工具入参」这一处，而三家的答案恰好是一条完整的光谱：**允许**（CC）、**允许但必须同时显式放行**（codex）、**拒绝并说明为什么**（dsh）。本仓的四段式在这一点上已经和 dsh 站在同一边——只是我们还没被迫说出理由。
:::

### 07 技能怎么进模型视野，谁付这笔上下文 <Badge type="tip" text="同构 · 三种预算" />

「平时只占一行、命中才读全文」三家一模一样。但那一行也是钱——装了三十个技能，每一轮都在付。三家对这笔钱的处理完全不同。

- **Claude Code**：系统提示词里一行；`/skills` 面板显示每个技能**过去 7 天花掉多少 token**，从没被调用过的会被点名
- **codex**：目录进 World State，预算 = **上下文窗口的 2%**（默认 8000 字符，封顶 10000 token）；超了先缩描述，再全砍成只剩名字
- **deepseek-harness**：首个 pre-step 注入一条 durable `<system-reminder>`；之后每步比对摘要，变了就**整段替换**，描述截 500 字

<small>同构</small> 加载形状三家一致，连措辞都像：常驻一行描述 + 命中才读全文。CC 的界面原文写得最直白：「one-line listing in the system prompt, included every turn（dash = not in the current listing, costs nothing; full SKILL.md loads only when it runs）」。

<small>CC</small> 只有它把账单摊开给用户看：`/skills` 面板有一列「7d tokens = tokens attributed to the skill over the last 7 days of sessions」，还会点名——「loaded but never invoked. Each one adds to the system prompt every turn. Disable in /skills, or remove from .claude/skills」。**三家里只有它给每个扩展贴了价签。**

<small>codex</small> 它选择硬压。预算是上下文窗口的 2%（默认 8000 字符 / 封顶 10000 token），放不下时走两级降级：先按分配缩短每条描述并挂一条告警——原文是「Codex 仍然看得见每一个技能，只是有些描述短了；关掉不用的技能或插件能给其余部分腾地方」；实在放不下就把*所有*描述删光，只留名字。单条描述另有 1024 字符上限，缩到 100 字符以下会额外告警。

<small>codex</small> 而且它已经在量化「技能太多要检索」这道题：`dynamic_skill_selector` 下有十种便宜的选择器——fielded BM25、字符 n-gram、路由卡、LRU、多查询、RRF 融合、加权词法……它们在**影子模式**下每一轮都对真实查询跑一遍，只出指标（目录条数、选中条数、缩减基点、耗时），*不改变模型可见的目录*。模块头写着这是临时实验、评估完就删。这与 Claude Code 的 tool search 是同一道题的两个答案：一个在延迟加载工具定义，一个在评估要不要延迟加载技能描述。

<small>dsh</small> 它的注入是一条 durable 的用户角色消息，不是 system 段；之后每一步比对渲染出来的目录摘要，变了就追加一条完整替换（删光了就追加一条显式的空目录）。压缩把历史目录消息藏掉之后，下一次完整快照会重新建立目录。**这与本仓 §5.9 定的那条是同一条**——中途注入一律追加到 messages 末尾，绝不动顶层 system。

::: tip 判断
同构，可以当定论：一行描述常驻 + 全文按需 + 目录变化只追加不改前缀。分岔全在预算这一格，而三家分别选了三种性质的解法：**让用户看见价格**（CC）、**按窗口比例硬压并降级**（codex）、**靠摘要比对少发几次**（dsh）。三者不互斥。
:::

### 08 斜杠命令到底是什么 <Badge type="warning" text="分岔" />

判据只有一句：命令执行完，模型知不知道发生过这件事？三家的答案是「一定知道」「一定不知道」「因为它已经不是命令了，所以知道」。

- **Claude Code**：一个提示词模板，展开成用户消息。`.claude/skills/deploy/SKILL.md` 直接给出 `/deploy`
- **codex**：命令被吸收进技能。触发靠 `$Name` 提及，加 `skill://` `mcp://` `plugin://` `app://` 四种统一寻址
- **deepseek-harness**：命令是插件注册的 handler，**直接对 agent 执行、不产生任何模型消息**，只落 `command/run` 与 `command/done` 两条日志

<small>CC</small> frontmatter 键在二进制里都在：`argument-hint` `allowed-tools` `disable-model-invocation` `user-invocable` `license` `when-to-use`。后两个开关值得单独记——**dsh 一字不差地读同样的两个键名**（`disable-model-invocation` 与 `user-invocable`），并把它们归一化成两个正布尔 `{ modelInvocable, userInvocable }`，四种组合全部保留：两个都关的技能仍然能被受信任的内部调用取到。「谁能调它」是一个二维问题，不是一个开关——这一点两家独立想到了一起。

<small>codex</small> 迁移器把命令 `.md` 变成 `SKILL.md`：名字加 `source-command-` 前缀、限长 64；正文按词边界把 `claude code` / `claude-code` / `claude_code` / `claudecode` / `claude` 改写成自家词，`CLAUDE.md` 改写成 `AGENTS.md`。描述缺失的处理还分了档：Claude Code 档要求 frontmatter 里必须有 description，没有就跳过；Cursor 档允许拿源文件名兜底。

<small>dsh</small> 它的命令契约里有两条别人没有的。一是 `recordInput`（默认 true）——某些命令的载荷已经由它自己的领域事件记过一遍了，就把 `rawInput` 关掉，避免会话日志里存两份同样的东西。二是图片准入：命令没声明 `input.images` 就在 handler 之前判错，**被拒的批次不产生任何持久对象**，原图还留在输入框里。另外它的结果里有个 `sourceEventSeq`：命令可以说「我的结果就是日志里第 N 条那个事件」，客户端据此渲染，不用解析文本。

<small>本仓</small> M1-20/21 的 `/help` `/diff` `/resume` `/continue` 走的正是 dsh 那条路——路线图里那句「只增加入口，不另造 Runtime 语义」和 dsh 的「不创建模型消息」是同一个决定。

::: tip 判断
三条路，判据是「模型知不知道」。CC 一定知道（命令*就是*一条用户消息），dsh 一定不知道（除非 handler 自己塞），codex 因为把命令变成了技能，答案也是「知道」。代价对称：知道的那一边，命令天然可以被模型复用；不知道的那一边，命令永远不会污染上下文，也永远不能被模型自己触发。
:::

### 09 怎么传给下一个人 <Badge type="warning" text="分岔 · 但格式已经趋同" />

分发这件事三家分岔得最开：一个做了市场，一个做了应用商店，一个没有。可它们同时在做另一件事——读对方的配置文件。

- **Claude Code**：`plugin.json` + `.claude-plugin/marketplace.json`；源可以是 GitHub `owner/repo`、SSH、HTTPS 的 marketplace.json、本地路径
- **codex**：清单里带一整套**应用商店字段**：类目、能力、品牌色、明暗两版 logo、截图、隐私政策与服务条款 URL、三条默认 prompt
- **deepseek-harness**：没有市场。分发靠 preset / bundle 包与 `cordis.yml` 里的组合行

<small>CC</small> `/plugin` 的子命令把它的分发观暴露得很清楚：`init`（脚手架）· `validate`（校验 plugin.json 与市场条目版本一致）·`tag`（打 `{name}--v{version}` 的 git tag）· `list` · `eval`。错误文案里还能读出三条规则：插件路径不许用 `..` 跳出插件目录；`plugin.json` 与市场条目同时声明组件是冲突；版本不一致时「plugin.json wins at install time」。

<small>codex</small> 它的 `PluginManifestInterface` 已经不是开发者清单了，是商店详情页的字段表：`display_name` `short_description` `long_description` `developer_name` `category` `capabilities` `website_url` `privacy_policy_url` `terms_of_service_url` `default_prompt`（最多 3 条、每条 128 字符）`brand_color` `composer_icon` `logo` `logo_dark` `screenshots`。加上 npm 源、远程 bundle、市场策略、启动同步、按插件计量的 sidecar——这是一条完整的软件供应链，不只是一个加载器。

<small>互相导入</small> 这才是本篇的头条。codex 的 `external-agent-migration` 把 Claude Code 的 hooks、命令（转成技能）、记忆、MCP、subagent、会话，连同**已经装好的插件市场**一起搬过来——它认得 `plugins/known_marketplaces.json`，并且硬编码了两个官方源（`anthropics/claude-plugins-official` 与 `anthropics/claude-code`）。dsh 反过来，写了两个桥去跑用户现成的 hook 配置，共享库 README 的第一段就说明了理由：

> Codex 是**刻意**重新实现了 Claude Code hook 协议的一个*子集*——同样的 `hooks.json` matcher 组形状、同样的退出码/标准输出契约、同样的命令 hook 执行模型。真正共享的那部分放在这里，每个桥只保留自己不一样的地方。

<small>还有一条只在源码里看得到</small> codex 的 hook 引擎，那个结构体的名字叫 `ClaudeHooksEngine`。不是注释，是类型名，散在十几个文件里。

::: tip 判断
分发的*形态*三家分岔到没有可比性（市场 / 应用商店 / 没有），但扩展的*格式*已经趋同。这是十二篇里唯一一处三家互相读对方配置文件的地方——也就是说，将来本仓做 hooks 时，「自己设计一套事件名与返回约定」不再是一个中立选项：它意味着放弃已经存在的三份实现与两份桥。
:::

## 分岔汇总

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| 扩展的种类 | 11 种组件目录；技能目录本身就是插件 | 清单四类 + 单独的 commands；命令迁移成技能 | 只有一种：插件 | 只有 `SkillRef` 一个接口（§5.9） |
| 发现与作用域 | 项目/用户两个目录 + 插件 + claude.ai 同步 | 六层配置栈；技能可长在远端执行器上 | 六档 rank + host/scope 双层 registry | 无。`load()` 从哪来没定义 |
| 默认信不信任 | 发现即生效；未信任目录也跑 | **四态信任，默认不执行**；只有用户层能盖章 | 发现即生效；无信任层（自记缺口） | 无扩展面，问题尚未出现 |
| 拦截点数量 | 31 个事件 | 11 个（9 个有 matcher） | 7 个规范点 + 2 个受限位置 | 四段式是固定管线，无插点 |
| 拦截点的权力 | 同一种返回，靠字段区分 | 同一种返回，靠事件区分 | **按位置分四类返回类型** | 固定：判定 → 审批 → 执行 → 审计 |
| handler 形态 | 五种，含 prompt 与 agent（用模型判） | 两种：command / mcp_tool | 原生是同进程函数；桥只跑 command | — |
| 能否改写工具入参 | 能（`updatedInput`） | 能，但必须同时显式放行 | **不能**，理由是审计与历史已落库 | 不能（入参先落审计，同一理由） |
| 技能的上下文预算 | 不压；把 7 天 token 账单给用户看 | 窗口 2%，两级降级到只剩名字 | 描述截 500 字；摘要比对决定重发 | 未定；§5.9 只定了注入位置 |
| 斜杠命令的身份 | 提示词模板 → 用户消息 | 已被吸收进技能；`$Name` 提及 | 插件 handler，不产生模型消息 | 同 dsh：只增加入口，不造语义 |
| 分发 | plugin.json + 市场，四种源 | 应用商店级清单 + npm/远程/策略 | preset / bundle，无市场 | 明确不做（§15.2） |

## 对本仓意味着什么

本仓今天在这一层几乎是空的：`§5.9` 定了 `SkillRef` 的三个字段与注入位置，hooks 排在 M3+，插件市场明确不做。所以这一节的用法不是「照着补」，而是**把将来一定会撞上的几道题先认出来**。

### 五个拦截点是最小集，hook 的返回协议是事实标准 <Badge type="tip" text="同构 · 可当定论" />

`SessionStart` · `UserPromptSubmit` · `PreToolUse` ·`PostToolUse` · `Stop`——两个桥独立地各自选中了同一组。返回协议同样：exit 2 阻断、其他非零不拦、多个命中按 deny > ask > allow 折叠。将来做 hooks 时这两样直接抄，别自创；自创的代价是放弃三份实现与两份现成的桥。

### 技能的加载形状不用再想了 <Badge type="tip" text="同构 · 可当定论" />

一行描述常驻 + 命中才读全文 + 中途注入只追加不改前缀——三家一致，而本仓 §5.9 已经定在这条线上（`description` 常驻、`load()` 按需、正文进 messages 末尾的 `role:"system"`）。**接口形状不用改**。M3 落地时要补的是它下面那一层，见下一条。

### 技能的发现层与作用域，是 M3 的第一道题不是第二道 <Badge type="warning" text="本仓没有 · 补不补是决策" />

`SkillRef { id, description, load() }` 回答了「一个技能长什么样」，没回答「它从哪儿来」。三家在这一格都是先有 rank 表或层栈，再谈别的——因为「项目能不能盖掉用户的同名技能」这个问题一旦晚定，已经写好的 `load()` 调用点全都要重来。dsh 的六档 rank + 「就近层整个赢，rank 只在层内决胜」是最小可抄的形状。

### 工具执行管线可插层：触发条件已经具备一半 <Badge type="warning" text="本仓没有 · 补不补是决策" />

`路线图 §15.3` 那一行写着重估条件是「出现第二个需要环绕工具执行的关注点（重试策略分档、按工具计量、hooks 落地）」。这一篇给出的信息是：hooks 落地时需要的不是「第二个环绕点」，而是**四种授权不同的位置**——能拒的、只能拒的、能包的、能改结果的、只能看的。那一行可以从「只有一个关注点，拆出来是为抽象而抽象」更新成「已知需要四类返回类型」，判据变了，结论要不要变是另一件事。

### hooks 的触发条件与信任问题是同一天到达的 <Badge type="warning" text="本仓没有 · 补不补是决策" />

§15.3 把 hooks 排在「当第一个非项目作者本人的用户出现时」——而那恰好也是「这条 hook 该不该跑」第一次有意义的那一天。codex 的形状是现成的：归一化配置身份哈希、四态、只有用户层能盖章、托管层能强制要求某条 hook 必须加载。这三样合起来才成立，单抄一样不够。

### 发现即生效，还是默认不执行 <Badge type="warning" text="三家分歧 · 自己判" />

CC 与 dsh 是「发现即生效」，codex 是「默认不执行」。本仓的红线里有一条同源的理由：「护栏不是沙箱；`risk` 判不了参数一律向上取整按最坏处理」。同一条理由指向 codex 那一边——一个还没被盖章的 hook，恰恰是「判不了」的最纯粹形态。但代价也要一起摆上桌：默认不执行意味着用户装上一条 hook 之后*什么都不会发生*，直到他找到那个盖章的地方。这一条要问，不能自己批。

### 斜杠命令要不要变成模型看得见的东西 <Badge type="warning" text="三家分歧 · 自己判" />

本仓现状（`/help` `/diff` `/resume` `/continue` 只增加入口）与 dsh 同构：命令不产生模型消息。另外两家都往反方向走——CC 让命令*就是*用户消息，codex 干脆把命令变成技能。反方向的好处很实在：命令写一次，人能敲、模型也能自己调。这不是现在要决定的事，但它决定了将来 `/xxx` 是不是要有 frontmatter。

## 明确没核到的部分

- **没有把任何一家的 hook 真正跑起来**。下文所有关于阻断、折叠、超时的结论都是契约层面的——「多个 hook 同时命中时实际的执行顺序与耗时」没有实测。
- **Claude Code 的 hook 分层发现与并行/去重规则没有一手证据**。我只有 dsh 桥 README 的转述：它说 CC 会并行跑并且对相同 handler 去重，而桥自己是串行且不去重。这条转述没有第二个来源。
- **CC 那 31 个事件是从二进制里 grep 到的*名字***。每个事件各自的载荷字段与返回契约没读到——除了那 7 个被 dsh 桥实现过的，那部分有逐字段的对照。
- **CC 的五种 handler 类型没有在二进制里直接核到**。它来自上一轮的文档盘点；这一轮只反向验证到 dsh 桥明确跳过 `http` / `mcp_tool` / `prompt` / `agent` 四种。
- **事件数 31 与 dsh README 里的「30」对不上**。两个都不算错——它的对照基线是官方文档的公开列表，我数的是二进制里的标识符，差的那一个大概率是新加的。凡是依赖精确条数的结论我都没写。
- **codex 的 `core-plugins`（4 万行）只读了清单、命令迁移与市场入口**。插件的实际加载、隔离与权限没读；「应用商店级清单」是从字段表推的定位，不是读到的加载逻辑。
- **dsh 这一轮读的是 README 与子系统文档，TS 实现没进去**。它的文档是从源码类型生成并逐条注释的，但毕竟不是代码——这是 `credentials-local` 那一轮已经记过的教训。
- **三家的 MCP 面这次都没展开**。它在扩展面里是一块独立的大陆（codex 的清单里它与 skills 平级，CC 有企业级的 MCP 允许清单，dsh 有独立的 mcp 包组），值得单独一篇。

## 落点索引

#### codex · codex-rs/hooks/

- `src/lib.rs:22` `HOOK_EVENT_NAMES` 十一个 · `:42` 九个有 matcher 的 · `:90` hook 状态键的构成
- `src/engine/discovery.rs:659-706` 信任判定与「只有 Managed/Trusted 才进 handlers」· `:742-751` SessionEnd 的 1s/3s · `:752-793` 归一化身份哈希与四态
- `src/config_rules.rs:8-15` 只有 user 与 session flag 层能写 hook 状态 · `src/output_spill.rs:12` 2500 token 与临时目录外溢
- `src/engine/output_parser.rs:431-441` `updatedInput` 必须配 allow · `:392` PermissionRequest 上它是保留字段 · `src/engine/mod.rs:69-80` 执行器作用域 handler 的 TODO

#### codex · 技能、插件与迁移

- `ext/skills/src/loader/mod.rs:19-32` `SKILL.md` / `agents/openai.yaml` 与全部长度上限 · `loader/metadata.rs` 旁挂元数据（工具依赖、OAuth 回调端口、`allow_implicit_invocation`）
- `ext/skills/src/render.rs:17-28` 2% 预算与两级降级 · `catalog_prompt.rs` 三套目录提示词全文 · `dynamic_skill_selector.rs` 与 `shadow_selection_experiment/` 十种选择器与影子指标
- `skills/src/parser.rs:52-57` 给第三方技能修 YAML frontmatter · `skills/src/mentions.rs:37-41` `$` 提及与四种 URI 前缀
- `plugin/src/manifest.rs` 清单与商店字段 · `core-plugins/src/command_migration.rs:14-15` `source-command` 前缀与 64 上限 · `external-agent-migration/src/source/cla.rs:19-31` 改写词表 · `:21-25` 两个硬编码的官方市场 · `hooks_cla.rs` hook 迁移

#### deepseek-harness · packages/ 与 docs/

- `packages/hooks/hook-protocol/README.md` 共享协议：matcher 两种模式、`parseHookOutput`、`mergeHookOutputs` 折叠、detached 运行的 drain 语义
- `packages/hooks/hooks-claude-code/README.md` 七个映射点与 23 项未支持事件的逐条清单 · `hooks-codex/README.md` 五个映射点与 Codex 十点里的五点缺口
- `docs/subsystems/skills.md` 六档 rank、双层 registry、两个 frontmatter 开关、目录摘要比对 · `docs/subsystems/commands.md` `recordInput`、图片准入、`sourceEventSeq`
- `.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md` 六段管线各自的授权，以及拒绝入参改写的完整理由

#### Claude Code · 2.1.247

- `bin/claude.exe` 中 `grep -a` 命中：31 个事件名全部在库 · frontmatter 键 `disable-model-invocation` / `user-invocable` / `allowed-tools` / `argument-hint` / `when-to-use`
- 插件识别清单（`.claude-plugin/` 或十一种顶层组件之一）· `/plugin init|validate|tag|list|eval` 的帮助与错误文案 · `headersHelper` 必须内联清单那条规则
- 技能计量文案：一行常驻的措辞、7d tokens 归因、「loaded but never invoked」告警 · `--safe-mode` 与 `--bare` 的说明

#### 本仓

- `docs/architecture/运行时内核.md` §5.9 `SkillRef` 三字段与「注入 messages 末尾，绝不动顶层 system」
- `docs/路线图.md` §15.2 插件市场不做 · §15.3 Skills / hooks / 斜杠命令 / 工具执行管线可插层四行
- `docs/架构设计.md` §4 不变量 5、6（能力只能经 ToolProvider 进入；副作用必走四段式）· §4.1 冲突优先级阶梯

---

三家对读系列 · 第十二篇 · 核验日期 2026-08-27 · 本文是时效证据，不定义 § 锚点、不定义不变量、不构成决定 · 结论进架构正文要走 ADR
