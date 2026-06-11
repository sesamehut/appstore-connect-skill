# 生态调研：ASC MCP server 与 Claude Skill

数据采集时间：**2026-06-09**。社区项目状态变化较快，引用前需要重新核对。

## 调研结论

没有发现 Apple 官方提供的 App Store Connect MCP server 或 Claude Skill。社区项目存在，但成熟度、维护状态和运行模型差异较大，不适合作为本项目的核心依赖。

本项目因此选择自建能力层：直接围绕 Apple 官方 API 契约设计请求、认证和工作流，再由 Skill 暴露给 agent。对应设计判断见 [架构总览](../architecture/overview.md)。

## 官方生态

Apple 提供的是公开 API 和相关交付工具，而不是面向 agent 的通用 ASC 工具层。现有一方工具更多服务于开发、构建、上传和 Xcode 生态。

这意味着本项目不能假设存在稳定的一方 agent 接口，需要自己定义 Skill 的能力边界、输入输出和错误反馈。

## 社区生态

社区 MCP server 和个人 Skill 可以分为三类：

| 类型 | 特点 | 对本项目的价值 |
|---|---|---|
| 覆盖型 MCP server | 尝试把大量 ASC 能力直接暴露成工具 | 可参考能力分组，但不直接依赖 |
| 轻量封装型项目 | 覆盖少量高频操作 | 可参考交互方式 |
| 代码生成或动态调用型项目 | 追求 API 覆盖面和抗变更能力 | 可参考思路，但运行边界需要谨慎 |

整体判断：社区项目适合作为调研材料，不适合作为核心运行依赖。

## 对本项目的影响

- Skill 的能力边界由本项目自己定义，不跟随某个社区 MCP 的工具列表。
- 核心逻辑放在可复用的请求层和工作流层中。
- 未来如需提供 MCP server，可在既有能力层外增加适配，不改变核心架构。

## 来源

- [Apple App Store Connect API](https://developer.apple.com/app-store-connect/api/)
- [modelcontextprotocol/swift-sdk](https://github.com/modelcontextprotocol/swift-sdk)
- [anthropics/skills](https://github.com/anthropics/skills)
