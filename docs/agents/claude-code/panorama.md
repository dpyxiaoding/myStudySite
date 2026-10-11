---
label: 全景
order: 0
date: 2026-10-11
summary: 在哪里用、命令、快捷键、工具、模型、扩展、并行、权限、审查、企业部署，一页列全
outline: 2
---

# Claude Code 全景

本篇把 Claude Code 有的东西一页列全：能在哪些地方用、怎么操作一个会话、全部斜杠命令和快捷键、模型能调的全部工具、怎么换模型和推理档、有哪些扩展方式、怎么并行、权限和安全、代码审查、给组织部署时有什么。每项一两句话说清是什么，细节链到对应的功能页或官方文档。

::: info 依据
- 核对的是 Claude Code 2.1.296（2026-10-09 发布），官方文档读取于 2026-10-11。
- 依据是官方文档，主要是命令参考、工具参考、交互模式、启动参数参考这几页，逐条对过。引擎不公开源码，文档没写的不推测。
- 不是每个人都能看到全部条目：有的按平台、套餐、云服务商开放，有的还在研究预览。文中注明了主要的限制条件。
:::

## 一句话

Claude Code 是 Anthropic 的编程智能体：读代码、改文件、跑命令，接上外部工具干活。同一个引擎跑在终端、IDE、桌面应用、网页和云端，配置、项目记忆和 MCP 服务器在本机的几种形态之间共用。

按官方文档数一下，它现在有：

| 项目 | 数量 |
| --- | --- |
| 斜杠命令 | 91 个内置命令、20 个随附技能、1 个随附工作流（命令参考共 119 行，另有 4 行是别名、3 行是已移除的） |
| 内置工具 | 46 个 |
| 启动参数 | 80 个，另有 30 多个子命令 |
| 钩子事件 | 33 个，处理器 5 种 |
| 权限模式 | 6 种 |
| 并行方式 | 5 种 |

[智能体功能简介](/agents/overview)里有 6 项不单独成篇，放在本页：

| 功能简介里的项目 | 在本页哪里 |
| --- | --- |
| [联网搜索与抓取](/agents/overview#联网搜索与抓取) | [内置工具](#内置工具)的「联网」，随附工作流 `/deep-research` |
| [代码智能](/agents/overview#代码智能) | 内置工具的 `LSP`，[扩展方式](#扩展方式)的代码智能插件 |
| [浏览器与电脑操作](/agents/overview#浏览器与电脑操作) | [在哪里用](#在哪里用)的 Chrome 和 computer use |
| [使用界面](/agents/overview#使用界面) | [在哪里用](#在哪里用)、[键盘与输入](#键盘与输入) |
| [云端与远程执行](/agents/overview#云端与远程执行) | 在哪里用的「离开电脑以后」 |
| [代码审查](/agents/overview#代码审查) | [代码审查](#代码审查) |

## 在哪里用

### 自己坐在电脑前

| 形态 | 是什么 |
| --- | --- |
| 终端 CLI | 功能最全的形态。脚本调用和 Agent SDK 只有 CLI 有 |
| 桌面应用（Code 标签页） | macOS、Windows，Ubuntu 和 Debian 上是测试版，另有 WSL 版。多个会话并排、每个会话可以用独立的 git worktree；可视化 diff、应用预览、内置终端和文件编辑器、PR 状态监控；会话可以跑在本机、云端或经 SSH 跑在远程机器上；有桌面定时任务、iOS 模拟器面板；Pro、Max 上能让 Claude 操作电脑，能接手机发来的 Dispatch 任务 |
| VS Code 扩展 | 也能装在 Cursor 里。图形界面：审改计划再接受、行内 diff、按选中行号 @ 文件、多个对话分标签页 |
| JetBrains 插件 | IntelliJ、PyCharm、WebStorm 等。交互式 diff、共享选中的代码；要另装 CLI |
| Chrome | 配合 Claude in Chrome 浏览器扩展，从 CLI 或 VS Code 驱动你的 Chrome：新开标签页、共享你的登录状态，测网页、填表、读 console；遇到登录页或验证码会停下来让你处理 |
| computer use | 让 Claude 打开应用、点击、打字、看屏幕。CLI 版是 macOS 上的研究预览，要 Pro 或 Max；桌面应用版支持 macOS 和 Windows |

### 离开电脑以后

| 形态 | 是什么 |
| --- | --- |
| 云端会话（网页 claude.ai/code） | 会话跑在 Anthropic 管的云端，或你组织的自托管环境里；合上电脑也继续跑，任何设备都能查看和接着指挥。终端里用 `claude --cloud` 发起、`--teleport` 拉回本机；`/autofix-pr` 让云端会话盯着 PR 自动修 CI 失败和评审意见 |
| 手机（Claude 应用） | 只是客户端，代码不在手机上跑：能开、看、指挥云端会话和 Projects，经 Remote Control 接本机会话，或给桌面应用发 Dispatch 任务 |
| Remote Control | 把本机正在跑的会话接到网页或手机上继续；代码执行和文件仍在本机。`/remote-control` 或 `claude remote-control` 开启 |
| Dispatch | 在手机 Claude 应用里发一个任务，由桌面应用在你电脑上开会话执行。Pro、Max |
| Projects | 一段长期对话，Claude 替你开很多并行的云端会话（叫 thread）去做一系列相关任务，并告诉你哪个需要你。公开测试版，Pro、Max |
| Channels | 一种 MCP 服务器，把外部事件（CI 失败、聊天消息、监控告警）推进你正开着的会话，可以双向回复。研究预览 |
| 定时任务 | 三种：会话内的 `/loop` 和 Cron 工具（只在会话开着时运行）、桌面应用的定时任务、云端的 Routines |
| Routines | 一份保存好的配置（提示词、仓库、连接器），按时间表、API 调用或 GitHub 事件触发，在云端执行。`/schedule` 管理。研究预览 |
| 自托管环境 | 让云端会话跑在你组织自己的机器上，`claude self-hosted-runner` 注册执行机。公开测试版，Team、Enterprise |

### 接进团队工具

| 形态 | 是什么 |
| --- | --- |
| GitHub Actions | `claude-code-action` 工作流：在 PR 或 issue 评论里 @claude，或在任意 GitHub 事件上自动跑。`/install-github-app` 一步装好。另有 GitHub Enterprise Server 的说明 |
| GitLab CI/CD | 同样的事做在 GitLab 流水线里。测试版，由 GitLab 维护 |
| Code Review | 自动审每个 GitHub PR，见[代码审查](#代码审查) |
| Slack | 在频道里 @Claude 派任务，结果以 PR 形式回来。现在的版本按个人账号运行，只给 Pro、Max；Team、Enterprise 用 Claude Tag，以组织的共享身份运行、由管理员配置权限 |

### 没有人坐在前面

| 形态 | 是什么 |
| --- | --- |
| `claude -p` | 非交互运行：给一个提示词，跑完退出，输出可选纯文本、JSON 或流式 JSON。`--bare` 跳过钩子、技能、插件、MCP、记忆和 CLAUDE.md 的自动发现，启动更快、结果更可复现 |
| Agent SDK | 把 Claude Code 的工具、循环和上下文管理当库用，有 Python 和 TypeScript 两版 |
| deep link | `claude-cli://` 网址，点开就在指定目录开一个终端会话、预填提示词（不自动发送），可以放进运维手册、告警、看板 |

## 会话与控制

**开始和恢复。** `claude` 开新会话，`claude -c` 接着本目录最近一次，`claude -r <名字或 id>` 或 `/resume` 回到任意一次；会话可以用 `/rename` 起名。`--from-pr` 列出和某个 PR 关联的会话（Claude 建 PR 时自动关联）。

**边干边说。** Claude 干活时直接打字回车，消息会排队，它做完这一步就接上；`↑` 能把排队的取回来改，`Ctrl+Enter` 立刻发出。`!` 开头直接跑 shell 命令，输出进对话；`@` 引用文件；可以粘贴图片、用语音输入。

**打断和回退。** `Esc` 打断当前回复或工具调用，已做的保留。每条开启新一轮的提示词前，Claude Code 自动存一个检查点；`Esc` `Esc`（输入框空时）或 `/rewind` 打开回退菜单，代码和对话可以分开退，也可以从某条消息起做摘要。检查点只管文件编辑工具改的文件，Bash 命令改的不追踪；快照默认约 30 天后清理。

**分叉。** 三种：`/branch` 在这里开一条对话分支并切过去，原对话留着；`/fork` 把对话复制成一个新的后台会话，自己留在原处；`/subtask` 派一个继承完整对话的子代理，结果回到这段对话。

**转到后台。** `Ctrl+B` 把正在跑的命令或子代理挪到后台；`/background` 把整个会话变成后台会话、腾出终端；`claude --bg` 直接以后台会话启动。后台会话都在 `claude agents` 打开的 agent view 里管理。

**让它自己接着干。** `/goal` 设一个完成条件，每轮结束后由一个模型判断是否达成，没达成就自动开下一轮；`/loop` 按间隔反复跑一个提示词。用量撞到套餐上限时，Claude Code 会在会话里等上限重置后自动接着做。

**旁支问题。** `/btw` 根据已有上下文回答一个问题，问答都不进对话历史。

**其他自动出现的东西。** 新会话会根据 git 历史在输入框里给一个灰色的示例提示词，回复后会建议下一句；离开超过三分钟再回来，会显示一行会话回顾；当前分支有 PR 时，底栏显示 PR 链接，下划线颜色表示评审状态；回复里的 `owner/repo#123` 可以点开；粘贴进来的不可见 Unicode 字符会在发送前被删掉并提示你。

上下文怎么装、怎么压缩，见 [Claude Code 的上下文管理](/agents/claude-code/context)。

## 键盘与输入

macOS 上带 `Alt` 的快捷键要先在终端里把 Option 设成 Meta 键。快捷键大多可以在 `~/.claude/keybindings.json` 里改（`/keybindings` 打开），`Ctrl+C`、`Ctrl+D` 这类保留键和按词移动、删除的几个不行。

### 通用

| 按键 | 作用 |
| --- | --- |
| `Ctrl+C` | 打断正在进行的操作；没在运行时，按一次清空输入框，再按一次退出。清空后在空输入框按 `↑` 能找回草稿 |
| `Ctrl+X Ctrl+K` | 停掉本会话所有后台子代理，并关掉 artifact 自动回复评论；3 秒内按两次确认 |
| `Ctrl+D` | 退出：按一次出提示，800 毫秒内再按退出。输入框有字时是删除光标后的字符 |
| `Ctrl+G` 或 `Ctrl+X Ctrl+E` | 用默认编辑器写这条提示词。`/config` 里可以设成把上一条回复以注释形式带进编辑器 |
| `Ctrl+L` | 重绘屏幕，输入和对话都保留。显示错乱或半空白时用 |
| `Ctrl+O` | 开关转录视图：每次工具调用的细节，每条回复的时间戳和所用模型；展开默认折叠的 MCP 调用和其他会话发来的消息 |
| `Ctrl+R` | 反向搜索输入历史 |
| `Ctrl+V`（iTerm2 是 `Cmd+V`，Windows 和 WSL 是 `Alt+V`） | 粘贴剪贴板里的图片，插入 `[Image #N]` 标记 |
| `Ctrl+B` | 把正在跑的命令和子代理转到后台；tmux 里按两次 |
| `Ctrl+T` | 显示或隐藏 Claude 的任务清单。这不是后台任务列表，后台任务看 `/tasks` |
| `Ctrl+S` | 暂存当前输入并清空；输入框空时再按，连光标位置、粘贴内容和输入模式一起取回 |
| `Ctrl+Z` | 挂起到 shell，用 `fg` 回来。仅 Unix |
| `←` `→` | 在对话框和菜单的标签页之间切换 |
| `Tab` | 接受补全；在权限确认框上，给「是」或「否」附一句说明 |
| `↑` `↓`，或 `Ctrl+P` `Ctrl+N` | 多行输入时先在行间移动，到了首行或末行再翻历史；有排队消息时，从首行按 `↑` 是把它们取回 |
| `Esc` | 打断 Claude 当前的回复或工具调用（已做的保留），或关掉对话框；在权限确认框上等于拒绝 |
| `Esc` `Esc` | 输入框有字：清空并存进历史；输入框为空：打开回退菜单 |
| `Ctrl+Enter` 或 `Ctrl+X Ctrl+S` | 立刻发出排队的消息 |
| `Shift+Tab`（个别 Windows 环境是 `Alt+M`） | 循环切换权限模式：Manual → acceptEdits → plan，可用时再到 bypassPermissions、auto |
| `Option+P` / `Alt+P` | 换模型，输入框里的字不清 |
| `Option+T` / `Alt+T` | 开关扩展思考。对 Opus 5.5、Sonnet 5.5、Haiku 5.5 和 Fable 系列无效，它们总在思考 |
| `Option+O` / `Alt+O` | 开关快速模式 |

### 编辑输入

| 按键 | 作用 |
| --- | --- |
| `Ctrl+A` / `Ctrl+E` | 移到当前行首 / 行尾 |
| `Ctrl+K` | 删到行尾 |
| `Ctrl+U` | 删到行首；多行时重复按会跨行删 |
| `Ctrl+W` | 删到前一个空白，一次删掉整个路径或 `--flag=value` |
| `Ctrl+Y` | 粘贴刚才删掉的文字 |
| `Alt+Y`（在 `Ctrl+Y` 之后） | 在删除记录里轮换 |
| `Alt+B` / `Alt+F` | 按词后退 / 前进。中文这种不用空格分词的文字也按词移动 |
| `Alt+D` | 删到词尾 |
| `Ctrl+_` 或 `Ctrl+Shift+-` | 撤销上一次输入编辑，连光标位置一起恢复 |

换行有五种写法：`\` 加回车（所有终端）；`Ctrl+J`（所有终端）；`Shift+Enter`（iTerm2、WezTerm、Ghostty、Kitty、Warp、Apple Terminal、Windows Terminal 原生支持，VS Code、Cursor、Alacritty、Zed 等用 `/terminal-setup` 装）；macOS 设好 Option 后的 `Option+Enter`；直接粘贴多行内容。

### 输入框开头的符号

| 符号 | 作用 |
| --- | --- |
| `/` | 命令或技能；在提示词中间打 `/` 也能补全命令名 |
| `!` | shell 模式：直接跑命令，输出进对话，Claude 接着回应 |
| `@` | 补全文件路径；开着跨会话消息时，也能补全你本机其他正在跑的会话 |
| `:` | 表情短码，比如 `:heart:` |
| `?`（输入框为空时） | 打开快捷键面板 |

### 转录视图和其他

转录视图（`Ctrl+O` 打开）里：`{` `}` 跳到上一条 / 下一条你的提问；`[` 把整段对话写进终端原生的滚动缓冲区，方便用终端自己的搜索；`v` 把对话写成临时文件用编辑器打开；`?` 打开快捷键面板；`q`、`Ctrl+C`、`Esc` 退出。前四个要在全屏渲染下；经典渲染下用 `Ctrl+E` 展开全部内容。

- **语音输入**：按住或点按空格录音，实时转写进输入框；`/voice` 开启，要 claude.ai 账号，音频发到 Anthropic 服务器转写。
- **vim 模式**：`/config` → Editor mode，有 NORMAL、INSERT、文本对象和可视模式。
- **全屏渲染**：`/tui fullscreen` 切换。不闪烁、长对话内存不涨、支持鼠标；研究预览。
- **其他**：`/theme` 里按 `Ctrl+T` 开关代码高亮；输入框可以开拼写检查；有给屏幕阅读器、放大镜和色盲用户的设置。

## 斜杠命令

下面按用途分组，列出命令参考里的全部条目，别名写在条目后面。前几组是内置命令，是写死在程序里的逻辑；最后一组是随附技能，本质是交给 Claude 的一段提示词，由它用工具完成。MCP 服务器提供的 prompt 也会出现在 `/` 菜单里。

### 对话的开始、结束和分叉

| 命令 | 作用 |
| --- | --- |
| `/clear [名字]` | 清空上下文开新对话，旧的可以用 `/resume` 找回。别名 `/reset`、`/new` |
| `/compact [说明]` | 把到目前为止的对话压缩成摘要，可以写希望保留什么 |
| `/autocompact [auto\|token 数]` | 设自动压缩窗口：上下文多满时自动压缩 |
| `/resume [会话]` | 按 id 或名字恢复，或打开会话列表；选中还在跑的后台会话会直接接上它。别名 `/continue` |
| `/rename [名字]` | 给会话改名，名字显示在提示条上 |
| `/branch [名字]` | 在这里开一条对话分支并切过去，原对话保留 |
| `/fork [提示]` | 把对话复制成新的后台会话，自己留在原处；副本改代码前会先建自己的 worktree |
| `/subtask <任务>` | 派一个继承完整对话的子代理在后台做，结果回到这段对话 |
| `/background [提示]` | 把当前会话转成后台会话，腾出终端。别名 `/bg` |
| `/stop` | 停掉当前接着的后台会话，记录和 worktree 保留 |
| `/exit` | 退出；在接着的后台会话里是断开，会话继续跑。别名 `/quit` |
| `/rewind` | 把对话和代码退回某个检查点，或从某条消息起摘要。别名 `/checkpoint`、`/undo` |
| `/export [文件名]` | 把对话导出成纯文本 |
| `/copy [N]` | 复制最近第 N 条回复，有代码块时可以只选一块 |
| `/recap` | 生成一行会话摘要 |
| `/cd <路径>` | 把会话挪到另一个工作目录，对话保留 |
| `/add-dir <路径>` | 再加一个可以访问的工作目录 |
| `/teleport` | 把云端会话拉到本机终端。别名 `/tp` |
| `/remote-control` | 让本会话可以从 claude.ai 或手机上继续。别名 `/rc` |
| `/desktop` | 交给桌面应用继续。别名 `/app` |

### 看状态和花销

| 命令 | 作用 |
| --- | --- |
| `/context [all]` | 用彩色格子画出上下文占用，附优化建议；`all` 展开每一项 |
| `/usage` | 本会话花销、套餐用量和活动统计。别名 `/cost`，`/stats` 直接打开统计页 |
| `/status` | 版本、模型、账号、连接状态 |
| `/diff` | 查看工作区的改动，包括 Claude 改的 |
| `/focus` | 只显示最后一句提问、一行工具摘要（带改动行数）和最终回复。仅全屏渲染 |
| `/tasks` | 本会话的后台工作，包括已完成的子代理，可以查看、接上、停止。别名 `/bashes` |
| `/workflows` | 动态工作流的进度，可以暂停、恢复、保存 |
| `/btw [问题]` | 问一个旁支问题，不进对话历史 |
| `/insights` | 分析本机近期的会话，生成一份 HTML 报告：在哪些项目上花时间、哪里常出错、有哪些没用过的功能 |
| `/release-notes` | 看更新日志，不进对话 |
| `/rate-limit-options` | 撞到用量上限时给出选择：等重置后自动继续、加额外用量、升级套餐 |
| `/usage-credits` | 设置或向管理员申请额外用量 |

### 调模型和行为

| 命令 | 作用 |
| --- | --- |
| `/model [模型]` | 换模型并存为默认；选择器里能用左右键调推理档，按 `s` 只对本会话生效 |
| `/effort [档位\|auto\|status\|ultracode]` | 设推理档；`ultracode` 打开后，Claude 遇到大任务会编排动态工作流 |
| `/fast [on\|off]` | 开关快速模式 |
| `/advisor [模型\|off]` | 开关顾问：关键时刻让第二个模型给意见 |
| `/plan [描述]` | 直接进计划模式，可以顺带给出任务 |
| `/goal [条件\|clear]` | 设完成条件，Claude 跨轮次一直做到条件满足 |
| `/output-style [风格]` | 列出或切换输出风格 |
| `/config [key=value]` | 打开设置面板，或直接设某一项。别名 `/settings` |
| `/permissions` | 管理 allow、ask、deny 规则和工作目录，查看 auto 模式的拒绝记录、编辑分类器规则。别名 `/allowed-tools` |
| `/auto-mode-setup` | 根据项目和近期会话起草 auto 模式要信任的环境（仓库、存储桶、域名等），你审过后存进用户设置 |
| `/sandbox` | 开关沙箱 |
| `/memory` | 编辑 CLAUDE.md，开关自动记忆，查看它记了什么 |
| `/hooks` | 查看钩子配置 |
| `/theme` | 换配色，有跟随终端的 auto、色盲友好主题和自定义主题 |
| `/color [颜色]` | 设本会话提示条的颜色，多开时好分辨 |
| `/tui [default\|fullscreen]` | 切换渲染方式，对话保留 |
| `/scroll-speed` | 调鼠标滚轮速度。仅全屏渲染 |
| `/keybindings` | 打开快捷键配置文件 |
| `/terminal-setup` | 给 VS Code、Cursor、Alacritty、Zed 等终端装 `Shift+Enter` 换行 |
| `/statusline` | 配置状态栏，可以直接描述想要什么 |
| `/voice [hold\|tap\|off]` | 开关语音输入 |

### 扩展和连接

| 命令 | 作用 |
| --- | --- |
| `/init` | 为项目生成 CLAUDE.md；发现 codex 或 Gemini CLI 的配置时提议导入 |
| `/import [codex\|gemini\|cursor]` | 把 OpenAI Codex、Gemini CLI、Cursor 的指令文件、MCP、命令、子代理、技能导入过来 |
| `/mcp` | 管理 MCP 连接和 OAuth 登录，可以重连、启用、停用某个服务器 |
| `/plugin` | 管理插件和插件市场 |
| `/reload-plugins` | 不重启重新加载插件 |
| `/plugin-authoring` | 加载写 mod 用的参考资料（内置插件提供） |
| `/skills` | 列出技能，可按 token 数排序、切换某个技能对 Claude 是否可见 |
| `/reload-skills` | 重新扫描技能目录，让会话中途新加的技能生效 |
| `/skill-doctor` | 每个技能占多少上下文、用过几次，帮你挑出该关的 |
| `/agents` | 提示子代理文件放在哪；创建子代理直接让 Claude 写，或自己改文件 |
| `/list-agents` | 列出 Claude 能发消息的对象：子代理、团队成员、你的其他会话。别名 `/peers` |
| `/ide` | 管理 IDE 连接 |
| `/chrome` | Chrome 集成的设置 |
| `/install-github-app` | 给仓库装 Claude GitHub App，可顺带配好 Actions 工作流和密钥 |
| `/install-slack-app` | 装 Slack 应用 |
| `/web-setup` | 用本机 `gh` 的凭证给云端会话连 GitHub |
| `/remote-env` | 选从 CLI 发起的云端会话默认用哪个环境 |
| `/schedule [描述]` | 用对话的方式创建、修改、运行云端 Routines。别名 `/routines` |
| `/autofix-pr [提示]` | 开一个云端会话盯着当前分支的 PR，CI 失败或有评审意见就推修复 |
| `/artifacts` | 列出你的 artifact，挂进会话、在浏览器打开或复制链接 |
| `/design-login` | 给 `/design-sync` 授权 |
| `/setup-bedrock`、`/setup-vertex` | Amazon Bedrock、Google Cloud 的配置向导。设了对应环境变量才出现在菜单里 |
| `/team-onboarding` | 根据近 30 天的使用记录生成一份团队上手指南 |

### 审查

| 命令 | 作用 |
| --- | --- |
| `/security-review` | 审当前分支相对远端默认分支的改动有没有安全漏洞 |
| `/ultrareview` | `/code-review ultra` 的别名，在云端跑多智能体深度审查 |
| `/review` | `/code-review` 的别名 |

`/code-review` 和 `/simplify` 是随附技能，见下面。

### 账号和杂项

| 命令 | 作用 |
| --- | --- |
| `/login`、`/logout` | 登录、退出 Anthropic 账号 |
| `/upgrade` | 打开升级套餐的页面 |
| `/passes` | 送朋友一周免费体验（符合条件的账号才有） |
| `/privacy-settings` | 隐私设置。Pro、Max |
| `/bug [描述]` | 报 bug，可以附上会话记录，发送前确认。别名 `/share` |
| `/feedback [描述]` | 提产品反馈；Claude 起草过反馈时，打开草稿队列 |
| `/help` | 帮助和可用命令 |
| `/powerup` | 带动画演示的小课，介绍各项功能 |
| `/mobile` | 显示下载手机应用的二维码。别名 `/ios`、`/android` |
| `/heapdump` | 写一份内存快照排查内存占用；不在菜单里，要打全名 |
| `/radio` | 在浏览器里打开 Lo-fi 电台 |
| `/stickers` | 订购 Claude Code 贴纸 |

已移除：`/pr-comments`（2.1.91）、`/vim`（2.1.92，改到 `/config`）、`/ultraplan`（改用计划模式）。

### 随附技能和工作流

| 命令 | 作用 |
| --- | --- |
| `/code-review [档位] [--fix] [--comment]` | 审当前 diff、某个 PR、分支或路径的正确性问题；`--fix` 直接改，`--comment` 发成 PR 或 MR 的评论，`ultra` 改到云端深度审查 |
| `/simplify [目标]` | 四个子代理并行看改动能不能复用现有代码、简化、提效、抽象层次对不对，然后直接改；不找 bug |
| `/batch <指令>` | 大规模改动：调研后拆成 5 到 30 个独立单元，批准后每个单元派一个后台子代理在独立 worktree 里实现、跑测试、提交 |
| `/loop [间隔] [提示]` | 会话开着期间反复跑一个提示词；不给间隔就由 Claude 自己定节奏。别名 `/proactive` |
| `/debug [描述]` | 开调试日志，然后读日志排查问题 |
| `/doctor` | 体检安装、设置、扩展和 CLAUDE.md，提出修法，你确认后由 Claude 改；`prompt-audit` 审查指令文件。别名 `/checkup` |
| `/fewer-permission-prompts` | 扫历史记录里常用的只读命令和 MCP 调用，生成一份放行清单写进项目设置 |
| `/update-config [需求]` | 描述想改的设置（放行命令、环境变量、钩子），由 Claude 改对应的 settings.json |
| `/run` | 把项目的应用真跑起来看改动的效果，而不只是看测试过没过 |
| `/verify` | 构建、运行、观察，确认改动确实做到了该做的；只在你调用时运行 |
| `/run-skill-generator` | 为项目写一个技能，教 `/run` 和 `/verify` 怎么从干净环境构建、启动、操作你的应用 |
| `/claude-api [子命令]` | 加载 Claude API 和 Managed Agents 的参考资料；代码里导入 Anthropic SDK 时自动加载 |
| `/claude-in-chrome [任务]` | 在浏览器里执行任务：测页面、填表、读 console |
| `/dataviz [需求]` | 图表和看板的设计规范，含配色校验脚本 |
| `/design [需求]` | 在一张画布上画界面草图、流程、落地页，发布成 Claude Design artifact |
| `/design-sync [提示]` | 把仓库里的 React 设计系统转换上传到 Claude Design |
| `/slides [需求]` | 生成一份 Claude Slides 演示文稿 artifact |
| `/artifact-capabilities` | 加载 artifact 运行时能力的参考资料 |
| `/artifact-diagramming` | 加载在 artifact 里画图的规范 |
| `/workflow-authoring` | 加载写动态工作流脚本的参考资料 |
| `/deep-research <问题>`（工作流） | 扇出联网搜索、抓取、交叉核对来源，写一份带引用的报告；只在你调用时运行 |

`disableBundledSkills` 设置可以关掉全部随附技能。

## 启动参数与子命令

### 子命令

| 子命令 | 作用 |
| --- | --- |
| `claude`、`claude "提示"` | 开交互会话，可带第一句话 |
| `claude -p "提示"` | 非交互运行后退出；可以从管道读入内容 |
| `claude -c`、`claude -r <会话>` | 接着最近一次 / 恢复指定会话 |
| `claude update`、`claude install [版本]` | 更新 / 安装指定版本或渠道 |
| `claude auth login\|logout\|status` | 登录、退出、查看登录状态 |
| `claude setup-token` | 生成给 CI 和脚本用的长期令牌 |
| `claude doctor` | 不开会话，打印安装和设置诊断 |
| `claude agents` | 打开 agent view，管理后台会话 |
| `claude attach`、`logs`、`stop`、`respawn`、`rm` | 接上、看输出、停止、重启、移除某个后台会话 |
| `claude daemon logs\|run\|status\|stop` | 后台会话管理进程的日志、前台运行、状态、停止 |
| `claude auto-mode defaults\|reset` | 打印 auto 模式内置规则 / 恢复默认 |
| `claude mcp …`、`claude mcp login\|logout` | 配置 MCP 服务器，单独跑或清除 OAuth 登录 |
| `claude plugin …` | 管理插件 |
| `claude import [来源]` | 从其他编程智能体导入配置 |
| `claude remote-control` | 以服务器模式启动 Remote Control |
| `claude self-hosted-runner` | 把这台机器注册成自托管环境的执行机 |
| `claude gateway` | 启动自托管的 Claude apps gateway |
| `claude ultrareview [目标]` | 非交互地跑云端深度审查 |
| `claude purge [路径]` | 删掉某个项目在本机的全部 Claude Code 数据 |

### 80 个启动参数，按用途分

| 用途 | 参数 |
| --- | --- |
| 会话 | `--continue` `--resume` `--session-id` `--name` `--fork-session` `--from-pr` `--no-session-persistence` |
| 非交互输出 | `--print` `--output-format` `--input-format` `--json-schema` `--include-partial-messages` `--include-hook-events` `--replay-user-messages` `--verbose` `--max-turns` `--max-budget-usd` |
| 模型 | `--model` `--fallback-model` `--effort` `--advisor` `--betas` `--autocompact` |
| 系统提示词 | `--system-prompt` `--system-prompt-file` `--append-system-prompt` `--append-system-prompt-file` `--append-subagent-system-prompt` `--append-subagent-system-prompt-file` `--exclude-dynamic-system-prompt-sections` `--system-prompt-snapshot` |
| 权限 | `--permission-mode` `--permission-prompts` `--permission-prompt-tool` `--enable-auto-mode` `--allow-dangerously-skip-permissions` `--dangerously-skip-permissions` `--allowedTools` `--disallowedTools` `--tools` |
| 配置加载与准备 | `--settings` `--setting-sources` `--bare` `--safe-mode` `--restricted` `--mcp-config` `--strict-mcp-config` `--plugin-dir` `--plugin-url` `--disable-slash-commands` `--add-dir` `--init` `--init-only` `--maintenance` |
| 子代理与团队 | `--agent` `--agents` `--forward-subagent-text` `--teammate-mode` |
| 后台与隔离 | `--bg` `--exec` `--worktree` `--tmux` |
| 云端与远程 | `--cloud` `--teleport` `--remote` `--environment` `--ref` `--remote-control` `--remote-control-session-name-prefix` |
| 连接其他形态 | `--ide` `--chrome` `--no-chrome` `--desktop` `--channels` `--dangerously-load-development-channels` |
| 界面与辅助 | `--prompt-suggestions` `--ax-screen-reader` |
| 调试 | `--debug` `--debug-file` `--version` |

几个值得单独说的：`--bare` 跳过一切自动发现，适合脚本；`--safe-mode` 关掉全部自定义内容，用来排查配置问题；`--restricted` 给评测程序用，去掉能跑命令的工具、不读本机设置；`--worktree` 在独立 worktree 里启动，可以直接从某个 PR 建；`--max-budget-usd` 让非交互运行花到这个数就停；`--init`、`--maintenance` 在非交互运行前先跑对应的 Setup 钩子；`--remote` 是 `--cloud` 的旧名，已不推荐。

## 内置工具

模型能直接调用的工具共 46 个。工具名就是写权限规则、钩子匹配、子代理工具清单时用的名字。要加自己的工具，接 MCP 服务器；技能不是新工具，它通过 `Skill` 工具运行。实际有哪些取决于平台、云服务商和设置，问 Claude「你有哪些工具」可以看当前会话的。

### 读写和搜索

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `Read` | 读文件，也能读图片、PDF、Jupyter 笔记本 | 否 |
| `Write` | 新建或覆盖文件 | 是 |
| `Edit` | 对文件做定点修改 | 是 |
| `NotebookEdit` | 改 Jupyter 笔记本的单元格 | 是 |
| `Glob` | 按文件名模式找文件，最多返回 100 个，默认不管 `.gitignore` | 否 |
| `Grep` | 基于 ripgrep 搜文件内容，跳过 `.gitignore` 里的文件 | 否 |
| `LSP` | 接语言服务器：跳定义、找引用、查类型、列符号、找实现、调用层级；每次编辑后自动报类型错误和警告。装了对应语言的代码智能插件才启用，云端会话里不启用 | 否 |

`Glob` 和 `Grep` 在 Windows 上默认提供；在 macOS、Linux、WSL 上默认不提供，Claude 改用 Bash 里的 `find` 和 `grep`（内置的 bfs 和 ugrep）。用 `--tools`、`--allowedTools` 点名，或会话里没有 Bash 时，这两个工具会回来。

### 执行

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `Bash` | 在你的环境里跑 shell 命令，可以放到后台跑。内置一批只读命令不用确认 | 是 |
| `PowerShell` | 原生跑 PowerShell。Windows 上没装 Git Bash 时自动启用，装了也默认开（第三方云服务商要手动开）；Linux、macOS、WSL 要手动开 | 是 |
| `Monitor` | 在后台跑一个命令，把每行输出实时交给 Claude，用来盯日志、轮询 CI、看目录变化；也能直接接 WebSocket | 是 |

### 联网

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `WebSearch` | 用 Anthropic 的搜索后端搜，返回标题和网址，不抓页面；一次调用最多内部搜 8 次；交互会话最多 200 次。Amazon Bedrock 上没有 | 是 |
| `WebFetch` | 抓网页转成 Markdown，再用一次单独的模型调用按你的要求提取内容，所以是有损的；一次最多读 10 万字符，缓存 15 分钟；不抓 localhost 和内网短域名 | 是 |

### 子代理和协作

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `Agent` | 派一个有独立上下文的子代理，只拿回最终结果；开了团队功能时也能拉起团队成员 | 否 |
| `SendMessage` | 给团队成员、要恢复的子代理或你的其他会话发消息 | 否 |
| `ListAgents` | 列出能发消息的对象 | 否 |
| `SubagentHandback` | 子代理把最终报告交回；只在 auto 模式下给本地子代理，报告先经分类器审查 | 否 |
| `Workflow` | 运行动态工作流脚本，在后台编排大量子代理，返回一个汇总结果 | 是 |
| `Skill` | 在主对话里执行一个技能 | 是 |

### 任务清单和后台任务

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `TaskCreate`、`TaskGet`、`TaskList`、`TaskUpdate` | 任务清单的增、查、列、改 | 否 |
| `TodoWrite` | 旧版任务清单，默认被上面四个取代 | 否 |
| `TaskStop` | 停掉一个后台任务、团队成员或后台子代理 | 否 |
| `TaskOutput` | 取后台任务的输出；已不推荐，改为直接 `Read` 输出文件 | 否 |

任务清单工具默认只在 Claude 3.x、Opus 4 到 4.7、Sonnet 4 到 4.6、Haiku 4.5 上提供。更新的模型不写清单也能跟踪多步工作，而工具定义和提醒要占上下文，所以默认不给；要用可以设 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`。后台会话和云端会话里所有模型都有。

### 计划模式和 worktree

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `EnterPlanMode` | 进计划模式，先设计再动手 | 否 |
| `ExitPlanMode` | 拿出计划请你批准，然后退出计划模式 | 是 |
| `EnterWorktree` | 新建一个 git worktree 并切进去，或切进已有的 | 是 |
| `ExitWorktree` | 退出 worktree，回到原目录 | 否 |

### 定时

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `CronCreate`、`CronList`、`CronDelete` | 在当前会话里建、列、删定时提示词；恢复会话时没过期的会恢复 | 否 |
| `ScheduleWakeup` | 自定节奏的 `/loop` 每轮结束时由 Claude 调用，决定下一轮在 1 分钟到 1 小时后 | 否 |
| `RemoteTrigger` | 在 claude.ai 上建、改、跑、列 Routines，`/schedule` 背后就是它 | 否 |

### MCP

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `ToolSearch` | 搜索并加载暂时没放进上下文的工具定义 | 否 |
| `ListMcpResourcesTool` | 列出 MCP 服务器暴露的资源 | 否 |
| `ReadMcpResourceTool` | 按 URI 读一个 MCP 资源 | 否 |
| `WaitForMcpServers` | 等还在后台连接的 MCP 服务器就绪；只在关掉工具搜索时出现 | 否 |

### 和人打交道、交付结果

| 工具 | 作用 | 要确认 |
| --- | --- | --- |
| `AskUserQuestion` | 用选择题向你问需求或澄清 | 否 |
| `PushNotification` | 发桌面通知；连着 Remote Control 时也推到手机 | 否 |
| `SendUserFile` | 把报告、图、截图、构建产物直接发到你的设备；要连着 Remote Control 或在云端会话里 | 否 |
| `Artifact` | 把 HTML 或 Markdown 发布成 claude.ai 上的私有交互网页，可以分享 | 是 |
| `ShareOnboardingGuide` | 上传 `/team-onboarding` 写好的指南，换一个分享链接 | 是 |
| `ReportFindings` | 把代码审查结论以结构化列表交给界面渲染 | 否 |
| `SendFeedback` | 起草一份关于 Claude Code 的反馈放进本机队列，你确认后才发 | 否 |
| `EndConversation` | 结束会话；只用于持续的辱骂或你要求演示时 | 否 |

另外，顾问（advisor）是 API 在服务端运行的工具，不是 Claude Code 实现的，没有可以写进权限规则的名字。

## 模型与推理

**模型别名。** `opus`、`sonnet`、`haiku` 指各系列的最新版，`fable` 指 Fable 5.1，`best` 有 Fable 时用 Fable、否则同 `opus`，`opusplan` 计划模式用 Opus、执行时换 Sonnet，`default` 恢复账号的默认模型；`sonnet[1m]`、`opus[1m]` 选 100 万窗口的版本（新一代模型原生就是 100 万）。直连 Anthropic API 时 `opus`、`sonnet`、`haiku` 分别是 Opus 5.5、Sonnet 5.5、Haiku 5.5，第三方云服务商上可能落到更早的版本。

**推理档（effort）。** `low`、`medium`、`high`、`xhigh`、`max` 五档，Opus 4.6 和 Sonnet 4.6 没有 `xhigh`。默认是 `high`，但 Opus 5.5、Sonnet 5.5、Haiku 5.5 默认 `medium`，Opus 4.7 默认 `xhigh`。`max` 只对当前会话有效。`ultracode` 不是一档推理，而是一个开关：打开后，Claude 遇到大任务会编排动态工作流。

**扩展思考。** 由推理档决定想多少；Opus 5.5、Sonnet 5.5、Haiku 5.5 和 Fable 系列不能关掉思考。

**快速模式。** 同一个 Opus 模型换一种 API 配置，最快 2.5 倍，单价更高；支持 Opus 5.5、Opus 5、Opus 4.8。订阅用户走额外用量，不算在套餐额度里。研究预览。

**顾问。** 让 Claude 在关键时刻（定方案前、反复卡在同一个错误时、宣布完成前）请一个更强的模型看完整对话给意见，由 Claude 决定什么时候请。实验功能，只在 Anthropic API 上有。

**备用模型链。** 主模型过载或不可用时，按顺序换到备用模型，最多 3 个，只对当前这一轮生效。

**组织管控。** 管理员可以限定能用哪些模型、设组织默认模型和推理档上限。

## 扩展方式

| 方式 | 是什么 | 什么时候进上下文 |
| --- | --- | --- |
| CLAUDE.md | 你写的长期指令，分组织、用户、项目、本地（`CLAUDE.local.md`）几级。仓库里只有 `AGENTS.md` 时直接读它 | 会话开始时全量，每次请求都带 |
| `.claude/rules/` | 规则文件，可以用 `paths` 限定只在碰到匹配文件时加载 | 无路径限制的开场加载，有限制的碰到文件时加载 |
| 自动记忆 | Claude 自己记下的经验和你的纠正，按仓库存 | 每次会话开头加载前 200 行或 25 KB |
| 输出风格 | 改 Claude 的角色、语气和回复格式。内置 Default 之外还有 Proactive、Concise、Explanatory、Learning 四种，也能自己写 | 会话开始和切换风格时，每次请求都带 |
| 技能 | `SKILL.md` 加脚本和参考文件，可以 `/名字` 调用，也可以让 Claude 按需自己用；可以在子代理里跑。分企业、个人、项目、插件四处来源 | 开场只放描述，用到时才放全文 |
| 子代理 | 在独立上下文里跑完任务、只回摘要。内置 Explore、Plan、general-purpose、claude、statusline-setup、claude-code-guide；自定义的写在 `.claude/agents/`，可以定模型、推理档、工具、钩子、是否在 worktree 里隔离 | 派出时，用自己的新上下文 |
| 动态工作流 | Claude 写一段 JavaScript 脚本，在后台编排大量子代理并交叉核对结果，脚本可以保存重跑 | 只有汇总结果回到对话 |
| 跨会话消息 | 让 Claude 给你本机、别的机器或云端的另一个会话捎话，传的是一段文字，不是对话历史 | 收到时作为一条消息 |
| 代码智能插件 | 按语言装一个语言服务器插件，启用 `LSP` 工具 | 编辑后的诊断和查询结果 |
| MCP | 接外部服务和工具：HTTP、WebSocket、本地 stdio（SSE 已不推荐）；本地、项目、用户三种作用域；能用 claude.ai 上配好的连接器；MCP 的 prompt 可以当斜杠命令，资源可以像文件一样引用；Claude Code 自己也能当 MCP 服务器 | 默认只放工具名，用到时取完整定义 |
| Channels | 能往会话里推事件的 MCP 服务器 | 事件到达时 |
| 钩子 | 在 33 个生命周期事件上运行的处理器，类型有 shell 命令、HTTP 请求、MCP 工具调用、单轮模型判断、子代理（实验）五种；能拦工具调用、拦提示词、阻止停下、补充上下文 | 不占，除非钩子返回了补充内容 |
| 插件和插件市场 | 把技能、子代理、钩子、MCP 服务器打成一个包安装、更新、分发；市场是插件目录，可以自建 | 取决于里面的组件 |
| mod | 一种插件，用 JavaScript 或 TypeScript 写的处理函数跑在 Claude Code 进程里：画面板、改界面、拦截或改写工具调用和请求、加立即执行的命令或新工具 | 处理函数在模型之外运行；它加的工具、改写或代发的提示词会进对话 |
| 状态栏 | 底部一行，跑你配的脚本，脚本从标准输入拿到会话的 JSON 数据 | 不占 |
| 快捷键和主题 | `keybindings.json` 改键位，`~/.claude/themes/` 放自定义主题 | 不占 |
| artifact | 把会话产出发布成 claude.ai 上的交互网页，可以分享、能收评论。Pro、Max、Team、Enterprise | 通过 `Artifact` 工具发布，页面本身不进对话 |

同一样东西在几处都定义了时：CLAUDE.md 各级叠加，全部进上下文；技能按名字覆盖，优先级是企业 > 用户 > 项目，插件技能有命名空间不冲突；子代理也按名字覆盖，企业 > 命令行参数 > 项目 > 用户 > 插件；MCP 服务器按名字覆盖，本地 > 项目 > 用户；钩子全部触发，不互相覆盖。

## 并行

官方把「同时做几件事」分成五种：

| 方式 | 是什么 | 适合 |
| --- | --- | --- |
| 子代理 | 一个会话里派出去的工人，在自己的上下文里做完只回摘要 | 旁支任务的输出会淹没主对话时 |
| agent view | `claude agents` 打开的一屏，派出和监看很多后台会话，哪个需要你一目了然；每个后台会话改文件前先进自己的 worktree。研究预览 | 几件独立的事交出去、回头再看 |
| agent teams | 多个会话组成团队，一个负责人分派任务，成员共享任务清单、互相发消息。实验功能，默认关；成员之间不隔离 worktree | 让 Claude 自己拆分、分派、同步一个项目 |
| 动态工作流 | 脚本掌握计划，大量子代理执行并互相核对 | 全仓审计、几百个文件的迁移、要交叉验证的调研 |
| Projects | 网页或桌面应用里的一段长期对话，Claude 开并行的云端 thread 去做 | 持续几天几周的一系列任务 |

配套的：worktree 给每个会话独立的文件副本；跨会话消息让你自己开的几个会话互相通报；`/batch` 是子代理加 worktree 的打包用法。不算并行的几样：后台跑一条 Bash 命令不产生智能体；分叉子代理只是派子代理的一种方式；Routine 是在云端按时运行。

子代理的几个默认限制：最多嵌套 3 层（子代理还能再派子代理）；同时运行超过 20 个时拒绝再派；子代理默认在后台运行，它要确认权限时会在主会话里弹出。

## 权限与安全

### 六种权限模式

| 模式 | 不用确认就能做的 | 适合 |
| --- | --- | --- |
| Manual（配置值 `default`） | 只读 | 每一步都自己看 |
| `acceptEdits` | 读、改文件、`mkdir` `mv` `cp` 这类常见文件命令 | 边看边改 |
| `plan` | 读；auto 模式可用时，还有分类器放行的命令 | 改之前先摸清代码 |
| `auto` | 全部，由一个单独的分类器模型在后台审查每个动作 | 长任务、不想被确认框打断 |
| `dontAsk` | 工作目录里的读取和预先放行的工具，其余一律拒绝 | 锁死的 CI 和脚本 |
| `bypassPermissions` | 全部 | 只在隔离的容器或虚拟机里用 |

2.1.283 起，交互式终端和 VS Code 会话默认就以 auto 模式开始。auto 的分类器会拦下超出你请求范围的操作、指向不认识的基础设施的操作，以及看起来是被读到的恶意内容驱使的操作；它也会让 Claude 少问例行问题。文档明说 auto 模式减少确认，不保证安全。

有几件事任何模式都不自动放行，包括 `bypassPermissions`：命中 ask 规则的工具、需要用户互动的工具（比如 `AskUserQuestion`）、对关键路径（比如 `/`、`~`）的 `rm` 和 `rmdir`。

### 规则、沙箱和检查点

- **权限规则**：allow、ask、deny 三类，可以细到 `工具名(说明符)`，比如 `Bash(npm run build)`、`Bash(aws *)`；deny 在任何模式下都生效。另有一批受保护路径，写入它们除 bypassPermissions 等少数情况外都不自动放行。
- **沙箱**：由操作系统在 Bash、PowerShell、Monitor 跑的命令外面加一道边界，限定能碰哪些文件和网络域名；在沙箱里的命令可以不用逐条确认。支持 macOS、Linux、WSL2，原生 Windows 不支持。文件工具、MCP 服务器、钩子不在沙箱里。
- **更强的隔离**：文档对比了沙箱、独立的 sandbox runtime、开发容器、Docker 和虚拟机，按威胁模型选。
- **检查点**：只追踪文件编辑工具的改动，Bash 命令改的文件和外部改动都不追踪，所以不能代替 git。

## 代码审查

| 方式 | 在哪跑 | 是什么 |
| --- | --- | --- |
| `/code-review` | 本机会话 | 审当前 diff、PR、分支或路径的正确性问题；按推理档决定广度；能直接改或发成 PR 评论 |
| `/simplify` | 本机会话 | 四个子代理找复用、简化、效率、抽象层次方面的改进并直接改，不找 bug |
| `/code-review ultra`（ultrareview） | 云端沙箱 | 多智能体深度审查，发现的问题逐个验证后才报；Pro、Max 送 3 次，之后用额外用量 |
| `/security-review` | 本机会话 | 单次审查当前分支的安全漏洞 |
| Code Review | GitHub 上 | 每个 PR 自动审，问题以行内评论发出、按严重度标注，不批准也不阻止合并；可以用 CLAUDE.md 或 `REVIEW.md` 调整关注点。研究预览，Team、Enterprise |
| security guidance 插件 | 本机会话 | 装上后 Claude 写代码时自动检查注入、不安全的反序列化等常见漏洞，当场修 |
| Claude Security 插件 | 本机会话 | 多智能体扫描整个仓库或一段改动：先梳理架构、建威胁模型，再找漏洞、逐个复核，最后出报告和补丁 |

## 组织与部署

- **模型从哪来**：Anthropic API（claude.ai 订阅或 Console），以及 Claude Platform on AWS、Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry。本机运行的功能在各家都能用，依赖 Anthropic 托管服务的（Routines、推送通知、artifact、联网搜索等）在部分云服务商上没有，文档有一张逐项对照表。
- **网关**：把流量集中经过组织自己的代理，统一凭证、用量、预算和审计。`claude gateway` 就是内置的自托管网关（Claude apps gateway），支持 SSO 和按组分配模型；也能接组织已有的 LLM 网关。
- **托管设置**：管理员下发的设置压过一切本地设置。可以用 MDM 或系统文件分发，Team、Enterprise 也能在 claude.ai 后台直接配（server-managed settings）；还能管控允许哪些 MCP 服务器、哪些插件、哪些模型，下发组织级 CLAUDE.md 和 auto 模式的信任范围。
- **网络与运行环境**：企业代理、自定义 CA、mTLS；用公司规定的启动器包住 Claude Code 启动的所有进程；开发容器参考配置；云端会话的环境配置（网络级别、环境变量、准备脚本）；自托管环境。
- **观测与成本**：OpenTelemetry 导出指标、事件，链路追踪在测试中；团队用量分析看板；成本管理和花销上限。
- **数据**：消费者账号可以选择是否让数据用于训练；Enterprise 合格账号可以申请零数据留存（ZDR）；有面向 HIPAA 的配置说明。

## 来源

官方文档（code.claude.com，2026-10-11 读取）：

- 总览：[Overview](https://code.claude.com/docs/en/overview)、[Platforms and integrations](https://code.claude.com/docs/en/platforms)、[Extend Claude Code](https://code.claude.com/docs/en/features-overview)、[Run agents in parallel](https://code.claude.com/docs/en/agents)
- 逐条核对的参考页：[Commands](https://code.claude.com/docs/en/commands)、[Tools reference](https://code.claude.com/docs/en/tools-reference)、[Interactive mode](https://code.claude.com/docs/en/interactive-mode)、[CLI reference](https://code.claude.com/docs/en/cli-reference)、[Hooks reference](https://code.claude.com/docs/en/hooks)
- 形态：[Desktop](https://code.claude.com/docs/en/desktop)、[VS Code](https://code.claude.com/docs/en/vs-code)、[JetBrains](https://code.claude.com/docs/en/jetbrains)、[Chrome](https://code.claude.com/docs/en/chrome)、[Computer use](https://code.claude.com/docs/en/computer-use)、[Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web)、[Mobile](https://code.claude.com/docs/en/mobile)、[Remote Control](https://code.claude.com/docs/en/remote-control)、[Projects](https://code.claude.com/docs/en/claude-projects)、[Channels](https://code.claude.com/docs/en/channels)、[Scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks)、[Routines](https://code.claude.com/docs/en/routines)、[Self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments)、[GitHub Actions](https://code.claude.com/docs/en/github-actions)、[GitLab CI/CD](https://code.claude.com/docs/en/gitlab-ci-cd)、[Slack](https://code.claude.com/docs/en/slack)、[Headless](https://code.claude.com/docs/en/headless)、[Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)、[Deep links](https://code.claude.com/docs/en/deep-links)
- 会话与输入：[Checkpointing](https://code.claude.com/docs/en/checkpointing)、[Manage sessions](https://code.claude.com/docs/en/sessions)、[Goal](https://code.claude.com/docs/en/goal)、[Keybindings](https://code.claude.com/docs/en/keybindings)、[Fullscreen](https://code.claude.com/docs/en/fullscreen)、[Voice dictation](https://code.claude.com/docs/en/voice-dictation)
- 模型：[Model configuration](https://code.claude.com/docs/en/model-config)、[Fast mode](https://code.claude.com/docs/en/fast-mode)、[Advisor](https://code.claude.com/docs/en/advisor)
- 扩展：[Memory](https://code.claude.com/docs/en/memory)、[Output styles](https://code.claude.com/docs/en/output-styles)、[Skills](https://code.claude.com/docs/en/skills)、[Subagents](https://code.claude.com/docs/en/sub-agents)、[Dynamic workflows](https://code.claude.com/docs/en/workflows)、[Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)、[Code intelligence plugins](https://code.claude.com/docs/en/plugins/code-intelligence)、[MCP](https://code.claude.com/docs/en/mcp)、[Plugins overview](https://code.claude.com/docs/en/plugins/overview)、[Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)、[Status line](https://code.claude.com/docs/en/statusline)、[Artifacts](https://code.claude.com/docs/en/artifacts)
- 并行：[Agent view](https://code.claude.com/docs/en/agent-view)、[Agent teams](https://code.claude.com/docs/en/agent-teams)、[Worktrees](https://code.claude.com/docs/en/worktrees)
- 权限与审查：[Permission modes](https://code.claude.com/docs/en/permission-modes)、[Permissions](https://code.claude.com/docs/en/permissions)、[Sandboxing](https://code.claude.com/docs/en/sandboxing)、[Sandbox environments](https://code.claude.com/docs/en/sandbox-environments)、[Code Review](https://code.claude.com/docs/en/code-review)、[Ultrareview](https://code.claude.com/docs/en/ultrareview)、[Security guidance](https://code.claude.com/docs/en/security-guidance)、[Claude Security](https://code.claude.com/docs/en/claude-security)
- 组织：[Enterprise deployment overview](https://code.claude.com/docs/en/third-party-integrations)、[Feature availability](https://code.claude.com/docs/en/feature-availability)、[Gateways](https://code.claude.com/docs/en/gateways)、[Managed settings](https://code.claude.com/docs/en/managed-settings)、[Server-managed settings](https://code.claude.com/docs/en/server-managed-settings)、[Managed MCP](https://code.claude.com/docs/en/managed-mcp)、[Network configuration](https://code.claude.com/docs/en/network-config)、[Development containers](https://code.claude.com/docs/en/devcontainer)、[Monitoring](https://code.claude.com/docs/en/monitoring-usage)、[Analytics](https://code.claude.com/docs/en/analytics)、[Data usage](https://code.claude.com/docs/en/data-usage)、[Zero data retention](https://code.claude.com/docs/en/zero-data-retention)

### 说明

- 命令、工具、快捷键、启动参数是按参考页的表格逐行数的；会随版本变，以你本机 `/help` 和 Claude 自己报的为准。
- 本篇只说每项「是什么」。各项怎么实现、和另外两家比怎么样，在对应的功能页和三家差异页里写；目前已写好的是[上下文管理](/agents/claude-code/context)。
