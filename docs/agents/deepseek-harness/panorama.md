---
label: 全景
order: 0
date: 2026-10-11
summary: 在哪里用、命令、快捷键、工具、模型、扩展、并行、权限、审查、部署，一页列全
outline: 2
---

# deepseek-harness 全景

本篇把 deepseek-harness（下文简称 dsh）有的东西一页列全：能在哪些地方用、怎么操作一个会话、全部命令和快捷键、模型能调的工具、怎么换模型和推理档、有哪些扩展方式、怎么并行、权限和沙箱、代码审查、部署时有什么。每项一两句话说清是什么，细节链到对应的功能页或源码文档。

::: info 依据
- 核对的是 0.2.1-alpha.2，源码读的是 2026-10-09 的 master 分支（提交 `d743267`，2026-10-11 确认仍是最新）。
- 依据是仓库自带的文档（`docs/`、各包 README）、源码和发布的打包配置，没有实际运行。
- dsh 一切皆插件：同一份代码装哪些插件，能力就完全不同。下文的「默认」指 `dsh web` 启动的网页版：基础打包 `base` 加网页打包 `web-app`，会话用默认的 `standard` 智能体预设。实验包要手动开启，单独注明。
- dsh 还是开发者预览版，官方明说会有不兼容的改动，且没做过安全审计。
:::

## 一句话

dsh 是 DeepSeek 开源的智能体框架（MIT 许可证），建立在 Cordis 插件框架上，「一切皆插件」：会话、模型接入、工具、界面、压缩、沙箱都是可以替换的插件。日常用法是 `npx @deepseek-ai/dsh web` 在本机起一个网页界面；也有桌面版、命令行单次运行、SDK 和 ACP 几种入口，本质上都是同一个启动器加载不同的插件组合（profile）。

按源码和打包配置数一下：

| 项目 | 数量 |
| --- | --- |
| 包 | 331 个，其中实验包 44 个 |
| 默认插件 | 基础打包 94 项，网页打包再加 87 项 |
| 斜杠命令（网页版） | 8 个，另外每个可调用的技能也是一个命令 |
| 给模型的工具（`standard` 预设） | 30 多个，另有 20 多个在可选包里 |
| 发布的启动配置 | 5 个：`web`、`headless`、`sdk`、`sdk-minimal`、`acp` |
| 网页版的智能体预设 | 4 个：`standard`（默认）、`ptc`、`cordis`、`minimal` |
| 可配置的插件 | 配置目录 `docs/config-catalog.md` 列了 149 个 |

[智能体功能简介](/agents/overview)里有 6 项不单独成篇，放在本页：

| 功能简介里的项目 | 在本页哪里 |
| --- | --- |
| [联网搜索与抓取](/agents/overview#联网搜索与抓取) | [内置工具](#内置工具)的 `web_search`、`web_fetch` |
| [代码智能](/agents/overview#代码智能) | 内置工具里的可选包 `lsp` |
| [浏览器与电脑操作](/agents/overview#浏览器与电脑操作) | [在哪里用](#在哪里用)、内置工具的可选包 |
| [使用界面](/agents/overview#使用界面) | [在哪里用](#在哪里用)、[键盘与输入](#键盘与输入) |
| [云端与远程执行](/agents/overview#云端与远程执行) | 在哪里用的「离开电脑以后」 |
| [代码审查](/agents/overview#代码审查) | [代码审查](#代码审查) |

## 在哪里用

### 自己坐在电脑前

| 形态 | 是什么 |
| --- | --- |
| 网页界面 | `dsh web` 在本机 `127.0.0.1:3080` 起服务并打开浏览器。先在设置里填模型的 API key、选一个工作区，然后开会话。侧栏有文件、终端、浏览器、文档预览；有工作区改动、定时任务、后台作业、计划、子代理等面板 |
| 桌面版 | Electron 外壳包着完整的网页界面，macOS 和 Windows。可以用 DeepSeek 账号登录，可以把 `dsh` 命令装到系统里；关窗口只是隐藏，任务继续跑 |
| ACP | `dsh --profile acp` 通过 Agent Client Protocol 的标准输入输出服务支持 ACP 的编辑器和工具 |
| 终端界面 | 示例里提到 `tui` 配置，但发布的五个启动配置里没有终端界面 |

### 离开电脑以后

| 形态 | 是什么 |
| --- | --- |
| 远程部署 | 网页界面默认只听本机地址；放在反向代理后面，用 `--public-url`、`--trusted-host` 告诉它外部地址，可以直接配 TLS 证书 |
| SSH | 可选的 SSH 插件让文件和命令落在远程机器上，模型、对话和会话存储留在本机 |
| 定时任务 | 在对话里建提醒，支持一次性、固定间隔、每天、每周、cron；到点作为一条消息送回原会话，服务重启后仍在，在「自动化任务」页查看和修改 |
| webhook | 可选的 webhook 插件：外部系统发来经过认证的请求，就自动开一个新会话处理（比如 GitHub PR 审查，见下文） |

dsh 没有托管的云端执行服务，也没有手机客户端。

### 没有人坐在前面

| 形态 | 是什么 |
| --- | --- |
| `dsh headless` | 回答一个任务后退出，答案写到标准输出；`--json` 输出事件流，`--session-id` 接着已有会话，任务可以从标准输入读 |
| SDK | `dsh --profile sdk` 用 JSON-RPC 服务 SDK 客户端；官方有 Python SDK（Python 3.10 以上）。`sdk-minimal` 是独立的最小组合 |
| 自定义 profile | `--from-default-profile` 从发布的模板新建一个组合，`--patch` 叠加补丁层，`--dump-config` 打印最终组合 |

## 会话与控制

**开始。** 网页界面里先选工作区，没选工作区不能输入。每个会话可以选模型和智能体预设；新会话默认用上次选的模型。

**边干边说。** 模型在干活时，输入的消息可以排队等这一轮结束，也可以插进当前这一轮（steer）；`Enter` 用其中一种，`Ctrl+Enter`（Mac 上 `Cmd+Enter`）用另一种。排队的消息可以编辑、删除，或改成插话。

**打断。** 在对话或输入框里快速连按两次 `Esc` 停止当前这一轮，排队的消息保留。

**计划和目标。** `/plan` 进入或退出计划模式：模型只出方案，最后用 `exit_plan_mode` 请你批准或继续修改；计划模式只是软约束，真正的限制由沙箱和审批决定。`/goal` 设一个长任务的目标，目标存在对话之外，压缩不会摘要掉它。

**引用和附件。** `@` 引用文件，也能引用另一个会话（作为只读快照放进来）；`/file` 选文件附上。

**其他。** `/export` 把会话日志下载成 ZIP；`/feedback` 记录对这个会话的反馈；会话有自动生成的标题、回合大纲和统计。

上下文怎么装、怎么压缩，见 [deepseek-harness 的上下文管理](/agents/deepseek-harness/context)。

## 键盘与输入

网页版和桌面版的快捷键分开设默认值，可以在设置里或按 `Mod+/` 打开的快捷键参考里改（`Mod` 在 Mac 上是 `Cmd`，其他系统是 `Ctrl`）。下面以 Windows 为例。

### 输入和对话（固定）

| 按键 | 作用 |
| --- | --- |
| `Enter` | 发送 |
| `Shift+Enter` | 换行 |
| `Ctrl+Enter` | 用另一种方式发送（排队和插话互换） |
| `/` | 打开命令菜单 |
| `@` | 引用文件或会话 |
| `Esc` `Esc` | 停止当前这一轮 |
| `Enter` / `Esc`（权限确认时） | 允许一次 / 拒绝 |
| `↑` `↓`、`Enter`、`Esc`（菜单里） | 移动、选中、关闭 |

### 应用命令（可改）

| 命令 | 网页版 | 桌面版 |
| --- | --- | --- |
| 快捷键参考 | `Ctrl+/` | `Ctrl+/` |
| 打开设置 | `Ctrl+Alt+,` | `Ctrl+,` |
| 开关左侧栏 | `Ctrl+Alt+B` | `Ctrl+B` |
| 开关右侧栏 | `Ctrl+Shift+B` | `Ctrl+Alt+B` |
| 工作区文件 | `Ctrl+Alt+P` | `Ctrl+P` |
| 新浏览器标签页 | `Ctrl+Alt+T` | `Ctrl+T` |
| 新终端 | `` Ctrl+` `` | `` Ctrl+` `` |
| 分屏 | `Ctrl+\` | `Ctrl+\` |
| 面板全屏 | `Ctrl+Alt+Enter` | `Ctrl+Alt+Enter` |

网页版的默认键多用 `Ctrl+Alt` 组合。实验包里另有语音输入（本地 SenseVoice 识别）。

## 斜杠命令

dsh 的命令由各个插件注册，装了哪个插件才有哪个命令。下面是默认网页版里的全部：

| 命令 | 来自 | 作用 |
| --- | --- | --- |
| `/compact` | `dsh-command-compact` | 压缩较早的对话历史，哪怕还没到阈值 |
| `/goal` | `dsh-command-goal` | 设置或查看长任务的目标 |
| `/plan` | `dsh-plan-mode` | 进入或退出计划模式 |
| `/permission` | `dsh-permission-presets` | 切换权限预设（沙箱模式加审批策略） |
| `/model` | 网页客户端 | 选模型（子代理的会话里不能用） |
| `/file` | 网页客户端 | 选文件附进对话 |
| `/export` | `dsh-session-log-export` | 把会话日志下载成 ZIP |
| `/feedback` | `dsh-command-feedback` | 记录对这个会话的反馈 |

另外，每个允许用户调用的技能都能用 `/技能名` 调用；技能和命令同名时按命令处理。命令不经过模型，直接执行，在网页界面、ACP 和（如果装了的）终端界面里写法一样。

## 启动参数与子命令

### 启动器

| 用法 | 作用 |
| --- | --- |
| `dsh web` | 启动网页版，等同于 `dsh --profile web` |
| `dsh headless "任务"` | 回答一个任务后退出 |
| `dsh --profile sdk`、`sdk-minimal` | 用 JSON-RPC 服务 SDK 客户端 |
| `dsh --profile acp` | 用 ACP 服务编辑器等客户端 |
| `dsh plugin --profile <名字> <pnpm 参数>` | 给某个 profile 安装、删除插件（转给 pnpm） |

启动器自己的参数：`--profile`、`--from-default-profile`、`--patch`（可重复）、`--dump-config`、`--dump-config-schema`、`--dump-default-config`、`-V, --version`；后面的参数交给被启动的应用。profile 是一组按顺序叠起来的打包补丁，最上面是你自己的 `$DSH_HOME/profiles/<名字>/cordis.patch.yml`。

### 各配置的参数

| 配置 | 参数 |
| --- | --- |
| `web` | `--host`（只能是本机某个接口的具体地址）、`--port`、`--no-open`、`--public-url`、`--trusted-host`、`--tls-cert`、`--tls-key` |
| `headless` | `--json`、`--session-id`；任务写 `-` 表示从标准输入读 |
| `sdk`、`sdk-minimal`、`acp` | 只有 `-h, --help` |

## 内置工具

dsh 的工具全部来自插件。网页版里，工具不是全局装的，而是由会话选的智能体预设挂载；默认的 `standard` 预设给模型下面这些。工具名就是写权限和日志时用的名字。

### `standard` 预设默认就有

| 工具 | 作用 |
| --- | --- |
| `bash` / `pwsh` | 跑命令，按平台二选一（Windows 上是 `pwsh`）；可以放到后台跑 |
| `job_list`、`job_output`、`job_kill` | 查看、读取输出、停止后台作业 |
| `read`、`write`、`edit` | 读、写、改文件；`read` 默认 2,000 行、一次 50 KiB |
| `read_image` | 看图片 |
| `glob`、`grep` | 用内置的 ripgrep 找文件、搜内容 |
| `web_search`、`web_fetch` | 联网搜索、抓网页；搜索后端默认是 DeepSeek 的 |
| `ask_user_question` | 用选项向用户提问 |
| `todo_write` | 整份替换本会话的待办清单，界面显示成清单 |
| `exit_plan_mode` | 计划模式下交出计划，请用户批准 |
| `create_goal`、`get_goal`、`update_goal` | 目标的建、查、改 |
| `subagent`、`subagent_fork`、`list_subagent_models` | 派一个全新的子代理 / 派一个继承当前历史的分叉子代理 / 列出子代理能用的模型 |
| `list_agents`、`send_message`、`interrupt_agent` | 列出、联系、打断子代理 |
| `workflow` | 运行一段模型写的编排脚本，脚本里再启动子代理 |
| `schedule_create`、`schedule_list`、`schedule_update`、`schedule_delete` | 定时提醒的增、查、改、删 |
| `skill` | 加载技能 |
| `present` | 把产出的文件交付给用户，显示在交付物面板 |
| `plugin_manager` | 让模型查看、安装插件 |
| `working_directory` | 读或改本会话的工作目录（装在宿主层，所有会话都有） |
| `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource` | 读 MCP 资源；配了 MCP 服务器才有用 |

### 其他预设

- **`ptc`**：同样的能力，但模型只看到一个 `run_code` 工具，其余工具变成代码里可以调用的函数，由模型写程序批量调用（programmatic tool calling）。整个进程也可以用环境变量 `DSH_TOOLS_MODE=ptc` 切到这种方式。
- **`cordis`**：在 `standard` 的基础上加 `cordis_inspect_list`、`cordis_inspect_query`，让模型查看运行中的插件，用于编写新插件。
- **`minimal`**：只有一个持久的终端（`bash` 或 `pwsh`，命令之间保留 shell 状态）。

### 可选包里的工具

| 工具 | 包 |
| --- | --- |
| `lsp` | `dsh-tool-lsp`：接语言服务器，跳定义、找引用等四种查询 |
| `str_replace_editor` | 另一种看、建、改文件的工具 |
| `terminal_open`、`terminal_send`、`terminal_read` 等 6 个 | 持久终端（伪终端） |
| `session_event_read`、`session_event_search`、`session_search` 等 5 个 | 回查本会话和其他会话的日志（实验） |
| `spawn_teammate`、`team_task_*`、`wait_agent` 等 | 智能体团队（实验） |
| `create_worktree` | 新建 git worktree 并切过去（实验） |
| `ralph` | 让子代理一轮轮反复做到完成（实验） |
| `stagehand_*` 6 个 | 浏览器操作（实验，Chromium） |
| 电脑操作 | Cua Driver 的两个提供方（实验） |
| `load_workspace_dependencies` | 加载工作区的依赖说明 |
| MCP 工具 | 装了 MCP 客户端插件后，每个服务器的工具以 `mcp__服务器名__工具名` 出现 |

全部工具的参数说明见仓库的 `docs/tool-catalog.md`。

## 模型与推理

**DeepSeek。** 默认的模型路线是 DeepSeek 官方接口，内置 DeepSeek-V4.1-Flash（`deepseek-flash`，默认模型，支持图片）和 DeepSeek-V4-Pro（`deepseek-v4-pro`，更强的编程和复杂推理，单价更高）。窗口默认 100 万 token，单次输出上限默认 25.6 万。可以用 API key，也可以在桌面版用 DeepSeek 账号登录。

**推理档。** DeepSeek 的思考可以设成 `off`、`low`、`high`、`max`，默认 `high`；部署方可以整体关掉思考。

**其他服务商。** 设置的「模型」页可以加第三方服务商（内置清单里有 `anthropic`、`openai`、`moonshotai`（Kimi）、`zai`（GLM）等），或者填一个自定义的接口（中转、公司网关、自建服务），选好协议、填 key 和模型；能自动拉取可用的模型列表。用 OAuth 登录的服务商（比如 Codex）还不支持。

**模型参数。** 每个模型可以设窗口、最大输出、是否接受图片；推理档、请求兼容开关、请求头、超时和重试写在 profile 的补丁文件里。会话一旦发过请求，就固定用日志里记的模型。

## 扩展方式

| 方式 | 是什么 |
| --- | --- |
| 插件 | dsh 的一切都是 Cordis 插件。profile 是按顺序叠起来的打包补丁，插件用 `dsh plugin`、网页里的插件管理器或模型的 `plugin_manager` 工具安装；装插件时检查和 dsh 版本是否兼容 |
| 智能体预设 | 用声明式的 YAML 决定一个智能体有哪些工具、提示词片段和技能；一个进程可以同时跑几种组合，会话各选一个 |
| 项目指令 | 读用户级和项目级的 `AGENTS.md`，也认 `CLAUDE.md`；有字节预算；读写文件时发现新的嵌套指令文件 |
| 技能 | 本地技能目录加可选的打包技能（Office 文档等）；模型用 `skill` 工具加载，用户用 `/技能名` 调用 |
| MCP | MCP 客户端是可选插件：本地 stdio 或远程 Streamable HTTP；工具名带服务器前缀，服务器的说明进系统提示词。仓库附了几个记忆类 MCP 服务器的参考配置，默认不开 |
| 人格（persona） | 预设可以挂一个人格插件，替换系统提示词的开头和结尾，甚至整个系统提示词 |
| 扩展插件 | 让模型自己写带版本的 Cordis 插件，运行它的宿主端和浏览器端（`cordis` 预设配合） |
| 钩子 | dsh 没有自己的「配置文件钩子」，要在插件里监听事件。实验包能读 Claude Code 和 codex 的钩子配置（但不支持 `PreCompact`、`PostCompact`），另一个实验包能运行 Claude Code 的 mod |
| 界面插件 | 网页界面本身也由插件拼成：侧栏、设置卡片、命令、快捷键、主题、槽位都能由插件加 |

## 并行

| 方式 | 是什么 |
| --- | --- |
| 子代理 | `subagent` 开一个全新的子会话，可以选模型；`subagent_fork` 继承父会话的历史，固定用同一个模型，这样继承的历史能复用 KV 缓存。子会话有自己的日志，界面里有子代理面板 |
| 工作流 | 模型写一段编排脚本，脚本里启动多个子代理；脚本在独立的运行时里按调用方会话的文件权限执行 |
| 后台作业 | 命令放到后台跑，用 `job_*` 工具收结果；完成时通知模型 |
| 多个会话 | 一个服务进程承载多个会话，各自独立 |
| 智能体团队 | 一个负责人加多个成员，共享任务清单、互相发消息。实验包 |
| worktree | `create_worktree` 新建分支和检出目录并切过去。实验包 |

## 权限与安全

**两个独立的旋钮。** 沙箱模式只管文件；审批策略决定要不要问人。权限预设把两者打包：

| 预设 | 沙箱模式 | 审批策略 |
| --- | --- | --- |
| `workspace-write` | 只能写工作区和临时目录 | `ask`：需要时问你，越界的重试要批准 |
| `danger-full-access` | 不限制 | `never`：从不询问 |

沙箱模式另有 `read-only`；审批策略只有 `ask` 和 `never` 两种。`/permission` 切换预设；手动改过、对不上预设时显示为 Custom；`auto` 预留给自动审查（实验包）。

- **沙箱实现**：Linux 先用 bwrap，再用 Landlock；macOS 用 Seatbelt；Windows 用基于访问控制列表的受限令牌。每次执行报告是「完全」还是「部分」生效（老内核、Windows 有已知缺口）。找不到可用的沙箱时直接报错，不会悄悄不加限制地运行。
- **沙箱覆盖范围**：bash 和 pwsh 跑的命令由上面的系统级沙箱限制；文件工具的写和改由 `dsh-fs-sandbox` 按同一个沙箱模式限制，读不受影响；`danger-full-access` 下都不限制。
- **计划模式**：只是软约束，靠提示词，不改变沙箱和审批。
- **其他保护**：工具调用超时策略；同一个工具反复调用时提醒模型；网页服务只认本机地址和你明确信任的主机。
- **官方安全须知**：dsh 没做过安全审计，沙箱和审批能降低风险但不保证隔离；建议用一次性的虚拟机或容器、最小权限、备份文件，装插件前先审查。

## 代码审查

dsh 没有内置的审查命令。仓库附了一个可选的 GitHub 审查配置：给 `dsh web` 加一个签名校验的 GitHub webhook，仓库里的 PR 从草稿变成「可审查」时，自动在对应的工作区开一个会话，用只读的提示词审这个 PR。

审批方面有一个实验包做自动审查（对应预留的 `auto` 预设），让审批请求先经模型判断。

## 组织与部署

- **组织策略**：没有类似托管配置的企业策略层。部署方通过 profile 和补丁层决定装哪些插件、用什么默认值；用户自己的补丁叠在最上面。
- **凭证**：API key 存在 `$DSH_HOME/.credentials.yaml`，设置里只留引用；界面只能写、不能读回明文。桌面版支持 DeepSeek 账号登录。
- **网络**：模型请求、联网搜索、抓网页和 HTTP 的 MCP 服务器都走标准的代理环境变量。
- **对外发布**：放在反向代理后面，用 `--public-url`、`--trusted-host`，或直接用 `--tls-cert`、`--tls-key` 跑 HTTPS。
- **观测**：OpenTelemetry 插件提供普通事件和会话日志两种通道；会话遥测、产品遥测是分开的插件；桌面版的产品分析按单独的收集政策，网页版不收集。
- **存储**：会话日志是只追加的 JSONL，另有 SQLite 的查询索引和投影缓存。

## 来源

源码：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，master 分支 2026-10-09 的提交 `d743267`（版本 0.2.1-alpha.2）。

自带文档：

- 入口：`README.md`、`SAFETY.md`、`apps/cli/README.md`、`apps/desktop/README.md`、`docs/cli-help.md`
- 用户指南（`docs/user/guide/`）：`index.md`（网页界面）、`providers.md`（模型服务商）、`python-sdk.md`、`public-deployments.md`、`network-proxy.md`、`schedule.md`、`github-review.md`、`mcp-memory.md`
- 工具：`docs/tool-catalog.md`
- 子系统（`docs/subsystems/`）：`commands.md`、`permission-presets.md`、`sandbox.md`、`approval.md`、`plan.md`、`goal.md`、`todo.md`、`jobs.md`、`terminal.md`、`skills.md`、`mcp.md`、`extensions.md`、`subagent.md`、`agent-team.md`、`workflow.md`、`schedule.md`、`webhook.md`、`browser-use.md`、`computer-use.md`、`lsp.md`、`ssh.md`、`worktrees.md`、`voice-input.md`、`otel.md`、`claude-code-mods.md`、`user-questions.md`

打包配置和源码：

- `packages/bundle/base/cordis.patch.yml`、`packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/presets/*.yml`：默认插件和四个智能体预设
- 各命令的注册：`packages/compaction/command-compact`、`goal/command-goal`、`plan/plan-mode`、`interaction/permission-presets`、`feedback/command-feedback`、`session-query/session-log-export`、`client/ui-model-selection`、`client/ui-conversation`
- 快捷键：`packages/client/*/src/client/` 里各插件的 `shortcuts.register` 和固定键
- `packages/llm/llm-deepseek/src/`：内置模型、默认窗口和推理档
- `packages/sandbox/sandbox-local/README.md`：各平台的沙箱实现
- `packages/context/agent-instructions/src/config.ts`：项目指令的文件名

### 说明

- 数字和清单取自源码与发布的打包配置，没有实际运行；换一个 profile 或预设，能力会完全不同。
- 本篇只说每项「是什么」。各项怎么实现、和另外两家比怎么样，在对应的功能页和三家差异页里写；目前已写好的是[上下文管理](/agents/deepseek-harness/context)。
