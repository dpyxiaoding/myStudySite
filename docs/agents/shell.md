---
group: 智能体内核
order: 7
date: 2026-08-27
summary: 文件与 shell 工具的 shell 那一半
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - 九个维度
  - 分岔总表
  - 对本仓的意义
  - 证据与缺口
  - 落点索引
---

# 命令跑起来之后

<Badge type="info" text="三家对读 · 第十六份" />

沙箱那份回答「这条命令允不允许碰这个文件」，文件工具那份回答「读和写怎么落到磁盘上」。中间还剩一整块没人管：命令批下来了、进程起来了，*然后呢*。九个维度按流水线顺序排，六个分岔。

<Badge type="warning" text="Claude Code 2.1.246" /> <Badge type="tip" text="codex（Rust 全量）" /> <Badge type="info" text="deepseek-harness（TS 全量）" /> <Badge type="info" text="本仓 M1" />

核验日期 2026-08-27 · 结论只进 evidence，不直接进架构正文

## 这件事在解决什么

工具调用是一次**同步的函数调用**：模型发一个请求，等一个结果，结果进上下文。shell 命令不是这个形状——它没有时长上界，没有输出上界，有状态，会继承父进程的一切，而且随时可能停下来等一个不存在的人打字。把后者塞进前者，是这一整块设计要解决的事。

五条张力，每条都有不止一个合理答案：

- **时长没有上界。**`ls` 是三毫秒，`pnpm install` 是三分钟，`npm run dev` 永不返回。
- **输出没有上界。**`cat` 一个 2GB 的日志能把上下文窗口整个吃掉，而且是在模型看到第一个字之前。
- **shell 有状态。**`cd`、`export`、`alias`、`source`——用户 `.bashrc` 里那个 `alias gs='git status'`，模型该不该看得见？
- **子进程什么都继承**。包括 harness 自己那个正在用的 API key。`echo $ANTHROPIC_API_KEY` 是一条只读命令。
- **命令会要求输入。**`git rebase -i` 打开编辑器，`npm login` 问密码，`sudo` 等一个 TTY——而终端前面没有人。

::: info
这五条里，第一条最能分辨设计立场：**一条命令跑太久了，谁做决定，做什么决定**。四家给了四个互不相同的答案，其中一家的答案是「这个问题不存在」。§6 与 §7 是这份对读的重心。
:::

## 三家是谁，证据到什么档次

::: claude 压缩源码 + 实机
随包发的 `sdk-tools.d.ts`（16 万字符）带全部工具的**完整输入输出类型与原文注释**；`claude.exe` 里 `grep -a` 能读出常量与英文文案。控制流读不到（单字母变量），凡是「按什么顺序做」的判断我都标出来。
:::

::: codex 全量源码
Rust 全量。`core/src/unified_exec/` 六千行加它的工具处理器，默认值直接读 `#[serde(default = ...)]` 的那个函数。
:::

::: dsh 全量源码
TS 全量，且 `packages/shell/` 下十一个包各自带头注释，把「为什么这样」和「刻意不做什么」写成完整句子——这一份里最好读的一列。
:::

::: ours 第四列，不是被对标方
`bash-tool-provider.ts` + `shell-runner.ts`，加 ADR-0052 / 0054 / 0055 三份决策记录。
:::

::: info
写这一份的过程里撞到一次一手证据：一条 `grep -a` 扫 250MB 二进制的命令跑过了两分钟，终端回的是<br>`Command did not complete within its 120s timeout and was moved to the background (ID: …). Output is being written to: …`<br> §6 与 §7 要写的机制，当场演示了一遍。
:::

## 九个维度

按一条命令的生命周期排：先是它怎么变成一把工具、怎么落到进程上，然后是它带着什么跑、跑多久、跑不完怎么办，最后是什么东西回到模型眼前。编号是流水线顺序，不是重要性顺序。

### 01 工具面怎么切 <Badge type="warning" text="分岔" />

「跑一条命令」「开一个能持续对话的 shell」「盯着一个一直吐日志的进程」——这是一把工具还是三把？

- **Claude Code**：三把，按**输出节奏**切：`Bash`（一次性）、`PowerShell`（Windows 另立一把）、`Monitor`（每行 stdout 是一个事件）。没有持久 shell。
- **codex**：两把，一次性与交互**合成同一把**：`exec_command` 开或复用一个会话，`write_stdin` 继续跟它说话。`shell` 只是前者的一个参数。
- **deepseek-harness**：四把两两成对，按**会话形态**切：`tool-bash` / `tool-bash-persistent`，pwsh 同构。装配时二选一，注册进去的那把都叫 `bash`。
- **本仓**：一把 `bash`。Windows 上靠探测 Git for Windows 的 `bash.exe`，工具名不变。

三种切法对应三个不同的问题定义。Claude Code 问的是「输出是一次给完还是持续到来」——所以 `Monitor` 与 `Bash` 分家，前者*每一行 stdout 都是一个唤醒事件*，不是攒完再给。dsh 问的是「两次调用之间要不要留下东西」——所以一次性与持久是两个包，而且**同一次装配里只装一个**，模型永远只看到一把叫 `bash` 的工具，不必判断该用哪把。codex 干脆不承认这是两件事。

::: tip 判断
codex 的合并做得比看上去彻底：`handlers/` 目录下没有 `shell.rs`，`"shell"` 这个词在整个工具面上只作为 `exec_command` 的一个**参数名**出现（选哪个 shell 二进制）。它不是「另外还有一把一次性工具」，是真的只有一把。
:::

本仓这一把是四家里最窄的，但窄的成本不在这一维——在 §7。

<figure class="diagram">
<!--@include: ./figures/shell-1.svg-->
<figcaption>同一份能力被切成工具的三种方式。dsh 那条虚线是关键：两个包实现同一个工具名，装配决定模型看到哪一个——所以「要不要持久 shell」是部署方的决定，不是模型每次调用的决定。</figcaption>
</figure>

### 02 命令怎么落到进程上 <Badge type="warning" text="分岔" />

哪个 shell 二进制、走不走登录 shell、有没有 PTY——这三个旋钮谁来拧？

- **Claude Code**：harness 定。bash 一路；Windows 上 PowerShell 是**另一把工具**，工具描述里直接写死 5.1 的语法差异清单。
- **codex**：**模型定**：`shell` 选二进制、`login` 走 `-l/-i`、`tty` 要不要 PTY。三个旋钮全在入参上。
- **deepseek-harness**：装配定。执行器把 argv 写死成 `bash -c`，模型只给 `command`。pwsh 是另一个执行器包。
- **本仓**：harness 定，按平台探测：Windows 找 Git for Windows 的 `bash.exe`，POSIX 走 `/bin/bash`，`AGENT_SHELL_PATH` 是出口。

codex 是唯一把这三个旋钮交给模型的。代价立刻出现在别处：它得为此写一整套 shell 类型检测（`detect_shell_type`），得为 PowerShell 与 cmd 单独准备一段 **Windows 安全须知**塞进工具描述——不要跨 shell 组合删除命令、递归删除前先验证解析后的绝对路径、`Start-Process` 要加 `-WindowStyle Hidden`。旋钮给出去了，防线就得跟着建到提示词里。

::: tip 判断
一处值得记的不一致：codex 的 `exec_command` 工具描述第一句是 `"Runs a command in a PTY"`，而 `tty` 参数的默认值 `default_tty() -> false` 是**普通管道**。描述里那句话对「会话语义」成立（不管有没有 PTY，命令没结束都会回一个 `session_id`），对「有没有 PTY」不成立。模型读到的与代码做的不是一回事。
:::

Claude Code 走的是相反的路：不给旋钮，改成给**另一把工具**。它的 PowerShell 工具描述里有一整段专门讲 5.1 没有 `&&`、没有三元、`2>&1` 会把原生命令的 stderr 包成 ErrorRecord——这些本可以写成一个 `shell: "powershell"` 参数，它选择写成一把独立工具带独立描述。*工具边界即文档边界*：模型选中哪把工具，就只读到那把的规矩。

### 03 两条命令之间留下什么 <Badge type="warning" text="分岔" />

上一条命令的 `cd`、`export` 还在不在？用户 `.bashrc` 里的别名和函数，模型用不用得上？

- **Claude Code**：`cd` **会留**——只要不出项目目录或 `--add-dir` 范围，出界自动重置。环境变量不留（走 `CLAUDE_ENV_FILE`）。别名与函数在会话启动时从 rc 加载。
- **codex**：什么都不留，`workdir` 默认回到本回合 cwd。但用 **shell 快照**把 rc 状态搬进每一条命令。
- **deepseek-harness**：一次性那把明说什么都不留，工具描述原话「`pass workdir instead of using cd`」。持久那把靠 PTY 天然全留。
- **本仓**：什么都不留，cwd 钉死在工作区根。别名与函数没有。

codex 这条是三家里最有意思的一手：它**不要持久进程，但要 rc 状态**，于是把两者拆开了。`ShellSnapshotV2` 在一个 thread 里跑一次快照脚本，把当时的 shell 函数、别名、环境整个抓下来，切成 60KB 一段塞进 `__CODEX_SHELL_SNAPSHOT_STATE_0/1/2…` 这些环境变量，然后在**每一条命令前面**拼一段 `eval` 把它还原回去。

细节里有一处能看出这不是随手写的：还原之前它把 shell 的启动文件*关掉*——bash 换成 `-pc` 加 `set +o privileged`，zsh 换成 `-fc` 加 `setopt RCS`。源码注释给的理由是「自动启动文件会在还原脚本之前跑，可能把快照已经滤掉的环境变量重新塞回来」。**先关掉真的 rc，再放回快照的 rc**，否则两份状态会打架。快照本身有 10 秒超时、512KB 上限、最多缓存 16 份。

::: tip 判断
三家在这一维给出的是三种不同的东西：Claude Code 留了**位置**（cwd），codex 留了**词汇**（别名与函数），dsh 的持久那把留了**全部**，本仓什么都不留。谁都没错，但「留位置」是唯一一个会让同一条命令在不同时刻产生不同结果的选择——Claude Code 为此配了一个 `backgroundCwdHint` 字段，专门在后台命令里含 `cd`/`pushd` 时告诉模型「会话 cwd 没变」。
:::

### 04 子进程继承什么 <Badge type="warning" text="分岔" />

harness 自己那个 API key 就在 `process.env` 里。`echo $ANTHROPIC_API_KEY` 判成只读、自动执行、输出回灌进上下文——三步都合规。

- **Claude Code**：未核到擦除逻辑。已知的是环境变量不跨命令持久，要注入走 `CLAUDE_ENV_FILE`；沙箱档另有一套限制。
- **codex**：策略化：`inherit` 三档 + `exclude` / `include_only` / `set`。默认词表是 `*KEY*` `*SECRET*` `*TOKEN*`——但**默认不启用**。
- **deepseek-harness**：硬性擦除，**不可配**：`/KEY|PASSWORD|SECRET|TOKEN/i` 加上所有 `DSH_*`，然后注入一套受管的 `DSH_*` 事实。
- **本仓**：硬性擦除，词边界匹配（ADR-0055）：`KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL` 及复数，**有意不匹配 AUTH**。

这一维里 codex 与另外两家的差别不在词表——三家的词表几乎逐字相同——在**默认值**。codex 的 `ignore_default_excludes` 字段名是反的（true 表示「跳过默认排除」），而配置加载那行是 `toml.ignore_default_excludes.unwrap_or(true)`：没写配置就是 true，就是*不擦*，加上 `inherit` 默认 `All`，子进程原样拿到整个父环境。

dsh 把它做成了不可配的函数 `scrubbedParentEnv()`，导出成一个纯函数而不是服务方法，理由写在注释里：node-pty 后端与 SDK 托管的传输走不了服务层，**但必须共用同一份擦除定义**。它还多擦一样——所有 `DSH_*`，而且大小写不敏感地擦，注释给的理由是 Windows 环境变量名不区分大小写，父进程一个 `dsh_*` 条目会在子进程里读回成 `$env:DSH_*`。

::: tip 判断
反向的那半边只有 dsh 做了：擦干净之后，它**主动注入**一组受管事实——`DSH_HOME`、`DSH_SHELL=1`、`DSH_SESSION_ID`、`DSH_SESSION_JSONL`（当前会话日志的路径）。而且这是个**注册表**：插件可以贡献自己的 `DSH_*` 变量，键有归属校验、重名在加载期就报错、每个变量必须带一句给模型看的描述。命令行环境成了一个可扩展的能力面。
:::

本仓那条词边界的取舍值得单记：`MONKEY_BUSINESS` 不该被摘掉，所以用 `(^|_)(KEY|…)(_|$)` 而不是子串；`AUTH` 有意不进词表，因为摘掉 `SSH_AUTH_SOCK` 会让 ssh 认证整个失效，而它本身是个 socket 路径不是明文凭证。codex 的通配 `*KEY*` 与 dsh 的 `/KEY/i` 都会误伤 `MONKEY_BUSINESS` 这类名字——代价小，但那是个不同的选择。

### 05 去交互化的那四个环境变量 <Badge type="tip" text="同构 · 可当定论" />

命令以为自己在终端里，于是上色、分页、等按键。怎么让它别这样？

- **Claude Code**：`TERM=dumb`。
- **codex**：同一组，硬编码。
- **deepseek-harness**：`NO_COLOR=1` `TERM=dumb` `PAGER=cat` `GIT_PAGER=cat`，先合并进 spawn 的显式 env，可被可信调用方覆盖。
- **本仓**：没有。stdio 的 stdin 接 `ignore`，颜色与分页没管。

这一维的证据强度在整个系列里少见：**它是被对读方自己写下来的**。dsh 的 `bash-local/src/index.ts` 在 `ENV_OVERRIDES` 上方的注释原话是「the same set Codex hardcodes; Claude Code achieves it via TERM=dumb」。一份第三方源码的注释里同时给出了另外两家的做法——省掉的不只是两次核对，还有「我是不是搜错了词」这个怀疑。

::: tip 判断
三家同构，本仓缺席。这是这份对读里**成本最低、争议最小**的一条：四个环境变量，没有取舍要拍，没有契约面要动。缺了它的具体后果是 `git log` 会挂起等分页器、`pnpm` 的输出带一堆 ANSI 转义序列进上下文。
:::

还有半条相关的：stdin。本仓 `spawn` 的 stdio 是 `["ignore", "pipe", "pipe"]`——fd 0 接空设备，与 dsh 的 `'ignore'` 档一致。dsh 的执行器*支持*一次性写入 stdin 再关闭，但**刻意不把它暴露成模型可见的参数**，注释给的理由是「需要 stdin 的模型用 heredoc 或管道」。这条本仓已经对齐了，不用补。

### 06 超时：默认多少，到点做什么 <Badge type="warning" text="四个不同答案" />

这是整份对读分岔最深的一处。前一半（默认多少）三家几乎一致，后一半（到点做什么）四家全不一样。

- **Claude Code**：默认 **120 秒**，上限 600 秒。到点**不杀**——转后台，输出改写文件。例外三类到点停：`sleep` 开头的、跑 `git` 的、解析不了的复合命令。
- **codex**：**没有超时。**`yield_time_ms` 默认 10 秒（250–30000，Windows 下限 10 秒）——那是「我等多久就把 `session_id` 还给你」，进程继续跑。
- **deepseek-harness**：一次性：默认 120 秒、上限 600 秒，到点 **SIGTERM → 3 秒 → SIGKILL** 杀整个进程组。持久：默认 300 秒，到点**连整个 shell 一起重置**。
- **本仓**：120 秒总时长，闸门收敛在 `ToolRuntime` 一处。到点中止 → 非只读档落 `unknown` → **停掉整个 Run**（ADR-0052 ④）。

<figure class="diagram">
<!--@include: ./figures/shell-2.svg-->
<figcaption>同一条跑了两分钟的命令，在四家手里的四个结局。竖线是硬停止，虚线箭头是「还在跑，但这次调用已经返回」。codex 那条实线从头到尾没有断点——它是唯一一个「超时」这个概念不存在的。</figcaption>
</figure>

**120 秒这个数字三家一致**（Claude Code 的 `BASH_DEFAULT_TIMEOUT_MS`、dsh 的 `timeoutMs: 120_000`、本仓的 `BASH_TIMEOUT_MS`），上限 600 秒也一致。这已经足够当定论：*两分钟是这一档任务的经验值*。有意思的是三家都把它做成总时长而不是静默超时——本仓的 ADR-0052 ⑥ 把理由写清楚了：按输出续期会让一个不停吐日志的失控任务永远不超时，防线恰好对最该防的那一档失效。

::: tip 判断
到点做什么，是四个立场：<br> **Claude Code**——超时不是失败，是*换一种交付方式*。<br> **codex**——同步等待本来就是个错误的模型，删掉它。<br> **dsh**——超时是失败，杀干净，模型想长跑就该一开始说清楚。<br> **本仓**——超时的写操作状态未知，未知就不能接着让模型猜。
:::

本仓这条是四家里最激进的，而它的激进有一条明确论据，不是保守的惯性：把超时包成普通错误喂回模型，模型会重试；重试时给的是**新的 `callId`**，而幂等键由 `(runId, callId, 入参哈希)` 派生——新 callId 就是新键，幂等直接失效。那是一次改名叫「重试」的重放，而被放弃的那次调用*可能正在后台生效*。三家里没有一家面对这个问题，因为三家的 bash 都不进幂等账。

dsh 持久档那条「到点重置整个 shell」看着重，其实是被形态逼出来的：一个 PTY 里的命令超时了，你没法只杀它而留下 shell——那个 shell 的状态已经不可知了（半条命令的输入还在缓冲区里、某个 `cd` 生效了一半）。它连带把还原提示写进了回执：`The persistent bash shell was reset; the next bash call starts from the workspace with a fresh current directory and environment.`

### 07 长跑：谁决定把它挪到后台 <Badge type="warning" text="分岔" />

「后台」有三个可能的决定者：harness（超时了自己挪）、模型（一开始就说这条要跑很久）、用户（看着它卡住，手动挪走）。

- **Claude Code**：**三个入口都有**：超时自动转、模型 `run_in_background`、用户 Ctrl+B。同一套后台设施，回执用 `timedOutAfterMs` / `backgroundedByUser` 区分来路。
- **codex**：不存在这个决定。前台本来就不阻塞，所以没有「挪到后台」这件事。上限 64 个并存进程。
- **deepseek-harness**：**只有模型**：`run_in_background: true` 立刻返回 job id，`job_output` 取、`job_kill` 停。后台无超时。部署方可以整个关掉（`enableRunInBackground: false`）。
- **本仓**：没有后台。这是路线图 §15.3 已登记的重估项，触发条件写着「跑测试超时杀掉整个 Run 真的伤到人时」。

Claude Code 那三个入口不是冗余，是三种不同的信息来源：**模型知道** `npm run dev` 不会返回，**harness 知道**这条已经跑了两分钟，**用户知道**这条卡住了但他想接着聊别的。三方各自掌握一部分事实，所以三个入口都保留。而且这套后台设施不是 bash 专属的——同一段文案也用在 MCP 工具上（`MCP tool "…" is still running after Ns. It was moved to the background as task …`），说明它是*工具层的通用能力*，不是 shell 的一个特性。

::: tip 判断
一处只有 Claude Code 处理了的边角：`backgroundEndsWithFinalResponse`——当一个后台命令属于**同步 subagent** 时，那个 agent 给出终态回答的一刻，命令被终止；属于主循环或异步 subagent 的则活下来。后台任务的生命周期要挂在*谁*身上，是有子代理之后才会遇到的问题，而它被显式回答了。
:::

dsh 把后台交给 `ctx.jobs`——一个**通用任务设施**，不是 shell 专属。代价是它得把 shell 的结局翻译成通用词汇，翻译规则在 `background.ts` 里，并且带一条 TODO：*非零退出必须映射成 completed 而不是 failed*，但沙箱运行器失败与无沙箱 spawn 失败目前都退化成「无信号的 kill」，分不开。注释把这个诚实边界写在了函数上方。

本仓这条缺口的代价在 §6 已经量化了：一次跑超两分钟的测试套件会停掉整个 Run。ADR-0052 预定的更小解法是加 `idleTimeoutMs`；三家给出的解法比这一条多——**模型显式后台**（dsh，最小改动：加一个入参加一套 job 设施）、**超时自动转后台**（Claude Code，不用改工具面）、**删掉同步等待**（codex，改动最大）。重估那天这三条都该一起摆上桌。

### 08 输出：截多少、截哪一段、全量去哪 <Badge type="tip" text="大体同构" />

一条命令吐了 200MB。给模型看哪一段？剩下的呢？

- **Claude Code**：30,000 字符（上限 150,000），掐**中段**：`… [N characters truncated] …`。超大落 `persistedOutputPath` + `persistedOutputSize`。
- **codex**：1 MiB 的 `HeadTailBuffer`，**头尾各半**，中间丢弃并报 omitted 字节数。另有 token 预算：默认 10,000，回执带 `original_token_count`。
- **deepseek-harness**：每流 64,000 字节，留**尾**；溢出落 spill 文件（每流上限 64MB）并把 `spillPath` 报回。持久那把反过来留**头**。
- **本仓**：每流 24,000 字符，头 6,000 + 尾 18,000，掐中段。**不落盘**——被掐掉的那一段就是没了。

「保头保尾、掐中段」是三家（加本仓）的共同答案，理由也一致，本仓注释写得最直白：头部保住「跑的是什么、一开始报了什么」，尾部给得更多因为「编译错误与测试摘要都在末尾」。codex 的实现最干净——`HeadTailBuffer` 把预算**对半分**，先填满 head，之后的字节全部进一个会丢老数据的 tail 队列。

::: tip 判断
唯一的例外来自 dsh，而且它自己内部就不一致：一次性那把留**尾**（工具描述原话 `truncated to its tail`），持久那把留**头**（`content.slice(0, maxOutputChars)`）。持久那把的截断文案还带一句给模型的建议：*先用 `grep -n` 找到行号再重试*——它假设输出来自一个可搜索的文件，源码里有一条 TODO 说这个假设不成立。
:::

**「全量落盘 + 把路径给模型」三家同构，本仓缺**。Claude Code 给 `persistedOutputPath`，dsh 给 `spillPath`，codex 给 `original_token_count`（知道自己丢了多少，虽然不给路径）。本仓掐掉中段只留一个 `truncated: true` 布尔——模型知道自己没拿全，但*没有任何办法拿到剩下的*。这条缺口比 §5 那四个环境变量更值钱：它决定了「跑一次测试，失败详情在中段」这类场景能不能救回来。

codex 多一维：它同时按**字节**和按 **token** 算。`max_output_tokens` 默认 10,000 且模型可以调，回执里带截断前的原始 token 数。按字节截会在 CJK 与 ANSI 转义序列上算不准上下文占用，按 token 截准，代价是每次都要跑一遍分词。

### 09 回执里除了 stdout 还有什么 <Badge type="warning" text="分岔 · 立场差别最大" />

工具回执是「只报事实」，还是 harness 与模型之间的一条旁路信道？

- **Claude Code**：**开放的信道**：十几个 harness 写的提示字段——`returnCodeInterpretation`、`noOutputExpected`、`backgroundCwdHint`、`staleReadFileStateHint`、`ghRateLimitHint`、`gitOperation`（只给客户端）。
- **codex**：**封闭六字段**：`chunk_id` / `wall_time_seconds` / `exit_code` / `session_id` / `original_token_count` / `output`。只有 `output` 是文本。
- **deepseek-harness**：**封闭且带 `additionalProperties: false`**，前台/后台是 `oneOf` 两分支。跨调用的规矩另走系统提示词一节。
- **本仓**：六个字段：`exitCode` / `stdout` / `stderr` / `truncated` / `durationMs` / `signal?`。

这一维把三种设计哲学摆得很清楚。**codex 与 dsh 站同一边**：回执是数据，schema 封闭，跨调用的规矩属于系统提示词。dsh 把这条做成了明规矩——它在系统提示词里注册了一节 `tool:bash`（order 105），内容是一句 `Check the [exit code: N] marker on every bash result`，源码注释解释道：*cross-call guidance belongs in the prompt rather than one-call schema prose*。这句话是一次立场声明。

::: tip 判断
**Claude Code 站另一边**，而且走得很远。最能说明问题的是 `staleReadFileStateHint`：「列出这条命令期间 mtime 变过的 `readFileState` 条目」——也就是说，*bash 工具会主动告诉模型「你之前读过的这几个文件，刚才被你自己的命令改了」*。这是 shell 工具与文件工具之间的一条横向耦合，写在 bash 的回执上。
:::

这条耦合对本仓有直接对应的问题。本仓有版本冲突保护（`expected-version.ts`）：`read` 回执带全文 `contentHash`，写工具比对，不一致就拒。模型跑了一条 `sed -i` 之后再去 `edit`，这道保护**会正确拦住**——差别不在拦不拦得住，在*模型什么时候知道*：Claude Code 是在 bash 回执里当场告知，本仓是等到下一次写被拒绝时才知道。多绕一轮，且那一轮里模型是在错误的前提上推理的。

还有一条只有 Claude Code 做的：`gitOperation` ——把命令里的 commit / push / merge / PR 操作解析成结构化字段，注释明写 *client-facing，不给模型*。同一份回执里同时装着「给模型的」和「给界面的」两套东西，靠字段注释区分。本仓 §7.2 走的是相反的路（敏感入参只进 `payloadRef`，摘要直接广播给每个订阅方），两条路各有代价，但都要求作者**逐字段想清楚它给谁看**。

### 附 什么算失败 <Badge type="tip" text="同构 · 可当定论" />

`grep` 没找到东西会返回 1。这算命令失败，还是算一个结果？

- **Claude Code**：维护一张表：`grep` `rg` `egrep` `fgrep` `find` `diff` `test` `[` `git diff` `git grep` 的**退出码 1 不算失败**，另有 `returnCodeInterpretation` 逐条解释。
- **codex**：`exit_code` 只是回执里的一个数字，不做任何解释。
- **deepseek-harness**：非零一律「报告」不「失败」，渲染成 `[exit code: N]` 标记；后台任务的非零退出也映射成 `completed`。
- **本仓**：`exitCode` 原样回，非零不当工具错误。

**四家一致：非零退出码不是工具失败**。这条可以当定论——工具失败是「这次调用没能发生」，命令返回 1 是「调用发生了，结果是 1」。混淆二者会让模型把一次成功的 `grep` 当成故障去排查。

Claude Code 在同构之上多做了一层：它**逐命令**维护语义。这只在「模型会照着退出码改变行为」时才值得——而它确实会。代价是那张表要跟着工具生态更新，收益是模型不会在 `grep` 无匹配时开始编造原因。三家里只有它付了这个成本。

## 分岔汇总

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| 01 工具面 | 三把，按输出节奏 | 一把，含会话 | 两把，装配二选一 | 一把 |
| 02 落到进程 | harness 定，PowerShell 另立一把 | 模型定：shell / login / tty | 装配定，argv 写死 | harness 定，按平台探测 |
| 03 调用之间 | 留 cwd（有界），不留 env | 什么都不留 + rc 快照回放 | 一次性全不留 / 持久全留 | 全不留，cwd 钉死 |
| 04 环境继承 | 未核到 | 可配，**默认不擦** | 硬性擦除 + 注入受管 `DSH_*` | 硬性擦除，词边界 |
| 05 去交互化 | `TERM=dumb` | 同一组，硬编码 | 四个变量，可覆盖 | **没有** |
| 06 超时到点 | 120s → 转后台 | 不存在超时 | 120s → 杀进程组 / 300s → 重置 shell | 120s → 停 Run |
| 07 谁转后台 | harness + 模型 + 用户 | 不需要这个概念 | 只有模型 | **没有后台** |
| 08 输出截断 | 30K 掐中段 + 落盘 | 1MiB 头尾各半 + token 预算 | 64K 留尾 + spill 文件 | 24K 掐中段，**不落盘** |
| 09 回执形状 | 开放，十几个提示字段 | 封闭六字段 | 封闭 + `additionalProperties: false` | 封闭六字段 |
| 附 非零退出 | 不算失败 + 逐命令语义 | 不算失败 | 不算失败 | 不算失败 |

## 对本仓意味着什么

### 三条已经对齐，两条缺着 <Badge type="tip" text="同构 · 可当定论" />

**已经对齐的**：非零退出码不算工具失败（四家一致）；保头保尾掐中段（四家一致，连「尾部给得多」的理由都一样）；不给模型 stdin 参数（dsh 明确写下这个决定，本仓 stdio 接 `ignore`，同构）。这三条不用再想。

**缺着的第一条：去交互化的四个环境变量。**`NO_COLOR=1` `TERM=dumb` `PAGER=cat` `GIT_PAGER=cat`。三家同构，而且是被 dsh 源码注释*直接点名*的同构。没有取舍要拍、没有契约面要动，缺了它的后果是 `git log` 挂起等分页器、ANSI 转义序列进上下文。

**缺着的第二条：大输出落盘并把路径给模型**。三家都有（`persistedOutputPath` / `spillPath` / 至少给 `original_token_count`），本仓只给一个 `truncated: true`——模型知道自己没拿全，但没有任何办法拿到剩下的。「跑一次测试，失败详情正好落在被掐掉的中段」是个会真实发生的场景。

### 长跑这一条，三家给的解法比 ADR-0052 预定的多 <Badge type="warning" text="本仓没有 · 补不补是决策" />

路线图 §15.3 已经登记了这条重估，触发条件写着「跑测试超时杀掉整个 Run 真的伤到人时」，预定的更小解法是给 `bash` 加 `idleTimeoutMs`。对读之后桌上多了三条，按改动量从小到大：**模型显式后台**（dsh：加一个入参 + 一套 job 设施，工具面几乎不动）、**超时自动转后台**（Claude Code：工具面完全不动，改的是 `ToolRuntime` 那道闸门的行为）、**删掉同步等待**（codex：整个工具面重画）。

有一条本仓独有的约束需要先解：三家的 bash 都不进幂等账，而本仓的 `unknown → 停 Run` 是从幂等键推出来的（新 `callId` 就是新键，「重试」等于重放）。*「转后台」把一次调用拆成了两次交互，那第二次算不算新的调用*——这个问题三家都不用回答，本仓要。

另一条现成可用的是 **codex 的 shell 快照**：它证明了「不要持久进程」与「要用户的别名和函数」不矛盾。对本仓这种「一把 bash、无状态」的形态是直接可移植的，代价是每条命令前面多一段 `eval`。

### 两个真问题 <Badge type="warning" text="三家分歧 · 得自己判" />

**一、回执要不要带 harness 写的提示**。codex 与 dsh 明确站「不带，跨调用规矩进提示词」，Claude Code 明确站「带，而且带十几个」。本仓现在跟前者一致，但有一个具体场景值得单独判：模型跑完 `sed -i` 之后再 `edit`，本仓的版本冲突保护会正确拦住，差别只在*模型什么时候知道*——回执里当场告知，还是等下一次写被拒。落点是 `expected-version.ts` 与 `bash-tool-provider.ts` 之间那条现在不存在的连线。

**二、环境变量默认擦不擦**。本仓已经拍了（ADR-0055，硬性擦除），这次对读的价值是确认它**不是孤例**：dsh 做了同一件事，而且做成了不可配的纯函数。分歧方是 codex——同一份词表，`ignore_default_excludes` 默认 `true`，默认*不擦*。它敢这么默认是因为它有沙箱兜底，而本仓 §12 明写「护栏不是沙箱」。这条对读把本仓那个判断的论据补强了一格。

## 证据档次与明确没核到的

codex 与 dsh 是全量源码，默认值直接读到定义处，可当事实。Claude Code 那一列分两档：**类型与常量是事实**（`sdk-tools.d.ts` 的字段注释是原文，`claude.exe` 里的默认值 `xlo=30000 / Plo=150000` 是原值），**控制流是推断**。

- **Claude Code 的环境变量擦除：没核到**。没找到对应的常量或文案。这一格在汇总表里是空的，不是「它不擦」。
- **Claude Code 超时转后台的三条例外**（`sleep` 开头、跑 `git`、解析不了的复合命令）取自既有 evidence 记录，本轮没有重新核。
- **codex 的 `tty`：核到默认值 `false`，没核到 PTY 分配之后的读写路径**——所以我只说「工具描述与默认值不一致」，没说「PTY 从不使用」。
- **dsh 持久档的 PTY 后端**（`ctx.terminals`）只读了工具那一层，后端实现没读。
- **三家的 Windows 路径**都只读了分支存在性，没有实机验证。本仓的 Git for Windows 探测是实机跑过的。
- **并发**这一维没做：codex 的 `supports_parallel_tool_calls` 返回 `true`，本仓 bash 是 `parallelSafe: false`，dsh 与 Claude Code 侧没核。它够得上单独一维，材料不够。

::: info
这份里出现的所有默认值（120s / 600s / 10s / 30000 字符 / 64KB / 1MiB / 64 进程 / 3s 宽限期）都是**写作当日**的值，会过期。要用它们做决定时回源码核一遍。
:::

## 落点索引

下一轮要接着读的话，从这些文件进去。

#### codex

- `core/src/unified_exec/mod.rs` —— 全部常量与流程总述（文件头注释是最好的入口）<br> `core/src/tools/handlers/unified_exec.rs` —— `ExecCommandArgs` 与全部 `serde` 默认值<br> `core/src/tools/handlers/shell_spec.rs` —— 模型看到的工具描述原文、Windows 安全须知、输出 schema<br> `core/src/unified_exec/head_tail_buffer.rs` —— 头尾对半的截断缓冲<br> `exec-server/src/shell_snapshot.rs` —— rc 快照的捕获、切块与还原<br> `config/src/shell_environment_policy.rs:136` —— `unwrap_or(true)`，默认不擦那一行

#### deepseek-harness

- `packages/shell/tool-bash/src/index.ts` —— 工具描述全文、升级重试、前台/后台分支<br> `packages/shell/bash-local/src/index.ts` —— `ENV_OVERRIDES`（含三家对照的那句注释）、全部默认值<br> `packages/shell/tool-bash-persistent/src/index.ts` —— PTY 标记法、超时重置、留头截断<br> `packages/shell/shell-env/src/index.ts` —— 受管 `DSH_*` 注册表<br> `packages/subprocess/subprocess/src/index.ts` —— `scrubbedParentEnv()` 与它的理由

#### Claude Code

- `@anthropic-ai/claude-code/sdk-tools.d.ts` —— `BashInput`（691 行起）、`BashOutput`（3150 行起）、`MonitorInput`（2859 行起）<br> `bin/claude.exe` —— `grep -a -o -E` 抓常量与文案；本轮用到的键：`BASH_MAX_OUTPUT_LENGTH` `BASH_DEFAULT_TIMEOUT_MS` `BASH_MAX_TIMEOUT_MS` `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`<br> 注意：单条 `grep` 扫这个 250MB 文件会跑过两分钟，先用窄模式限定

#### 本仓

- `packages/packs-coding/src/bash-tool-provider.ts` —— 工具 spec 与风险判定入口<br> `packages/packs-coding/src/shell-runner.ts` —— 截断常量、凭证擦除、shell 探测、进程树清理<br> `docs/decisions/0052-超时的调用落什么状态以及守到哪一层.md` —— ④ 停 Run 的论据、⑥ 总时长不续期、重估触发条件<br> `docs/decisions/0055-bash-子进程不继承凭证类环境变量.md` —— 词边界与不匹配 AUTH 的理由<br> `docs/路线图.md §15.3` —— 已登记的重估项与触发条件

---

三家对读 · 第十六份 · 核验日期 2026-08-27<br> 覆盖 路线图 §15.0「文件与 shell 工具」的 shell 那一半 —— 与沙箱那份（隔离面）、文件工具那份（文件面）合起来成一组<br> 结论只进 docs/evidence/，改架构走 ADR
