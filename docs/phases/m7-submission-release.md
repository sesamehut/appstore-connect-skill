# M7 送审准备与发布配置 — 阶段计划

本文是 [Roadmap](roadmap.md) 中 M7 阶段的 **送审准备与发布配置部分**详细计划，承接 [M7 TestFlight](m7-testflight.md) 之后、补齐产品首期六项能力的最后一项：**送审材料检查、版本送审提交、发布时机配置与手动发布触发**。这是首期范围内把"准备 → 送审 → 发布"闭环走通的能力面，用来检验[架构总览](../architecture/overview.md)中能力层与工作流层的边界在"只读预检 + 多步状态推进式提交 + 多个高副作用不可逆触发"组合下同样成立。策略依据为[请求模型与流程策略](../implementation/request-model.md)的请求构造一节、[Skill 入口与 CLI 策略](../implementation/skill-interface.md)的输出口径与破坏性操作立场、以及[产品范围](../product/api-scope.md)对"可自动化能力 vs 必须网页端处理"的硬性区分。Apple 行为核实于 **2026-06**。

## 目标与退出标准

来自 Roadmap（M7"TestFlight 与送审准备"，本阶段承接其中送审准备一半）：

- [产品范围](../product/api-scope.md)首期列出的六项能力全部可经 Skill 调用——本阶段交付其中的 **送审准备与发布配置**这一项，完成 M7 能力闭环。
- 每项能力有任务级反馈与错误提示；送审就绪预检在真正提交前以结构化方式列出缺失项。
- 区分"Apple API 不支持"与"本项目暂未实现"：legacy `appStoreVersionSubmissions` 的创建/读取被 Apple 移除，归为退出码 6；本期刻意延后但 Apple 支持的能力（分阶段发布写、年龄分级写、出口合规声明文档上传）归为退出码 5。

## 范围与非目标

**范围**（范围决策已于 2026-06-13 由产品 owner 确认，取 A2/B2/C1/D1/E2/F2/G2，理由见下文"决策与理由"）：送审就绪预检（preflight，只读：读版本 `appVersionState`、附着的 `build` 与其 `usesNonExemptEncryption`、各必填本地化是否非空、`appStoreReviewDetail` 是否存在、`ageRatingDeclaration` 是否存在并取值，聚合为结构化 `blockers[]`，**不复刻 Apple 服务端校验矩阵**——决策 A 取 A2 中档）；App Store 审核材料（`appStoreReviewDetails` 的按版本 find-or-create 读 + 设：联系人、演示账号、审核备注，**不含审核附件上传**——决策 G 取 G2）；发布时机配置（`appStoreVersions` PATCH 设 `releaseType`（`MANUAL`/`AFTER_APPROVAL`/`SCHEDULED`）、`earliestReleaseDate`、`downloadable`，并设/换版本的 `build` 关系——低/零副作用）；出口合规薄写（PATCH `build.usesNonExemptEncryption` 布尔——决策 E 取 E2，覆盖 80% 常见路径）；现代送审提交（`reviewSubmissions` 容器 + `reviewSubmissionItems`（`appStoreVersion` 项）+ PATCH `submitted=true`，组装为工作流，高副作用 `--force` 门控）；送审撤回（PATCH `canceled=true`，高副作用 `--force`——决策 C 取 C1）；送审状态只读（`reviewSubmissions` 集合（按 app 必带 filter）/单读、`reviewSubmissionItems` 经父集合读、版本的 `appStoreVersionSubmission`/`appVersionState` 关系读）；手动发布触发（POST `appStoreVersionReleaseRequests`，高副作用 `--force`——决策 F 取 F2）；分阶段发布只读（在 preflight/status 中呈现 `phasedReleaseState`/`currentDayNumber`，不提供写——决策 B 取 B2）；CLI `submission` 顶层域（替换既有 planned stub）；冒烟脚本的 `ASC_SMOKE_SUBMISSION` 只读/可逆步骤；registry/SKILL.md/barrel/docs 更新。

**非目标**（刻意排除）：

- **不做 build 二进制上传**——与整个 M7 一致的硬性排除；送审一律围绕**已上传、已处理、已合格**的构建展开（Sonara version-8 构建为 `VALID`/`APP_STORE_ELIGIBLE`）。
- **不混淆 beta 审核与正式上架审核**——TestFlight 的 `betaAppReviewSubmission` 与 App Store 的 `reviewSubmissions` 是两套资源、两条审核链路。重申 [M7 TestFlight](m7-testflight.md) 非目标，保持两半一致。
- **不暴露 legacy `appStoreVersionSubmissions` 的创建/读取**——契约确认该资源整体 `@deprecated`，且**不存在** `AppStoreVersionSubmissionCreateRequest`，仅剩一个 `@deprecated` 的实例 DELETE。这是 Apple **移除**（非本项目未实现），归退出码 6，任何 legacy 送审请求一律路由到 `reviewSubmissions`。
- **不做审核沟通 / Resolution Center**——已在 [产品范围](../product/api-scope.md) 明确不支持，重申为边界，agent 不应尝试"回复拒绝"。
- **不做 IDFA / App Clip / nominations / featuring / 自定义产品页 / 应用内事件 / 实验送审项**——`reviewSubmissionItems` 可携带多种内容关系（`appStoreVersion`、`appCustomProductPageVersion`、`appEvent`、`appStoreVersionExperiment(V2)`、`backgroundAssetVersion`、若干 `gameCenter*Version`），首期只携带 `appStoreVersion` 一种项。
- **不做出口合规声明文档上传**——`appEncryptionDeclarationDocuments` 是另一套 upload-like 多部分流程，与被延后的上传家族同属一类；出口合规仅做读侧预检 + `usesNonExemptEncryption` 布尔写（决策 E）。
- **不做年龄分级问卷的写入**——`ageRatingDeclarations` PATCH **受 Apple 支持**（故延后是退出码 5、非退出码 6，须标注正确），但问卷是随 Apple 政策漂移的大面积写表面，首期只读其存在性/取值进 preflight，写延后 M9（决策 D）。
- **不做分阶段发布的写控制**——`appStoreVersionPhasedReleases` 的 POST/PATCH/DELETE 受支持（故延后是退出码 5），但 pause/resume/complete 一个正在进行的公开放量属更高风险的发布运维，与其他发布工具一起留 M9；首期只读其状态完成 status 全景（决策 B）。
- **不做发布指标 / 时序看板**——不在分阶段放量进度上叠加 analytics，镜像 [M7 TestFlight](m7-testflight.md) 对指标的非目标立场。

## 关键发现

- **现代送审 = `reviewSubmission` + `reviewSubmissionItem`，且"提交"是一次 PATCH 而非独立端点。** 组装链路为：POST `/v1/reviewSubmissions`（关系 `app` 必填，**不**指名版本——容器是按平台作用域的应用级容器）→ POST `/v1/reviewSubmissionItems`（关系 `reviewSubmission` 必填 + 恰好一个内容关系，本期为 `appStoreVersion`）→ PATCH `/v1/reviewSubmissions/{id}` 置 `attributes.submitted=true` 真正进入 App Review。没有"submit"子资源，`state` 只读派生（`READY_FOR_REVIEW`/`WAITING_FOR_REVIEW`/`IN_REVIEW`/`UNRESOLVED_ISSUES`/`CANCELING`/`COMPLETING`/`COMPLETE`），靠 `submitted`/`canceled` 两个布尔间接驱动。

- **legacy `appStoreVersionSubmissions` 已被 Apple 收缩到只剩一个 `@deprecated` DELETE。** 契约里 `AppStoreVersionSubmission`/`...Response` 整体 `@deprecated`，且 grep **无任何** `AppStoreVersionSubmissionCreateRequest`，唯一存活操作是实例 DELETE（亦 `@deprecated`）。这是本期最干净的"Apple 不支持（退出 6）vs 本项目未实现（退出 5）"分界例证：旧的"按版本直接送审"不是没实现，是 Apple 移除了。

- **Apple 并不强制"每应用/平台仅一个开放送审"。** 上限是**每平台至多 2 个并发送审**：一个含应用版本的送审，外加一个仅含 items（实验/IAE/自定义产品页）的送审；不同平台不可混入同一送审；内购/订阅走独立送审流程不能与版本捆绑。这推翻了"单容器"假设——find-or-create 一个送审容器时不能假定全局唯一，须按版本项是否已在某未提交容器中来幂等。

- **发布时机配置在版本上，不在送审上。** `releaseType`（`MANUAL`/`AFTER_APPROVAL`/`SCHEDULED`）、`earliestReleaseDate`、`downloadable` 都是 `appStoreVersion.attributes`，经 `AppStoreVersionUpdateRequest` 在版本可编辑时 PATCH；`build` 关系也在此处设。`MANUAL` 在批准后停在 `PENDING_DEVELOPER_RELEASE` 等手动触发；`SCHEDULED` 在批准后不早于 `earliestReleaseDate` 自动发布；`AFTER_APPROVAL` 批准即发布。

- **手动发布 = POST `/v1/appStoreVersionReleaseRequests`（建资源，非 PATCH）。** 资源本身无属性，`CreateRequest` 仅 `relationships.appStoreVersion` 必填。这是 `MANUAL` + `PENDING_DEVELOPER_RELEASE` 下的"立即发布"按钮，fire-and-forget，按异步受理（"accepted"信封）建模，高副作用、`--force`、绝不冒烟。

- **版本状态有新旧两套词汇，且都只读派生。** `appStoreState`（`AppStoreVersionState`）整字段 `@deprecated`，现行用 `appVersionState`（`AppVersionState`，含 `PREPARE_FOR_SUBMISSION`/`WAITING_FOR_EXPORT_COMPLIANCE`/`READY_FOR_REVIEW`/`WAITING_FOR_REVIEW`/`IN_REVIEW`/`PENDING_DEVELOPER_RELEASE`/`PENDING_APPLE_RELEASE`/`READY_FOR_DISTRIBUTION` 等，**无** `READY_FOR_SALE`——是 distribution 词汇）。preflight 以 `appVersionState` 为准（过滤用 `filter[appVersionState]`、非弃用的 `filter[appStoreState]`），两者皆不可写。

- **没有 `MISSING_*` API 状态可读——就绪须自行派生。** 契约的各状态枚举均不暴露 `MISSING_METADATA`/`MISSING_SCREENSHOT` 之类值，那些是 App Store Connect 网页端的校验提示而非 API 状态。preflight 必须从 `appVersionState`、是否有 `VALID`/合格 build 关系、`build.usesNonExemptEncryption` 是否设值、`appStoreReviewDetail` 是否存在、`ageRatingDeclaration` 是否存在并完整，综合派生 `blockers[]`，而非读单一"MISSING_X"字段。

- **出口合规信号在 Build 上，不在版本上。** `Build.attributes.usesNonExemptEncryption`（布尔）是出口合规信号；契约**不存在** `exportComplianceUsesEncryption` 字段。`BuildUpdateRequest` 可写 `usesNonExemptEncryption`，并可经 `BuildUpdateRequest.relationships.appEncryptionDeclaration` 关联声明（取代已弃用的 `/appEncryptionDeclarations/{id}/relationships/builds` POST）。Sonara 构建已是 `usesNonExemptEncryption=false`，故声明流常态为 no-op；首期只暴露布尔写。

- **年龄分级是 app-info 作用域，不是版本作用域，且 PATCH-only。** `AgeRatingDeclaration` 挂在 `appInfo`（经 `GET /v1/appInfos/{id}/ageRatingDeclaration`，id 须先经 `GET /v1/apps/{id}/appInfos?include=ageRatingDeclaration` 解析），**无 create/delete/collection**，随 app-info 自动存在。它不出现在任何 `appStoreVersions` 的 field/include 列表里。preflight 须从 app-info 侧而非版本侧取它。`ageRatingOverride` 已弃用，现行 `ageRatingOverrideV2`（`EIGHTEEN_PLUS` 取代 `SEVENTEEN_PLUS`）。

- **一个集合带"省略即编译错误"的必带 filter。** `reviewSubmissions_getCollection` 的 `filter[app]` 在契约里为非可选数组——能力签名须把 app id 设为必填参数。其余在用的集合 filter（`filter[platform]`/`filter[state]`、版本侧 `filter[appVersionState]` 等）均可选。注意列版本走 `apps_appStoreVersions_getToManyRelated`，app 是路径 id 而非 filter。

- **撤回是 PATCH `canceled=true`，且语义有代价。** 撤回使版本变 Developer Rejected，已 Accepted 的项须重提交，重提交从头复审；可撤回窗口为 Waiting for Export Compliance / Waiting for Review / In Review / Pending Developer Release / Pending Apple Release。`IN_REVIEW` 后除撤回外无 PATCH 可改项——"提交后编辑送审项"属 Apple 不支持。`reviewSubmissionItems` 可单独 DELETE 或 PATCH（`removed`/`resolved` 布尔，非只读 `state`）。

## 决策与理由

**范围决策已定档（2026-06-13）**：预检中档（A2）、分阶段发布只读（B2）、撤回纳入并门控（C1）、年龄分级只读（D1）、出口合规布尔写（E2）、发布侧配置 + 手动发布触发（F2）、审核材料不含附件上传（G2）。下文逐条展开理由。

**送审组装是工作流，预检与其余读写是能力层。** "开容器 → 加版本项 → PATCH `submitted=true`"是典型多步状态推进，按架构边界整体属工作流层（镜像 `workflows/beta-distribution.ts` 的 ensure/编排），能力层只持有各 POST/PATCH/GET 单请求；CLI 单次调用工作流。预检（preflight）虽聚合多次读，但它**不推进任何状态**、只读派生一个就绪报告，本质是"多读聚合为一个结构化摘要"——同样落工作流层（与反馈下载、报表编排同构），其各分项读复用能力层。其余（审核材料读/设、发布配置 PATCH、出口合规布尔、送审/版本状态读、手动发布触发、撤回）都是标准单请求读写，落 `src/capabilities/` 若干资源文件。

**两个高副作用不可逆写经 `--force` 门控，且一律排除真机冒烟。** 提交 App Store 审核（PATCH `reviewSubmissions submitted=true`，对 Apple 真人审核启动正式审核）与手动发布到公开（POST `appStoreVersionReleaseRequests`，把已批准版本推上架）是本期两个 canonical 高副作用动作，连同撤回（PATCH `canceled=true`，破坏队列位置、强制重审、版本翻 Developer Rejected）一并 `--force` 门控、绝不进 `ASC_SMOKE_SUBMISSION`——延续 M4 评论回复、M6 预览上传、M7 TestFlight 提交/过期刻意不冒烟的一贯立场。`requireForce` 是 `run()` 第一行、先于 `await cli.client()`，故缺 `--force` 是零网络成本的退出 64。误把任一漏进冒烟会触发真实审核或真实上架，是本期最大风险，写进冒烟脚本注释、SKILL.md conventions 与本文。

**避开 deprecated 路径，正面区分退出码 5 与 6。** 送审一律走 `reviewSubmissions`，绝不暴露 legacy `appStoreVersionSubmissions` 的创建/读取——后者被 Apple 移除（无 CreateRequest），归 `API_UNSUPPORTED`/退出 6；"提交后编辑送审项（撤回除外）"、"un-cancel / 复活已撤回送审"、"回复拒绝（Resolution Center）"同归退出 6。反之，本期延后但 Apple 支持的能力（分阶段发布写、年龄分级写、出口合规声明文档上传、其他送审项类型）保持"本项目未实现"语义，**不得**误emit退出 6——它们的契约 POST/PATCH 都存在，延后是产品取舍而非 Apple 边界。

**预检做中档（A2），surface why-not 而不复刻 Apple 矩阵。** preflight 在"只读版本态 + 列附着 build"（浅）之上，进一步检查各必填本地化字段非空、review-detail 存在、age-rating 存在、出口合规已决，输出结构化 `blockers[]`（如 `MISSING_REVIEW_DETAIL`/`MISSING_BUILD`/`MISSING_AGE_RATING`/`BUILD_EXPORT_COMPLIANCE_UNSET`/`VERSION_NOT_EDITABLE`），但**不**复刻 Apple 服务端的逐地区/逐 locale/截图尺寸完备性校验——后者不透明且随 Apple 漂移，与 M7 TestFlight 拒做招募条件自动推断同一"薄、可审计、不重造 Apple 矩阵"哲学。preflight 是只读的，可冒烟，是提交前的 advisory，不是提交的硬前置（真正的硬前置由 ASC 在 PATCH `submitted=true` 时返回 STATE_ERROR，自然走错误归一）。

**审核材料按版本 find-or-create，发布配置走既有版本 PATCH。** `appStoreReviewDetails` 是按 `appStoreVersion` 的单例：set 动词以 `--version` 为键，先经 `GET /v1/appStoreVersions/{id}/appStoreReviewDetail` 读现有 detail（拿到 detail id），存在则 PATCH、不存在则带 `relationships.appStoreVersion` POST——镜像 `builds beta-detail set` 的"先读后按 id PATCH"与 M6 localization 的 find-or-create，不守卫 TOCTOU 并发双建。发布配置（`releaseType`/`earliestReleaseDate`/`downloadable`/`build` 关系）复用 metadata 层已触碰的 `appStoreVersions` PATCH 资源，是低/零副作用、无需 `--force`。出口合规布尔走 `builds beta-detail` 同款"读 build → PATCH `usesNonExemptEncryption`"（或直接按 build id PATCH），不开声明文档上传流程。

**异步受理用"accepted"口径，不预校验 Apple 可编辑态矩阵。** 提交/撤回/手动发布的服务端推进是异步的（PATCH/POST 返回后 `state` 可能短暂滞后），信封按"已受理"建模，不断言即时读回（沿用 M7 TestFlight 异步删与 M5 报表口径）。版本不可编辑、出口合规缺失、年龄分级不全等 STATE_ERROR 一律由请求层在响应边界归一为既有错误类自动透传，**不**在客户端预校验 Apple 的可编辑态矩阵（沿用 M4/M6 "无客户端矩阵可校"的有意立场）。本地校验（`CliUsageError`/退出 64）只用于无需网络即可判定者：缺 `--force`、空属性集、坏枚举/日期格式、`reviewSubmissionItems` 的"恰好一个内容关系"约束、必填 `--app`/`--version`/`--id` 缺失。

**复用既有信封/错误/分页助手，不新增错误家族。** 全部读写复用 `documentEnvelope`/`listEnvelope`/`emitResult`、`readPaged`、`expectDocument`、`requireForce`/`forceArg`、`collectAttributes`/`attributeArgs`；纯副作用无文档者（撤回、手动发布的受理）直接 emit `{ ok:true, command, data:{...} }`。错误一律复用既有类（`AscNotFoundError` 用于按版本无 review-detail/无送审、`AscInvalidParameterError` 用于欠定多命中、STATE_ERROR 经归一路径）；本期**不新增错误类别**，故 `mapAscErrorToExit` 与 hint 表无须扩展。Apple 不支持的任务经 `UnsupportedByApiError`（退出 6）从 `API_UNSUPPORTED` 表驱动，未实现经 registry `implemented:false`（退出 5）。

**`submission` 建为顶层域，替换 planned stub。** registry 既有 `submission` 占位（`{ implemented:false, milestone:"M7" }`）翻为 `{ implemented:true }` 并细化 summary 为实际动词列表；root 引入真实 `submissionCommand` 替换 `plannedDomain("submission")`。这是最后一个 planned 域——一旦无 planned 域，`PlannedMilestone`/`makePlannedCommand`/`planned.ts` 失去消费者：保留为 M8+ 扩展点（无害）或随 registry 类型一并清理，本期默认保留。

## 实机核实记录

实施中对真实 ASC 行为的核实结果将逐项落档。账号：Sonara `6761486081`（草稿版本 1.1.2 处 `PREPARE_FOR_SUBMISSION` 可编辑，version-8 构建 `VALID`/`APP_STORE_ELIGIBLE`、`usesNonExemptEncryption=false`）。下表为待核实项（每项写明核实什么、为何要核实）：

| # | 核实项 | 为何要核实 |
|---|---|---|
| 1 | 提交是否严格 `POST reviewSubmissions` → `POST reviewSubmissionItems(version)` → `PATCH submitted=true` 三步，还是加项即自动 arm？ | 决定送审工作流的步序与"提交"边界（待核实） |
| 2 | `submitted=true` PATCH 在不完整版本上是否返回结构化 `MISSING_*` JSON:API 错误码？ | 决定 preflight 与提交失败 hint 能否引用 Apple 的结构化阻断码；API 参考页 JS 渲染、契约无（待核实） |
| 3 | `DELETE /v1/reviewSubmissions/{id}` 是否被接受，还是 `PATCH canceled=true` 是唯一撤回路径？ | 契约只见 PATCH、无同级 DELETE；决定撤回动词实现（默认 PATCH 为正，待核实） |
| 4 | 加/删送审项的精确前置：哪些 `reviewSubmission.state` 仍接受 item 的 create/delete？ | 决定工作流在已存在容器上的幂等与可加项窗口（待核实） |
| 5 | 年龄分级完整 + 出口合规是在 *create-item* 时强制，还是仅在 *submit* 时强制？ | 决定 preflight 阻断项是 advisory 还是会更早被 ASC 拒（待核实） |
| 6 | `appStoreReviewDetail` 存在模型：每版本自动存在（提交前即可读）还是送审上下文创建后才有？ | 决定 set 是否需处理首读 404 → POST（镜像 TestFlight #12，待核实） |
| 7 | `PREPARE_FOR_SUBMISSION` + `VALID` build 是否需显式 `appEncryptionDeclaration` 关联，还是 `usesNonExemptEncryption=false` 足够？ | 决定出口合规 preflight 深度（平行 TestFlight #10，待核实） |
| 8 | 重提交（拒后）流程：新 POST `reviewSubmissions` vs 自动复活；旧 `REJECTED`/`CANCELING` 容器是否仍可读？ | 决定提交/撤回的重提交文案（待核实） |
| 9 | `appStoreVersionReleaseRequests` POST 前置（是否要求版本 `PENDING_DEVELOPER_RELEASE`/已批准）、异步受理码、不可逆性 | 决定手动发布前置校验与"accepted"信封（待核实） |
| 10 | 撤回时序：`PATCH canceled=true` 后多久 `state` 反映 `CANCELING`→出审？ | 决定撤回信封是"已受理"还是可断言即时一致（待核实） |
| 11 | 并发送审上限（每平台至多 2，含版本 1 + items 1）在 API 侧的实际拒绝形态 | 决定容器 find-or-create 的幂等与多命中处理（待核实） |
| 12 | 提交/发布/撤回所需的 ASC 角色（App Manager vs Admin vs Developer）？ | 决定权限错误指引，类比 TestFlight #19 / M5 财务 403（待核实） |

### 核实结果（2026-06-14 实施 + 对抗审查 + 可逆冒烟）

实施流水线（均经 workflow 交付、manager 独立复核）：实施（能力/工作流/CLI/测试）→
7 维对抗式审查（7 确认 / 1 淘汰）→ 修复 + 独立复验（5 项全 CLOSED）→ 真机可逆冒烟 +
只读 CLI 走查。`npm run check` 全绿（475 tests / 48 files）、`npm run build` 绿、生成契约零改动、
运行时依赖仍为 jose/openapi-fetch/citty 三个。对抗审查的 1 个 HIGH 缺陷为
`review-detail get/set` 把 `demoAccountPassword` 原样回显到 stdout（同源问题亦存在于已交付的
TestFlight `review-detail`）；以单点 redactor（`src/cli/review-detail-redaction.ts`）收敛修复，
覆盖 submission + TestFlight 两域的全部 get/set 输出点，password 以存在标志
`demoAccountPasswordSet` 取代。

真机核实（Sonara `6761486081`，草稿版本 1.1.2 `9abbcabf…` 处 `PREPARE_FOR_SUBMISSION`）：

| # | 状态 | 真机结果 |
|---|---|---|
| 6 | 部分确认 | 真实版本 1.1.2 存在 `appStoreReviewDetail`（`…f1ef`），经版本侧 to-one 可读；因已存在 detail，首读 404 → POST 分支未能真机触发（离线测试覆盖）。 |
| 9 | 部分确认（可逆面） | `releaseType` set→restore（`MANUAL → AFTER_APPROVAL → MANUAL`）经 `updateAppStoreVersionRelease` PATCH 真机可逆、读回一致。release-request POST 的前置/受理码/不可逆性属高副作用，绝不冒烟。 |
| 11 | 部分确认 | `reviewSubmissions` list（`filter[app]` 必填）真机返回 6 个 `COMPLETE` 容器，find-or-create 扫描可读真实容器；每平台 2 并发的实际拒绝形态需真实提交方能触发，未冒烟。 |
| 12 | 部分确认 | 本团队 key 读全部送审资源零 403（送审读角色在位），且 `releaseType` PATCH 成功（版本写角色在位）；submit/release/cancel 写角色未测（高副作用）。 |
| — | 已确认（preflight） | 1.1.2 `submittable=false`、`blockers=[MISSING_BUILD]`（build 未附着），review-detail/age-rating/localization 均无 blocker（均在场）→ 阻断推导真实有效、无误报。 |
| — | 已确认（安全/HIGH 修复） | 真实 detail `…f1ef` 配有 demo 密码：CLI `review-detail get` 输出剥离 `demoAccountPassword`、仅留 `demoAccountPasswordSet=true`，联系信息与 demo 账号名保留可用。 |
| — | 已确认（FIX 4） | `release-config set --earliest-release-date 2026-07-01`（裸日期）真机 exit 64、stdout 空、零网络。 |
| — | 已确认（门控） | `submission submit`（缺 `--force`）真机 exit 64、stdout 空、零网络。 |

仍待真机（均为高副作用，绝不自动冒烟，需监督式走查——提交会触发真实 Apple 审核）：#1/#2/#4/#5/#8/#10
（提交-撤回-重提交时序与结构化 `MISSING_*` 错误码）。设计取定：#3 撤回用 `PATCH canceled=true`
（契约无同级 DELETE）；#7 出口合规用 `usesNonExemptEncryption` 布尔（未真机对比 `appEncryptionDeclaration`）。

## 验证清单

- [x] 能力层离线集成测试：`reviewSubmissions` create（关系 `app`）/集合（`filter[app]` 必带）/单读/PATCH（`submitted`/`canceled` 布尔，非只读 `state`）；`reviewSubmissionItems` create（`reviewSubmission` + 恰好一个内容关系、本地"多于一个内容关系即退出 64"约束）/DELETE/PATCH（`removed`/`resolved`）；`appStoreReviewDetails` 按版本 find-or-create（首读 404 → POST、存在 → PATCH）；`appStoreVersions` 发布配置 PATCH（`releaseType`/`earliestReleaseDate`/`downloadable`/`build` 关系）；`builds` `usesNonExemptEncryption` 布尔 PATCH；`appStoreVersionReleaseRequests` create（关系 `appStoreVersion`、异步"accepted"口径）；版本侧 `appStoreReviewDetail`/`appStoreVersionSubmission`/`appStoreVersionPhasedRelease`/`build` to-one 读；app-info 侧 `ageRatingDeclaration` 解析读。
- [x] 工作流离线集成测试：送审组装（开容器 → 加版本项 → PATCH `submitted=true`）的步序与 body 断言、不注册多余请求即证幂等、async-accept 不断言即时读回；preflight 聚合读 → 结构化 `blockers[]`（缺 build/缺 review-detail/缺 age-rating/出口合规未设/版本不可编辑各分支）、只读不写、含分阶段发布只读字段；撤回与手动发布的"accepted"信封。
- [x] CLI 离线测试：arg 校验（缺 `--force` 于 submit/release/cancel、空属性集、坏 `releaseType`/日期格式、`reviewSubmissionItems` 多内容关系、缺必填 `--app`/`--version`/`--id`）→ 退出 64 不触网；成功信封 `resolved` 链充实（含 `submitted:true`/`canceled:true`/释放版本 id）、列表信封 `pagination.scope`、preflight 信封 `blockers[]` 形态；legacy `appStoreVersionSubmissions` 创建/读取路由到退出 6 文案。
- [x] 退出码映射覆盖：`UnsupportedByApiError`→6（legacy 送审创建、提交后编辑、Resolution Center）、`implemented:false` 残留分支→5（若任何子能力本期落空）、STATE_ERROR 经归一→3、`CliUsageError`→64；复用既有错误类，`mapAscErrorToExit`/hint 表零扩展断言。
- [x] `npm run check` 全绿；生成契约零改动；零新增运行时依赖（仍为 jose/openapi-fetch/citty 三个）。
- [x] 真实账号只读/可逆冒烟（`ASC_SMOKE_SUBMISSION=1`）：在 Sonara 草稿版本 1.1.2 上跑 preflight、读 `appStoreReviewDetail`、读现有 `reviewSubmissions` 状态、读分阶段发布只读字段、set+restore `releaseType`（可逆 PATCH，同 promotionalText restore 套路）；无数据/权限不足按报告性跳过；**绝不冒烟** submit / release / cancel。
- [x] 监督式 Skill 只读/可逆走查（已于 2026-06-14 完成）：经完整 CLI 信封跑通 preflight → 读 review-detail（含 redaction 验证）→ set+restore releaseType → 读送审状态。
- [ ] 有记录的高副作用走查（**延后**，非阻塞）：在受控前提下提交一次送审或触发一次发布（使用 `--force`）——会触发真实 Apple 审核/即时上架，需用户显式 opt-in 与真实风险评估后方可执行；同 TestFlight 的高副作用走查处理。

## 实现分解

### 新增/变更文件与职责

能力层（`src/capabilities/`）：

- `review-submissions.ts` — `reviewSubmissions` 的 list（`filter[app]` 必填）/get/create（关系 `app`）/PATCH（`submitted`/`canceled`）；`reviewSubmissionItems` 的 create（`reviewSubmission` + 一个内容关系）/delete/PATCH（`removed`/`resolved`）与经 `/reviewSubmissions/{id}/items` 的子读。状态类型经 `components["schemas"]["ReviewSubmission"]["attributes"]["state"]` 派生（契约为内联枚举、无命名 schema）。
- `app-store-review-details.ts` — `appStoreReviewDetails` 的按版本 find-or-read（经版本侧 to-one）/create/update（联系人、演示账号、备注；不含附件）。
- `app-store-versions-release.ts`（或并入既有版本能力文件） — `appStoreVersions` 发布配置 PATCH（`releaseType`/`earliestReleaseDate`/`downloadable`/`build` 关系）、`appStoreVersionReleaseRequests` create；新增 `getAppStoreVersion(id)`（当前缺，按 `getApp` 模板补，返回完整 `*Response` 以支 include）与版本侧 to-one 读（`appStoreReviewDetail`/`appStoreVersionSubmission`/`appStoreVersionPhasedRelease`/`build`）。
- `export-compliance.ts`（薄） — `builds` 的 `usesNonExemptEncryption` 布尔 PATCH（出口合规薄写）；读侧复用既有 build 读。
- `age-rating.ts`（只读） — 经 `apps/{id}/appInfos?include=ageRatingDeclaration` 解析并读 `ageRatingDeclaration`（供 preflight；本期不写）。

工作流层（`src/workflows/`）：

- `submission-assembly.ts` — `submitVersionForReview`（开容器 → 加版本项 → PATCH `submitted=true` 的状态推进编排，async-accept）、`cancelReviewSubmission`（PATCH `canceled=true`）、`releaseVersionNow`（POST `appStoreVersionReleaseRequests`，受理口径）。各自承载高副作用，门控由 CLI 层 `requireForce` 兜。
- `submission-preflight.ts` — `preflightVersionSubmission`：聚合读版本态 + 附着 build + 各必填本地化 + review-detail + age-rating + 出口合规 + 分阶段发布只读字段 → 结构化 `{ submittable, blockers[], snapshot }`，只读不写。

CLI 层（`src/cli/`）：

- `commands/submission.ts` — `submission` 顶层组，subCommands：`preflight`/`review-detail`/`release-config`/`export-compliance`/`submit`/`cancel`/`status`/`release`。
- `commands/submission-status.ts`、`commands/submission-release.ts` 等 leaf 文件（按子树体量拆分，沿用 builds/testflight/metadata 拆法）。
- 复用 `commands/testflight-shared.ts` 的 `forceArg`/`requireForce`/`requireIdList` 与 `commands/metadata-shared.ts` 的 `attributeArgs`/`collectAttributes`/`fromJsonArg`，不复制。

### CLI 域树（标注副作用动词与其确认旗标）

```
submission
  preflight        --version [--app]                          [只读：就绪检查，输出 blockers[]]
  status           --app [--state --platform] --all/--max-items/--page-limit  [只读：列送审]
                   | get <submissionId> --include app,items,appStoreVersionForReview
  review-detail    get --version | set --version --contact-* --demo-account-* --notes
  release-config   set --version --release-type MANUAL|AFTER_APPROVAL|SCHEDULED
                       --earliest-release-date <iso> --downloadable <true|false>
                       --build <buildId>                       [低副作用：发布时机配置]
  export-compliance set --build <buildId> --uses-non-exempt-encryption <true|false>
                                                               [低副作用：出口合规布尔]
  submit           --version --force                           [高副作用：启动正式审核 / --force / 不冒烟]
  cancel           <submissionId> --force                      [高副作用：撤回，强制重审 / --force / 不冒烟]
  release          --version --force                           [高副作用：立即上架公开 / --force / 不冒烟]
```

### 能力 + 工作流函数用途（命名）

能力：`listReviewSubmissions`（`filter[app]` 必填）/`getReviewSubmission`/`createReviewSubmission`/`updateReviewSubmission`（submitted/canceled）、`createReviewSubmissionItem`/`deleteReviewSubmissionItem`/`updateReviewSubmissionItem`/`listReviewSubmissionItems`；`getAppStoreReviewDetail`（按版本）/`createAppStoreReviewDetail`/`updateAppStoreReviewDetail`；`getAppStoreVersion`/`updateAppStoreVersionRelease`（releaseType/earliestReleaseDate/downloadable/build 关系）/`createAppStoreVersionReleaseRequest`、`getVersionAppStoreReviewDetail`/`getVersionReviewSubmission`/`getVersionPhasedRelease`/`getVersionBuild`；`setBuildExportCompliance`（usesNonExemptEncryption）；`getAgeRatingDeclaration`（经 appInfo 解析，只读）。工作流：`submitVersionForReview`/`cancelReviewSubmission`/`releaseVersionNow`/`preflightVersionSubmission`。

### 错误映射

复用既有错误类与退出码映射，**零新增**：`AscNotFoundError`（按版本无 review-detail / 无送审容器 / app-info 无 age-rating，附"现有项"提示）；`AscInvalidParameterError`（欠定多命中送审容器）；STATE_ERROR（版本不可编辑 / 出口合规缺失 / 年龄分级不全 / 提交前置不满足）经请求层响应边界一次性归一，自动映退出 3，hint 表已覆盖；`UnsupportedByApiError`→退出 6（legacy `appStoreVersionSubmissions` 创建/读取、提交后编辑送审项、un-cancel、Resolution Center），由 `API_UNSUPPORTED` 表驱动；`CliUsageError`→退出 64（缺 `--force`、空属性、坏枚举/日期、多内容关系、缺必填 id）。能力层只 throw，退出码由 `main.ts` 的 `renderFailure`→`mapAscErrorToExit` 自动决定。

### registry / SKILL / smoke / docs 更新点

- `src/cli/registry.ts` — `submission` 域 `status` 翻为 `{ implemented:true }`、`summary` 细化为实际动词；`API_UNSUPPORTED` 追加三条：legacy `appStoreVersionSubmissions` 的创建/读取（Apple 移除）、提交后编辑送审项（撤回除外）、un-cancel/复活已撤回送审。检查 `PlannedMilestone`/`makePlannedCommand` 是否还有消费者（无 planned 域后默认保留为扩展点）。
- `src/cli/root.ts` — 引入 `submissionCommand`，把 `submission: plannedDomain("submission")` 替换为 `submission: submissionCommand`；按需更新 root `meta.description`。
- `.claude/skills/app-store-connect/SKILL.md` — 五处镜像：YAML `description` 追加送审/发布动词；"现可用"列加 `submission`；从"尚未实现（M7）"移出 `submission`；任务路由表逐动词加行；conventions 补"提交 App Store 审核触发真实审核""手动发布立即上架""撤回强制重审"三条高副作用警示与 `--force` 动词清单，并重申 legacy 送审为 Apple 不支持。
- `scripts/smoke/asc-smoke.mjs` — 头注释加 `ASC_SMOKE_SUBMISSION` 段（镜像 TestFlight 段，明确 submit/release/cancel **永不冒烟**）；加 `runSubmissionCheck`，仅跑 preflight / 读 review-detail / 读送审状态 / 读分阶段只读字段 / set+restore releaseType，无数据/权限不足按报告性跳过；新能力 import 入导入块。
- `src/index.ts` — 把新能力与工作流符号加入 barrel（values + `export type`），供冒烟脚本与测试从 `dist/index.js` 导入。
- `CLAUDE.md` + `AGENTS.md`（仓库根，保持语义一致） — Verification 段的 smoke 描述追加 `ASC_SMOKE_SUBMISSION` 一句（镜像 `ASC_SMOKE_MEDIA`/`ASC_SMOKE_TESTFLIGHT`）。
- `docs/phases/roadmap.md` 与本 `.claude/rules/docs.md` 的 docs 清单 — M7 状态推进为已完成、把本文登记进 phases 目录清单。

### 离线测试清单

`tests/capabilities-review-submissions.test.ts`、`capabilities-app-store-review-details.test.ts`、`capabilities-app-store-versions-release.test.ts`、`capabilities-export-compliance.test.ts`、`capabilities-age-rating.test.ts`（query/body/必带 `filter[app]`/恰好一个内容关系/async-accept 口径/版本侧 to-one 读形态）；`workflow-submission.test.ts`（送审组装步序、幂等、preflight `blockers[]` 各分支、撤回/发布受理信封）；`cli-submission.test.ts`（arg 校验退出 64、`--force` 门控、成功信封 `resolved` 链、preflight 信封形态、legacy 路由退出 6）。
