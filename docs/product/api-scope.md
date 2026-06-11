# 产品范围：App Store Connect 自动化

本文定义本 skill 的产品边界。它用于判断哪些 App Store Connect 工作流适合由 agent 自动化，哪些必须交回网页端或其他 Apple 工具。

数据采集时间：**2026-06**。实现前应按 Apple 官方文档和 OpenAPI spec 复核。

## 问题背景

App Store Connect 覆盖发布、测试、销售、报表、评论和账号管理等多个工作面。网页端可以完成大多数操作，但很多重复性任务适合自动化，例如批量读取元数据、准备送审材料、下载报表、整理评论和维护测试人员。

公开 REST API 覆盖面很广，但不是网页端的完整镜像。部分合同、财务、法务和审核沟通能力仍只能在网页端处理。因此，本 skill 需要从一开始就把“可自动化能力”和“必须人工网页端处理的能力”分清楚。

## 产品目标

- 为 agent 提供可组合的 ASC 自动化能力。
- 优先覆盖发布、元数据、TestFlight、报表、评论等高频工程流程。
- 对 API 不支持、权限不足、账号条件不满足的场景给出明确反馈。
- 避免把网页端内部能力或二进制上传链路误包装成普通 REST 能力。

## 能力分组

| 分组 | 产品判断 |
|---|---|
| 应用与版本管理 | 作为核心能力，覆盖元数据、本地化、版本状态和送审准备 |
| TestFlight | 作为核心能力，覆盖测试分发、测试员和反馈读取 |
| 商业化资源 | 作为扩展能力，覆盖内购、订阅、价格、优惠和地区可用性 |
| 营销资源 | 作为扩展能力，覆盖自定义产品页、应用内事件和产品页实验 |
| 媒体素材 | 作为核心工作流，单独处理截图和预览素材上传 |
| 报表与分析 | 作为核心工作流，单独处理下载、解析和权限提示 |
| 评分与评论 | 作为核心能力，覆盖读取和开发者回复 |
| 组织与访问 | 作为受限能力，覆盖公开 API 支持的用户和角色管理 |
| Provisioning | 作为受限能力，覆盖公开 API 支持的证书、标识和配置材料 |
| Xcode Cloud 与 Webhooks | 作为后续集成能力，根据具体需求推进 |
| EU 替代分发 | 作为条件能力，依赖账号资格和业务条款 |

## 首期建议范围

首期优先覆盖工程价值高、边界清晰、容易验证的能力：

- 应用、版本、元数据和本地化管理。
- 截图和预览素材工作流。
- 送审准备与发布配置。
- TestFlight 基础管理。
- 销售、财务和分析报表工作流。
- 评论读取与开发者回复。

暂缓实现：

- build 二进制上传。
- Webhooks 接收端。
- Xcode Cloud 深度集成。
- EU 替代分发完整流程。
- 产品页实验结果分析。

## 明确不支持

- 协议、税务、银行和收款账户管理。
- 审核沟通中心中的往来消息。
- 创建或下载新的 ASC API key。
- 依赖网页端内部接口的能力。
- 需要网页会话而不是 ASC API key 的能力。

## 设计要求

- Skill 输出应区分“Apple API 不支持”和“本项目暂未实现”。
- 需要网页端完成的动作，应给出明确前置条件或人工处理说明。
- 多步骤文件流程应作为任务流程呈现，而不是伪装成普通资源请求。
- 权限不足时，应提示权限问题和可能需要的角色范围。

## 来源

- [App Store Connect API](https://developer.apple.com/app-store-connect/api/)
- [App Store Connect API Release Notes](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-release-notes)
- [Analytics Reports API](https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api/)
