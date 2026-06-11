# 生态调研：OpenAPI 代码生成与 Node 运行时栈

数据采集时间：**2026-06-11**。版本号与维护状态来自 npm registry、GitHub 与官方文档的当日核对；工具生态变化快，引用前需要重新核实。本文是[架构总览](../architecture/overview.md)技术选型的证据存档。

## OpenAPI → TypeScript 生成工具

背景事实：Apple ASC 规范为单文件 OpenAPI 3.0.1 JSON，约 6.9 MB、929 个 path、1346 个 schema（4.4 版实测）；Apple 只发布最新版，无历史归档，社区有抓取存档仓库可作升版感知信号。

| 工具 | 状态（2026-06） | 判断 |
|---|---|---|
| openapi-typescript | 7.13.0，稳定大版本，周下载 420 万+，活跃 | **选用**。types-only、单文件确定性输出；官方仓库以比 ASC 更大的 GitHub/Stripe 规范做快照测试；默认内联字面量联合，免疫 ASC 重名 enum 问题 |
| @hey-api/openapi-ts | 0.98.x，周更，周下载 297 万 | 备选。已弃用的 openapi-typescript-codegen 的官方继任者，有 ASC 规范实战记录（社区 SDK 即用它生成）；但 0.x 月度破坏性变更、多文件产物 diff 噪音大 |
| Orval / Kubb | 活跃 | 面向前端框架全家桶或自定义生成器，产物数千文件，与薄运行时方向相反 |
| swagger-typescript-api | 活跃 | 会提升命名 enum，对 ASC 重名 enum 有踩雷先例风险 |
| Speakeasy / Stainless / Fern / Kiota | 商业或带运行时抽象 | 等同引入第三方 SDK，被架构规则排除 |

ASC 规范已知坑：重名内联 enum 曾使部分生成器失败；大量 deprecated schema 深嵌于 oneOf 联合，触发过生成器过滤逻辑的边角 bug（hey-api 当日修复）。openapi-typescript 的 issue 库中无 ASC 相关未决问题。

配套件 openapi-fetch（0.17.x，约 6KB，周下载 485 万）直接消费生成的 `paths` 类型，调用点自动推断参数与响应，middleware 可挂认证——被选为请求层内核。

## JWT 签名（ES256）

| 库 | 状态（2026-06） | 判断 |
|---|---|---|
| jose | 6.2.x，活跃，零依赖，ESM-first，WebCrypto | **选用**。可直接导入 Apple .p8（PKCS#8）私钥 |
| jsonwebtoken | 9.0.3，约 2.5 年仅一次 patch，CJS-only | 实质停滞，社区一致建议新项目弃用 |
| fast-jwt | 活跃但 CJS，优化高吞吐验证 | 场景不匹配（本项目每 ≤20 分钟才签一次） |
| 手写 node:crypto | 核心 API 长期稳定 | 合法的零依赖兜底，但要自行处理签名格式与 base64url 细节 |

## HTTP 客户端与重试

- Node 原生 fetch 在所有受支持 Node 版本中已稳定；undici 维护者对库作者的建议是默认用全局 fetch 保证可移植性，仅在需要代理、连接池等 dispatcher 级控制时直接依赖 undici。
- axios 于 2026-03-31 发生供应链投毒（恶意版本在线约 3 小时），事件强化了"HTTP 层少依赖"的社区共识；got/ky 均已 ESM-only 且要求 Node ≥22。
- 重试：429/5xx/网络错误用指数退避加抖动是标准模式；几十行手写退避即可覆盖，且是可单测纯逻辑，不必引入重试库。

## Node 基线与构建

- 2026-06 的 Node 现状：20 已 EOL（2026-04-30）；22 为 Maintenance LTS（至 2027-04）；24 为 Active LTS；26 为 Current。生态 ESM 库的下限已普遍移到 22。
- 结论：`engines` 下限 22.12（ESM 包可被 CJS require 的起点），开发与 CI 主要目标 24。
- 构建：tsup 已在 README 声明停止维护并指向继任者 tsdown（Rolldown 系，仍 0.x）；Node-only 库不打包、用纯 tsc 是最可审计的路线。
- TypeScript：稳定线 6.0.x（最后一个 JS 实现的大版本）；基于 Go 的 TypeScript 7（tsgo）2026-04 进入 Beta，类型检查提速约 10 倍，语义承诺一致——大体量生成类型文件的检查成本顾虑随之消解。

## 测试

- Vitest 4.x（2025-10 发布 4.0）对 TS/ESM 零配置，coverage、watch、mock 均稳定，是 2026 年新 ESM 库的共识选择。
- node:test 的 runner 与快照已稳定，但 coverage、watch 仍为 experimental，module mock 需要 flag——测试密度高的项目摩擦明显。
- HTTP 边界 mock：undici MockAgent 与原生 fetch 同源，可拦截全局 fetch 并断言未消费的拦截器；注意 devDependency 的 undici 主版本需与 Node 内置版本对齐。msw 适合需要跨场景复用 handler 时再引入；nock 已不是 fetch 时代的默认推荐。

## 后续复核点

- openapi-fetch、tsdown 仍为 0.x，升级需钉版本并关注 changelog。
- TypeScript 7 稳定版发布后评估切换。
- Node 22 于 2027-04 EOL 时把基线提到 24。

## 来源

- openapi-typescript / openapi-fetch：<https://openapi-ts.dev/>、<https://github.com/openapi-ts/openapi-typescript>
- Hey API：<https://heyapi.dev/>、<https://github.com/hey-api/openapi-ts>
- ASC 规范社区存档：<https://github.com/EvanBacon/App-Store-Connect-OpenAPI-Spec>
- jose：<https://github.com/panva/jose>
- undici（库作者指引讨论）：<https://github.com/nodejs/undici/discussions/4595>
- axios 供应链事件：<https://www.tenable.com/blog/faq-about-the-axios-npm-supply-chain-attack-by-north-korea-nexus-threat-actor-unc1069>
- Node 生命周期：<https://endoflife.date/nodejs>、<https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule>
- Vitest 4：<https://vitest.dev/blog/vitest-4>
- tsup 弃维护声明：<https://github.com/egoist/tsup>；tsdown：<https://tsdown.dev/>
- TypeScript 6.0 / 7 Beta：<https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/>、<https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/>
