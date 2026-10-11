---
label: 全景
order: 0
date: 2026-10-11
summary: 在哪里用、命令、快捷键、工具、模型、扩展、并行、权限、审查、企业部署，一页列全
outline: 2
---

# codex 全景

本篇把 codex 有的东西一页列全：能在哪些地方用、怎么操作一个会话、全部斜杠命令和快捷键、模型能调的工具、怎么换模型和推理档、有哪些扩展方式、怎么并行、权限和沙箱、代码审查、给组织部署时有什么。每项一两句话说清是什么，细节链到对应的功能页或官方文档。

::: info 依据
- 核对的是发布版 rust-v0.162.1（2026-10-09）；源码读的是 2026-10-11 的 main 分支（提交 `a07c8eb`），斜杠命令、子命令和工具注册另外和发布版的源码对过。官方文档读取于 2026-10-11。文件路径相对 `codex-rs/`。
- codex 的文档现在并在 ChatGPT 的文档站里，桌面端也并进了 ChatGPT 桌面应用。文档和源码说法不一致时，以发布版源码为准，并注明差异。
- 不是每个人都能看到全部条目：有的按平台、套餐、组织设置开放，有的藏在功能开关后面。源码里一共有 173 个功能开关，默认关闭、还在开发中的功能本篇单独注明，不算 codex 的默认做法。
:::

## 一句话

codex 是 OpenAI 的编程智能体：读代码、改文件、跑命令，接上外部工具干活。核心是开源的 Rust 程序（`openai/codex`），终端 CLI、IDE 扩展、ChatGPT 桌面应用都通过同一个 app-server 接口驱动它；云端任务跑在 OpenAI 的容器里。ChatGPT Work 和 codex 共用用量和计费。

按发布版源码和文档数一下：

| 项目 | 数量 |
| --- | --- |
| 斜杠命令（终端） | 63 个，其中 4 个是调试用的；另有按模型服务档位动态生成的，比如 `/fast` |
| 子命令 | 26 个公开的，另有 4 个内部用的 |
| 给模型的工具 | 默认十来个，另有一批按配置或功能开关出现，见[内置工具](#内置工具) |
| 钩子事件 | 12 个，处理器 2 种 |
| 沙箱模式 | 3 种，配合审批策略组合使用 |
| 配置项 | `config.toml` 参考页列了 474 个 |
| 功能开关 | 173 个：53 个稳定、3 个实验、71 个开发中、4 个已弃用、42 个已移除 |

[智能体功能简介](/agents/overview)里有 6 项不单独成篇，放在本页：

| 功能简介里的项目 | 在本页哪里 |
| --- | --- |
| [联网搜索与抓取](/agents/overview#联网搜索与抓取) | [内置工具](#内置工具)的联网搜索 |
| [代码智能](/agents/overview#代码智能) | 内置工具一节末尾：没有语言服务器工具 |
| [浏览器与电脑操作](/agents/overview#浏览器与电脑操作) | [在哪里用](#在哪里用)的桌面应用 |
| [使用界面](/agents/overview#使用界面) | [在哪里用](#在哪里用)、[键盘与输入](#键盘与输入) |
| [云端与远程执行](/agents/overview#云端与远程执行) | 在哪里用的「离开电脑以后」 |
| [代码审查](/agents/overview#代码审查) | [代码审查](#代码审查) |

## 在哪里用

### 自己坐在电脑前

| 形态 | 是什么 |
| --- | --- |
| 终端 CLI | `codex` 命令打开的终端界面，也能脚本调用、接 CI。用 npm、Homebrew 或官方安装脚本装 |
| ChatGPT 桌面应用（Codex 模式） | macOS、Windows，Linux 另有一版。在 ChatGPT 下拉菜单里选 Codex。每个对话选在本机、新 worktree 或云端跑；有项目、文件查看器、每个对话自带的终端、代码审查面板、定时任务；能经 SSH 接远程机器上的项目 |
| IDE 扩展 | VS Code、Cursor、Windsurf、VS Code Insiders。带上打开的文件和选中的代码，在编辑器旁看改动；大任务可以交给云端。Xcode 和 JetBrains 由各自厂商集成。扩展本身不开源 |
| 浏览器 | 桌面应用内置的浏览器，打开网页、查资料、操作页面。CLI 和 IDE 扩展里没有 |
| 浏览器扩展 | 让桌面应用在你的 Chrome、Edge、Brave、Opera、Vivaldi 里操作，用你已登录的账号 |
| Computer Use | 桌面应用在 macOS 和 Windows 上操作电脑，要装 Computer Use 插件，按地区开放 |

### 离开电脑以后

| 形态 | 是什么 |
| --- | --- |
| Codex Cloud | 云端任务：先建一个云端环境（仓库、依赖、工具、网络权限、密钥），每个任务在自己的工作区里跑，电脑睡眠也继续；看改动、追加要求、提交或开 PR。网页、手机、桌面应用都能用，终端里用 `codex cloud` |
| 手机 | ChatGPT 手机应用里的 Codex：跟进度、批准操作、发指令。任务跑在云端，或跑在连着的 Mac、Windows 电脑上 |
| 远程连接 | 从手机或另一台设备接上正在别处跑的对话，桌面应用也能接 SSH 主机上的项目。`codex remote-control` 开启 |
| 定时任务 | 桌面应用的 Scheduled：按时间表在后台跑，Git 仓库里会用专门的后台 worktree，不和手上的工作冲突；网页和手机上部分套餐还能按应用事件触发 |
| 长任务 | `/goal` 设一个目标，codex 持续做到完成，可以暂停、恢复、修改 |

### 接进团队工具

| 形态 | 是什么 |
| --- | --- |
| GitHub | PR 的自动审查，见[代码审查](#代码审查) |
| GitLab | MR 的审查，测试版 |
| Slack | 在频道里 @ChatGPT 提需求；组织开了云端委派时，代码活会转成一个 Codex Cloud 任务，结果回到线程。Microsoft Teams 里也有 @ChatGPT |
| Linear | 把 issue 指派给 Codex 或在评论里 @Codex，它开一个云端对话并回复进展和结果。付费套餐 |
| GitHub Action | `openai/codex-action@v1`：在工作流里装好 CLI、按你给的权限跑 `codex exec`，可以打补丁或发审查 |

### 没有人坐在前面

| 形态 | 是什么 |
| --- | --- |
| `codex exec` | 非交互运行，别名 `codex e`。`--json` 输出事件流，`--output-last-message` 把最后一条回复写进文件，`--output-schema` 要求按 JSON Schema 输出 |
| Codex SDK | 有 TypeScript（`@openai/codex-sdk`）和 Python（`openai-codex`）两版，开始、继续、恢复本机的 codex 对话 |
| app-server | IDE 扩展和桌面应用背后的 JSON-RPC 接口，提供登录、对话历史、审批和事件流，可以做进自己的产品；源码开源 |
| codex 当 MCP 服务器 | 已经移除（`codex mcp-server` 不再有），文档要求改用 SDK 或 app-server |

## 会话与控制

**开始和恢复。** `codex` 开新对话，可以带第一句话和图片（`-i`）。`codex resume` 或 `/resume` 回到以前的对话（`--last` 接最近一次），`codex fork` 或 `/fork` 复制一份另走一条路。对话可以 `/rename` 改名、`/archive` 归档、`/delete` 永久删除；`codex queue` 给已有对话排一条消息。

**边干边说。** codex 干活时，回车把新指令插进当前这一轮，`Tab` 则排到下一轮再发；斜杠命令和 `!` 命令也能这样排队。`!` 开头直接跑 shell 命令（按当前的审批和沙箱规则），`@` 找文件，`$` 引用应用（连接器）。

**打断和回退。** `Esc` 打断当前这一轮。输入框为空时连按两次 `Esc`，进入编辑上一条消息的模式，改完从那里分叉成新对话。斜杠命令里没有回退文件改动的命令，文档建议任务前后用 Git 做检查点。

**计划和目标。** `Shift+Tab` 在协作模式之间切换，`/plan` 直接进计划模式：先出方案、不动手。`/goal` 设一个持久目标，codex 一直做到完成，可以暂停、恢复、修改、清除。

**旁支对话。** `/side`（或 `/btw`）开一个临时分叉的旁支对话，不打扰主对话，`Ctrl+/` 在两者之间切换。

**后台终端。** 长时间跑的命令留在后台，`/ps` 看它们和最近的输出，`/stop` 全部停掉。

**换地方。** `/cd` 换工作目录，`/worktree` 在新 worktree 里开或继续对话，`/app` 交给桌面应用继续，`codex cloud` 把任务交到云端、再 `codex apply` 把云端的改动应用到本地。

上下文怎么装、怎么压缩，见 [codex 的上下文管理](/agents/codex/context)。

## 键盘与输入

下面是发布版终端界面的默认键位，取自源码 `tui/src/keymap.rs`。`/keymap` 可以改键并存进 `config.toml`；表末几个是保留键，不能改。

### 全局和对话

| 按键 | 作用 |
| --- | --- |
| `Esc` | 打断当前这一轮 |
| `Esc` `Esc`（输入框为空时） | 编辑上一条消息，从那里分叉 |
| `Ctrl+T` | 打开完整记录 |
| `F3` | 在完整记录里查找 |
| `F4` | 聚焦活动分组，展开或收起细节 |
| `F2` | 查看保留的警告 |
| `Ctrl+G` | 用外部编辑器写这条输入 |
| `Ctrl+O` | 复制最近一条完成的回复 |
| `Ctrl+L` | 清屏 |
| `Alt+R` | 切换原始滚动模式，方便在终端里选中复制 |
| `Ctrl+/` | 在旁支对话和主对话之间切换 |
| `Alt+,` 或 `Shift+↓` / `Alt+.` 或 `Shift+↑` | 降低 / 提高推理档 |
| `Shift+←` 或 `Alt+↑` | 编辑最后一条排队的消息 |
| `Ctrl+]` | 跳过当前聚焦的问题 |
| `F8` / `F9` | 开始或停止语音对话 / 麦克风静音 |
| `Enter` | 发送；codex 在干活时，插进当前这一轮 |
| `Tab` | codex 在干活时，把输入排到下一轮 |
| `?` | 显示或隐藏快捷键面板 |
| `Ctrl+R` / `Ctrl+S` | 搜索输入历史 / 跳到下一个匹配 |
| `↑` `↓` | 翻回以前的输入草稿 |

### 编辑输入

| 按键 | 作用 |
| --- | --- |
| `Ctrl+J`、`Shift+Enter`、`Alt+Enter` | 换行 |
| `Ctrl+A` / `Ctrl+E`，或 `Home` / `End` | 行首 / 行尾 |
| `Ctrl+B` `Ctrl+F` `Ctrl+P` `Ctrl+N` | 左、右、上、下移动 |
| `Alt+B` / `Alt+F`，或 `Ctrl+←` / `Ctrl+→` | 按词后退 / 前进 |
| `Backspace` 或 `Ctrl+H` / `Delete` | 删左边 / 右边一个字符 |
| `Ctrl+W`、`Alt+Backspace` / `Alt+D`、`Alt+Delete` | 删前一个词 / 后一个词 |
| `Ctrl+U` / `Ctrl+K` | 删到行首 / 行尾 |
| `Ctrl+Y` | 粘贴刚删掉的文字 |

`/vim` 打开 vim 模式，有常用的 NORMAL 模式移动、插入、替换、查找命令。

### 保留键

| 按键 | 作用 |
| --- | --- |
| `Ctrl+C` | 打断，或退出 |
| `Ctrl+D` | 退出 |
| `Ctrl+V`、`Ctrl+Alt+V` | 粘贴图片 |
| `Shift+Tab` | 切换协作模式（计划模式） |
| `Alt+←` / `Alt+→` | 切到上一个 / 下一个子代理的对话 |
| `/`、`!`、`@`、`$`（行首） | 斜杠命令、shell 命令、文件路径、应用引用 |

桌面应用有自己的一套快捷键和深链接（`codex://`），见文档的 [ChatGPT desktop app commands](https://learn.chatgpt.com/docs/reference/commands)。

## 斜杠命令

下面列出发布版 0.162.1 源码里定义的全部终端斜杠命令（`tui/src/slash_command.rs`），按用途分组，说明以官方文档为准，文档没写的取源码里的描述。标「条件」的只在对应开关打开或满足平台条件时出现。

文档的命令表和发布版源码有出入：文档列了 `/personality`、`/sandbox-add-read-dir`、`/agent`，发布版终端里没有这几个命令（`/personality` 在 IDE 扩展里有，终端里改用配置项）；反过来，`/worktree`、`/recap`、`/voice`、`/agents`、`/export`、`/tui`、`/daemon`、`/warnings`、`/cd`、`/pwd`、`/daybreak` 在源码里有、文档没列。发布之后，main 分支又加了一个 `/config`（设置 codex 偏好），下一个版本才会有。

### 对话

| 命令 | 作用 |
| --- | --- |
| `/new` | 在同一个终端里开一段新对话 |
| `/clear` | 清屏并开新对话 |
| `/resume` | 从会话列表里恢复一段对话 |
| `/fork` | 把当前对话复制成新对话，另走一条路 |
| `/rename` | 给当前对话改名 |
| `/archive` | 归档当前对话并退出，记录保留 |
| `/delete` | 永久删除当前对话（连同派生的对话）并退出 |
| `/compact` | 把对话压缩成摘要，腾出上下文 |
| `/recap` | 立刻总结当前对话 |
| `/side`、`/btw` | 开一个临时分叉的旁支对话 |
| `/plan` | 进计划模式，可以顺带发一句话（条件：开了协作模式） |
| `/goal` | 设置、修改、暂停、恢复、查看、清除目标（条件：开了目标功能） |
| `/worktree` | 在新的 git worktree 里开始或继续对话（条件：开了 worktree） |
| `/app` | 交给桌面应用继续（仅 macOS、Windows） |
| `/cd`、`/pwd` | 换工作目录 / 显示当前工作目录（`/pwd` 别名 `/cwd`） |
| `/init` | 在当前目录生成一份 `AGENTS.md` 骨架 |
| `/review` | 审查工作区的改动，报告问题，不改文件 |
| `/mention` | 把文件或目录附进对话 |
| `/ide` | 带上 IDE 里打开的文件、选中内容等上下文 |
| `/quit`、`/exit` | 退出 |

### 看状态

| 命令 | 作用 |
| --- | --- |
| `/status` | 当前模型、审批策略、可写目录、上下文剩余量 |
| `/usage` | 账号的 token 用量（按天、周、累计），或使用一次额度重置（条件） |
| `/diff` | git diff，包括还没被跟踪的文件 |
| `/copy` | 复制最近一条完成的回复 |
| `/export` | 把对话导出成 Markdown |
| `/raw` | 切换原始滚动模式，方便复制 |
| `/ps` | 列出后台终端和最近的输出 |
| `/stop` | 停掉全部后台终端（别名 `/clean`） |
| `/warnings` | 查看保留的警告和诊断细节 |
| `/debug-config` | 打印配置分层和管理要求的来源，排查配置问题 |
| `/mcp` | 列出 MCP 工具；`/mcp verbose` 看服务器详情，`/mcp login <名字>` 登录 |

### 调模型和行为

| 命令 | 作用 |
| --- | --- |
| `/model` | 选模型和推理档 |
| `/fast` | 开关快速档（模型目录提供这一档时才有，按服务档位动态生成） |
| `/daybreak` | 开关 Daybreak（条件：开了对应功能；源码里还在开发中） |
| `/permissions` | 选 codex 不经询问能做什么，比如在 Auto 和只读之间切换 |
| `/approve` | 对最近一次被自动审查拒绝的操作，批准重试一次 |
| `/setup-default-sandbox` | 设置提权版的 Windows 沙箱（仅 Windows，条件） |
| `/experimental` | 开关实验功能 |
| `/memories` | 设置是否使用、是否生成记忆 |
| `/skills` | 浏览和使用技能 |
| `/hooks` | 查看和管理钩子：信任新的或改过的钩子、停用非托管的钩子 |
| `/keymap` | 改终端界面的快捷键 |
| `/vim` | 开关输入框的 vim 模式 |
| `/statusline` | 选底栏显示哪些项（模型、上下文、额度、git、token 等） |
| `/title` | 选终端标题显示哪些项 |
| `/theme` | 选代码高亮主题 |
| `/pets` | 选一只终端宠物，或藏起来（别名 `/pet`） |
| `/tui` | 选下次启动用哪种终端界面模式 |
| `/voice` | 开始或停止语音（条件） |

### 扩展、协作和账号

| 命令 | 作用 |
| --- | --- |
| `/apps` | 浏览应用（连接器），以 `$应用名` 插进提示词（条件：开了应用） |
| `/plugins` | 浏览已装的和可发现的插件（条件） |
| `/import` | 从 Claude Code（文档还写了 Cursor）导入配置、项目和近期对话 |
| `/agents` | 打开智能体指挥中心，看共享后台服务上的所有会话 |
| `/subagents` | 在本会话的子代理之间切换 |
| `/daemon` | 管理本机的后台服务 |
| `/feedback` | 把日志发给维护者 |
| `/logout` | 退出登录 |

另有 `/debug-m-drop`、`/debug-m-update`（描述写着「不要使用」）和只在调试构建里出现的 `/rollout`、`/test-approval`，共 4 个调试命令。

IDE 扩展有自己的一组命令，包括 `/cloud`、`/local`、`/cloud-environment`、`/project`、`/reasoning`、`/ide-context`、`/personality` 等，见文档的 [IDE 命令页](https://learn.chatgpt.com/docs/developer-commands?surface=ide)。

## 启动参数与子命令

### 子命令

| 子命令 | 作用 |
| --- | --- |
| `codex exec`（`e`） | 非交互运行 |
| `codex review` | 非交互地审查：未提交的改动（`--uncommitted`）、相对某个分支（`--base`）或某个提交（`--commit`） |
| `codex resume`、`codex fork` | 恢复 / 分叉以前的对话，默认弹列表，`--last` 选最近一次 |
| `codex queue` | 给已有对话排一条消息 |
| `codex archive`、`unarchive`、`delete` | 按 id 或名字归档、取消归档、永久删除对话 |
| `codex apply`（`a`） | 把 codex 最近产生的 diff 用 `git apply` 应用到本地 |
| `codex cloud` | 浏览 Codex Cloud 的任务并把改动应用到本地（实验） |
| `codex agents` | 浏览共享本机后台服务上的所有会话 |
| `codex login`、`logout` | 登录、清除凭证 |
| `codex mcp` | 管理外部 MCP 服务器 |
| `codex plugin` | 管理插件和插件市场 |
| `codex app-server` | 运行 app-server（实验） |
| `codex remote-control` | 以开启远程控制的方式管理后台服务（实验） |
| `codex app` | 打开桌面应用，没装就打开安装程序（仅 macOS、Windows） |
| `codex sandbox` | 在 codex 提供的沙箱里跑命令，方便测试沙箱规则 |
| `codex doctor` | 诊断安装、配置、登录和运行状态 |
| `codex features` | 查看功能开关 |
| `codex update` | 更新到最新版 |
| `codex completion` | 生成 shell 补全脚本 |
| `codex debug` | 调试工具，比如列出模型目录、渲染发给模型的提示词 |
| `codex migrate-rollouts` | 把旧的本地会话迁移到分页的历史格式 |
| `codex exec-server` | 运行独立的执行服务（实验） |

另有 `tcp-tunnel`、`execpolicy`、`responses-api-proxy`、`stdio-to-uds` 四个隐藏的内部子命令。

### 启动参数

| 用途 | 参数 |
| --- | --- |
| 输入 | `[PROMPT]` `-i, --image` |
| 模型 | `-m, --model` `--oss` `--local-provider` `-p, --profile` |
| 权限 | `-s, --sandbox` `-a, --ask-for-approval` `--approve-for-me` `--dangerously-bypass-approvals-and-sandbox`（别名 `--yolo`） `--dangerously-bypass-hook-trust` |
| 目录 | `-C, --cd` `--add-dir` `--worktree` |
| 配置 | `-c key=value` `--enable` `--disable` `--strict-config` |
| 联网 | `--search` |
| 远程 | `--remote` `--remote-auth-token-env` |
| 界面 | `--no-alt-screen` `--no-daemon` |

`codex exec` 另有：`--json` `--output-last-message` `--output-schema` `--color` `--skip-git-repo-check` `--ephemeral` `--ignore-user-config` `--ignore-rules` `--strict-config`。`-c` 可以临时覆盖 `config.toml` 里的任意一项，优先级最高；`--oss` 接本地模型（比如 Ollama）。

## 内置工具

codex 给模型的工具是按条件拼出来的（`core/src/tools/spec_plan.rs` 和 `ext/` 下的扩展），不是一张固定的表。下面按默认情况分开列；工具名取自源码。

### 默认就有

| 工具 | 作用 |
| --- | --- |
| `exec_command`、`write_stdin` | 跑命令，支持伪终端；命令没结束时可以接着往里写输入、读输出。受管配置关掉这种方式时，退回一次性执行 |
| `apply_patch` | 以补丁格式改文件。内置模型都声明了支持 |
| `view_image` | 查看本地图片 |
| 联网搜索 | OpenAI 托管的搜索工具，不走本地命令的网络和沙箱。默认用 OpenAI 维护的缓存索引，`--search` 或 `web_search = "live"` 改成实时抓取，完全放开权限时默认实时；可以关掉 |
| `image_gen.imagegen` | 生成或编辑图片；用 OpenAI 的服务时可用 |
| `request_user_input` | 用选项向用户提问；默认只在计划模式下 |
| `spawn_agent`、`send_input`、`resume_agent`、`wait_agent`、`close_agent` | 派子代理、追加指令、恢复、等待、关闭。内置模型上默认不直接放进请求，需要时用 `tool_search` 取出 |
| `create_goal`、`get_goal`、`update_goal` | 目标的建、查、改，配合 `/goal` |
| `tool_search` | 搜索并加载暂时没放进请求的工具定义（MCP 工具、子代理工具等） |

### 有条件才有

| 工具 | 什么时候有 |
| --- | --- |
| `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource` | 配了 MCP 服务器时 |
| MCP 工具、应用（连接器）工具 | 配了或装了时；内置模型上默认通过 `tool_search` 按需加载 |
| `list_available_plugins_to_install`、`request_plugin_install` | 有可推荐的插件时，让模型建议安装 |
| `update_plan` | 计划清单工具，要在配置里打开 `[tools.update_plan]` |
| `sleep`、时间工具 | 模型声明需要、或开了对应功能时 |
| 记忆工具 | 打开记忆功能后（本地记忆默认关闭） |

### 开发中、默认关闭

`new_context`、`get_context_remaining`（`token_budget`）、`request_permissions`、`send_message_to_user_async`、`wait_for_environment`，Code Mode 下用 JavaScript 编排工具调用的那套，以及第二版多智能体工具（`multi_agent_v2`）。

codex 没有读文件、搜文件的专门工具，这些都用命令（`cat`、`rg` 等）做；也没有接语言服务器的代码智能工具。

## 模型与推理

**模型。** 内置模型清单里对外列出的有 GPT-6 Astra（最强）、GPT-6.1 Sol（推荐用于复杂的编程和智能体任务）、GPT-6 Sol、GPT-6 Luna（适合聚焦、重复的任务），以及 GPT-5.6 Sol、Terra、Luna。GPT-5.5 在 2026-10-14 从 ChatGPT、ChatGPT Work 和 codex 下线（OpenAI API 不受影响）。内置模型的窗口都是 27.2 万 token。

**推理档。** `low`、`medium`、`high`、`xhigh`、`max`，部分模型还有 `ultra`：文档说它用子代理加速复杂工作，ChatGPT 会主动把能并行的部分派出去。默认档因模型而异，GPT-6 Astra、GPT-6.1 Sol 默认 `low`，其他多为 `medium`。终端里 `Alt+,`、`Alt+.` 随时调；计划模式可以单独设一档（`plan_mode_reasoning_effort`）。

**速度档。** 快速模式在支持的模型上提速，订阅额度按标准的 2.5 倍消耗；Ultrafast 支持 GPT-6 Astra 和 GPT-6.1 Sol，Astra 最快可到 8 倍，只给 Pro $500 和部分 Enterprise、Edu。

**其他可调的。** 回复风格（`personality`：none、friendly、pragmatic）、推理摘要的详细程度、输出长短（`model_verbosity`）、`/review` 单独用的模型（`review_model`）。

**接别的模型。** `model_providers` 可以配其他服务商（Responses 或兼容接口），`--oss` 接本地模型；组织也可以经网关或 Amazon Bedrock 接入。

## 扩展方式

| 方式 | 是什么 |
| --- | --- |
| `AGENTS.md` | 长期指令。先读全局的（`~/.codex` 下，`AGENTS.override.md` 优先），再从项目根往下逐级读到当前目录，每级最多一个文件；默认最多读 32 KiB |
| 记忆 | 把以前工作里有用的上下文带到以后。本地 codex 的记忆单独存放，默认关闭 |
| 技能 | 按开放的 agent skills 标准写的说明、资源和脚本。从仓库各级的 `.agents/skills`、`~/.agents/skills`、`/etc/codex/skills` 和系统内置几处读取，模型按需使用，也能 `/skills` 调用 |
| 插件 | 把技能和 MCP 服务器打成一个包；和 ChatGPT 共用同一个插件目录，有插件市场 |
| MCP | 本地 stdio 和远程 Streamable HTTP 两种服务器；`codex mcp` 管理，带 OAuth 登录 |
| 应用（连接器） | ChatGPT 里接好的第三方服务，在提示词里用 `$名字` 引用；有副作用的调用要确认，标了破坏性的总是要确认 |
| 钩子 | 12 个事件：`SessionStart`、`SessionEnd`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PreCompact`、`PostCompact`、`SubagentStart`、`SubagentStop`、`Stop`、`Interrupt`。处理器可以是命令或 MCP 工具调用，也能在后台跑；非托管的钩子要先审查、信任才会运行 |
| rules | `.rules` 文件，规定哪些命令可以在沙箱外运行。实验功能 |
| 自定义智能体 | `~/.codex/agents/` 或 `.codex/agents/` 下的 TOML 文件，定名字、说明、指令，以及模型、推理档、沙箱、MCP、技能等配置 |
| 配置文件 | `~/.codex/config.toml`，可以分 profile；项目里也能放一份 `.codex/config.toml` |
| 自定义提示词 | 已弃用，改用技能 |
| 界面定制 | 底栏、终端标题、代码主题、终端宠物、快捷键；`notify` 指定一个外部通知程序 |
| 导入 | `/import` 从 Claude Code 导入配置、技能、插件、项目和近期对话（文档说 CLI 也支持 Cursor）；桌面应用还能从 Claude Cowork 导入 |

## 并行

| 方式 | 是什么 |
| --- | --- |
| 子代理 | 主对话把独立的部分派给子代理并行做，收回摘要。默认开启；内置 `default`、`worker`、`explorer` 三种，也能自定义。终端里 `/subagents` 或 `Alt+←` `Alt+→` 在子代理之间切换。源码默认同时最多 6 个、只派一层 |
| `ultra` 推理档 | 让 codex 主动把能并行的工作派给子代理 |
| worktree | `/worktree`、`--worktree` 或桌面应用里的 Worktree 模式，让同一个项目里的几段对话各用一份文件，互不干扰 |
| 云端任务 | 每个 Codex Cloud 任务有自己的工作区，可以同时开很多个 |
| 后台会话 | 本机的共享后台服务承载多个会话，`/agents` 或 `codex agents` 统一查看 |
| 后台终端 | 长命令在后台跑，不挡对话 |

文档提醒：子代理适合读多写少的活（探索、跑测试、分析日志、总结），几个子代理同时改代码容易冲突。

## 权限与安全

**两层控制。** 沙箱决定技术上能碰哪些文件和网络；审批策略决定什么时候停下来问你。换谁来审批不会扩大沙箱。

| 沙箱模式 | 能做什么 |
| --- | --- |
| `read-only` | 只读；不在版本控制下的目录默认用它 |
| `workspace-write` | 能写当前工作区（含 `/tmp` 等临时目录），默认不联网；版本控制下的目录默认推荐 |
| `danger-full-access` | 没有沙箱，非常危险 |

| 审批策略 | 什么时候问 |
| --- | --- |
| `on-request` | 由模型决定什么时候请求批准（默认） |
| `never` | 从不询问，在沙箱范围内尽力完成 |
| `granular` | 按类别分别设：沙箱外操作、命令规则、MCP 请求、权限请求、技能脚本，各自是交互确认还是自动拒绝 |

旧的 `untrusted` 审批策略已经不支持，留在配置里可能导致启动失败。

- **常用组合**：Auto（`workspace-write` + `on-request`，默认推荐）、安全只读、CI 用的只读不询问、全放开（`--dangerously-bypass-approvals-and-sandbox`，别名 `--yolo`）。
- **自动审查**：`approvals_reviewer = "auto_review"`，界面上叫 Approve for me。审批请求先交给一个审查智能体判断，沙箱边界不变；被拒的可以用 `/approve` 批准重试一次。
- **权限配置档**：内置 `:read-only`、`:workspace`、`:danger-full-access`，也能自定义更细的文件和网络规则。
- **受保护路径**：可写目录下的 `.git`、`.agents`、`.codex` 始终只读。
- **网络**：命令联网默认关；开启后经沙箱的网络代理，按域名白名单放行，本地和内网地址默认拦截。联网搜索是托管工具，不受这套规则管。
- **系统级沙箱**：macOS 用 Seatbelt；Linux 用 bwrap 加 seccomp；Windows 用 MXC，旧的 elevated、unelevated 两种作为后备；WSL2 用 Linux 的实现。在 Docker 里沙箱可能用不了，文档建议让容器负责隔离、在里面用全放开。
- **安全监控**：触发安全检查的任务会被暂停，部分客户端可以看完发现再继续；CLI 和手机上任务直接结束。

## 代码审查

| 方式 | 在哪跑 | 是什么 |
| --- | --- | --- |
| `/review` | 本机会话 | 审查未提交的改动、某个提交或相对某个分支的改动，按优先级报问题，不改工作区。可以用 `review_model` 单独指定模型 |
| `codex review` | 命令行 | 同样的审查，非交互 |
| 桌面应用的审查面板 | 本机 | 看改动、逐行评论、暂存或撤回文件；Code Review 插件能看 PR 的描述、改动、评论和检查结果 |
| GitHub PR 审查 | 云端 | 按仓库里的指导审 PR 的 diff，以标准的 GitHub 代码审查发出，只报严重问题；可以自动审 |
| GitLab MR 审查 | 云端 | 同上，测试版 |
| Security Review | 云端 | 对 PR 做更深入的安全审查。研究预览，Enterprise、Business、Edu、Pro |
| Codex Security | 多处 | 应用安全智能体：找漏洞、确认、修复；有插件、命令行工具、TypeScript SDK，也能接 GitHub 仓库 |
| GitHub Action | CI | 在工作流里跑审查并发出结果 |

## 组织与部署

- **登录方式**：用 ChatGPT 账号登录（共用 ChatGPT 的套餐额度），或 API key；组织可以要求经网关登录，或直接用 Amazon Bedrock。
- **托管配置**：管理员可以下发不可覆盖的要求（`requirements.toml`，或从云端下发）和可覆盖的默认值（系统级 `config.toml`）。能限定允许的审批策略、权限配置档、沙箱和网络规则、联网搜索方式、插件市场、浏览器和 Computer Use、远程控制，也能锁定功能开关。
- **观测**：`otel.*` 配置项导出 OpenTelemetry 日志、指标和链路；组织有用量分析、Analytics API、Compliance API 和审计事件。
- **用量和花销**：ChatGPT Work 和 codex 共用定价、额度和用量上限；管理员可以设花销控制。
- **开源部分**：CLI、app-server、TypeScript 和 Python SDK、Codex Security 的命令行和 SDK、技能库、插件库、云端的基础环境镜像都在 GitHub 上；IDE 扩展和 Codex Cloud 不开源。

## 来源

源码：[openai/codex](https://github.com/openai/codex)，main 分支 2026-10-11 的提交 `a07c8eb`；发布版 rust-v0.162.1 的对应文件另外对过。主要读了：

- `tui/src/slash_command.rs`、`tui/src/bottom_pane/slash_commands.rs`：斜杠命令和它们的显示条件
- `tui/src/keymap.rs`、`tui/src/keymap_setup/actions.rs`：默认键位和保留键
- `cli/src/main.rs`、`tui/src/cli.rs`、`utils/cli/src/shared_options.rs`、`exec/src/cli.rs`：子命令和启动参数
- `core/src/tools/spec_plan.rs`、`ext/`：给模型的工具和出现条件
- `core/src/config/mod.rs`：联网搜索、计划工具、子代理数量等的默认值
- `features/src/lib.rs`：功能开关的阶段和默认值
- `models-manager/models.json`：内置模型、窗口和推理档

官方文档（learn.chatgpt.com，2026-10-11 读取）：

- 形态：[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[ChatGPT desktop app](https://learn.chatgpt.com/docs/app)、[Codex IDE extension](https://learn.chatgpt.com/docs/codex/ide)、[Codex Cloud](https://learn.chatgpt.com/docs/cloud)、[Codex on mobile](https://learn.chatgpt.com/docs/mobile)、[Remote connections](https://learn.chatgpt.com/docs/remote-connections)、[Codex environments](https://learn.chatgpt.com/docs/environments/modes)、[Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)、[Scheduled tasks](https://learn.chatgpt.com/docs/automations)、[Long-running work](https://learn.chatgpt.com/docs/long-running-work)、[Browser](https://learn.chatgpt.com/docs/browser)、[Browser extension](https://learn.chatgpt.com/docs/chrome-extension)、[Computer Use](https://learn.chatgpt.com/docs/computer-use)、[Slack](https://learn.chatgpt.com/docs/third-party/slack)、[Linear](https://learn.chatgpt.com/docs/third-party/linear)、[GitHub Action](https://learn.chatgpt.com/docs/github-action)、[Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)、[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[App Server](https://learn.chatgpt.com/docs/app-server)、[Codex MCP server removal](https://learn.chatgpt.com/docs/mcp-server)
- 命令：[Developer commands（CLI）](https://learn.chatgpt.com/docs/developer-commands?surface=cli)、[IDE 命令](https://learn.chatgpt.com/docs/developer-commands?surface=ide)、[Desktop app commands](https://learn.chatgpt.com/docs/reference/commands)
- 模型：[Models](https://learn.chatgpt.com/docs/models)、[Speed](https://learn.chatgpt.com/docs/agent-configuration/speed)、[Web search](https://learn.chatgpt.com/docs/web-search)、[Image generation](https://learn.chatgpt.com/docs/image-generation)
- 扩展：[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)、[Memories](https://learn.chatgpt.com/docs/customization/memories)、[Build skills](https://learn.chatgpt.com/docs/build-skills)、[Plugins](https://learn.chatgpt.com/docs/plugins)、[MCP](https://learn.chatgpt.com/docs/extend/mcp)、[Hooks](https://learn.chatgpt.com/docs/hooks)、[Rules](https://learn.chatgpt.com/docs/agent-configuration/rules)、[Custom prompts](https://learn.chatgpt.com/docs/custom-prompts)、[Import](https://learn.chatgpt.com/docs/import)、[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- 权限与审查：[Permissions](https://learn.chatgpt.com/docs/permission-modes)、[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)、[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review)、[Code review](https://learn.chatgpt.com/docs/code-review)、[GitHub](https://learn.chatgpt.com/docs/third-party/github)、[GitLab](https://learn.chatgpt.com/docs/third-party/gitlab)、[Security Review](https://learn.chatgpt.com/docs/security/security-review)、[Codex Security](https://learn.chatgpt.com/docs/security)
- 组织：[Managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration)、[Admin rollout guide](https://learn.chatgpt.com/docs/enterprise/admin-setup)、[Authentication](https://learn.chatgpt.com/docs/auth)、[Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、[Pricing](https://learn.chatgpt.com/docs/pricing)、[Open Source](https://learn.chatgpt.com/docs/open-source)

### 说明

- 斜杠命令、子命令、工具和键位来自发布版对应的源码，没有实际运行；带条件的条目在你的环境里可能看不到。
- 文档和源码有出入的地方（主要是斜杠命令），已在对应位置写明。
- 本篇只说每项「是什么」。各项怎么实现、和另外两家比怎么样，在对应的功能页和三家差异页里写；目前已写好的是[上下文管理](/agents/codex/context)。
