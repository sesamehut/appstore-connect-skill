# 认证实现策略

App Store Connect API 使用短期签名 JWT 访问。本文描述认证策略、协议事实和职责边界，不给出具体代码。Apple 行为核实于 **2026-06**，来源见文末。

## 协议事实

实现所依赖的 Apple 官方约束：

- 所有 JWT 必须以 **ES256** 签名；header 需携带 `alg`、`kid`（Key ID）、`typ: JWT`。
- payload 必须携带 `iss`（Issuer ID）、`iat`、`exp`、`aud: "appstoreconnect-v1"`。
- token 过期时间最长 **20 分钟**；Apple 明确建议在有效期内复用同一 token，而不是每请求重签。
- 私钥以 .p8 文件（PKCS#8、EC P-256）分发，仅可下载一次，Apple 不保留副本。
- **团队 key** 与**个人 key** 形态不同：个人 key 不用 `iss` 而要求 `sub: "user"`；个人 key 不能访问 Provisioning、销售与财务报表等端点。
- 可选 `scope` 声明可把 GET-only token 的寿命延长到最多 6 个月，但仅限少数资源。本项目不采用：Skill 场景下短期签发的复杂度足够低，不值得引入 scope 的限制与维护成本。

## 认证目标

- 对调用方隐藏签名细节，业务模块只表达业务意图。
- 凭证短期有效、在有效期内复用、过期前自动重签。
- 凭据不进入仓库、不进入日志、不出现在错误快照中。
- 权限不足、凭据失效、限流等外部失败被明确区分和上抛。

## 选型与实现策略

签名基于 **jose**（设计判断见[架构总览](../architecture/overview.md)）：.p8 私钥内容直接导入，无需格式转换；签发逻辑收敛为一个纯函数式的"凭据 → token"步骤，便于单独测试。

认证层对外只暴露"给我一个可用凭证"的语义：

1. 请求层发起 ASC 调用前，向认证层索取凭证。
2. 凭证仍在安全有效期内则直接复用。
3. 接近失效或不存在时重新签发；签发有效期取上限以内的保守值，并预留时钟偏差余量。
4. 并发请求同时触发重签时，合并为一次签发（single-flight），避免重复劳动和混乱状态。
5. ASC 仍判定凭证无效时，允许一次受控的强制重签重试；再失败则按认证错误上抛，保留原始错误类别（私钥问题、账号问题、网络问题）。

## 凭据边界

认证输入为三件：Issuer ID（团队 key）或个人 key 标识、Key ID、.p8 私钥。处理原则：

- 全部按敏感信息对待，经环境变量或不入库文件提供；本地开发与 CI 使用不同凭据来源。
- 错误信息可以说明缺少哪类凭据，但不能输出凭据值。
- 真实凭据不得出现在 fixture、快照或示例文档中；测试用无法通过 ASC 认证的假 key。

## 权限与角色

API key 的角色与团队用户角色同构（Admin、App Manager、Developer、Finance、Sales and Reports 等），角色决定可访问资源范围。项目不把权限错误包装成资源不存在或普通网络失败：

- 权限不足时，错误信息明确说明这是权限问题，并提示可能需要的角色范围。
- 个人 key 与团队 key 的能力差异（报表、Provisioning 等场景）在任务反馈中显式处理，而不是让用户面对一个含混的失败。

## 限流边界

限流是请求层的职责，不是认证层的：ASC 按 key 计算配额（默认每小时 3500 次，滚动窗口），通过 `X-Rate-Limit` 响应头暴露余量，超限返回 429。认证层不感知、不吞掉限流错误；请求层保留限流信息并交上层决定等待、退避或终止（见[请求模型与流程策略](request-model.md)）。

## 测试关注点

认证测试关注策略正确性，而不是复刻 Apple 的认证实现：

- 凭据缺失或残缺时给出明确错误。
- 凭证复用、提前重签、签发有效期上限符合预期。
- 并发触发重签时只发生一次签发。
- 认证失败、权限不足、限流三类错误可被区分。
- 日志和错误快照不泄露敏感信息。

## 来源

- [Generating Tokens for API Requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests)
- [Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)
- [Identifying Rate Limits](https://developer.apple.com/documentation/appstoreconnectapi/identifying-rate-limits)
