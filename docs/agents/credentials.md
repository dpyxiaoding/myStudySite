---
title: 凭证与身份三家对读
label: 凭证与身份
group: 协议与接入
order: 3
date: 2026-08-27
summary: 凭证与身份
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

# 凭证与身份

<Badge type="info" text="三家对读 · 第十篇 · 核验日期 2026-08-27" />

一个编程智能体天生站在最坏的位置上：手里有 shell，脚下是一台开发机，而那台机器上摊着这个人所有的钥匙。三家 harness 对「模型能不能碰到这些钥匙」给出的答案，相差整整两个数量级。

`AWS_SECRET_ACCESS_KEY = ████████████████`

Claude Code 2.1.246 · codex（codex-rs 全量） · deepseek-harness（全量 + 自述） · 本仓作为第四列 · 九维

## 这件事在解决什么

「凭证」这个词在 harness 里其实盖着三道不同的题，它们经常被当成一件事，于是设计时也只解了一道：

- **harness 自己怎么认证。** 拿什么去调模型、存在哪、怎么刷新、登出时怎么撤。纯工程题。
- **模型和它拉起的进程能碰到什么。** 同一台机器上的其它凭证——包括 harness 自己那份登录态。这是安全边界题。
- **agent 自己算不算一个身份。** 服务端看到一次请求时，它知道的是「某个人在用某个工具」，还是「某个 agent 代表某个人在跑某一次任务」。这是协议题。

第一道题三家解得差不多，差异集中在默认值上；第二道题是全篇最大的分岔，一端是「我们不假装这是边界」，另一端是出站 MITM 代理在发请求那一刻把哨兵值换回真凭证；第三道题三家答的根本不是同一个问题。

这三道题为什么必须一起读：只解第一道的 harness，凭证存得再好也挡不住模型 `cat ~/.aws/credentials`；只解第二道的，企业没法把密钥挪出开发机；只解第三道的，服务端能验签，却仍然不知道被验的那个进程刚刚读了谁的私钥。

## 三家是谁，证据到什么档次

::: codex 一手源码
这一轮把 `secrets` / `keyring-store` / `agent-identity` / `aws-auth` 四个 crate 与 `login/src/auth/` 全套读了。最硬的一档：常量、默认值、函数注释都是原文。
:::

::: dsh 一手源码 + 自述
每个包自带 README，且都有一节 `Known Limitations and Deferred Work`。这一档比读代码还可信一点——它自己写出来的「这里不设防」，比我从实现里推出来的结论证据级别更高。
:::

::: claude 压缩源码 + 实机
**这一轮证据档次变了。** 2.1.246 的 `bin/claude.exe` 是 250 MB 原生可执行文件，但里面打包的是 JS：`grep -a` 能读出配置 schema、标识符和大量完整英文诊断文案。外加 `claude --help` 与 `claude auth status` 的实机输出。
:::

::: info 这一档的边界要说清楚。
我读的是标识符与英文文案——它们是原文，没被压缩改名；我没读控制流——那是单字母变量，从中推断行为不可靠。所以下文凡是「Claude Code 有某个配置项 / 某句诊断这么写」都可以引用，凡是「它在什么条件下走哪条分支」我只在文案自己说清楚时才写。
:::

## 九个维度

按凭证的生命周期排：先有取值域，再落盘，再决定配置里放什么，然后是取值、身份、外泄面、脱敏、获取、和把这一整套挪出开发机。编号是顺序，不是装饰——第七维的答案完全由第六维的选择决定。

### 01 认证模式的取值域 <Badge type="warning" text="分岔" />

枚举的到底是「认证方式」，还是「凭证的地址空间」？

::: codex
`AuthMode` 七个值：`ApiKey`、`Chatgpt`、`ChatgptAuthTokens`、`Headers`、`AgentIdentity`、`PersonalAccessToken`、`BedrockApiKey`。枚举上挂了两个派生判据——`has_chatgpt_account()` 与 `uses_codex_backend()`——让下游问「有没有人类账号」和「走不走 codex 后端」，而不是逐个匹配枚举值。`Headers` 那一档把整个凭证生命周期外包出去，注释原话：`“The provider owns credential validation, rotation, and persistence.”`
:::

::: claude
没有对外暴露的枚举，但 `--bare` 的帮助文案把分档说全了：OAuth（订阅）、系统钥匙串、`ANTHROPIC_API_KEY`、`apiKeyHelper`，三家云各走自己的凭证链（Bedrock / Vertex / Foundry），外加工作负载联合（`ANTHROPIC_FEDERATION_RULE_ID` + `ANTHROPIC_ORGANIZATION_ID`）。`claude auth status` 吐的 JSON 把两件事拆成两个字段：`authMethod`（怎么认证的）与 `apiProvider`（哪个 API 提供方）。
:::

::: dsh
**根本没有「认证模式」这个概念。** 它切的是另一刀：两个正交的键空间。`CredentialRef` 是一个 POSIX 环境变量名，回答「这个名字背后是什么」，可以分层；`CredentialKey` 是 `<owner>/<id>`，回答「这个插件为这个 id 存了什么」，不能分层——README 给的理由很硬：`“an authorization grant has no environment to be read from”`，所以记录存在与否就是全部事实。
:::

::: tip 判断
分岔在抽象层级上。codex 与 Claude Code 都在枚举「认证方式」，dsh 枚举的是「凭证的地址空间」。后者更耐改：新增一种认证方式在 dsh 那里不是加一个枚举值（以及每一处 `match` 的新分支），是注册一个 flow。
:::

### 02 落盘形态 <Badge type="tip" text="同构，差在默认值" />

登录态最后躺在哪个文件里，权限多少，谁能读？

::: codex
两个正交的配置项：`AuthCredentialsStoreMode` 四档（`File` / `Keyring` / `Auto` / `Ephemeral`）× `AuthKeyringBackendKind` 两档（`Direct` 直接把序列化后的 auth 塞进钥匙串 / `Secrets` 走加密文件）。**默认是 `File`**——`auth.json`，unix 上 `0o600`。`Secrets` 那一档的做法是：age + scrypt 加密整份文件，32 字节随机口令放 OS 钥匙串，账号名是 `secrets|sha256(codex_home)[..16]`。三个命名空间各一份密文——`local.age`（托管密钥）、`codex_auth.age`（自己的登录态）、`mcp_oauth.age`（MCP 的 OAuth）。
:::

::: claude
走 `Bun.secrets`——macOS 钥匙串 / Windows 凭据管理器 / Linux libsecret。大 payload 要分块，错误文案原文：`“SecureStorageData too large for Credential Manager”`。回退是 `~/.claude/.credentials.json`。有一条另外两家都没有的检查：读之前先 lstat，是符号链接就直接 `refused-symlink`。
:::

::: dsh
`$DSH_HOME/.credentials.yaml`，目录 `0700`、文件 `0600`，**而且读的时候也校验**：POSIX 上文件带任何 group/other 位，就在解析内容之前失败，错误里直接给出 `chmod 600`。Windows 没有 mode 可查，它就跳过而不是假装检查过。四层优先级写成一张表：进程环境 > 托管文档 > 项目 `.env` > 用户 `.env`，且最上层永远 `writable: false`——因为改不动它，就必须让它*看起来*改不动。
:::

::: tip 判断
三家都到了「钥匙串优先、文件兜底、0600」，这一条可以当定论。真正的分岔是默认值：codex 默认落文件、钥匙串是选配；Claude Code 默认进钥匙串、文件是回退。dsh 的加分项是那条**读时权限自检**——另外两家都只在写的时候设权限，改坏了不会有人告诉你。
:::

### 03 配置里放引用还是放值 <Badge type="tip" text="同构" />

settings 文件能不能同步、能不能截图、能不能在 UI 里渲染？

::: dsh
把这条写成了教义第一句：`“Configuration carries references to secrets, never the secrets.”`README 明写它换来三件事——设置文档可以同步、可以渲染；`describe()` 能回答「配没配、从哪来、能不能写」而手里从没有值；**轮换一个密钥不碰任何配置文件**。
:::

::: codex
同构：`model_providers.<id>.env_key` 指名一个环境变量，`auth` 段是一条命令。它多做了一步——把「不该被打印」编进类型：`ModelProviderAuthInfo.args` 的元素类型是 `RedactedString`，而不是 `String`。
:::

::: claude
部分同构：`apiKeyHelper` 是命令，但 `ANTHROPIC_API_KEY` 可以直接进环境，settings 里也能存 `primaryApiKey`。它在这条上补的是另一个方向的防线——见第七维的 `customApiKeyResponses`。
:::

::: tip 判断
三家同构，dsh 说得最清楚。值得抄的是它那条推论：判断一个设计有没有真做到「只放引用」，看的不是配置文件里有没有密钥，而是**轮换密钥时要不要动配置文件**——要动，就说明值还在里面。
:::

### 04 凭证由外部程序现取 <Badge type="warning" text="二比一" />

企业的密钥不在文件里，在一条只有运维知道怎么跑的命令后面——接得住吗？

::: codex
`BearerTokenRefresher`：配置是 `{command, args, cwd, timeout_ms, refresh_interval_ms}`。`refresh_interval_ms = 0` 的语义被明确写进注释——**不主动刷，只在 401 之后重跑**。stdout trim 完就是 token，空串报错，非 UTF-8 报错，超时报错且错误里带上命令名；子进程 `kill_on_drop`。
:::

::: claude
`apiKeyHelper` 配 `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`（有默认值常量，数值没读出来），另有两条专门给 AWS 的：`awsAuthRefresh`（跑一条刷新命令）与 `awsCredentialExport`（跑一条命令、吃它吐出来的凭证），加上 `CLAUDE_CODE_AWS_CHAIN_RESOLVE_TIMEOUT_MS`。它还有一条另两家没有的：`CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR`——密钥从一个已打开的 fd 递进来，连命令行和环境变量都不经过。
:::

::: dsh
没有。README 明说 seam 的形状给 keyring、helper-command、KMS 三种 provider 都留了位置，但目前落地的只有 local 一个——`“an OS-keychain provider … is the deferred answer”`。
:::

::: tip 判断
二比一，且第三家自己写着这是待补的，所以这条按「三家都会做」算。可抄的是 codex 那个 `refresh_interval_ms = 0` 的语义：把「不预刷、只在 401 后重取」做成取值域里的一个合法值，而不是另开一个布尔开关。
:::

### 05 agent 自己算不算一个身份 <Badge type="warning" text="三家答的不是同一道题" />

服务端收到一次请求，它知道的是「一个人在用工具」，还是「一个 agent 在跑一次任务」？

::: codex
有一整个 crate。ed25519 密钥在本地生成，**私钥从不离开本机**；带着一份 **ABOM**（agent bill of materials：`agent_version`、`agent_harness_id`、`running_location`）与一组 capabilities 注册到 `auth.openai.com/api/accounts/v1/agent/register`，换回 `agent_runtime_id`；每次跑任务再签一次 `"{runtime_id}:{timestamp}"` 注册出一个 `task_id`——服务端可以只回*加密的* task id，客户端用 ed25519 私钥派生出的 curve25519 私钥解开；此后每个请求带 `Authorization: AgentAssertion <base64url({agent_runtime_id, task_id, timestamp, signature})>`。
:::

<figure class="diagram">
<!--@include: ./figures/credentials-1.svg-->
<figcaption>codex 把「agent 身份」拆成两级：长期的 runtime id 与一次性的 task id。服务端因此能把一次请求归到<em>某一次运行</em>，而不只是归到一个账号；四个步骤里没有任何一步把私钥送出去。</figcaption>
</figure>

::: claude
不签名，但有一整套「这个 agent 代表哪个组织的哪个服务账号」的变量：`ANTHROPIC_SERVICE_ACCOUNT_ID`、`ANTHROPIC_IDENTITY_TOKEN` / `ANTHROPIC_IDENTITY_TOKEN_FILE`、`ANTHROPIC_SCOPE`、`ANTHROPIC_WORK_ID` / `ANTHROPIC_WORK_SECRET`、`ANTHROPIC_WORKSPACE_ID`、`ANTHROPIC_FEDERATION_RULE_ID`。这是工作负载联合：把 CI 发的 OIDC 断言换成访问令牌。**codex 有一份一模一样的**（`workload_identity.rs`：`assertion_file` + `federation_rule_id` → token 端点），两家连环境变量名都只差前缀。
:::

::: dsh
只有 `getOrCreateAnonymousUserId()`——一个 UUID v4，落在 `$DSH_HOME/.anonymous-user-id`，用于遥测、`/feedback` 回执，以及给 DeepSeek 的 `x-deepseek-harness-user-id` 头。README 特意声明：**绝不从主机名、网络地址、git remote 派生**，删掉文件就换一个身份，不同的 `$DSH_HOME` 之间无法关联。
:::

::: tip 判断
三家分岔，而且分在不同的问题上。codex 回答「服务端怎么确认这次请求真是一个 agent 发的」；Claude Code 与 codex 共同回答「CI 里的 agent 怎么无密钥登录」；dsh 回答「怎么在不识别人的前提下把同一个人的记录串起来」。三条都成立，但只有前两条在本仓 M2 的路上——第三条是产品遥测题。
:::

### 06 工具子进程能看见什么 <Badge type="warning" text="全篇最大的分岔" />

`echo $ANTHROPIC_API_KEY` 这一条命令，判成 read、自动执行、输出回灌进上下文——三步都合规。谁挡得住？

::: codex
默认 `inherit: All`，而那三条 `*KEY*` / `*SECRET*` / `*TOKEN*` 默认过滤器——**`ignore_default_excludes` 的默认值是 `true`，也就是过滤器默认关着**（`toml.ignore_default_excludes.unwrap_or(true)`）。子进程拿到完整的父进程环境，`OPENAI_API_KEY` 在里面。另有一张固定 5 条的清单永远剥掉，函数注释诚实到可以直接抄：

> this prevents accidental propagation of Codex launch context; it is not a filesystem security boundary for the referenced identity-token file.
:::

::: dsh
同样完整继承，而且它把这件事写成了一节正文，标题就叫 `Security boundary`，结论是一句：

> That is discretion, not a boundary.

展开是：`0600` 挡的是别的 OS 用户，不是模型；工具进程与用户同 UID，`workspace-write` 策略约束的是写不是读，没有任何沙箱档单独关照这个文件。它守的只有两条——从不把这份文件的路径交给模型，也从不把它加载进进程环境。
:::

::: claude
唯一一家把它当边界来做的，三层叠起来：

- **内建拒读清单。** 目录级 `.ssh .aws .azure .gnupg .kube .docker`；二级路径 `.config/gh`、`.config/gcloud`、`.cargo/credentials`、`.m2/settings.xml`、`.gradle/gradle.properties`、`.claude/settings.json`…；文件名 `.netrc`、`.git-credentials`、`.npmrc`、`.pgpass`、`kubeconfig`，**以及 `.bash_history` / `.zsh_history` / `.psql_history` 这类历史文件**——密钥常常不在凭证文件里，而在某个人当年手打过的那条命令里。
- **可配的掩码。** `sandbox.credentials.files[]` 与 `envVars[]` 两种模式：`deny` 直接不给读，`mask` 给一个哨兵值。掩码还能配 `extract` 正则，让 `.netrc` / JSON / YAML 仍然解析得动，`onExtractNoMatch` 决定匹配不上时怎么办。
- **出站替换。** MITM 代理在 `injectHosts` 命中的主机上把哨兵换回真值（`mutateHeaders` / `getBodySubstitutions`）；AWS 另有 `awsPairs` 让 SigV4 能重新签名，并且会警告：只掩了密钥对的一半就没法配对重签。
:::

<figure class="diagram">
<!--@include: ./figures/credentials-2.svg-->
<figcaption>差别只有一个盒子：Claude Code 在子进程与网络之间插了一个代理，凭证的明文因此从来没有出现在<em>模型能读到的任何一个位置</em>。另外两家不是做漏了，是明确写着不打算在这里设防。</figcaption>
</figure>

::: info Claude Code 把边界的失效条件也写进了诊断文案
，这比机制本身更值得抄。三条原文级别的自曝：① 非可信来源（被禁用的 userSettings、上级托管设置）给的 mask 只能降级成 sentinel-only，`injectHosts` 在加载时被剥掉——`“a disabled source cannot grant it”`；② macOS 上文件层策略放松时，mask 会退化成 deny，而 read-deny 在那个模式下会被丢掉；③ 被掩的文件如果落在沙箱可写根里，沙箱内的命令能在两次 wrap 之间把它换掉，**从而操纵宿主读到并注入的那个凭证**——所以它建议只掩可写根之外的文件。
:::

::: tip 判断
这一维是全篇最大的分岔，也是唯一一处三家的**诚实度**能直接对照的地方：codex 与 dsh 在注释和正文里明写「这不是边界」，Claude Code 把它做成了边界、并且把边界什么时候不成立也写了出来。三家没有一家在这里含糊——真正危险的写法是第四种：做了一半，然后称之为「已加固」。
:::

### 07 脱敏在哪一层 <Badge type="warning" text="分岔，且由第六维决定" />

凭证已经在字符串里了，在它进入日志 / 事件 / 记忆 / 客户端之前，谁负责擦？

::: codex
一个 `redact_secrets` 正则，四条规则（`sk-` 开头的 key、`AKIA` 开头的 AWS access key id、`Bearer <token>`、`api_key= / token= / secret= / password=` 赋值）。关键是它只在**两个地方**被调用：给客户端展示的命令串（`CommandExecutionPresentation::from_raw`），以及 memories 写盘前的文本。不在模型输入上，不在命令输出上。
:::

::: dsh
schema 驱动：设置项标 `role('secret')`，`describe({redactSecrets: true})` 在 wire 边界剥掉。而它自己给这条打了红叉——`“redactSecrets is not a proven wire boundary”`：walker 只走 object / dict / array，藏在 union、intersection、transform 后面的 secret 会原样返回，而且 `secrets` 清单是空的（也就是**连「这里漏了」的信号都没有**）。遥测那一侧更直接：`sessionTelemetry/record` 是个瀑布式扩展点，**本体不带任何规则**，没挂 listener 就原样导出。
:::

::: claude
没有全局正则，因为不需要——走的是第六维那套哨兵：凭证在进入模型视野*之前*就已经是假值了。压缩那一层另有一条，写在摘要提示词里：用户声明过的敏感文件与凭证处理规则，必须逐字保留进摘要，**好让它们在压缩之后继续生效**。
:::

::: tip 判断
分岔的根因就是第六维：做了哨兵替换，就不必在出口擦；没做，就只能在出口擦，而两家都写明了自己擦不干净（codex 只覆盖两条路径、四条正则；dsh 承认 walker 有盲区）。结论很干脆：**正则脱敏是止损，不是防线**——真防线在凭证进入字符串之前。
:::

### 08 拿不到凭证时怎么获得 <Badge type="tip" text="同构，一家抽了缝" />

有些凭证不能配置，只能获得——「打开这个页面、粘贴这个码、选一个账号」。这段对话归谁管？

::: dsh
专门抽了一个 seam：`ctx.authorization`。四条设计取舍都值得抄——① flow 注册在它要写的那个 `CredentialKey` 上，所以「谁能解释这份记录的格式」是显式的；② **flow 自己提交写入**，seam 只确认它在本次尝试期间*观察到了*一次提交，理由写得很准：`“presence alone would let a re-authorization pass a stale record off as fresh”`；③ 交互对象**随请求走**而不是从注册表取——发起授权的人才是能跟人对话的那个，headless 调用方就塞一个直接拒绝的 interaction；④ 一个 key 同时只允许一次尝试，第二个调用方拿 `ALREADY_IN_FLIGHT` 而不是被合并进去，否则两个人会轮流回答同一串问题。交互词汇表只有 notify 与 prompt（text / secret / select），**刻意比任何一家 provider 的都小**：能渲染一个 flow 的界面就能渲染全部。
:::

::: codex
本地回环 OAuth server + PKCE，外加设备码流程（给出 `verification_url` 与 `user_code`）。`server.rs` 的文件头把两件互相打架的事拆成两条路径：给人看的错误要留足够细节供排查，结构化日志只输出显式审过的字段，URL 与 error 一律脱敏。
:::

::: claude
`claude auth login / logout / status`，以及 `claude setup-token`（长效令牌，要订阅），另有 `CLAUDE_CODE_CUSTOM_OAUTH_URL` 给自建 IdP。
:::

::: info 撤销这一条上顺序倒过来。
codex 有 `revoke.rs`：登出时尽力撤 refresh token，没有 refresh token 就退而撤 access token，撤不掉也照删本地。dsh 明写 `“Nothing revokes”`——登出就是 `deleteRecord`，忘掉本地记录，不通知签发方。
:::

::: tip 判断
三家做的是同一件事，只有 dsh 把它抽成了一条第三方插件能复用的缝。判据也在它自己的文档里：**第二种授权协议来的时候，是加一个 flow，还是加一个 seam**？答案是 flow——这句话就是这条缝划对了的证据。
:::

### 09 怎么把凭证挪出开发机 <Badge type="warning" text="分岔" />

企业不想让密钥出现在任何一台开发机上。三家各给了什么出口？

::: claude
加一个进程：`claude gateway --config <yaml>`，帮助原文`“Run the enterprise auth/telemetry gateway”`。配套的是设置分层里那条规则——托管设置能收紧，但**不能授予凭证注入**，注入只能由本机可信层开。
:::

::: codex
把身份联合做进 CLI 本身：workload identity（OIDC 断言文件 + federation rule id → token 端点）、`aws-auth` 的 SigV4，以及上一篇读到的 `ThreadConfigLoader`——由 gRPC 下发整份 provider 配置。开发机上不需要有长期密钥，因为身份是从运行环境换来的。
:::

::: dsh
没有专门的企业面，它的说法是这题在第三维就解掉了：`“a remote settings provider never needs to carry secrets”`——远程配置面天然不碰密钥，因为配置里只有引用。
:::

::: tip 判断
三条路互不重叠：加一个网关进程 / 把联合身份做进客户端 / 让配置面天然无密钥。第三条最便宜但只解了「配置同步」这一半；前两条解的是「开发机上根本没有长期密钥」，代价是要有服务端配合。
:::

## 分岔汇总

| 维度 | Claude Code | codex | deepseek-harness | 本仓 |
| --- | --- | --- | --- | --- |
| 认证取值域 | 分档在文档与 CLI 输出里；`authMethod` 与 `apiProvider` 分开 | `AuthMode` 七值 + 两个派生判据 | 不枚举方式，枚举地址空间：ref / key 两个键空间 | 只有 `apiKeyEnv`（§9.7 profile），没有取值域概念 |
| 落盘 | OS 凭证管理器优先（分块），文件回退，拒符号链接 | 四档 store × 两档 keyring；默认落文件 `0600`；加密档用 age+scrypt | `.credentials.yaml` `0600`/`0700`，**读时校验权限** | 凭证尚未落地；库只有 `.agent/agent.db` |
| 引用 vs 值 | 两者都可（`apiKeyHelper` 或直接 key） | 引用；`RedactedString` 把「不许打印」写进类型 | 教义级：配置只放引用 | 同构：`apiKeyEnv` 指名环境变量，`core-runtime` 不碰 `process.env` |
| helper 命令 | `apiKeyHelper` + TTL；AWS 另有两条；还能走 fd | `{command,args,cwd,timeout,refresh_interval}`；0 = 只在 401 后重跑 | 无（seam 留了位置，明确 deferred） | 无 |
| agent 身份 | 工作负载联合 + 服务账号 + 组织 | ed25519 + ABOM + runtime id + 每次 run 一个 task id + 每请求签名 | 只有匿名 UUID，且刻意不可派生 | `Principal{type:'agent', delegatedFrom}`——**有类型位，没有机制** |
| 子进程环境 | deny / mask + 哨兵 + 代理注入；另有内建拒读清单 | 默认全量继承（过滤器**默认关**）；固定 5 条永远剥掉 | 全量继承；明写「这是自觉，不是边界」 | `scrubCredentials` **默认开**，词边界匹配，刻意不匹配 `AUTH`（ADR-0055） |
| 脱敏层 | 不需要出口脱敏——凭证从没进过模型视野 | 四条正则，只在展示串与 memories 两处 | schema `role('secret')`；自曝 walker 有盲区；遥测无内置规则 | `secret` 一档**不在 `EventSensitivity` 里**——带 secret 的信封构造不出来（ADR-0014） |
| 交互授权 | `auth login` / `setup-token` | 回环 OAuth + PKCE + 设备码；有 `revoke` | 抽成 `ctx.authorization` seam；明写「无撤销」 | 无 |
| 企业面 | 独立网关进程；托管层不能授予注入 | 联合身份做进 CLI；gRPC 下发 provider 配置 | 不需要——配置面本来就不携带密钥 | M2 安全基线三条不可裁剪项，尚未开工 |

## 对本仓意味着什么

### 「注入发生在出站 HTTP 客户端那一层」不再是推的 <Badge type="tip" text="三家撞出同一个答案 · 可当定论" />

§5.3 ② 那句「工具实现自始至终拿不到明文凭证——实际注入发生在出站 HTTP 客户端那一层」，当初是本仓自己推的，没有对标样本。现在有了：**Claude Code 的哨兵 + 代理替换就是这句话的一个已发货实现**，连推论都一致（做了替换就不需要出口脱敏）。这条可以从「我们的判断」升格成「有先例的做法」。

它还带来一个本仓 §5.3 没写的推论：**替换点必须能按目标主机做条件**。`injectHosts` 的存在说明「出站客户端注入」不是一个开关，是一张表——否则一个被诱导去 `curl attacker.com` 的工具，会让代理替它把真凭证送出去。

### 记忆写入路径要单独拦一次 <Badge type="tip" text="三家撞出同一个答案 · 可当定论" />

codex 在 memories 落盘前跑一遍 `redact_secrets`；本仓 §5.8 写着 `MemoryStore.write` 入口做模式匹配拦截。两家**独立地**把记忆认成了一条必须单独设卡的路径，理由也一样：记忆会被反复注入未来所有会话，写进去一次等于泄漏无数次。这条不必再论证，直接实现即可。

### 配置只放引用，判据是「轮换密钥要不要改配置文件」 <Badge type="tip" text="三家撞出同一个答案 · 可当定论" />

三家一致，本仓的 `apiKeyEnv` 已经在这条线上。dsh 多给了一个可执行判据，值得收进 §5.3：**不看配置文件里有没有密钥，看轮换一次密钥要不要动配置文件**。

### agent 身份只有类型位，没有机制 <Badge type="warning" text="本仓没有 · 补不补是决策" />

`Principal{type: 'user' | 'service' | 'agent', delegatedFrom}` 已经把「agent 代表谁在操作」留成了字段，但目前没有任何东西*产生*或*验证*这个身份。codex 那套（本地 ed25519 + ABOM + 每次 run 一个 task id）是完整的、可抄的参考，代价是要有服务端配合——而本仓 M2 的企业侧本来就有服务端。

真正该现在决定的不是抄不抄，是**要不要在 M2 的 `Principal` 里预留「这次 run 的身份」这一级**。codex 把 runtime id（长期）与 task id（一次性）分成两级，正是因为审计要能回答「哪一次运行做的」，而不只是「哪个账号做的」——这和本仓 §13.1 审计要回放到 Run 粒度是同一个需求。

### 凭证文件的拒读清单 <Badge type="warning" text="本仓没有 · 补不补是决策" />

本仓的 `scrubCredentials` 挡住的是**环境变量**这条路，`~/.aws/credentials` 那条路完全没挡——而 M1 的 bash 工具已经能读文件了。Claude Code 那三张清单（目录 / 二级路径 / 文件名，含 shell 历史文件）是现成的起点，且不需要沙箱：它是路径判定，落点在 §5.2 的风险判定或工作区读取边界上。

注意 dsh 的反面证据也在这里：它明确*选择*不做，理由是同 UID 下文件权限挡不住模型，做半套只会让人误以为有边界。所以这条要么做成路径级拒读（拒绝而不是静默返回空），要么明确写进威胁模型表说不做——**不能只在文档里写「凭证不进上下文」然后靠自觉**。

### 子进程过滤器：默认开还是默认关 <Badge type="warning" text="三家分歧 · 要自己判" />

本仓默认开（`scrubCredentials` 无条件生效），codex 默认关，dsh 不做。本仓这条更严，而且实现细节比 codex 更准：codex 用 `*KEY*` 通配，会顺手吃掉 `MONKEY_BUSINESS`；本仓用词边界匹配，并**刻意不匹配 `AUTH`**，免得摘掉 `SSH_AUTH_SOCK` 让 ssh 整个失效。这一条不用改，但要意识到我们比对标方严，因此**踩到「某个工具需要某个含 KEY 的环境变量」的概率也比它高**——真撞上时，正确反应是加一条允许项，不是把过滤器关掉。

### 脱敏放类型里还是放正则里 <Badge type="warning" text="三家分歧 · 要自己判" />

本仓选的是最硬的一档：`EventSensitivity` 里根本没有 `secret` 这一级，带 secret 的信封**构造不出来**（ADR-0014）。dsh 走 schema walker 并自曝有盲区，codex 走正则并只覆盖两条路径。

本仓这条的代价现在能说清了：编译期约束只管得住*本仓自己构造的*信封，管不住「凭证以字符串形式出现在命令输出里、然后被合法地放进一个 `display` 档字段」。dsh 与 codex 的正则/walker 恰好补的就是这一段。**结论不是改设计，是承认这里有第二段风险**，它的正确落点是威胁模型表里新的一行，而不是把 `secret` 加回 `EventSensitivity`。

## 明确没核到的部分

- **没有把任何一家跑起来验行为。** 所有数值与默认值取自源码常量、配置 schema 与帮助文案，不是实测。Claude Code 那一列尤其：我读的是压缩产物里的标识符与英文文案，没有读控制流。
- **Claude Code 的哨兵替换只读到了配置面与诊断文案**，没有确认代理在什么条件下真的替换、哨兵值怎么生成、以及 `allowPlaintextInject` 关闭时非 TLS 连接上具体发生什么。
- **`apiKeyHelper` 的默认 TTL 数值没读出来**——它在二进制里是一个被压缩掉名字的常量。
- **本机那份 `~/.claude/.credentials.json` 的真实 ACL 没核**。文件存在，说明这台 Windows 机器走的是回退档；但 Git Bash 报的 `-rw-r--r--` 是模拟位，不是 Windows ACL，不能据此说它对其他用户可读。
- **codex 的托管密钥（`SecretScope::Environment`）没有找到任何消费方。**`secrets` crate 全仓只被三处使用：codex 自己的登录态、MCP 的 OAuth、以及那个脱敏正则。`environment_id_from_cwd` 是公开导出的，但没有 CLI 命令、也没有把托管密钥注入工具执行环境的路径——看起来是提前造好的地基，功能还没接上。**这是「grep 零命中 + 读了装配入口」得出的结论，不是纯零命中。**
- **codex 的 `aws-auth` 只读了 SigV4 签名与配置发现的入口**，没有跟到它与 `BedrockApiKey` 那一档的完整关系。
- **dsh 的 `credentials-local` 只读了 README 与类型，935 行实现没读**。跨进程写锁、watcher 去抖、旧格式就地升级这三处的实际行为以文档为准。

## 落点索引

#### codex · codex-rs/

- `secrets/src/lib.rs:23` 钥匙串服务名 · `:53` `SecretScope` · `:90` backend trait · `:183` 钥匙串账号名推导
- `secrets/src/local.rs:41-43` 三个命名空间文件名 · `:237` 口令生成/取用 · `:378` age+scrypt
- `secrets/src/sanitizer.rs:1-22` 四条脱敏正则 · `keyring-store/src/lib.rs:43` `KeyringStore` trait
- `agent-identity/src/lib.rs:232` AgentAssertion 头 · `:315` 注册 task · `:358` 注册 agent · `:497` ABOM · `:521` 签名载荷
- `login/src/auth/storage.rs:40` `AuthDotJson` · `:322` 加密档 · `:405` auto 档 · `:498` 装配入口
- `login/src/auth/external_bearer.rs:103` 跑 auth 命令 · `login/src/auth/revoke.rs:1-6` 撤销语义（文件头）
- `protocol/src/auth.rs:9` `AuthMode` 七值 · `protocol/src/shell_environment.rs:14` 5 条不继承清单 · `:33` 剥离函数与那句诚实注释
- `protocol/src/config_types.rs:207` inherit 三档 · `:240` `ShellEnvironmentPolicy` · `:569` `ModelProviderAuthInfo`
- `config/src/types.rs:108` store 四档 · `:123` MCP OAuth 三档 · `:140` keyring 两档 · `config/src/shell_environment_policy.rs:136` `unwrap_or(true)`

#### deepseek-harness · packages/

- `credentials/credentials/README.md` 两个键空间与三条推论 · `src/types.ts` 记录联合与两个事件
- `credentials/credentials-local/README.md` 四层优先级表 · `§ Security boundary` 那句「discretion, not a boundary」
- `credentials/authorization/README.md` flow / session / interaction 的四条取舍
- `identity/anonymous-user-id/README.md` 匿名身份的存储契约与不可派生声明
- `settings/settings/README.md` `redactSecrets` 与它自曝的盲区 · `session/session-telemetry/README.md` 空瀑布

#### Claude Code · 2.1.246

- `claude --help` 的 `--bare` 段（认证分档最完整的一处原文）· `claude auth status` · `claude gateway --help`
- `bin/claude.exe` 中 `grep -a` 命中的标识符：`sandbox.credentials`（`files`/`envVars`/`sigv4`/`awsPairs`/`allowPlaintextInject`）· `injectHosts` · `customApiKeyResponses` · `apiKeyHelper` · `awsAuthRefresh` · `awsCredentialExport` · 三张拒读清单（目录 / 二级路径 / 文件名）

#### 本仓

- `packages/packs-coding/src/shell-runner.ts:38-63` `CREDENTIAL_NAME` 与头注释（为什么不匹配 `AUTH`）
- `docs/architecture/安全与审计.md` §5.3 ②（`CredentialGrant`）· §13 威胁模型表「凭证」行
- `docs/architecture/执行与恢复.md` §7.2 敏感度五档与 `secret` 的编译期约束
- `docs/architecture/运行时内核.md` §5.8 记忆写入拦截 · `ADR-0055` · `ADR-0014`

---

三家对读系列 · 第十篇 · 核验日期 2026-08-27 · 本文是时效证据，不定义 § 锚点、不定义不变量、不构成决定 · 结论进架构正文要走 ADR
