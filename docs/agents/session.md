---
title: 会话持久化与恢复三家对读
label: 会话持久化与恢复
group: 智能体内核
order: 4
date: 2026-08-26
summary: 会话持久化与恢复
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - ① 落盘形状
  - ② 谁来写
  - ③ 进不进日志
  - ④ 读回重建
  - ⑤ 崩在半路
  - ⑥ 回退与分叉
  - ⑦ 读不懂怎么办
  - ⑧ 索引与分页
  - ⑨ 存在哪儿
  - 分岔总表
  - 对本仓的意义
  - 证据与缺口
  - 落点索引
---

# 会话持久化与恢复

<Badge type="info" text="Evidence · 三家对读" /> <Badge type="info" text="agent-platform · 证据 · 2026-08-26" />

上一份对读管的是「模型看到什么」。这一份管的是另一半：**进程死掉之后还剩什么，以及怎么从那堆剩下的东西里回到能接着跑的状态**。Claude Code、codex、deepseek-harness 三家各有一套完整实现，九个维度上有五处同构、四处分岔。

- **9** 维度，按「写 → 读 → 回退 → 边界」排
- **4** 处三家互相矛盾，要自己判
- **48** dsh 的已知事件类型，由脚本生成
- **14** Claude Code 给外部存储的行为契约

## 先说清楚，这件事在解决什么

一个跑了二十分钟的会话，进程被关掉了。再打开时要回到原处——听起来像「把文件读回来」，但真正难的地方有四个，每一个都不在「读文件」这三个字里面。

**第一，崩溃点不是均匀分布的**。一次回合里最慢的那一段是工具执行：跑测试、装依赖、等网络。所以进程最可能死在「工具已经发出去、结果还没回来」这个位置上。日志尾巴上因此常常挂着一个没有结果的工具调用——而模型提供方不接受这样的历史，有 `tool_call` 没有 `tool_result` 的请求会被直接拒掉。读回来不等于能接着跑。

**第二，日志有两个读者，要求不一样**。一个是模型（要的是一段合法对话），一个是人和程序（要的是「当时到底发生了什么」，包括那些从来没进过模型的执行标记）。这两个读者对「什么该记」的答案不同，对「读到不认识的东西怎么办」的答案也不同。

**第三，写这件事本身会失败**。磁盘满、断电、文件写到一半。最后一行 JSON 缺半个花括号，是真的会发生的事。

**第四，「回到原处」有两种意思**。回到崩溃前那一刻（恢复），和回到三轮对话之前那一刻（回退）。第二种是用户主动要的，而它对存储格式提的要求，比第一种苛刻得多。

九个维度按流水线排：① 落盘的是什么形状 → ② 谁能写、什么时候写 → ③ 什么进日志 → ④ 怎么重建 → ⑤ 崩在半路 → ⑥ 回退与分叉 → ⑦ 格式演进 → ⑧ 索引与分页 → ⑨ 存哪儿。

## 三家是谁，证据到什么档次

::: claude Anthropic · 档 A（SDK 侧）
- Agent SDK 的 Python 源码可读，其中包含**会话重建的完整实现**，本地 JSONL 的形状可以从它反推
- CLI 引擎本体不开源，写入路径只到规格档
- 2026-03-31 那次 source map 泄漏一律不用

来源：`refs/sdk-py/src/claude_agent_sdk/_internal/`
:::

::: codex OpenAI · 全量源码
- 持久化占三个 crate：`rollout`（写与扫）、`thread-store`（生命周期与回退）、`history`（领域类型）
- 另有 `rollout-trace` 与 `message-history` 两个周边
- 头注释里写了大量「为什么不那样做」

来源：`refs/codex/codex-rs/{rollout,thread-store,history}/src/`
:::

::: dsh DeepSeek · 全量源码 + 自带文档
- 持久化拆成六个包：seam、两个后端、投影、投影缓存、检查点策略
- 每个包自带一个 `invariant.ts`，**连「这一条为什么做不成运行时不变量」都写成了代码里的一段说明**
- 崩溃恢复有 e2e 测试，真的 kill 子进程

来源：`refs/deepseek-harness/packages/{core/session,session}/`
:::

下面每一维都按同一顺序给三家，最后一句是判断：**同构**（三家撞出同一个答案，可以当定论）还是**分岔**（要自己判，没有现成答案）。

## ① 落盘的东西是什么形状

一条会话在磁盘上是一个什么结构？这一维决定了后面所有维度的难度上限。

::: claude 一棵树 | 树 · uuid / parentUuid
- `~/.claude/projects/<经过消毒的-cwd>/*.jsonl`，一行一条
- 每条带 `uuid` 与 `parentUuid`，**一个文件里可以同时存在多条分支**
- 主线之外还混着 `isSidechain`（子智能体）、`teamName`、`isMeta` 三类标记
- 压缩边界上的 `logicalParentUuid` 是一根故意不走的指针

来源：`_internal/sessions.py`
:::

::: codex 分段序列 | 不可变文件段 · ordinal 区间
- 一条 thread 的历史 = 若干**不可变** rollout 文件段，每段是 `{rollout_id, path, start_ordinal, end}`
- 段与段靠 `SessionMeta.history_base` 串起来，字段注释是「本 thread 继承的、另一份分页 rollout 的排他前缀」
- `RolloutLineage` 是**唯一**跟随这些指针的抽象，其余读者只消费它给出的有界段
- 文件名 `rollout-<19 位时间戳>-<threadId>[_<rolloutId>].jsonl`——回退过的线程在稳定的 threadId 后面追加一个不同的 rolloutId

来源：`thread-store/src/local/rollout_lineage.rs` · `rollout/src/rollout_file_name.rs`
:::

::: dsh 单调日志 | append-only · seq 严格递增
- 第一行是不可变的 `SessionHeader`，标成 `type: 'session'`，好让读者一眼区分它和事件行
- 其后每行一个事件，`seq` 严格递增，只追加
- 「模型看到的历史」是它上面的一层投影（surface），日志本身**一条也不删**

来源：`packages/core/session/src/types.ts` · `session-persistence-jsonl/src/format.ts`
:::

<figure class="diagram">
<!--@include: ./figures/session-1.svg-->
<figcaption>同一件事的三种数据结构。树天然支持分叉，代价是每次重建都要先找叶子；分段序列把「回退」变成新建一段加换一个指针，代价是需要一个索引库来存那个指针；单调日志最简单，代价是回退只能在它上面的投影层做。</figcaption>
</figure>

::: warning 分岔
这一维不是风格差异，它决定了 ⑥ 的实现难度。选了单调日志，「回到三轮之前」就只能靠投影层的替换语义表达；选了分段序列，就必须有一个可变指针，于是必须有一个索引库和一次 CAS。三家的选择各自自洽，但没有一家能便宜地切到另一家的形状上。
:::

## ② 谁能写，什么时候写

并发写一个日志文件会写坏。而「什么时候必须已经落盘」这个问题，比「谁来写」更要命。

::: codex 三层锁加一把维护锁 | 单写者，锁分层
- 每条 thread 上叠三把：`lock_lifecycle`、`lock`、`writer_lock_coordinator.acquire`，再加一句 `ensure_live_recorder_absent`
- 另有一把**进程级、非阻塞的文件锁** `rollout-maintenance.lock`：压缩与格式迁移都靠「改名覆盖」发布，两者不能同时对一个 codex_home 动手
- 头注释专门写明这三样是不同的东西：维护锁 ≠ per-thread 写锁 ≠ 压缩自己的节流标记

来源：`rollout/src/maintenance.rs` · `thread-store/src/local/live_writer.rs`
:::

::: dsh 批写 200ms，但压着语义检查点 | write-behind + fail-closed
- `DEFAULT_WRITE_BATCH_MAX_DELAY_MS = 200`，入队时 `structuredClone` 把事件从生产者手里拷走
- 批写之上压着一层**语义检查点**：`llm/stream` 之前 flush，顶层 `tools/execute` 之前 flush
- **fail-closed**——检查点写不下去，就不调下游 adapter、不进工具体。头注释原话是「the downstream adapter or tool body is not invoked」
- 嵌套工具调用复用外层那次已经持久的记录，不重复 flush

来源：`session/session-checkpoint-policy/src/index.ts` · `session-persistence/src/write-behind.ts`
:::

::: claude 镜像那一路的批写 | 档 A（仅 SDK 侧）
- 本地 JSONL 由 CLI 自己写，SDK 看不到
- SDK 负责把 `transcript_mirror` 帧批到外部 store：`result` 消息到达时显式 flush，或 pending 超过 500 条 / 1 MiB 时后台急切 flush
- 失败有界重试 3 次、退避 0.2s 与 0.8s；**超时不重试**（理由是那次写可能还在飞）

来源：`_internal/transcript_mirror_batcher.py`
:::

::: tip 同构
三家在一条更强的规则上一致：**要发出去之前，先让它落下去**。codex 用锁与 recorder 保证顺序，dsh 把它写成一个插件加两处 fail-closed 分支，Claude Code 在镜像那一路上用显式 flush 点。本仓 §5.10 的「写前日志」是同一条，且已经实现。

值得单独记一笔的是 dsh 的 fail-closed：**持久化失败不是记一条警告继续跑，是不让副作用发生**。这比「先跑再补记录」严格，而严格的方向是对的——一次没记下来的写操作，恢复时无从对账。
:::

## ③ 什么进日志，什么不进

进模型的那些当然要记。问题是那些从来不进模型的东西——压缩标记、风险评分、世界状态快照。

::: codex 一个函数说了算 | 手写 match
- `is_persisted_rollout_item` 一个入口，按 `RolloutItem` 的变体逐个判
- 执行标记（`Compacted`、`TurnContext`、`WorldState`、`SecurityRiskScore`、`SessionMeta`）**一律持久化**，注释写明理由是「事后能分析压缩流程与 API 回合」
- 另有 `persistence_metrics.rs`：按 1% 采样记 kept / dropped 与字节数——**丢掉了什么是有度量的**

来源：`rollout/src/policy.rs` · `rollout/src/persistence_metrics.rs`
:::

::: dsh 生成的清单 | 脚本生成 + 新鲜度校验
- `KNOWN_SESSION_EVENT_TYPES`，48 个类型，由 `gen-persistence-catalog.ts` 生成
- 文件头第一句是「GENERATED — do not edit by hand」，新鲜度由 `verify-persistence-catalog` 保证，**挂在 `doc-sync` 里**
- 它同时是读路径的白名单，见 ⑦

来源：`packages/core/session/src/known-event-types.ts`
:::

::: claude 参与重建的才算 | 档 A（重建侧）
- `_TRANSCRIPT_ENTRY_TYPES` 是一个 frozenset，且还要求这条记录带一个字符串 `uuid`
- 判据是「**它参不参与那条链**」——没有 uuid 的行进不了树，也就进不了重建

来源：`_internal/sessions.py`
:::

::: tip 同构
三家都把「什么算历史」收成一个**封闭集合**，不靠各个调用点自觉。分岔只在这个集合怎么维护：codex 手写 match（编译器帮忙穷举），dsh 生成加新鲜度校验，Claude Code 手写 frozenset。本仓的三张事件登记表（敏感度 / 版本 / 载荷字段）是同一个机制，而且已经做到了 dsh 那一档——加事件类型不登记就编译不过。
:::

## ④ 读回来怎么重建

一堆行变回一个可用的会话状态。这一步的形状，决定了「恢复」和「新开」是不是同一段代码。

::: codex 四态封闭枚举 | 全量源码
- `InitialHistory` 只有四个值：`New` / `Cleared` / `Resumed` / `Forked`
- **`Cleared` 单独占一态很说明问题**：`/clear` 不是开一个新会话，是同一条 thread 上的一个状态
- 解码有一条硬约束：`decode_rollout_line` 绕开 serde 的扁平化缓冲，因为 `arbitrary_precision` 下浮点数在 flatten 里回放不出来。头注释写明这个绕法要**留在持久化边界上**，好让 history 保持格式中立，并且**恢复与投影用同一个解码器**

来源：`history/src/lib.rs` · `rollout/src/lib.rs`
:::

::: claude 找叶子，往上走 | 档 A（重建侧）
- 先找终端节点（没有任何人把它当 parent 的），再从每个终端往上走到最近的 user / assistant 节点，得到候选叶子
- 候选里优先**主线**（排除 sidechain / team / meta），同为主线则取文件里位置最靠后的那个
- 然后从叶子沿 parentUuid 一路走到根，倒序即历史
- 解析不了的行直接 `continue`，见 ⑦

来源：`_internal/sessions.py` · `_build_conversation_chain`
:::

::: dsh 三层依次过 | 全量源码
- **字节层**：最后一条没有换行符的记录当撕裂尾巴忽略，返回 header、连续事件前缀、安全截断偏移
- **语义层**：`interruptedTurnClosers` 补齐回合边界，见 ⑤
- **格式层**：版本与未知事件类型，见 ⑦
- 三层各自有独立的错误类型，不混在一个「读失败」里

来源：`session-persistence-jsonl/src/format.ts` · `core/session/src/repair.ts`
:::

::: warning 分岔
三家在这一维上唯一的共识是「恢复要和新开走同一段下游代码」——codex 把它做成一个枚举喂进同一个构造函数，dsh 把修复后的日志喂进同一条投影管线。分岔在于遇到读不懂的东西怎么办，那是 ⑦ 的题。
:::

## ⑤ 崩在半路：那个没有结果的工具调用

日志尾巴上挂着一个 `tool_call`，没有对应的 `tool_result`。这份历史喂给模型会被拒。怎么办？

::: dsh 合成闭合事件 | 全量源码 · 有 e2e
- 两个恢复码分得很干净：`TOOL_NOT_STARTED`（助手请求了工具，但没有一条记下来的调用开始）与 `TOOL_OUTCOME_UNKNOWN`（调用记下来了，结局没落盘）
- 合成顺序是确定的：先给未配对的调用发错误结果，再补一个 `step/end`，再补一个标为 interrupted 的 `turn/end`
- seq 接着日志往下排，时间戳复用最后一条真事件——**合成的东西不假装是新发生的**
- 目的写在头注释里：*resume with a provider-valid transcript*。不是为了好看，是因为提供方不收

来源：`packages/core/session/src/repair.ts`
:::

::: codex 同源的不变量在迁移路径上 | 全量源码
- 回合级的崩溃修复没有单独一处（执行标记本身就落盘，恢复时按 item 重放）
- 但格式迁移那条路上有一条同源不变量，头注释原话：**任何时候留下的要么是原来的 legacy rollout，要么是一份可恢复的 paginated rollout**
- 一旦替换了路径，那份持久的 `.pending` 日志**必须足够**让下一次迁移跑完 SQLite 的恢复

来源：`thread-store/src/local/rollout_migration.rs`
:::

::: claude 这一格没核到 | 证据只到 SDK 边界
- SDK 侧只负责镜像，镜像批写失败重试三次然后报给回调
- CLI 引擎恢复时怎么处理未闭合的工具调用，**不在可读范围内**
- 可以确定的只有一点：重建时坏行会被跳过，所以一个写到一半的 tool_result 行会整条消失

来源：`—`
:::

::: warning 分岔 · 本仓走的是第三条
本仓的答案在 `reconcile-decision.ts` 那张表里：崩在半路的调用被消解成 `failed`，**那一步整个丢掉**，由接管后的循环重跑——模型会重新请求一次。头注释把理由写清楚了：一次调用的 `callId` 由模型给、结果要回灌进那一步的对话记录，而这种情况意味着那一步的记录根本没落，重放出来的结果无处可去。

所以三家三答：**dsh 补一条假的结果让历史合法，本仓丢掉整步让模型重问，Claude Code 那一格没核到**。两者对模型看到的历史不一样：dsh 的模型会看到「那次工具出错了」，本仓的模型看到的是「上一步没发生过」。哪个更好不是这份文档能判的，但值得注意的是本仓的 `ReconcileVerdict` 五值判的是「世界变没变」，dsh 的两个恢复码判的是「日志缺哪一段」——**这是两个正交的问题，本仓只有前一个**。
:::

## ⑥ 回退与分叉，以及一个术语陷阱

用户说「退回到三轮之前」。这句话在三家的代码里指着三样不同的东西。

::: codex 新建不可变段，CAS 换指针 | 全量源码
- `revert` 的头注释：**老 rollout 原封不动，新文件引用保留的前缀，唯一可变的切换点是 SQLite 里那个 rollout 路径指针**
- 切换走 CAS——代码里特意保留 SQLite 存的那个精确路径用于比对，因为路径解析可能返回一个压缩过的兄弟文件
- 整个过程握着生命周期锁、写锁、协调器锁三把

来源：`thread-store/src/local/revert_thread.rs`
:::

::: claude 回退的是文件 | 档 A（SDK 类型）
- `enable_file_checkpointing` 打开后，`rewind_files(user_message_id)` 把文件回退到某条用户消息时的状态
- 机制是**改文件之前先备份**，锚点是那条用户消息的 uuid
- 对话回退是另一件事（CLI 的 `/rewind`），两者可以分别使用

来源：`types.py` · `client.py:335`
:::

::: dsh 这个词根本不指回退 | 全量源码
- dsh 的 `checkpoint` 指的是**持久性屏障**：请求发出前、工具体执行前，先确保日志落盘
- 它与「回到某个历史位置」毫无关系
- 历史层面的回退在 dsh 里是压缩用的 `replace` 语义，住在投影层

来源：`session/session-checkpoint-policy/src/index.ts`
:::

::: info 「checkpoint」一词四义。
Claude Code = 改文件前的备份；deepseek-harness = 持久性屏障；codex 里根本没有这个词，对应物叫 revert 与 lineage；本仓的 `Checkpoint` 是第四义——恢复时用来定位「跑到哪了」的执行坐标。对标这一维时，**先问对方的 checkpoint 是哪一义**，否则「他们也有 checkpoint」这句话什么都没说。
:::

::: warning 分岔 · 且修正了一条既有判断
`codex.md` 里记过一条：codex 的 `thread/rollback` 已标 Deprecated，可以当作本仓「不做 checkpoint 回溯 UI」的独立佐证。读源码之后这条要改：**协议里 `thread/rollback` 确实写着「DEPRECATED，will be removed soon」，但取代它的是同一个文件里标着 `#[experimental]` 的 `thread/revert`，外加一个 `thread/reverted` 通知**。codex 不是退役了对话回退，是在换一个建立在不可变段加 CAS 指针之上的新实现。

`claude-code.md` 那句「对话回退是一个 §15.2 没讨论过的独立问题」因此更站得住：现在它有两个活的实现样本，而不是一个活的加一个退役的。
:::

## ⑦ 读到读不懂的东西怎么办

日志是自己写的，但可能是上一个版本的自己写的。三家给了三个互相排斥的答案。

::: dsh 拒绝 | 全量源码 · 论证最完整
- 两个错误类分得干净：`SessionPersistenceCorruptionError`（读出来了但校验不过）与 `SessionFormatUnsupportedError`（日志完好，是这个 build 解释不了；**原始日志仍然可读，错误里带着路径**）
- `SESSION_FORMAT_VERSION = 0`，未发布期间钉死在 0：不隐含任何兼容性，不兼容的日志直接拒，不提供迁移
- 未知事件类型**缺省即必需**：没有 `ignorable` 标记的未知类型，读者必须拒绝重建

来源：`core/session/src/types.ts` · `session-persistence/src/coordinator.ts`
:::

::: codex 迁移 | 全量源码
- `rollout_migration/` 是一整套状态机：找文件 → 判是否合格 → 拿维护锁与写锁 → 规范化进暂存 JSONL → 投影进 SQLite → 校验投影 → 原子发布
- 附带 rollback、rollback_plan、rollback_replay 三个文件——**迁移本身可回滚**
- 协议那一面则是整体换代：`protocol/v1.rs` 与 `protocol/v2/` 两套命名空间并存

来源：`thread-store/src/local/rollout_migration/`
:::

::: claude 跳过 | 档 A（重建侧）
- 重建时逐行解析，`json.JSONDecodeError` 与 `ValueError` 一律 `continue`
- 类型不在集合里、或者没有 uuid，同样跳过
- **没有版本字段参与这个判断**——能解析成认识的形状就用，不能就当它不存在

来源：`_internal/sessions.py`
:::

::: info
dsh 把升版判据写进了类型注释，值得整段引：**版本要不要升，由「写者发出什么」决定，永远不由「新读者能接受什么」决定**——当一个老运行时不再能以完整语义正确性处理新日志时就升。「能解析不报错」不算正确：静默跳过影响重建的内容，是一次错读。只有结构性变更够格升版（header 形状、事件信封、核心事件语义、投影机制），加一个普通事件类型不升版，那由 per-event 的 `ignorable` 守卫覆盖。拿不准就升——近似恒等的升级步骤几乎免费，漏升会让老运行时静默读错。

`ignorable` 的缺省方向同样是被论证过的：**缺省即必需，写者只在纯信息性、丢了也不影响重建的记录上标 true**。理由一句话——忘标记会导致过度拒绝（一次不便），而反过来会静默恢复出一个被掏空的会话。
:::

::: warning 分岔 · 正对本仓 §7.3
本仓 §7.0 写着「未知事件类型和未知 `schemaVersion` 必须能安全忽略……渲染层遇到不认识的 `type` 就跳过，不要抛错」——站的是 Claude Code 那一侧。但恢复面上本仓其实是**拒绝派**：快照主版本读不了就是 `snapshot_unsupported`，定义版本漂移就是 `agent_version_drift`，两个都是结构化拒绝，不是跳过。

也就是说**本仓已经在两个面上用了两个答案，而这个区分只体现在 §7.0 那句话里的「渲染层」三个字上，没有被写成一条规则**。dsh 的论证正好给出了那条规则该怎么说：渲染时跳过一条事件，代价是少画一行；重建时跳过一条事件，代价是重建出一个错的会话。同一句「安全忽略」在这两处不是同一件事。
:::

## ⑧ 索引、列表与分页

「列出我最近的会话」不能靠把每个文件都解析一遍。三家撞出了同一个量级的答案。

::: codex SQLite 索引 + 反向扫描 + 冷压缩 | 全量源码
- `state_db.rs` 用 SQLite 存线程元数据、队列与投影
- `reverse_jsonl_scanner.rs` 从文件尾往前扫，**64 KB 一块**，不为读最后几条解析整个文件；过大的记录会被丢弃而不是撑爆内存
- 列表游标是「时间戳 + UUID」，直接从文件名解析出来
- 冷文件由一个 fire-and-forget 后台 worker 压成 `.zst`，用 codex_home 下的运行标记防重叠与过频

来源：`rollout/src/{state_db,reverse_jsonl_scanner,list,compression}.rs`
:::

::: claude 只读两头 | 档 A
- `LITE_READ_BUF_SIZE = 65536`：从 stat 加首尾各一块拿元数据，不整份解析
- 列举外部 store 时 `_STORE_LIST_LOAD_CONCURRENCY = 16`，注释写明理由是**别把适配器的连接池耗光或触发后端限流**

来源：`_internal/sessions.py`
:::

::: dsh 按值大小决定压不压 | 全量源码
- SQLite 后端把大于 `ZSTD_DATA_THRESHOLD_BYTES = 4096` 的 data 压成 zstd（level 3）
- 小值留 SQLite 文本，注释写明是**避免每帧的 CPU 与字节开销**
- 另有一条专门的 `compression-unprofitable.spec.ts`：压了反而更大的情况有断言盯着

来源：`session-persistence-sqlite/src/compression.ts`
:::

::: tip 同构
两家独立撞到同一个 64 KB 的「只读两头」，第三家把同样的思路用在了值级别上。共同的判据是一句：**元数据不该要求解析全文**。本仓 M1 是本地单会话 CLI，还没有列表需求；M2 有 server 之后，这一维会直接变成分页 API 的形状——而 codex 那个「时间戳 + UUID 游标从文件名解析」是现成可抄的一格。
:::

## ⑨ 存哪儿：本地、外部、两个后端

日志能不能不落在本机？三家的答案，分别对应三种不同的产品形态。

::: claude 外部存储是镜像，不是后端 | 档 A · 契约是公开 API
- 本地 JSONL 是唯一真后端。设了 `session_store` 之后，每一行本地写入**同时**过一遍 `store.append()`
- 从外部存储恢复的做法很直接：把会话读回来，**写进一个布局与 `~/.claude/` 一模一样的临时目录**，再用 `CLAUDE_CONFIG_DIR` 指过去——因为 CLI 子进程只会从本地文件恢复
- SDK 把一致性套件当公开 API 发出去：`run_session_store_conformance`，**14 条行为契约**，四个可选方法没实现就跳过
- 要求写入时间严格单调递增，注释指出真实后端天然具备（文件 mtime、S3 LastModified、Postgres updated_at）

来源：`_internal/session_resume.py` · `testing/session_store_conformance.py`
:::

::: dsh 两个平级后端 + 差分测试 | 全量源码
- JSONL（可选 zstd）与 SQLite 是两个平级实现，共享一份契约测试
- 另有一份 **fast-check 的 differential spec**：同一串事件并排喂给两个后端比对结果
- JSONL 后端在 Windows 上另走一条路：POSIX 靠「建目录项 + fsync 父目录」发布新文件，Node 在 Windows 上不暴露那个契约，所以用 `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)`，**不允许替换、不允许跨卷复制回退**

来源：`session-persistence-sqlite/tests/differential.spec.ts` · `session-persistence-jsonl/src/win32.ts`
:::

::: codex 两半，不是两个后端 | 全量源码
- JSONL 文件与 SQLite 索引是同一套东西的两半：文件存内容，SQLite 存元数据、队列、投影与那个可变指针
- 不存在「换一个后端」这回事——回退的 CAS 就依赖 SQLite 在场，没有 `state_db` 时直接返回 `Unsupported`

来源：`rollout/src/state_db.rs` · `thread-store/src/local/`
:::

::: tip 同构一条，分岔一条
**同构的是「两个实现 + 一份共享契约测试**」。三家全都这么做，Claude Code 甚至把套件当公开 API 发出去让第三方自测。本仓的 `SqliteStore` + `InMemoryStore` + 一致性套件已经站在这条线上；dsh 的差分属性测试是比共享套件更强的一档，可以当作下一步。

**分岔的是外部存储的角色：镜像还是后端**。Claude Code 选镜像，是为「CLI 子进程只认本地文件」这个约束付的税——它得为了恢复去伪造一个假的 `~/.claude/`。本仓 M2 的 PG 是后端不是镜像，而且没有那个约束，所以这一格**不必抄**；它的价值在于反过来提醒一件事：一旦某处代码只认本地路径，远程存储就会变成一层镜像加一次伪造。
:::

## 九维分岔，放在一张表里

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| ① 日志形状 | 树（uuid / parentUuid） | 不可变段 + ordinal 区间 | 单调 seq 日志 + 投影 | append-only，四类记录各有坐标与作用域 |
| ② 写入时机 | 镜像批写 500 条 / 1 MiB | 三层锁 + 维护锁 | 批写 200ms + fail-closed 检查点 | 写前日志（§5.10），唯一写者（§6.4） |
| ③ 记什么 | 带 uuid 的转录条目 | 手写 match + 1% 采样度量 | 48 类，脚本生成 + 新鲜度校验 | 三张登记表，不登记编译不过 |
| ④ 重建 | 找叶子 → 走 parentUuid | 四态枚举，恢复与投影同解码器 | 字节 → 语义 → 格式，三层 | 核快照 → 读 Checkpoint → 补游标 |
| ⑤ 崩在半路 | 未核到 | 迁移路径上有同源不变量 | 合成闭合事件，两个恢复码 | 整步丢弃重跑，五值对账 |
| ⑥ 回退 | 回退文件，锚点是用户消息 | 新建不可变段 + CAS 换指针 | 不做；checkpoint 是另一个意思 | 无对应概念（§15.2 只讨论过代码回退） |
| ⑦ 读不懂 | 跳过 | 迁移，且迁移可回滚 | 拒绝，缺省即必需 | 渲染面跳过，恢复面拒绝 |
| ⑧ 索引 | 只读两头 64 KB | SQLite + 反向扫描 + 冷压缩 | 按值大小决定压不压 | 尚无列表需求 |
| ⑨ 存哪儿 | 本地为准，外部是镜像 | 文件与索引是一套的两半 | 两个平级后端 + 差分测试 | 两实现 + 一致性套件；M2 上 PG 后端 |

## 对本仓意味着什么

### 同构 —— 三家都这么做，可以当定论

- **要发出去之前先让它落下去**。三家各有各的实现，但没有一家允许「先跑再补记录」。本仓 §5.10 已在这条线上。
- **「什么算历史」是一个封闭集合，不靠调用点自觉**。本仓的三张事件登记表已经做到了最强的那一档。
- **两个实现 + 一份共享契约测试**。本仓的 SqliteStore 加 InMemoryStore 加一致性套件已经站在这里。
- **历史条目原样保留，harness 自己的元数据分开存**。codex 的 `ResponseItemEnvelope` 注释一句话：「持久化保持 response item 完整，把它的元数据单独存」。本仓的事件信封加 `payloadRef` 是同一个形状。
- **元数据不该要求解析全文**。M2 有列表 API 时直接按这条设计。

### 本仓没有 —— 补不补是决策，本文不作

- **崩溃尾巴的语义闭合**。本仓有 `ReconcileVerdict` 五值，判的是「世界变没变」；dsh 的两个恢复码判的是「日志缺哪一段」。两者正交，本仓只有前者。落点是 §5.10 与 `reconcile-decision.ts`。
- **对话回退。**`claude-code.md` 已判定这是「§15.2 没讨论过的独立问题」；现在它有两个活的实现样本，其中 codex 那个的关键设计是**不可变段加一个 CAS 切换的指针**——这个形状与本仓 append-only 的坐标分配是相容的。
- **会话日志本身的格式版本**。本仓按事件类型分版本、快照有 schemaVersion，但没有一个「这份日志整体是第几版」的字段。dsh 的升版判据可以直接拿来当模板。
- **丢弃了什么的度量**。codex 按 1% 采样记 kept / dropped 与字节数。本仓的持久化决策目前是静默的。

### 三家分歧 —— 要自己判，没有现成答案

- **读到读不懂的东西：拒绝、迁移、还是跳过**。本仓事实上已经按面分开选了（渲染面跳过、恢复面拒绝），但这个区分只藏在 §7.0 那句话的「渲染层」三个字里。要不要把它升格成一条明写的规则，是一个决策。
- **回退落在文件还是历史**。本仓 §15.2 定的是「代码回退靠 git」，那条决定不覆盖对话回退。
- **外部存储是镜像还是后端**。本仓 M2 是后端，Claude Code 那条镜像路是为一个本仓没有的约束付的税。

## 证据档次与没核到的部分

codex 与 deepseek-harness 两家是全量源码，上面每一条都能落到具体文件；引号里的话是头注释原文的转述，不是我的概括。Claude Code 那一列**只有 SDK 侧是档 A**：重建、镜像、列表这三条路可读，而**写入路径、CLI 引擎自己的恢复逻辑不可读**。2026-03-31 那次泄漏一律不用。

### 明确没核到的

- Claude Code 的 CLI 引擎在恢复时怎么处理未闭合的工具调用（⑤ 那一格空着）
- Claude Code 的 `/rewind` 对话回退的具体机制——只知道它存在、与文件 checkpoint 是两件事
- 三家都没有跑起来做行为实测，全部结论来自源码与文档
- codex 的 `rollout-trace` 与 `message-history` 两个周边 crate 没读
- dsh 的投影缓存（`session-projection-cache`）与会话统计没读
- `thread/revert` 标着 experimental，语义可能还会变；本文记的是 2026-08-26 的形状

---

## 落点索引

#### Claude Code

- `_internal/sessions.py` — 重建、列表、只读两头
- `_internal/session_resume.py` — 从外部存储伪造本地目录
- `_internal/transcript_mirror_batcher.py` — 镜像批写与重试
- `testing/session_store_conformance.py` — 14 条行为契约
- `types.py` — session_store / flush 模式 / 文件 checkpoint

#### codex

- `rollout/src/lib.rs` — 解码边界与「格式中立」的理由
- `rollout/src/policy.rs` — 什么进日志
- `rollout/src/maintenance.rs` — 三种锁的区别
- `rollout/src/state_db.rs` · `list.rs` · `reverse_jsonl_scanner.rs` — 索引与分页
- `thread-store/src/local/revert_thread.rs` — 回退与 CAS
- `thread-store/src/local/rollout_lineage.rs` — 段与 history_base
- `thread-store/src/local/rollout_migration.rs` — 迁移状态机与不变量
- `history/src/lib.rs` — InitialHistory 四态
- `app-server-protocol/src/protocol/v2/thread.rs` — rollback 弃用与 revert

#### deepseek-harness

- `core/session/src/types.ts` — 格式版本与升版判据、ignorable
- `core/session/src/repair.ts` — 崩溃尾巴的语义闭合
- `core/session/src/known-event-types.ts` — 48 类，生成的
- `session/session-persistence/src/coordinator.ts` — 两个错误类
- `session/session-persistence/src/write-behind.ts` — 200ms 批写窗口
- `session/session-checkpoint-policy/src/index.ts` — fail-closed 检查点
- `session/session-persistence-jsonl/src/{format,win32}.ts` — 撕裂尾巴与 Windows 发布
- `session/session-persistence-sqlite/{src/compression.ts,tests/differential.spec.ts}`

#### 本仓

- §5.10 执行与恢复 · §6.3 落库 · §6.4 写入目录 · §7.0 信封 · §7.3 契约演进
- `contracts/src/recovery.ts` — ReconcileVerdict 五值
- `core-runtime/src/recovery/reconcile-decision.ts` — 恢复决策表
- `core-runtime/src/loop/run-resume.ts` — 核快照与授权面重判
- `platform/src/store/sqlite-append-only.ts` — 四类记录的坐标与作用域
