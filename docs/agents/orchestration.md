---
title: 编排层三家对读
label: 编排层
group: 平台能力
order: 1
date: 2026-08-27
summary: 待办 / 计划模式 / 目标 / 后台 / 定时
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

# 编排层

<Badge type="info" text="三家对读 · 第十一篇 · 核验日期 2026-08-27" />

待办清单、计划模式、目标、后台任务、定时——模型给自己派的活儿。三家在这一层的功能几乎重合到令人意外，而它们把同一个功能接进循环的位置，没有一处是一样的。

<Badge type="info" text="pending" /> <Badge type="warning" text="in_progress" /> <Badge type="tip" text="completed" />

Claude Code 2.1.246 · codex（codex-rs 全量）· deepseek-harness（全量 + 子系统文档）· 本仓作为第四列 · 九维

## 这件事在解决什么

一个回合循环只回答「这一步做什么」。可是真实任务不是一步——它有十二个子步骤、有一件要等测试跑完才能继续的事、有一个「跑到全绿为止」的目标、还有一条「二十分钟后再看一眼」的提醒。这些东西都要有地方待着，而循环本身没有地方放它们。

编排层就是这些「地方」的总称。它其实是四道各自独立的题，很容易被当成一道：

- **现在这一段活儿的进度**——待办清单。给人看的多，给模型看的少。
- **这一整段任务的终点**——目标。它决定「什么时候可以停」，也就决定了要不要自己接着跑。
- **不在这一轮里发生的事**——后台任务与定时。做完了、到点了，怎么回到对话里。
- **做之前先说清楚**——计划模式。它看起来是产品形态，实际上是一道权限题。

这四道题在三家那里都有答案，而且答案的*功能*相似到可以并排放进一张表。真正分岔的是**接入点**：同一个「跑到条件满足为止」，一家在空闲派发处注入上下文，一家合成一条被准入的用户轮次，一家干脆拦住「停」这个动作。这才是这一份要读出来的东西——功能表看不出差别，接入点看得出。

## 三家是谁，证据到什么档次

::: codex 一手源码
读了 `ext/goal`（含四份提示词模板全文）、`ext/queue`、`core/src/tools/handlers/plan.rs` 与它的 spec、`ModeKind` 全部引用点、`unified_exec` 的模块头。
:::

::: dsh 一手源码 + 子系统文档
这一轮主要读它的 `docs/subsystems/`——goal / jobs / schedule / plan / workflow 五份都是从源码类型生成并逐条注释的参考文档，比读实现更准；再加六个包组的 README。
:::

::: claude 压缩源码 + 实机 + 自带工具
`bin/claude.exe` 里 `grep -a` 出的 schema 与文案，加上**本会话直接持有的工具定义**——`CronCreate` 三件套与 `ScheduleWakeup` 的完整契约是从工具面板取的原文，不是推的。
:::

::: info Claude Code 这一列有一处证据比另外两家还硬。
定时那一维的取值域、抖动规则、7 天过期、「只在 REPL 空闲开火」，全部来自我这个会话自己能调用的那几把工具的定义原文。相对地，`/goal` 与 `Task*` 那两组来自压缩产物里的标识符与文案，控制流没读——凡是涉及「什么条件下走哪条分支」的地方，下文都标了没核到。
:::

## 九个维度

每一维先给三家的一句话答案，再展开。顺序按「这一步 → 这一段 → 这之后」排。

### 01 待办清单的形状 <Badge type="tip" text="同构" />

模型怎么把「我打算分几步做」写下来？三家给的字段几乎一样，但把规矩放在了不同的地方。

- **Claude Code**：`TodoWrite`：`{content, status, activeForm}`，多一个「现在进行时」字段给界面用
- **codex**：`update_plan`：`{explanation?, plan:[{step, status}]}`，规矩只写在工具描述里
- **deepseek-harness**：`todo_write`：`{content, status}`，多一个字段都报错；并发规矩是部署配置

<small>整表替换</small> 三家一致：模型每次都要把**完整的清单**发一遍，没有增量更新、没有单条编辑、没有读回工具。三个状态值也一字不差：`pending` / `in_progress` / `completed`。codex 的类型文件里还留着一行来历注释——这套参数是照着它自己 VS Code 扩展里的 todo-mcp 抄过来的。

<small>分岔一</small> **「同时只能有一件在做」这条规矩归谁管。** codex 把它写在工具描述里（「At most one step can be in_progress at a time.」），而 handler 只做 JSON 反序列化，**一次都不校验**——解析完直接发一条 `PlanUpdate` 事件，返回给模型的字符串是常量 `"Plan updated"`。dsh 把它做成了一个**必填**的部署配置 `allowParallelInProgress`，而且这个开关同时挪动提示词与校验：为 `true` 时要求模型标出每一件正在做的事、接受任意条数，为 `false` 时要求恰好一条、多标一条就报错。

> durable-log 那条不变量刻意不跟着这个开关走——一份在允许并发时写下的日志，在部署把策略收紧之后仍然必须能重放。

<small>分岔二</small> **对模型手滑的容忍度。** dsh 拒绝任何超出 `content` / `status` 的键，理由写得很直白：一个带 id 或嵌套的扩展形状应当*大声失败*，而不是被悄悄压平——否则日志里存下的清单就和模型以为自己写下的那份不一样了。Claude Code 走了相反的路：它有一层别名归一化，把 `id` / `task_id` 认成 `taskId`、把 `active_form` 认成 `activeForm`，并把发生了哪几种归一记成一个 `shapeClass` 埋点。两种都成立，区别是谁承担偏差：dsh 让模型重来一次，Claude Code 自己吸收掉并统计。

::: tip 判断
清单这件事已经收敛：整表替换 + 三态 + 一条「同时只做一件」的约定。真正要选的只有两处——规矩写在描述里还是校验里，以及模型给错形状时是纠正它还是原谅它。**本仓两处都还没选**：不但没有这把工具，文档里连一条关于它的决策都没有。
:::

### 02 计划模式硬到什么程度 <Badge type="warning" text="一条完整光谱" />

「先出方案再动手」——这句话是提示词里的一段话，还是一道拦得住工具的闸？

- **Claude Code**：它**就是一档权限模式**，与 acceptEdits、bypassPermissions 并列
- **codex**：提示词来自**模型目录**，另加两条点状硬规则；安全侧完全不读它
- **deepseek-harness**：明写是 **soft guidance**：沙箱与审批各自独立，谁都不读计划状态

<small>最软</small> dsh 的 `plan/mode` 是一个 log-only 的会话事件（`{active: boolean}`），纯 fold 恢复，resume、fork、压缩都不需要活镜像。它做的唯一一件事是让一段部署自定义的 `plan:policy` 提示词分节参与请求组装。文档把边界说死了：

> Sandbox mode and approval policy enforce restrictions independently; neither reads or writes plan state.

还有一处很讲究：`exit_plan_mode` 这把工具**常驻注册**，进出计划模式只改提示词分节、*绝不改请求里的工具目录*——因为工具目录一变，KV 缓存前缀就废了。

<small>中间</small> codex 的 `ModeKind` 只有 `Plan` 与 `Default` 两个值。它的计划模式指令来自**模型目录**（`CollaborationModeMessages{default, plan}`）——也就是每个模型自带一份属于自己的计划模式提示词，由服务端下发而不是客户端硬编码。安全侧同样不读它（`safety.rs` 与工具装配里没有任何 `ModeKind` 分支），但有两条点状的硬规则：

- `update_plan` 在计划模式下**直接被拒**，错误原文是「update_plan is a TODO/checklist tool and is not allowed in Plan mode」——它把「清单」和「计划模式」认成两件不该混的事，并且用代码把这个区分钉住了。
- 自动唤醒不能开启一个计划轮：`is_automatic_idle_work` 为真时进入计划模式的提交会被拒，注释写着「空的非恢复启动是自动唤醒，不是显式的用户请求」。

<small>最硬</small> Claude Code 把计划模式做成了权限模式本身——在权限档的列表里，它和「接受编辑」「跳过全部权限」是同级选项，说明文字是「research and propose changes without making them」。还有一条专门的规则：计划模式下第一次读某个文件时，**批准必须来自用户、不能来自自动权限分类器，而且只覆盖这一次读**。

::: tip 判断
四家排成一条线：dsh 纯提示词 → codex 提示词加两条点状硬规则 → Claude Code 权限档 → **本仓在装配期就把工具裁掉**。本仓的立场早就写死在路线图上：四态产品形态可以后置，但「模式影响装配期工具可见性」这条机制不后置，理由是「提示词约定挡不住模型调用一个它看得见的工具，装配时裁掉才挡得住」。这句话恰好是 dsh 明确选择*不*去解的那件事。
:::

### 03 目标：跑到条件满足为止 <Badge type="tip" text="三家都有 · 接入点三样" />

这一整段任务的终点写在哪儿？谁决定「还没到，接着跑」？

- **Claude Code**：`/goal <condition>`：给会话装一个 **Stop 钩子**，把条件当提示词交回去
- **codex**：`ext/goal` 扩展：三把工具 + 六档状态 + 一整份续跑提示词模板
- **deepseek-harness**：`goal` 包：事件溯源 + revision CAS + 四档相位，另有一维进程内 activation

<small>意外</small> 开读之前我以为这是只有一两家做了的功能。**三家全都有，而且都不是玩具。** 这是这一份里最强的一处同构信号——功能本身不必再论证要不要做。

<small>codex</small> `create_goal` / `get_goal` / `update_goal` 三把工具，状态是六档：`Active` / `Paused` / `Blocked` / `UsageLimited` / `BudgetLimited` / `Complete`。续跑靠一份内嵌模板 `templates/goals/continuation.md` 注入成一段内部上下文片段，而那份模板本身是这次读到的最讲究的一段提示词工程——它花了大半篇幅只讲两件事：**不许把目标缩小成现在做得完的样子**，以及**完成必须被证明，而不是「没找到明显的剩余工作」**。

> Keep the full objective intact. If it cannot be finished now, make concrete progress toward the real requested end state, leave the goal active, and do not redefine success around a smaller or easier task.

「卡住」也被写成了一条可数的规则而不是感觉：同一个阻塞条件**连续三个目标轮次**重复出现才允许标 `blocked`，用户恢复一个曾被标为 blocked 的目标之后，重新开始一次全新的三轮计数。

<small>dsh</small> durable 与 process-local 被切成了两维，文档里那句话值得抄：**持久相位回答「这个目标发生了什么」，进程内的 activation 单独回答「续跑消费者现在可不可以再起一轮」。** 每次变更都是一条 `goal/change` 事件，载荷要么是变更后的完整快照、要么是一个清除墓碑；`GoalRef{id, revision}` 做 compare-and-set，每次持久变更 revision 加一。「卡住」在这里是类型化的：`GoalBlockReason{code, message}`——一个给路由用的稳定 kebab-case 码，一个给人和模型看的说明。

<small>Claude Code</small> 最轻，也最巧：`/goal <condition>` 做的事情是**往会话钩子注册表里装一个 `Stop` 钩子**，钩子的载荷就是那句条件。于是「还没到就接着跑」不需要任何新的循环机制——它复用的是「拦住停止」这条既有通路。状态是 `{condition, iterations, setAt, origin, tokensAtStart}`；再设一个目标会把旧的标成 `superseded`；条件有字符数上限；`restoreGoalFromTranscript` 让它在 `--resume` 之后回来。

<figure class="diagram">
<!--@include: ./figures/orchestration-taps.svg-->
<figcaption>同一个功能，三个接入点。三处都能让 agent 自己接着跑，但它们对循环的其余部分索取的东西完全不同：合成用户轮次要有一套准入与轮次记账，注入上下文片段要有一个空闲派发链，拦住「停」只要有钩子机制。</figcaption>
</figure>

::: tip 判断
「跑到条件满足为止」可以当定论：三家独立做了同一件事。接入点则是真分歧，而且选哪个几乎完全由既有机制决定——**本仓已经有 `RunInbox` 的步边界注入，那就是它天然的接入点**，不必像 dsh 那样另造一套轮次准入。
:::

### 04 预算：拿什么计量，用完算什么 <Badge type="warning" text="单位三样 · 用法同构" />

自动续跑必须有闸。闸门以什么为单位，撞上之后是一个状态还是一次拒绝？

- **Claude Code**：记 `iterations` 与 `tokensAtStart`；没核到上限
- **codex**：按 **token** 设预算，同时记墙钟时间；用完落 `BudgetLimited` 状态
- **deepseek-harness**：按 **轮次** 设 `maxGoalRounds`；超额不是状态，是一条重放校验

<small>codex</small> `token_budget` 可选，另外始终记录 `tokens_used` 与 `time_used_seconds`——**时间只记不限**。有一处细节很值得抄：**计划模式的轮次不计入 token 记账**（`account_tokens = !matches!(mode, Plan)`）——想清楚怎么做，不该花目标的预算。撞上预算之后不是硬停，而是换一份提示词模板进去：

> The system has marked the goal as budget_limited, so do not start new substantive work for this goal. Wrap up this turn soon… Do not call update_goal unless the goal is actually complete.

最后那句是防守一个很具体的失败模式：预算快用完时，模型会倾向于把目标标成「完成」了事。codex 在两份模板里各写了一遍这句话。

<small>dsh</small> `maxGoalRounds` 按轮次计。超额**不是一个状态**——它是重放时的一条拒绝规则：回放会拒绝非正数轮号、跳号、过期 revision、已停相位、以及超帽。也就是说，一个超了帽的日志根本就不该存在，而不是存在但标着「已超支」。

<small>本仓</small> `RunLimits` 是四轴的：`maxSteps` / `maxTokens` / `maxDurationMs` / `maxCostUsd`，比三家都全。而 `maxTokens` 那条注释写下的设计，与 codex 的两份模板是同一个东西——**一个数字同时当软提醒和硬终止**：越过阈值时往 messages 末尾追加一条提示让模型主动收尾，触及即终止并落 `budget_exhausted`。注释里还记了为什么不是两个数字：曾经 `ModelPolicy` 上另有一个 `taskBudget` 与它并存，那就需要一条「软 ≤ 硬」的校验，而两处漂开时的症状是*模型看到的倒计时和实际终止点对不上*。

::: tip 判断
「预算既是提醒又是闸门」可当定论——本仓与 codex 独立走到了同一处，连防守的失败模式都一样。计量单位是真分歧（token / 轮次 / 步数），而**三家没有一家回答四个上界之间谁压谁**。本仓轴最多，也就最先会撞上这个问题：同时配了 `maxSteps` 与 `maxTokens` 时，先到哪个就落哪个码——这一点目前只在 `RunFailureReason` 的取值域里隐含着，没有明说。
:::

### 05 任务图：有 id 与依赖的那一档 <Badge type="warning" text="一比二" />

清单之上还有没有一层——有稳定 id、有归属人、有「A 做完才能做 B」？

- **Claude Code**：有：`TaskCreate/Get/List/Update` 四把工具，记录带 `blocks` / `blockedBy` / `owner`
- **codex**：没有
- **deepseek-harness**：没有，且写明是**刻意的裁剪**

<small>Claude Code</small> 记录形状是 `{id, subject, description, activeForm, status, owner, blocks[], blockedBy[], metadata}`，落在一个带命名空间与分页的键值存储里（`{namespace: "task", listId}`），配套有 id 高水位线、跳号补记、以及一个 `resetTaskList`。列表排序会把「没有被阻塞的 pending」排在「被阻塞的 pending」前面——依赖不只是记着，是参与排序的。工具描述里还专门划了一道界：它「takes `subject` and `description`… To delegate work to a subagent, use the Agent tool instead」——**任务不是委派**。

<small>另外两家</small> dsh 把不做这件事写进了 Known Limitations，两条并列：条目形状刻意最小化（「whole-list replacement needs no stable id, priority, or active-form fields」），以及清单只属于调用它的那一个 agent 会话，subagent / 共享 / 蜂群作用域是*刻意的裁剪*。codex 那边则连这个概念都没出现过。

::: tip 判断
这道题本仓**已经答过了**，而且和多数派站在一边：`Run.taskId?` 是个预留位，§6.1 写着 M2+ 才做，理由是「半个 Task 比没有 Task 危险得多，因为代码会开始假设它存在」。Claude Code 走另一边付出的代价这次看得见：一套带命名空间、分页、高水位线和 reset 的独立存储，外加一条要反复对模型强调的边界（任务 ≠ 委派）。**这条不用改，但值得把代价记下来**——将来真要做 Task 时，这就是清单。
:::

### 06 后台长活儿：谁收尸 <Badge type="warning" text="二比一" />

一条要跑十分钟的命令、一个要跑五轮的子代理——它们在哪儿跑，做完了怎么让模型知道？

- **Claude Code**：三档：后台 `Bash`、后台子代理、`--bg` 整个会话；都会**在结束时重新唤起模型**
- **codex**：没有通用注册表；答案是可复用的 PTY 会话，模型靠再读一次推进
- **deepseek-harness**：`ctx.jobs`：一个抽象 seam + 本地实现，owner 围栏 + 完成播报

<small>dsh</small> 把它做成了通用能力：id 是 `<kind>-N`，**刻意可预测**——文档原话「Access control relies on owner authorization, not id secrecy」。owner 按 session id 围栏，本地实现默认每个 owner 最多 10 个并发 job；结算是 first-wins，即便生产者迟到的结果也只落一个终态。最讲究的是 `reported` 这一位，它专门用来避免重复播报，而拆除流程会*主动认领*它：

> Teardown claims it because the owner or service being destroyed leaves no reader: a reporter that opens a turn on notice would otherwise spend a model request per teardown layer.

同一份文档还写了「完成播报排在最后」，理由一样——播报可能同步开一轮模型请求，所以必须等记录提交、其它观察者都看过之后再做。这两条是一个已经踩过坑的人写出来的。

<small>codex</small> 没有 job 注册表。它的 unified exec 是可复用的交互式 PTY 进程：创建、复用、带上限的输出缓冲，模型靠再写一次 / 读一次去推进。**没有「完成时叫醒模型」这条通路**——要知道跑完没有，得自己回去读。

<small>Claude Code</small> 三档并存，而且三档的完成语义一致：后台 Bash「keeps running across turns and re-invokes you when it exits」，后台子代理完成时发通知，`--bg` 则把整个会话变成后台代理由 `claude agents` 管。另有一个 `Monitor` 做「按行反应」，而 `CronCreate` 的文档特意把两者分开：Monitor 是流式、事件一发生就到；cron 是按表轮询。

::: tip 判断
两家独立走到「后台活儿结束要能开一轮模型」，可当定论。本仓目前只有一个 120 秒总时长的同步 `bash`，路线图已登记 `idleTimeoutMs` 作为更小的解法，触发条件是「跑测试超时杀掉整个 Run 真的伤到人时」。真到那一步时，**dsh 的 `reported` 位与「播报排最后」这两条是现成答案**——它们防的正是「每一层拆除都花掉一次模型请求」这种只有上线之后才会发现的账。
:::

### 07 排队的活儿怎么进对话 <Badge type="tip" text="四家同构" />

用户中途补的话、到期的提醒、跑完的后台任务——它们在哪一刻插进正在跑的会话？

- **Claude Code**：排队提示词在 REPL 空闲时出队；cron 也只在空闲（不在查询中）开火
- **codex**：`ext/queue`：**可重排**的持久队列，在线程空闲时派发
- **deepseek-harness**：`followup()` 队列；到期工作等 agent 完全空闲并认领维护阶段

<small>共识</small> 四家的答案是同一句话：**只在空闲或边界注入，绝不打断正在跑的这一轮。** dsh 把它写得最直白——到期工作「waits for the Agent to become fully idle and claims the maintenance phase」，而且明说它*从不调 `steer()`*。

<small>codex 多的那一样</small> `ext/queue` 的模块头写着「Durable, storage-neutral user-message queue and idle dispatch」，它注册成线程生命周期贡献者，**排在低优先级空闲贡献者之前**——也就是说 codex 有一条按优先级排序的空闲贡献链，用户排队的消息优先于目标续跑。API 是 `enqueue / list / update / delete / reorder / start`，**`reorder` 是它独有的**：用户可以先排三条，再改主意调顺序。

<small>本仓</small> `RunInbox` 的形状和这一族一致，但边界更细：循环在**每个步边界** drain 一次，而不是等整轮结束。它还额外守住一条别人没有的规矩——*它是只读端口，不是写者*：客户端只把话放进收件箱，`ConversationEntry` 的唯一写者仍然是循环。按 ADR-0090，Esc 的作用是把这个边界提前（掐掉这一轮的模型调用，Run 不停）。

::: tip 判断
这一维四家全同构，是全篇最干净的一处定论：**后来的活儿只在边界进，永远不打断当前轮。** 唯一的分歧是边界的粒度——三家等整轮，本仓等步。更细的代价是 drain 与追加必须是一次事务，而本仓已经付过这笔（收件箱一次取走全部、循环一次事务性追加）。
:::

### 08 定时：本地会话内，还是托管 <Badge type="warning" text="二比一，且都只做了本地那一档" />

「二十分钟后再看一眼」——这件事需要一个调度器吗？

- **Claude Code**：两档：会话内 cron（**明写 session-only**）+ 托管的云端 routines
- **codex**：没有任何按墙钟时间触发的东西
- **deepseek-harness**：session-local；**没有 cron 表达式、没有日历、没有时区**

<small>dsh</small> 三种规则：`after`（延迟）、`at`（绝对时刻）、`every`（固定速率，下限 5 分钟）。协议里**刻意没有** cron 表达式、日历、递归时区、共享冷却或跨记录准入门。时区必须由调用方显式给出——字符串要带偏移，或者用 `{date, time, time_zone}` 的结构形式；Schedule 自己「never reads browser, session, process, or model context」。错过的周期不补齐：一条 every 记录只贡献*最近一次*到期，然后直接跳到下一个锚点对齐的目标，既不枚举也不持久化错过的那些。多条 every 同时到期时合成**一个**批次，理由写得很实在——「batching bounds model turns」。投递是 at-least-once，文档明写崩溃窗口可能让提醒内容重复一次。

<small>Claude Code</small> 会话内那一档是标准五段 cron、本地时区，**`durable` 这个参数存在但明写无效**——「All jobs are session-only (in-memory, gone when this Claude session ends)」。只在 REPL 空闲（不在查询中）开火，递归任务 7 天自动过期。最有意思的是它的抖动规则与配套劝告：调度器给递归任务加最多 10%（上限 15 分钟）的延迟，给落在 :00 / :30 的一次性任务提前最多 90 秒，而工具描述专门劝模型别选整点：

> Every user who asks for "9am" gets `0 9`… which means requests from across the planet land on the API at the same instant.

这是一条把**服务端负载**写进客户端工具描述的设计——三家里独一份。第二档是托管的 cloud routines，受组织策略 `allow_routines` 管控。

<small>codex</small> 没有。全仓 `cron` 只命中 markdown 渲染与 pty 两处无关代码。它的「以后再做」全部走空闲派发，没有任何东西按墙钟时间触发。

::: tip 判断
两家有定时，而**两家有的都只是 session-local 那一档**——托管调度器是另一个产品。本仓路线图 §15.1 已经把这条切成了同样的两半：「**云端**定时 routines 做不了（需要托管调度器），**本地定时可以做**，别混淆」。这条判断被两家的实现印证了。真做本地档时，三件配套是必需的而不是可选的：**频率下限、抖动、只在空闲开火**——它们防的都是同一件事，模型轮数失控。
:::

### 09 模型自己写编排脚本 <Badge type="warning" text="二比一 · 有一条看得见的抄袭链" />

与其一个个调 subagent，不如让模型写一段脚本把它们串起来——这条路有人走通了吗？

- **Claude Code**：`Workflow` 工具：自包含 JS，用 `agent()` / `parallel()` / `pipeline()` / `phase()`
- **codex**：没有对应物。Code Mode 是让模型写 JS **调工具**，不是编排子代理
- **deepseek-harness**：有，且**自己写明**字段词汇表与 Claude Code 的 meta 块一致

<small>Claude Code</small> 脚本必须以 `export const meta = { name, description, phases }` 开头，且是**纯字面量**——不许有函数调用、展开或模板插值。脚本体用 `agent()` / `parallel()` / `pipeline()` / `phase()` / `log()`。`phase()` 的标题与 `meta.phases` 按标题严格匹配，对不上的自己成一组进度分组。也可以按名字取 `.claude/workflows/` 下的预定义工作流。

<small>dsh</small> 同一套东西，而且它在自己的类型文档里点名说了来源：「the field vocabulary matches the Claude Code dynamic-workflows meta block」。**这是这个系列里第一次看到一家明确写出自己抄了谁。** 抄的同时它加了一条 Claude Code 没有的硬规则——`meta` 与 `args` 按契约是 plain JSON 数据，引擎在*任何脚本文本被求值之前*先按 schema 校验 meta 并大声失败：

> no script text is ever evaluated to obtain it

理由很实在：一个要靠跑脚本才拿得到 meta 的设计，等于让「要不要跑这个脚本」这个判断依赖于先跑这个脚本。另外两处也值得记：脚本跑在 `node:worker_threads` 的 worker 里，而文档明写 **worker 不是安全边界**，只是把执行与宿主事件循环隔开；`parent` 必填，脚本起的每个 `agent()` 都归属到它，并且有一个 `maxTotalAgents` 上限——*脚本既看不见也换不掉*。

::: tip 判断
本仓在这条上已经表过态：路线图 §15.2「大规模 Multi-Agent 编排｜维持不做」，subagent 本身排在 M3。这条不用重估。**真正值得留下的是 dsh 那条元规则**——任何「模型给的东西要先校验再执行」的设计，都要检查校验本身有没有依赖执行。它不只适用于工作流脚本，也适用于本仓的 `inputSchema` 校验与风险判定顺序。
:::

## 分岔汇总

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| 待办清单 | `{content, status, activeForm}`；别名归一 + 埋点 | `{step, status}`；「只能一件在做」只写在描述里，不校验 | `{content, status}`；多一个键就报错；并发是必填部署配置 | **没有这把工具，也没有任何相关决策**——是空白不是取舍 |
| 计划模式 | 一档权限模式；首次读要用户亲批 | 提示词来自模型目录 + 两条点状硬规则；安全侧不读 | 明写 soft guidance；工具目录刻意不动，保 KV 缓存 | 装配期按 `maxRisk` 裁工具，`list` 与 `prepare` 同时生效——最硬 |
| 目标 | `/goal`：一个 Stop 钩子 + 迭代计数 | 扩展 crate：三工具、六状态、四份提示词模板 | 事件溯源 + revision CAS；持久相位与进程内 activation 分两维 | 无。但 `RunLimits` 已经是它的闸门那一半 |
| 预算单位 | `iterations` + `tokensAtStart`（上限没核到） | token 预算 + 墙钟时间只记不限；计划模式不计费 | 轮次上限；超额是重放拒绝，不是状态 | 四轴：步 / token / 时长 / 成本；token 一个数字兼软提醒与硬终止 |
| 任务图 | 有：id、owner、`blocks`/`blockedBy`，独立分页存储 | 没有 | 没有，写明是刻意裁剪 | `Run.taskId?` 预留位；「半个 Task 比没有 Task 危险」 |
| 后台任务 | 后台 Bash / 后台子代理 / `--bg`；结束即唤起模型 | 可复用 PTY 会话；没有完成通知 | `ctx.jobs` 通用注册表；owner 围栏 + 去重播报 | 只有 120 秒同步 `bash`；`idleTimeoutMs` 已登记待触发 |
| 排队注入 | REPL 空闲时出队 | 持久队列，**可重排**，空闲贡献链按优先级 | `followup()`；等完全空闲并认领维护阶段；从不 steer | `RunInbox` 在**步**边界 drain；只读端口，写者仍是循环 |
| 定时 | 会话内 cron（session-only、7 天过期、抖动）+ 托管 routines | 没有 | after/at/every；无 cron 表达式；every 下限 5 分钟；批量投递 | §15.1 已把云端与本地切开：云端做不了，本地可以做 |
| 编排脚本 | `Workflow`：`agent()`/`parallel()`/`pipeline()`/`phase()` | 没有（Code Mode 解的是另一道题） | 同词汇表，加一条「meta 必须先于任何求值校验」 | §15.2 维持不做；subagent 本身排在 M3 |

## 对本仓意味着什么

### 「跑到条件满足为止」是内核功能，不是产品花活 <Badge type="tip" text="三家撞出同一个答案 · 可当定论" />

三家各自独立做了目标续跑，而且都不是玩具：codex 一整个扩展 crate，dsh 一个事件溯源的包，Claude Code 一个复用 Stop 钩子的巧解。本仓路线图里没有这一条。

**好消息是本仓已经有它的一半。** `RunLimits` 是闸门，`RunInbox` 的步边界注入是接入点。缺的只有中间那块：一个「终点条件」的存放处，以及一条「这一轮结束了、条件还没满足」的判断。按三家的经验，这块状态必须能被恢复重放，否则 `--resume` 之后目标就丢了——Claude Code 为此专门做了 `restoreGoalFromTranscript`。

### 后来的活儿只在边界进，永不打断当前轮 <Badge type="tip" text="三家撞出同一个答案 · 可当定论" />

四家全同构，连措辞都接近。本仓的粒度最细（步边界 vs 整轮空闲），而更细的那笔代价——drain 与追加必须是一次事务——已经付过了。这条不用动，但值得在 §6.4 旁边记一句：**这个粒度是刻意比对标方细的**，将来加定时或后台完成播报时，它们也走同一个口子，不要另开一条注入路径。

### 预算要同时是提醒和闸门 <Badge type="tip" text="三家撞出同一个答案 · 可当定论" />

本仓 `RunLimits.maxTokens` 的「一个数字一个家」与 codex 的两份提示词模板（continuation 里报余量、budget_limit 里叫停）是同一个设计，连要防的失败模式都一样：codex 在两份模板里各写了一遍「不要因为预算快用完就把目标标成完成」。本仓那条软提醒目前只说「让它主动收尾」——**把「不要因此宣布完成」补进那句提示词，成本为零**。

### 待办清单工具：三家都有，本仓连决策都没有 <Badge type="warning" text="本仓没有 · 补不补是决策" />

这是这一份最干净的一处缺口。它不在「明确不做」里，也不在「后置」里——文档里检索不到任何关于它的判断。而三家的答案已经收敛到几乎相同的形状：一把无副作用的工具、整表替换、三个状态、一条会话事件。

真要补，需要先选的只有两处（见维度 01）：**「同时只做一件」写在描述里还是校验里**，以及**模型给错形状时纠正它还是原谅它**。按本仓一贯的取向（`assertNameUnclaimed` 那种「无声地赢最危险」的写法），大概率会选 dsh 那一侧：校验 + 大声失败。

### 后台任务的完成播报 <Badge type="warning" text="本仓没有 · 补不补是决策" />

本仓只有 120 秒同步 `bash`，路线图已经登记了 `idleTimeoutMs` 作为更小的解法。但真走到「后台跑 + 完成通知」那一步时，dsh 已经把两个只有上线才会发现的坑写出来了：**播报要排在记录提交与所有观察者之后**（因为播报可能同步开一轮模型），以及**拆除流程要主动认领「已播报」这一位**（否则每一层 teardown 都花掉一次模型请求）。这两条不需要等撞上再学。

### 计划模式：本仓最硬，而它的代价与 dsh 的不同 <Badge type="warning" text="三家分歧 · 要自己判" />

dsh 拒绝改工具目录的理由是 KV 缓存——目录一变，前缀就废。这条在本仓**不成立**，而且原因值得写下来：`Run.mode` 在 Run 启动时快照锁定并落库，一个 Run 之内不会翻转，所以工具清单在 Run 内是稳定的；切换模式意味着开一个新 Run，那本来就是新前缀。

换句话说，**两家的设计差异来自状态挂在哪儿**：dsh 的计划模式是会话级、对话中途可翻转的，本仓的模式是 Run 级、不可变的。这不是谁更对，是两种产品形态。但它有一个直接推论：本仓将来若要支持「对话中途切进计划模式」，代价不是加一个开关，是**要么开新 Run，要么承认这一次翻转会废掉缓存前缀**——这笔账现在没有任何地方记着。

### 四个上界之间谁压谁，本仓是唯一需要回答这题的 <Badge type="warning" text="三家分歧 · 要自己判" />

codex 只有 token 一轴（时间记而不限），dsh 只有轮次一轴，本仓有四轴。轴多是好事，但也意味着**本仓是唯一会同时撞上两个上界的那一家**，而三家里没有一家给出过优先级。今天这件事只隐含在 `RunFailureReason` 的取值域里（`max_steps` 与 `budget_exhausted` 是两个码），没有一处明说先到哪个落哪个。**这是一个可以现在就用一句话关掉的缺口**，代价远低于将来从两份日志里反推。

## 明确没核到的部分

- **没有把任何一家跑起来。** 尤其是「模型多久更新一次待办清单」这种只有实测才知道的行为，三家都没测——下文所有关于清单的结论都只是契约层面的。
- **Claude Code 的 `/goal` 有没有预算上界，没核到。** 状态里有 `iterations` 与 `tokensAtStart`，看起来是给某个判据用的，但那段是压缩后的控制流，我没读。
- **Claude Code 的 Task 存储是本机还是远端，没核到。** `{namespace, listId}` 加分页与作用域校验看起来是一层通用键值抽象，两者都可能。「多个 agent 共享一张任务板」是从 `owner` 字段与 `listId` 推的，不是读到的。
- **Claude Code 的计划模式是否也从请求里摘掉写工具，没核到。** 我只核到它在权限层拦（首次读要用户亲批），没核到工具目录本身有没有变。
- **codex `ext/goal` 的 `runtime.rs`（600 行）与 `extension.rs`（503 行）没读。** 「续跑在哪一步被触发」是从 `is_automatic_idle_work` 的三处引用与模板文件名推出来的，不是直接读到的调用链。
- **dsh 的 workflow 引擎实现没读**，只读了子系统文档与类型；`credentials-local` 那一轮的教训同样适用——文档写得极准，但它毕竟不是代码。
- **codex 「没有定时」这条是负向结论。** 依据是两件事而不是一次零命中：全仓 `cron` 只命中 markdown 渲染与 pty 两处无关代码，并且读了 `ext/queue` 的模块头确认它的派发触发器是 `on_thread_idle` 而不是时钟。

## 落点索引

#### codex · codex-rs/

- `protocol/src/plan_tool.rs` 清单参数类型（含来历注释）· `core/src/tools/handlers/plan_spec.rs` 工具描述里那句「At most one step」· `core/src/tools/handlers/plan.rs:84` 计划模式下拒绝 `update_plan`
- `protocol/src/config_types.rs:673` `ModeKind` 与 `allows_request_user_input` · `core/src/context/world_state/collaboration_mode.rs` 计划模式提示词来自模型目录
- `core/src/session/turn_input.rs:266-311` `is_automatic_idle_work` 与它挡住的两件事
- `ext/goal/src/spec.rs` 三把工具的完整描述 · `src/accounting.rs:66-80` 计划模式不计费 · `src/steering.rs` 三个注入点 · `templates/goals/continuation.md` 与 `budget_limit.md` 全文
- `protocol/src/protocol.rs:3823` `ThreadGoalStatus` 六档 · `ext/queue/src/lib.rs` 与 `service.rs:355,399,540` 可重排队列与空闲派发
- `core/src/unified_exec/mod.rs` 模块头：可复用 PTY 会话的职责边界

#### deepseek-harness · docs/subsystems/ 与 packages/

- `subsystems/goal.md` 相位与 activation 分两维、revision CAS、轮次归属 · `subsystems/schedule.md` 三种规则、追赶策略、批量投递、at-least-once
- `subsystems/jobs.md` owner 围栏、`reported` 位、播报排最后 · `subsystems/plan.md` soft guidance 与常驻的 `exit_plan_mode`
- `subsystems/workflow.md` `WorkflowMeta` 与「meta 先于求值校验」· `packages/todo/tool-todo/README.md` 整表替换、拒绝额外键、`allowParallelInProgress`

#### Claude Code · 2.1.246

- 本会话工具面板原文：`CronCreate` / `CronList` / `CronDelete`（session-only、抖动、7 天过期）· `ScheduleWakeup`（`/loop` 自定步调）· `Bash(run_in_background)` 的重新唤起语义 · `Agent` 的后台完成通知
- `bin/claude.exe` 中 `grep -a` 命中：`activeForm` 的 zod schema 与别名归一 · `TaskCreate/Get/List/Update` 与记录形状 · `{namespace:"task", listId}` 存储 · `activeGoal` 与 Stop 钩子安装 · `/goal` 的文案 · `Workflow` 的 `meta` 约束
- `claude --help` 的 `--bg` 段 · `agents` 子命令

#### 本仓

- `docs/architecture/执行与恢复.md` §6.1 Task 预留位与「半个 Task」· §6.2 Run 状态机 · `packages/contracts/src/run.ts:451` `RunLimits` 四轴与 `maxTokens` 的双用注释
- `packages/core-runtime/src/tools/tool-selection.ts:46-58` `allowedInMode` 与「只挡一半等于没挡」· `packages/contracts/src/run-inbox.ts` 只读端口与步边界 drain（ADR-0090）
- `docs/路线图.md` §15.1 云端 vs 本地定时 · §15.2 大规模编排维持不做 · §15.3 计划模式那一行

---

三家对读系列 · 第十一篇 · 核验日期 2026-08-27 · 本文是时效证据，不定义 § 锚点、不定义不变量、不构成决定 · 结论进架构正文要走 ADR
