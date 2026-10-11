---
group: 平台能力
order: 5
date: 2026-08-27
summary: 项目指令文件 AGENTS.md / CLAUDE.md
# 右侧本页目录只列二级标题，用下面的短名字（按顺序对应文章里的二级标题）
outline: 2
toc:
  - 要解决的问题
  - 三家与证据
  - 九个决策点
  - 分岔总表
  - 对本仓的意义
  - 证据与缺口
  - 落点索引
---

# 仓库自己写的规矩

<Badge type="info" text="三家对读 · 第十五篇 · 核验日期 2026-08-27" />

`AGENTS.md` 是一份放在仓库里、由仓库作者写、直接进模型上下文的指令文件。它是外部内容能取得的最高权限位置——不用调工具，不过审批，进门就在那儿。三家都读它，本仓也读，四份实现在同一道题上给出了四个不同答案，而最关键的那个分歧不在「读哪些文件」，在*把它放进请求的哪一段*。

<Badge type="info" text="user 消息" /> <Badge type="info" text="system 之下" /> <Badge type="info" text="四家 × 九维" />

Claude Code 2.1.247 · codex（codex-rs 全量） · deepseek-harness（全量 + 包文档） · 本仓有真实实现，不是待定

## 这件事在解决什么

编程智能体进一个仓库，第一件事是读那份仓库自己写的说明。名字各家不同（`AGENTS.md` / `CLAUDE.md`），作用一样：把「这个项目怎么干活」直接告诉模型。

听起来是读个文件。真做起来，一份文件要过九道决定：

- **算数的文件有哪几种**。仓库的、用户全局的、不进版本库的本地覆盖的、公司下发的——它们权限不一样。
- **往上找到哪儿停**。子目录里也有一份怎么办？一直往上找到磁盘根目录吗？
- **多份怎么合。**「更具体的优先」是句好听的话，落到代码里得有顺序。
- **太大了怎么办**。一份六万字的 `AGENTS.md` 会把稳定前缀撑爆。截断？丢弃？报错？
- **它里面写的 `@别的文件` 跟不跟**。跟了就等于仓库能把任意路径的内容升级成指令。
- **不认识的仓库读不读**。克隆一个陌生项目，它的 `AGENTS.md` 是第一段能对模型说话的攻击面。
- **放进请求的哪一段**。system 里、user 里，还是别的地方——这一条决定了后面两条。
- **跑到一半文件变了怎么办。**
- **仓库能不能伪造包裹它的那层框**。如果指令是被 `<system-reminder>` 包着送进去的，那份文件里写一个闭合标签会发生什么。

::: info 本仓在这一维不是旁观者。
你正在读的这篇文章由一个遵守 `docs/agent-guide.md` 的智能体写出来，而那份文件正是靠 `CLAUDE.md` 里一行 `@docs/agent-guide.md` 进来的。本仓自己也有实现：`ProjectRulesSource`（ADR-0034 / M1-3），112 行，三条口径写在文件头注释里。所以这一篇的第四列是*可以逐条对照的代码*，不是「将来打算怎么做」。
:::

## 三家是谁，证据到什么档次

::: codex 一手源码
`core/src/agents_md.rs`（529 行）与它的头注释、`agents_md_manager.rs`、`context/world_state/agents_md.rs`、`context/user_instructions.rs`、`context-fragments/src/fragment.rs` 的渲染路径，以及 `config_toml.rs` 的三个相关配置项。
:::

::: dsh 一手源码 + 包文档
`packages/context/agent-instructions/`（1863 行）的 `render.ts` 预算算法与转义、README 的完整行为契约与它自己写的六条已知局限。这个包是三家里最长的一份实现。
:::

::: claude 压缩源码 + 自证
从 `claude.exe` 里 grep 出了完整的装配函数（未混淆的字符串常量 + 可读的控制流），加上*一份直接证据*：本文作者自己的上下文里就有 `Contents of …CLAUDE.md (project instructions, checked into the codebase)` 这一行，与二进制里的模板字面量逐字相符。
:::

**本仓这一列**读的是 `packages/packs-coding/src/project-rules-source.ts` 与 `packages/core-runtime/src/context/context-assembler.ts` 的可信指令通道，两份文件的头注释都把「为什么这样」写全了，本文直接引用。

## 九个决策点

按一份文件从被找到到进请求的顺序排。四列并排，本仓那一格标出来。

### ① 算数的文件有哪几种 <Badge type="warning" text="分岔" />

同一个目录里同时有 `AGENTS.md` 和 `CLAUDE.md`，读几份？

- **Claude Code**：五类来源、五种标签，公司下发的那一类排不掉
- **codex**：每个目录首个命中即止，`AGENTS.override.md` 排最前
- **dsh**：全读，靠内容去重；`.local` 覆盖跟在后面
- **本仓**：首个命中即止，且**刻意不同时加载**

<small>Claude Code</small> 装配时给每一份加一个人话标签，这五句是二进制里的原文：

```text
Project  → (project instructions, checked into the codebase)
Local    → (user's private project instructions, not checked in)
User     → (user's private global instructions for all projects)
AutoMem  → (user's auto-memory, persists across conversations)
Managed  → (organization-managed policy instructions)
```

文件名上，每个目录读三处：`CLAUDE.md`、`.claude/CLAUDE.md`、`.claude/rules/` 整个目录，外加不进版本库的 `CLAUDE.local.md`。用户可以用 `claudeMdExcludes` 配一组 glob 把文件排掉——*但那个函数第一行就把 `Managed` 排除在外*：公司下发的那份，用户排不掉。企业还能直接在托管设置里塞一段 `claudeMd`，它以伪路径 `<managed-settings>` 的名义进上下文，磁盘上根本没有这个文件。

<small>codex</small> 每个目录按顺序试三类文件名，**第一个存在的赢，后面的不看**：`AGENTS.override.md` → `AGENTS.md` → 配置里的 `project_doc_fallback_filenames`（默认空）。那个 `.override.md` 是逐目录的本地覆盖，不是全局开关。

<small>dsh</small> 相反：`instructionFileCandidates` 默认 `['AGENTS.md', 'CLAUDE.md']`，一个目录里**每一份存在的都加载**；去重不看文件名，看内容——去掉首尾空白后字节相同的兄弟文件折叠成最早的那个。所以「`CLAUDE.md` 是 `AGENTS.md` 的副本」只渲染一次，而两份真的写了不同东西的就都生效。`.local` 覆盖（`AGENTS.local.md` / `CLAUDE.local.md`）跟在同目录基文件之后。

<small>本仓</small> `RULE_FILE_CANDIDATES = ["AGENTS.md", "CLAUDE.md"]`，首个命中即止，与 codex 同形。但它把「为什么不同时加载」写成了一条口径：

> 两份同权的 system 指令冲突时，确定的**输入顺序**并不等于确定的**冲突语义**——「各自成一个 block」只是没写合并函数，不是没有合并。

::: tip 判断
dsh 是唯一一家正面回答了「两份都在怎么办」的：*用内容判重，不用文件名判重*。另外三家都选择了首个命中即止，也就是把这个问题定义掉。本仓那句注释说清了代价在哪——不是「两份读不了」，是「读了之后谁压谁没人定义」。
:::

### ② 往上找到哪儿停 <Badge type="warning" text="分岔" />

你在 `repo/packages/api/src` 里干活。哪几个目录的规则文件算数？

- **Claude Code**：一路走到磁盘根，**不停在项目边界**
- **codex**：停在 `.git`，且仓库不能改这条线
- **dsh**：停在 `.git`，但子目录的按需加载（见 ⑧）
- **本仓**：只读仓库根一份；目录级的通道建好了没接上

<small>codex</small> 从 cwd 往上走，找到第一个带 `project_root_markers` 标记的目录当项目根（默认 `['.git']`），然后**从根往下收到 cwd 为止**，按这个顺序拼接。头注释里明写「We do **not** walk past the project root」，还留了个后门：标记列表配成空数组就完全关掉向上遍历。

这里有一处很讲究的取舍，不读代码看不出来：读 `project_root_markers` 时，它*跳过 Project 那一层配置*——

```text
for layer in config.config_layer_stack.layers_low_to_high() {
    if matches!(layer.name, ConfigLayerSource::Project { .. }) { continue; }
    merge_toml_values(&mut merged, &layer.config);
}
```

也就是说，**一个仓库不能自己定义「我的项目根在哪」**。否则仓库里放一份配置就能把搜索范围扩到父目录，那是它自己给自己扩权。

<small>Claude Code</small> 没有项目根这个概念。装配函数里那段循环是：从 cwd 开始，`while (y !== root(y)) { push(y); y = dirname(y) }`，收集**全部祖先目录**，然后反转成「从上到下」的顺序逐个读。唯一的截断是 git worktree：当前在 worktree 里时，主仓根那一支的目录会被跳过。此外一个环境变量能把额外目录也纳进来。

<small>dsh</small> 与 codex 同形（`projectRootMarkers` 默认 `['.git']`），但只有**基线**是「根到 cwd」；更深的目录靠 ⑧ 那套按需加载补。

<small>本仓</small> 只读工作区根那一份。目录级规则不是没设计——`InstructionBlock` 上已经有 `origin.appliesTo` 字段（根规则填空字符串），`stability: "dynamic"` 的渲染通道 M1-3 就建好并有单测，缺的是「当前目标是哪个文件」这个事实：

> `RunState` 有界（两个标量加一个游标），`ToolInvocation` 的已校验 claims 倒是现成的目标来源，但把它变成可恢复的装配输入是另一件事。

::: tip 判断
**Claude Code 是四家里唯一一个不设项目边界的**。好处是「把公司通用规则放在父目录」这种用法直接可用；代价是走到磁盘根之前经过的每一个目录都能对模型说话，而用户通常不知道自己有几层祖先目录。codex 那条「仓库不能定义自己的根」值得单独记下来——它是同一类问题里最容易被漏掉的一格。
:::

### ③ 多份怎么排，谁压谁 <Badge type="tip" text="口径同构" />

根目录说「用 tabs」，子目录说「用 spaces」。模型该听谁的？

- **Claude Code**：按来源类型排，公司在最前、项目在后
- **codex**：根到 cwd 顺序拼接，靠位置表达优先
- **dsh**：同顺序，且**把规矩写进提示词**
- **本仓**：只有一份，不存在这个问题

三家的物理顺序一致：广的在前，具体的在后。差别在**说不说出来**。dsh 把优先级直接写进注入给模型的那段话里：

> The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

最后那半句是四家里独一份：它*显式给出了一条权限阶梯*——仓库指令低于 system、低于 developer、低于用户当场说的话。codex 与 Claude Code 都只靠位置和措辞暗示，没有这一句。（Claude Code 的措辞反而更强硬：`IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.`）

::: tip 判断
物理顺序同构，可以当定论：**广的在前、具体的在后**。但「仓库指令在权限阶梯上排第几」只有 dsh 说了出来，而这恰好是本仓 `§4.1 冲突优先级阶梯` 已经有答案的问题——本仓的 `ProjectRulesSource` 产出的是「可信但低于平台」的指令，由装配器独占渲染进平台 system *之下*。位置就是它的答案，只是没写给模型看。
:::

### ④ 太大了怎么办 <Badge type="warning" text="四家四答" />

一份规则文件比预算大。截断、丢弃、还是报错？丢的时候丢哪一份？

- **Claude Code**：没有总预算；单份超 4 MiB 才整份跳过
- **codex**：32 KiB 总预算，**先到先得**，超了截断且只写日志
- **dsh**：预算必填，**先丢最广的**，并逐条告诉模型
- **本仓**：64 KB 单份上限，超了**抛错**

<small>codex</small> `project_doc_max_bytes` 默认 32 KiB，是*所有*项目文档的总和。读取顺序是根 → cwd，`remaining` 一路递减——也就是说**最广的那份先吃满预算，最具体的那份被截断或整个跳过**。截断是在原始字节上做的，之后走 `String::from_utf8_lossy`，中文被切一半就变成 U+FFFD。模型不会被告知发生过截断，只有一行 `tracing::warn!`。

<small>dsh</small> 方向完全相反，而且算法明写在 `render.ts` 里：整体放不下时，**从最广的那份开始逐个丢**，直到剩下的能装进预算；如果连最具体的那一份单独都放不下，就截断它；再放不下就只留一条通知。截断在 UTF-8 码点边界上做（发现切在续字节上就退回到前导字节），不会产生半个字。而且每一步都写进模型看得见的那段文本：

> Workspace instruction budget 32768 bytes: omitted docs/AGENTS.md; truncated packages/api/AGENTS.md from 5000 to 1200 bytes

`maxBytes` 在 dsh 里是**必填**，README 给的理由是「so each deployment makes its prompt-budget choice explicitly」。

<small>Claude Code</small> 在装配函数里找不到任何总预算或截断。唯一的上限在读文件那一层：单份超过 4 MiB 返回 `{kind:"skipped"}`——*整份跳过，不是截断*。四家里它是唯一一个「你写多少我就送多少」的。

<small>本仓</small> `MAX_RULE_BYTES = 64_000`，超了既不截断也不跳过，直接抛。理由写在常量的注释里，而且是两条：

> 超了**拒绝而不是截断**：半条指令可能把意思读反，而模型看不出自己拿到的是半条。…… 规则文件在那儿、却没有生效，是「以为设了其实没设」那类失效：用户看不出差别，而模型会理直气壮地违反它。拆文件是用户一分钟能做的事，静默跳过则是他永远不会发现的事。

同一段注释还解释了为什么预算器不接管它：可信指令进的是*不可裁的固定档*，`ContextSelector` 根本拿不到它，所以「按预算动态定」在这里等于「预算不够就少给半条规则」——正是它拒绝的那件事。

::: tip 判断
四家四个答案，而且分歧的是**失效该不该被看见**。codex 静默截断（只有日志）、Claude Code 静默跳过、dsh 截断但告诉模型、本仓直接失败。dsh 与本仓解的是同一个担忧的两半：dsh 保证*模型知道自己拿到的是残缺的*，本仓保证*用户知道自己的规则没生效*。两条可以同时做，四家里没有一家两条都做。
:::

### ⑤ 文件里写的 `@别的文件` 跟不跟 <Badge type="warning" text="一跟三不跟" />

规则正文里出现一行 `@docs/foo.md`。它是一段字面文本，还是一条把目标文件升级成指令的命令？

- **Claude Code**：跟。深度 5、去环、外部路径要用户批准
- **codex**：不跟。读到的字节原样进
- **dsh**：不跟，且写进了「明确不做」清单
- **本仓**：不跟，理由写了整整一段

<small>Claude Code</small> 它是四家里唯一支持内联引用的，而且这一层的防护做得最细，全部能从装配函数读出来：

- **深度上限 5**（`o >= sLo` 直接返回空）。
- **去环与去重**：一个已处理路径的集合贯穿整趟遍历，符号链接的原路径与解析后路径都进这个集合。
- **外部路径要批准**：深度大于 0 且目标在项目之外时，必须用户点过那个对话框——「Allow external CLAUDE.md file imports?」，选项是 `Yes, allow external imports` / `No, disable external imports`，旁边挂着安全文档链接。
- **用户级文件额外防链接**：`User` 档在没批准外部导入时，深度 0 的符号链接会被拒，*硬链接（`nlink > 1`）也会被拒*——后者防的是往 `~/.claude/` 里硬链一份别处的文件。

<small>codex</small> `agents_md.rs` 里没有任何展开逻辑：读到的字节经 `from_utf8_lossy` 之后原样成为一个 `InstructionEntry`。

<small>dsh</small> 把这条明写进 README 的「Known Limitations and Deferred Work」：「lowercase names, `.claude/rules/`, and `@path` imports are not interpreted」。*不是没想到，是选择不做。*

<small>本仓</small> 同样不跟，理由在文件头注释里，而且它把「为什么这不是一个小功能」拆开了：

> 通用递归跟随要一次性定下允许的语法、边界、敏感策略、循环与深度限制、总字节预算、来源 hash 与适用目录继承——那是一整套安全语义，不该在实现阶段临场决定。

对照 Claude Code 那份清单，这句话的每一项都对得上一处真实机制：深度 5、去环集合、外部批准、链接拒绝。*它确实是一整套，不是一个 `readFile`。*

::: info 一处自指的意外，值得本仓自己看一眼。
本仓的 `CLAUDE.md` 写着「下一行把它内联进来：`@docs/agent-guide.md`」，`AGENTS.md` 写着「开始工作前请先完整阅读它」。这两句在 Claude Code 下都成立（它会展开），但在 codex 与本仓自己的 `ProjectRulesSource` 下，进上下文的就是那五行字面文本——`AGENTS.md` 那句「请先完整阅读」刚好是对的写法，`CLAUDE.md` 那句「内联进来」则只在一家成立。*两个入口文件的措辞差异不是随手写的，但它现在只有一半是准确的。*
:::

### ⑥ 不认识的仓库读不读 <Badge type="warning" text="分岔" />

克隆一个陌生项目、第一次进去。它的 `AGENTS.md` 直接生效吗？

- **Claude Code**：正文照读；只有**外部导入**那一层要批准
- **codex**：项目标为 untrusted 时**整个不读**
- **dsh**：不设信任门，把风险明写成已知局限
- **本仓**：正文照读，但正文**不许授权**

<small>codex</small> 一行判断挡在最前面：`if config.active_project.is_untrusted() { return ...; }`——用户指令仍然生效，但这个项目的所有 `AGENTS.md` 一份都不读。四家里只有它把「信任级别」直接接到了指令加载上。

<small>dsh</small> 明确不做，而且在 README 里把后果和缓解都写了：

> Symlinked instruction files are followed across the trust boundary … so a cloned repository can surface off-tree file content as lower-authority workspace guidance. Confine `ctx.fs` with the filesystem policy gate or an OS sandbox when loading untrusted repositories.

<small>本仓</small> 没有信任门，但有一条别家都没有的正面禁令，写在 `ProjectRulesSource` 的第三条口径里：

> **规则正文绝不作为 `ResourceClaimPolicy` 的输入**。它是给模型的指令，不是给强制点的配置（ADR-0034 ①：规则正文不得授予权限、不得修改 Policy）。

同一句话在 `coding-resource-claim-policy.ts` 与 `approval-allowlist.ts` 里各出现一次，措辞是「让 `AGENTS.md` 能改这张表，等于让仓库内容给自己发许可证」。这条与 Claude Code 那条「`claudeMdExcludes` 排不掉 `Managed`」是同一个直觉的两种表达：*仓库能说话，但不能改规则本身*。

<small>Claude Code</small> 正文本身没有信任门。它把闸设在别处：外部导入要批准（见 ⑤），企业下发的那份排不掉，以及一条更硬的——权限规则、hook、MCP 都各有自己的信任闸，`AGENTS.md` 那一层拿不到它们。

::: tip 判断
两种思路，都成立：codex 的「不信任就不读」是**阻断**，本仓与 Claude Code 的「读，但它只能说话不能授权」是**降权**。降权那条更耐用——因为最终总要读它（不读就等于这个功能不存在），而阻断只是把「什么时候读」推给了一个信任对话框。*本仓两条都可以有*：降权已经落地，阻断这一格空着。
:::

### ⑦ 放进请求的哪一段 <Badge type="warning" text="三比一" />

这是全篇最要紧的一格，因为它决定了下一格。

- **Claude Code**：`user` 消息，包在 `<system-reminder>` 里
- **codex**：`user` 消息，包在 `<INSTRUCTIONS>` 里
- **dsh**：`user` 消息，包在 `<system-reminder>` 里
- **本仓**：`system` 角色，在平台 system **之下**

三家的包装文案，全是原文：

```text
codex        # AGENTS.md instructions for /repo
             <INSTRUCTIONS> … </INSTRUCTIONS>        role: user

Claude Code  Codebase and user instructions are shown below.
             Be sure to adhere to these instructions. IMPORTANT: …    role: user

dsh          <system-reminder>
             The following workspace instructions may be relevant …   role: user

本仓          项目规则（来源：AGENTS.md）
             …                                          role: system
```

三家一致选了 user 角色，理由在 dsh 的 README 里说得最直白，是它的 **KV Cache effect** 那一节：

> Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<small>本仓</small> 选了另一边，理由同样是缓存，但结论相反。装配器的注释写着：可信指令由 `InstructionSource` 在 **Run 起点采集一次**，之后逐 Step 递进来，因为——

> 每个 Step 重读一次的话，Run 跑到一半有人改了 `AGENTS.md`，顶层 system 就变了，而 §9.3 ① 要求它全程冻结。

<figure class="diagram">
<!--@include: ./figures/project-instructions-1.svg-->
<figcaption>同一条缓存约束，两个方向的答案。三家把规则挪到前缀之后，换来「随时能改」；本仓把它留在前缀里，换来「顶层指令在一个 Run 内不会变」。两边都在守 §9.3 ①。</figcaption>
</figure>

::: tip 判断
**这不是三家更先进，是同一个取舍的两端**。放进 user 段 → 前缀不动 → 可以中途追加、替换、撤销，代价是仓库文本坐在与用户发言同一个角色里。放进 system 段 → 权限位置更准（低于平台、高于材料）、能进 `ContextManifest` 的规则栏留证，代价是一个 Run 内只能有一个版本。本仓已经付了后者的代价并写清了理由；*要改的话动的是 §9.3，不是这个类*。
:::

### ⑧ 跑到一半文件变了 <Badge type="warning" text="分岔" />

上一格的直接后果。三家都能更新，各自的触发条件与措辞完全不同。

- **Claude Code**：`.claude/rules` 按 glob 命中你在动的文件才激活
- **codex**：环境或信任级别变了才重算，发一条「替换」通知
- **dsh**：每次成功的读/写/改都检查一遍，三种通知
- **本仓**：不更新。Run 起点一次，全程冻结

<small>codex</small> 缓存键是三样东西：环境选择、项目信任级别、Windows 沙箱级别。任何一样变了就重新发现一遍，然后**渲染一个 diff** 进对话——两句通知都是常量：

> These AGENTS.md instructions replace all previously provided AGENTS.md instructions.<br> The previously provided AGENTS.md instructions no longer apply.

<small>dsh</small> 最细的一家，而且触发点选得很有讲究：它监听的是**成功的第一方 `read` / `write` / `edit` 工具结果**，不是文件监听器，也不是 shell 的 `cd`。README 给的理由是：

> a `bash` command that changes directories does not trigger nested instruction discovery because shell syntax and per-call shell state are not a reliable filesystem seam.

三种通知，措辞各自不同：

```text
新到达的目录  Additional instructions from: packages/app/AGENTS.md
              These instructions apply to work under `packages/app`. …

同一份改了    Updated instructions from: <path>
              This file changed after it was loaded. Use the following content
              instead of the previously loaded instructions from this file.

文件没了      Instructions removed: <path>
              The previously loaded instructions from this file no longer apply.
```

去重靠 SHA-1：路径与内容摘要都没变就不再注入。删除记成墓碑，所以同一个文件消失又出现能被重新加载。压缩把之前那条消息挤出可见区之后，对应的 scope 会重新武装，下一次触碰再补一遍。

<small>Claude Code</small> 它的动态那一半在 `.claude/rules/`：规则文件带 `globs`，按**你正在动的那个文件的路径**过滤，没有 glob 的直接不算条件规则。也就是「碰到匹配的文件时这条规则才出现」。

<small>本仓</small> 不做，且是明写的决定：Run 起点采集一次，逐 Step 递给装配器，装配器保持无状态。注释还顺手否掉了一个看起来更省事的实现——

> 用按 runId 缓存实现同样能冻，但那份缓存没有清理点，且进程内多个 Run 交错时会互相打架（`AppService.startRun` 不保证同时只有一个 Run）。

::: tip 判断
三家的三种触发条件里，**dsh 那条最值得记**：不用文件监听器，改用「智能体自己碰过的文件」当信号。这既省掉了一整套 watcher 生命周期，又天然把发现范围限制在智能体真正走到过的地方。本仓将来接目录级规则时，缺的那个事实正是「当前目标是哪个文件」——*而 dsh 已经证明了 `ToolInvocation` 的已校验 claims 是够用的信号源。*
:::

### ⑨ 仓库能不能伪造那层框 <Badge type="warning" text="两转义两不转义" />

规则文件里写一行 `</system-reminder>`。它会不会提前关掉包着它的那层框，让后面的文本看起来像是平台说的？

- **Claude Code**：转义。一个容忍空格的正则
- **codex**：不转义。标记直接拼在正文两端
- **dsh**：转义，并写进 README 说明为什么
- **本仓**：不适用——它根本不用标签包

<small>Claude Code</small> 二进制里能读到这个正则与它的替换目标：`<\s*\/\s*system-reminder\s*>` → `&lt;/system-reminder&gt;`。注意它容忍标签内的空白，也就是 `</ system-reminder >` 这种写法同样被挡。

<small>dsh</small> `escapeInstructionFrameBody()` 把 `</system-reminder>` 替换成 `<\/system-reminder>`，作用范围是*整段正文*，包括路径、scope 名和预算诊断这些元数据。README 里那句写得很清楚：

> Literal `</system-reminder>` text anywhere in instruction content or model-visible path, scope, and budget metadata is escaped so repository-controlled text cannot close the plugin-owned frame.

<small>codex</small> 渲染是一行拼接，没有转义环节：

```text
fn render(&self) -> String {
    let (start_marker, end_marker) = self.markers();
    format!("{start_marker}{body}{end_marker}")
}
// markers() for AGENTS.md = ("# AGENTS.md instructions", "</INSTRUCTIONS>")
```

而这对标记还有第二个用途：`matches_marked_text()` 用它们*识别*历史里哪一条是之前注入的指令片段（压缩与替换都依赖这个识别）。所以正文里出现 `</INSTRUCTIONS>` 影响的不只是模型的观感。

<small>本仓</small> 这一格不适用，但不是因为做对了防护，是因为选了另一种包装：`renderInstruction()` 输出的是`项目规则（来源：AGENTS.md）\n\n<正文>`，一个人类可读的抬头，没有需要闭合的标签。*没有框，就没有框可以被关掉*——但代价是这段文本与它下面的正文之间没有机器可判的边界。

::: tip 判断
Claude Code 与 dsh 独立做了同一件事，可以当定论：**凡是用标签框住外部内容的，就必须转义正文里的闭合标签**，而且范围要覆盖路径与元数据，不只是文件正文。codex 是这一格的反例，且因为标记还兼任识别器，代价比单纯的观感问题大一点。本仓走的是第三条路（不用标签），今天成立；*但只要将来把规则挪进 user 段并加上标签框（见 ⑦），这一条立刻变成必须做的事。*
:::

## 分岔汇总

| 决策点 | Claude Code | codex | dsh | 本仓（已实现） |
| --- | --- | --- | --- | --- |
| ① 哪些文件 | 五类来源；`.claude/rules`；Managed 排不掉 | 逐目录首个命中；`AGENTS.override.md` 优先 | 全读 + 内容去重；`.local` 覆盖 | 首个命中；刻意不同时加载两份 |
| ② 找到哪儿 | 一直到磁盘根；worktree 会跳过主仓 | 到 `.git`；仓库不能改这条线 | 到 `.git` + 按需下探 | 只读工作区根一份 |
| ③ 谁压谁 | 按来源类型排序 | 根→cwd 顺序拼接 | 同序，且把阶梯写进提示词 | 只有一份；位置在平台 system 之下 |
| ④ 超量 | 无总预算；单份 >4 MiB 跳过 | 32 KiB 先到先得；截断只写日志 | 预算必填；先丢最广的；告诉模型 | 64 KB 单份；超了抛错 |
| ⑤ 内联引用 | 跟。深度 5 / 去环 / 外部要批准 / 拒硬链接 | 不跟 | 不跟（写进已知局限） | 不跟（理由写了一整段） |
| ⑥ 不信任的仓库 | 正文照读；外部导入要批准 | untrusted 则整个不读 | 不设门；已知局限里给缓解建议 | 照读，但正文不得授权（ADR-0034 ①） |
| ⑦ 放哪一段 | user + `<system-reminder>` | user + `<INSTRUCTIONS>` | user + `<system-reminder>` | system，在平台 system 之下 |
| ⑧ 中途变了 | 条件规则按 glob 命中当前文件激活 | 环境/信任变了才重算，发替换通知 | 每次成功的 fs 工具结果触发，三种通知 | 不更新；Run 起点冻结一次 |
| ⑨ 闭合标签 | 转义（容忍空白的正则） | 不转义，且标记兼任识别器 | 转义，覆盖正文与元数据 | 不适用（不用标签框） |

## 对本仓意味着什么

### 三条 <Badge type="tip" text="同构 · 可当定论" />

- **广的在前、具体的在后**。三家物理顺序一致，没有第二种排法值得考虑。本仓今天只有一份，但目录级规则接上来时这条就是现成答案。
- **用标签框住外部内容，就必须转义闭合标签，范围覆盖路径与元数据**。Claude Code 与 dsh 独立做了同一件事，codex 是反例。本仓今天不用标签所以不适用，*但这条是「一旦改 ⑦ 就立刻生效」的欠账*。
- **仓库能说话，但不能改规则本身**。本仓的 ADR-0034 ①（规则正文不得授予权限、不得修改 Policy）与 Claude Code 的「`claudeMdExcludes` 排不掉 Managed」是同一个直觉。本仓这条写得更硬也更早，可以放心继续用。

### 四家里只有本仓不告诉任何人「规则被裁过了」 <Badge type="warning" text="本仓没有 · 补不补是决策" />

严格说，本仓的做法是**不裁**——超了就抛错，用户一定会知道。这在「用户知不知道」这一维上是四家里最好的。但它换来的是另一半：*模型永远不知道有没有被裁过*，因为压根不会被裁。今天成立，因为只有一份根规则；目录级规则接上来之后，「三份加起来超了」会立刻变成一个真实场景，而抛错这条路在那时候会变成「一个子目录里多了份说明，整个 Run 起不来」。

dsh 的算法是现成的：**从最广的开始丢，留最具体的，并把丢了什么写进模型看得见的那段文本**。它与本仓那条「半条指令可能把意思读反」并不冲突——dsh 也不发半条，它发的是「完整的这几份 + 明说被省略的那几份」。

### 目录级规则缺的那个事实，dsh 证明了它够用 <Badge type="warning" text="本仓没有 · 已经知道缺什么" />

本仓的注释把缺口定位得很准：渲染通道已建好并有单测，缺的是「当前目标是哪个文件」，而 `ToolInvocation` 的已校验 claims 是候选来源、「把它变成可恢复的装配输入是另一件事」。

dsh 的实现正是这条路的一个存在性证明：它监听**成功的第一方 `read` / `write` / `edit` 结果**，不用文件监听器，并且明说不跟 shell 的 `cd`——理由是「shell 语法与每次调用各自的 shell 状态不是可靠的文件系统接缝」。这句话对本仓完全成立：本仓的 `bash` 是 `declaresResourceClaims: false` 的那一档，正是「不知道自己碰了什么」。*可靠信号只能来自声明得出 claims 的那些工具*——与 dsh 的结论一字不差。

### 两个真问题 <Badge type="warning" text="三家分歧 · 要自己判" />

- **⑦ 要不要改**。本仓把规则放在 system 段是有理有据的决定（权限位置更准、能进 `ContextManifest` 留证），代价也已经付了（一个 Run 内冻结）。三家一致选了另一边，理由是缓存前缀。*这不构成改的理由*——它们的动机是「要能中途更新」，而本仓今天并不需要中途更新。真要重估，触发条件应该是「目录级规则落地，且确实需要在 Run 中途激活」，那时候动的是 §9.3，不是这个类。
- **⑥ 要不要加阻断**。本仓有降权（正文不得授权），没有阻断（不信任的仓库照读）。codex 的 `is_untrusted` 是一行判断，成本极低。要不要加取决于一个本仓还没回答的问题：*本仓有没有「工作区可信度」这个概念*。§5.3 有 `Principal` 与租户，但工作区本身的信任级别今天不存在。加它是一条新概念，不是一行判断。

### 本仓两个入口文件的措辞，只有一半是准的 <Badge type="info" text="顺手发现的 · 建议核一下" />

`CLAUDE.md` 写「下一行把它内联进来：`@docs/agent-guide.md`」——在 Claude Code 下成立（它展开导入，深度上限 5）。`AGENTS.md` 写「开始工作前请先完整阅读它」——在 codex 与本仓自己的 `ProjectRulesSource` 下成立（都不展开）。两句各自都对，但*它们描述的是同一个文件的同一行*，而读到它的智能体不一定知道自己属于哪一家。

这不是 bug，是一个可以顺手消掉的歧义：把两句都改成「请先完整阅读它」（在会展开的那一家里这句仍然成立，只是多余），歧义就没了。**本文不改，因为改入口文件的措辞是一个需要你点头的决定。**

## 证据档次与明确没核到的

**本篇的证据档次比上一篇高一档**。codex 与 dsh 是一手源码；Claude Code 这一次不只有字符串——那段装配函数的控制流是可读的（目录遍历、类型标签、深度计数、链接判定都能逐句还原），而且有一份直接的交叉印证：本文作者自己的上下文里就有那行 `Contents of …CLAUDE.md (project instructions, checked into the codebase)`，与二进制里的模板字面量逐字相符。本仓那一列是自己的源码。

**明确没核到的：**

- **Claude Code 有没有总字节预算**。装配函数里没有任何截断，单文件 4 MiB 以上整份跳过是唯一找到的上限。但装配之后、发请求之前还有一段没读到的路径，所以「没有总预算」这个负向结论只到「在这一层没有」。
- Claude Code 的 `.claude/rules` 只读到了 glob 过滤那一段，没核 frontmatter 的完整字段集，也没核条件规则在对话里长什么样。
- `<auto-memory-index>` 与 `AutoMemPinned` 这两类只见到常量与分组逻辑，没读它们的写入路径——那属于「记忆」那个题目，不属于本篇。
- codex 的 `memories` 两个 crate 与 `/init` 的实现都没读；本篇只用了 `/init` 的一行说明（`create an AGENTS.md file with instructions for Codex`）。
- dsh 的 `state.ts`（433 行，reconciliation 的主体）只读了 README 对它的描述，没有逐行读。本文引用它的行为时都标着「README 说」。
- 三家的用户全局文件（`~/.claude/CLAUDE.md` / `$CODEX_HOME` 的 instructions / `$DSH_HOME/AGENTS.md`）只核了它们在装配顺序里的位置，没有对比各自的发现规则。

**一处需要说明的负向判断。**「codex 不展开 `@path`」不是靠搜 `import` 零命中得出的：`agents_md.rs` 从 `read_file` 到 `from_utf8_lossy` 到 `InstructionEntry` 是一条能读完的直线，中间没有任何二次处理。读的是那条路径本身。

## 落点索引

#### codex · codex-rs/

- `core/src/agents_md.rs` — 头注释写全了发现规则；候选文件名优先级、32 KiB 预算的消耗顺序、截断
- `core/src/agents_md.rs`（`agents_md_paths`）— 项目根标记的读取跳过 Project 配置层
- `core/src/agents_md_manager.rs` — 缓存键（环境选择 / 信任级别 / 沙箱级别）
- `core/src/context/world_state/agents_md.rs` — 替换与移除两句通知的常量与 diff 逻辑
- `core/src/context/user_instructions.rs` — `<INSTRUCTIONS>` 包装与 user 角色
- `context-fragments/src/fragment.rs` — `render()` 无转义；`matches_marked_text` 用标记识别历史
- `config/src/config_toml.rs` — `project_doc_max_bytes` / `project_doc_fallback_filenames` / 默认值
- `tui/src/slash_command.rs` — `/init` 的一行说明

#### deepseek-harness · packages/context/agent-instructions/

- `README.md` — 完整行为契约：生命周期、三种通知文案、KV Cache effect、六条已知局限
- `src/render.ts` — 预算算法（先丢最广）、UTF-8 边界截断、`escapeInstructionFrameBody`、三种 section 文案
- `src/config.ts` — 候选文件名与 `.local` 覆盖的默认值、`$DSH_HOME` 用户全局
- `src/state.ts` — reconciliation 主体（本轮未逐行读）

#### Claude Code · 二进制与实机

- `bin/claude.exe` — 装配函数：Managed → User → 祖先目录反转 → 附加目录；五种类型标签的模板字面量
- `bin/claude.exe` — 单文件读取函数：4 MiB 上限 → `{kind:"skipped"}`
- `bin/claude.exe` — 导入递归：深度 5、已处理路径集合、外部路径批准、User 档拒符号链接与硬链接
- `bin/claude.exe` — `claudeMdExcludes`（对 Managed 无效）、`<managed-settings>` 伪路径
- `bin/claude.exe` — `<\s*\/\s*system-reminder\s*>` 转义正则

#### 本仓 · 这一列的源头

- `packages/packs-coding/src/project-rules-source.ts` — 三条口径（首个命中 / 不跟随内联引用 / 正文不得授权）、64 KB 上限与抛错理由
- `packages/core-runtime/src/context/context-assembler.ts` — 可信指令的 system 位置、Run 起点采集一次的理由、`renderInstruction`、`instructionCandidates` 留证
- `packages/packs-coding/src/coding-resource-claim-policy.ts` / `packages/platform/src/config/approval-allowlist.ts` — 「让仓库内容给自己发许可证」那句在两处各出现一次
- `docs/decisions/0034`（规则正文的权限边界）与 `0046`（规则进 ContextManifest）
- `运行时内核 §5.4 · §9.3 ①` — 装配与稳定前缀冻结，⑦ 与 ⑧ 的母约束
- `CLAUDE.md` / `AGENTS.md` — 那两句只有一半准确的措辞

---

三家对读第十五篇 · 核验日期 2026-08-27 · 时效证据，不定义 § 锚点、不定义不变量、不构成决定 ·结论进架构正文要走 ADR
