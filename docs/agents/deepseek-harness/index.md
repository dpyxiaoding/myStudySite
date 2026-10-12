---
date: 2026-10-11
summary: deepseek-harness 是什么、能在哪里用、本组的依据
---

# deepseek-harness 功能介绍

deepseek-harness（简称 dsh）是 DeepSeek 开源的智能体框架。它的特点是「一切皆插件」：上下文管理、压缩、工具、会话存储都是可以替换的插件，靠 Cordis 这个插件框架组装起来。本组按[智能体功能简介](/agents/overview)的清单，一项一项介绍它是怎么做的。

## 基本情况

| 项目 | 情况 |
| --- | --- |
| 出品 | DeepSeek |
| 源码 | 全部公开，MIT 许可证。主体是 TypeScript，三百多个包 |
| 使用形态 | 本地 Web 界面（`npx @deepseek-ai/dsh web`）、无界面运行、TypeScript 和 Python SDK、通过 ACP 协议接入编辑器 |
| 阶段 | 开发者预览版，项目说明里写明会有不兼容的改动 |
| 本组核对的版本 | 0.2.1-alpha.2；源码读的是 2026-10-09 的 master 分支，提交 `d743267` |

## 本组的依据

- **自带的子系统文档**（`docs/subsystems/`）和各包的 README：dsh 的文档里，类型定义由脚本保证和源码一致，可信度和源码接近。
- **源码**：文档没写到的数值、默认值以源码为准，文中写出文件路径。
- **默认打包配置**（`packages/bundle/base/cordis.patch.yml`）：因为一切皆插件，「默认装了哪些插件、参数是多少」只能看打包配置。各篇说的默认行为，指的是这份配置。

没有实际运行，数值取自源码常量和默认打包配置。放在 `packages/experimental/` 下、默认配置没有装的插件，各篇单独注明。

## 本组目录

- [全景](/agents/deepseek-harness/panorama)：在哪里用、命令和快捷键、给模型的工具、模型、扩展、并行、权限、代码审查、部署，一页列全

按功能简介的清单逐项介绍：

1. [回合循环与中断](/agents/deepseek-harness/turn-loop)
2. [上下文管理](/agents/deepseek-harness/context)

其余各项陆续补上，顺序和功能简介一致。
