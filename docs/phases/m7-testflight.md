# M7 TestFlight 管理 — 阶段计划

本文是 [Roadmap](roadmap.md) 中 M7 阶段的 **TestFlight 部分**详细计划。目标：补齐产品首期范围里的 TestFlight 基础管理能力——测试组与测试员、构建分发可见性、beta build/app 本地化、beta 送审材料（review detail）与 beta 送审提交、反馈列表与附件下载。这是首期范围内最后一类"读写 + 工作流混合"的能力面，用来检验[架构总览](../architecture/overview.md)中能力层与工作流层的边界在"高副作用写 + 既有下载原语复用"的组合下同样成立。策略依据为[请求模型与流程策略](../implementation/request-model.md)的请求构造与文件流程两节、[Skill 入口与 CLI 策略](../implementation/skill-interface.md)的输出口径与破坏性操作立场、以及[产品范围](../product/api-scope.md)对"可自动化能力 vs 必须网页端处理"的硬性区分。Apple 行为核实于 **2026-06**。

## 目标与退出标准

来自 Roadmap（M7"TestFlight 与送审准备"，本阶段只承接其中 TestFlight 一半）：

- [产品范围](../product/api-scope.md)首期列出的六项能力全部可经 Skill 调用——本阶段交付其中的 **TestFlight 基础管理**（测试组、测试员、构建分发可见性、反馈读取）这一项。
- 每项能力有任务级反馈与错误提示。

送审准备与发布配置（送审材料检查、版本提交相关资源）拆为后续独立阶段计划，见下文非目标。

## 范围与非目标

**范围**：测试组（betaGroups 的 list/get/create/update/delete、公开链接配置、招募条件读写与兼容构建预检）；测试员（betaTesters 的 list/get/create/delete、按组/应用/构建过滤、退组与从应用移除、按邮箱批量加组工作流）；测试组与测试员之间的成员关系编辑（双向关系端，择一为正、另一为内部别名）；构建只读与分发可见性（builds 的 list/get、"最新已处理构建"便捷解析、buildBetaDetail 的读取与 `autoNotifyEnabled` 切换、build↔betaGroups 分发关系、individualTesters 单测试员分发、betaBuildLocalization 的"测试须知"逐 locale CRUD、betaAppLocalization 的应用级 TestFlight 元数据 CRUD、preReleaseVersion 构建训读取）；beta 送审材料（betaAppReviewDetail 的读取与更新——按 app 必带 filter）与 beta 送审提交（betaAppReviewSubmission 的状态读取与高副作用提交）；构建过期（expireBuild，一次性不可逆，`--force` 门控且不冒烟）；反馈读取（crash/screenshot 两类提交的列表与单条读取）与反馈附件下载工作流（截图签名 URL 免认证下载 + crash 日志的认证内联文本写盘）；下载侧 `file-processing` 阶段复用与必要的二进制下载分支；CLI `testflight` 域与 `builds` 域；冒烟脚本的 `ASC_SMOKE_TESTFLIGHT` 只读/可逆步骤；SKILL.md 与能力注册表更新。

**非目标**（刻意排除）：

- **不做送审与发布到 App Store**——版本送审（`appStoreVersionSubmissions` / `reviewSubmissions` / `appStoreVersionReleaseRequests` 等）是**独立的后续阶段计划**，与 TestFlight 的 beta 送审是两套资源、两条审核链路，不可混淆。本阶段的 `betaAppReviewSubmission` 仅指 TestFlight 外部测试的 beta 审核，不触碰正式上架审核。
- **不做 build 二进制上传**——明确不在[产品范围](../product/api-scope.md)首期内，且走 Apple 另一套（仍在演进的）多部分上传模型；TestFlight 能力一律围绕**已存在的构建**展开。
- **不做招募条件的自动化推荐**——`betaRecruitmentCriteria` 仅做直读直写（读现值、按用户给定的 deviceFamily/OS 过滤项写、清除），并提供 `betaRecruitmentCriterionOptions` 的合法值矩阵只读查询；不做"根据现有测试员设备分布自动生成招募条件"之类的策略推断——那依赖会随 Apple 更新的设备/OS 矩阵，且属任务级判断而非能力。
- **不做测试指标看板**——`metrics/betaTesterUsages` 与 `metrics/publicLinkUsages` 是只读时序聚合，对"分发与反馈闭环"非必需，且其消费形态（趋势/图表）超出 CLI 单次 JSON 信封的合理边界；留待真实需求出现后按扩展能力引入。
- **不做"重发邀请"动词**——`betaTesterInvitation` 的 `betaTester` 关系已被规范标注 `@deprecated`、其受支持形态正在演变，贸然暴露会过早绑定不稳定接口；加组本身已触发首次邀请邮件，重发留待实机核实当前形态后再定。
- **不做反馈的日期范围服务端过滤**——反馈集合只支持 `createdDate`/`-createdDate` 排序，无日期区间 filter；日期窗口若需要由调用方读后客户端裁剪，不假装提供服务端能力。

## 关键发现

- **反馈只有按应用作用域的集合端点**。crash 与 screenshot 两类提交的列表只存在于 `/v1/apps/{id}/betaFeedback{Crash,Screenshot}Submissions`，没有按构建或按测试员的集合路径；要收窄到某构建/某测试员，只能在应用集合上加 `filter[build]` / `filter[tester]`。排序仅限 `±createdDate`，无其他排序键。

- **两类反馈附件是两套截然相反的传输模型**。screenshot 提交的 `attributes.screenshots[]` 直接内联**短时效签名 URL**（带 `url` + `expirationDate`，但**无 `fileName`**），与 Analytics 分段、媒体上传计划同属一类——必须用免认证 `createRetryingFetch` 取，Bearer token 绝不能泄漏给 CDN。crash 提交则相反：`BetaCrashLog.attributes.logText` 把整段日志**内联在认证 JSON 响应体**里，没有 URL、没有过期时间、没有文件名——它的"下载"本质是"取一个 JSON 属性写盘"，根本不走签名 URL 模型。同一个下载工作流文件里必须并存这两条路径。

- **screenshot 图片无 Apple 校验和、无文件名**。`BetaFeedbackScreenshotImage` 只有 `url`/`expirationDate`/`width`/`height`，没有 `fileName`、没有 checksum——文件名须由"提交 id + 序号 + 嗅探出的扩展名"合成，且下载侧的 checksum 阶段对反馈截图**不被触发**（与 Analytics 分段携带校验和相反），完整性只靠 HTTP 成功 + 字节计数兜底。

- **build 暴露两个独立的生命周期状态，且都只读**。`buildBetaDetail` 上 `internalBuildState`（小枚举、无审核态）与 `externalBuildState`（大枚举，含 `READY_FOR_BETA_SUBMISSION`/`WAITING_FOR_BETA_REVIEW`/`IN_BETA_REVIEW`/`BETA_APPROVED`/`BETA_REJECTED`/`IN_BETA_TESTING`/`MISSING_EXPORT_COMPLIANCE`）彼此分立、皆服务端计算只读；唯一可写字段是 `autoNotifyEnabled`。内部测试**无需** beta 审核，外部测试经 `externalBuildState` 的审核态推进。

- **内部组 vs 外部组的约束写死在 create 时**。`isInternalGroup` 仅创建时可设、之后不可改（不在 UpdateRequest 里）；`hasAccessToAllBuilds` 同样 create-only。公开链接与招募条件仅对外部组有意义。`Build.processingState` 契约枚举恰为 `PROCESSING|FAILED|INVALID|VALID`，`VALID` 即"已处理/可测试"。

- **几个写是真实副作用，且部分不可逆**。把测试员加入组（组端关系 POST、或带 betaGroups 的 createBetaTester、或测试员端关系 POST）会发出真实 TestFlight **邀请邮件**；`betaAppReviewSubmission` 的 POST 触发真实 Apple beta 审核且提交**不可 PATCH/DELETE**（拒绝后须重新 POST，行为待核实）；`expireBuild`（PATCH `expired=true`）**单向不可逆**，API 无法 un-expire。这些都不能进自动冒烟。

- **几个删是异步的（202）**。账号级删测试员（`DELETE /betaTesters/{id}`）返回 202 或 204，按应用移除测试员、按应用批量移除也返回 202——意味着随后一次读可能仍短暂可见该测试员；信封不能断言"已立即删除"。

- **测试员属性写一次即定**。`betaTesters` 无 PATCH，姓名/邮箱创建后不可改；应用关联只能经组/构建成员产生，没有"直接关联应用"的 POST。

- **两个必带 filter 的集合**。`betaAppReviewDetails` 集合 GET 必带 `filter[app]`，`betaAppReviewSubmissions` 集合 GET 必带 `filter[build]`——能力签名须把这两个参数设为必填，省略即 400。

## 决策与理由

**反馈附件下载是工作流，其余 TestFlight 操作是能力层读写。** 反馈附件下载是"解析签名 URL / 取内联日志 → 建目录 → 逐项流式落盘 → 结构化摘要"的多步文件流程，与 M5 的 Analytics 一步直达下载同构，按架构边界整体属工作流层。其余 TestFlight 操作（组/测试员/构建/本地化/送审材料/送审提交/反馈列表与单读）都是标准单请求读写，按能力层模板（`customer-reviews.ts` / `analytics-reports.ts` / `app-screenshots.ts`）落在 `src/capabilities/` 下若干资源文件；工作流层只承担反馈下载与少数 ensure/resolve 编排，不为单请求读写造一层无复用收益的转发。

**所有高副作用写经门控/旗标，且一律排除在真机冒烟之外。** 凡是会发真实邀请邮件（加测试员到组、带组创建测试员、批量加组、build 加 individualTester）、触发真实 Apple beta 审核（提交 beta 送审）、或不可逆移除构建（过期）的写，都不进 `ASC_SMOKE_TESTFLIGHT` 自动冒烟——这延续 M4 评论回复写、M6 预览上传刻意不冒烟的一贯立场：它们只有离线集成测试（mock 网络接缝）+ 一次有记录的监督式走查。误把任一高副作用写漏进冒烟会向真实邮箱发出真实邀请或触发真实审核，是本阶段最大风险，故"加测试员/提交送审/过期构建永不冒烟"写进冒烟脚本注释、SKILL.md conventions 与本文。

**破坏性删除一律 `--force` 门控。** 删测试组、删测试员、退组/从应用移除、删 betaBuildLocalization/betaAppLocalization，全部要求 `--force`，缺失即 `CliUsageError`（退出 64）——镜像 M6 `media screenshots delete-set` 先列成员、非空时强制 `--force` 的立场。删测试组前先读成员（级联 vs 拒绝行为待实机核实，故默认按"先读后 `--force`"保守处理）；异步删（202）的信封用"已受理"口径，不断言即时一致性。

**反馈下载复用免认证传输原语，crash 日志走认证读 + 本地写的独立路径。** screenshot 附件逐字复用 `report-files.downloadExternalFile → saveReportStream`：免认证 `createRetryingFetch`（token 绝不泄漏给 CDN）、URL 去 query 只留 origin+path 作诊断 target、部分文件清理、下载/写盘阶段标注。**一处复用缺口须正视**：`saveReportStream` 面向文本/CSV（gzip 嗅探 + 行观察算行数/表头），对二进制 PNG/JPEG 的 gzip 嗅探无害（magic 不匹配、`wasGzipped=false`）但行数/表头无意义——故为反馈截图加一条**二进制下载分支**，共享同一套免认证 fetch + 去 query + 部分清理 + 阶段标注接缝，但跳过行观察；无 Apple 校验和故 checksum 阶段对截图不触发，作为与 Analytics 的有意差异落档。crash 日志**不走**该原语：日志是认证 JSON 属性，按"取属性 + 本地写"的独立路径，写失败映射到 `file-processing` 的 `write` 阶段；`logText` 是否纯文本/base64/gzip 待实机核实，若被编码则解码后再写。

**find-or-create / resolve-with-helpful-miss 用在该用的地方。** betaBuildLocalization 与 betaAppLocalization 的"set"动词按 locale **upsert**（缺则 POST、存在则 PATCH，避开重复 locale 的 409，冲突行为待核实），镜像 M6 的 localization find-or-create；betaAppReviewDetail 因无 create/delete、按 app 存在性是 find-or-(读现有)，能力签名把 `filter[app]` 设为必填。组/测试员/反馈的解析在未命中时遵循 M5 的"答以现有"立场——二次无过滤 `all-pages` 列举并抛 `AscNotFoundError` 列出现有（"Available groups: …"），欠定的多命中抛 `AscInvalidParameterError` 提示补充条件。这类 ensure/resolve 不守卫并发双建（TOCTOU），与 M5/M6 一致按真实 agent 的顺序用法。

**构建分发可见性建模为关系编辑，双向择一为正。** "把构建分发给某些组"既可从组端（`betaGroups/{id}/relationships/builds`）也可从构建端（`builds/{id}/relationships/betaGroups`）编辑，两端功能等价；为避免双重维护与用户困惑，**择一为正式能力、另一为内部别名**——以构建端 `assignBuildToBetaGroups`/`removeBuildFromBetaGroups` 为正（"分发这个构建给这些组"是更常见的任务表述），组端读 `listGroupBuilds` 仅作可见性只读。同理测试员↔组的成员关系择组端为正。加外部组分发会使构建对外部测试员可见（可能要求先过 beta 审核），属副作用；`hasAccessToAllBuilds=true` 的组自动可见全部构建、显式关系冗余甚至被拒，CLI 对此组拒绝显式 build 关系并给清晰提示。

**"找到最新已处理构建"做成便捷解析，纯组合不新增端点。** `findLatestProcessedBuild({ appId, platform?, audienceType? })` 是 `listBuilds` 上的纯组合：按 app（+可选 platform 经 `preReleaseVersion.platform`）过滤、`processingState=VALID`、`sort=-uploadedDate`、取首条，把"某应用最新可测试构建"这一高频任务编码为一个动词。文档说明 `VALID` 即"已处理/就绪"状态（契约枚举仅 `PROCESSING|FAILED|INVALID|VALID`）。

**`builds` 为顶层域，反馈只读，招募条件做薄读写。** 构建是 ASC 一等资源，既服务 TestFlight 也服务后续送审/发布阶段，故 `builds`（含 `pre-release-versions` 子命令）建为**顶层 CLI 域**而非 `testflight` 子树，避免后续阶段复用时路径偏移。反馈按 Roadmap"反馈读取"定位**只读**（list/get/download），不提供 delete——删反馈价值低且只增命令面。招募条件（`betaRecruitmentCriteria`）做**薄读写**（读现值、写过滤项、清除、合法值矩阵只读），不做"按设备分布自动生成"的策略推断（依赖随 Apple 演变的设备/OS 矩阵，属任务级判断）。批量反馈下载采 **continue-on-error**：单条附件失败（多为签名 URL 过期）记入该条结果并继续，绝不因一条拖垮整批。

**CLI 本地校验先于任何请求（用法错误退出 64）。** 凡能在发请求前判定的用法错误一律本地 `CliUsageError`（退出 64）：`isInternalGroup`/`hasAccessToAllBuilds` 出现在 **update** 旗标上（它们 create-only，UpdateRequest 根本不含、朴素透传会被静默丢弃，故显式拒绝并说明"仅创建时可设"）；招募条件 `--filter deviceFamily:minOs:maxOs` 的格式与 deviceFamily 取值；`--force` 缺失于破坏性动词；必填 `--app`/`--build`/`--id` 缺失；公开链接 enable 时 app 被公开暴露（无逐人邮件但属真实外部暴露）须确认。ASC 会校验的枚举（如 `processingState`/`betaReviewState`）一律透传不本地硬编码；只有被工作流先客户端分支的值才本地 soft-check（沿用 `media-flags` 的 `displayType` 先例）。

**信封绝不泄漏签名附件 URL。** 反馈截图的签名 URL 与其 query 签名是机密，与 M5 分段、M6 上传计划同口径：成功信封只回落盘路径、字节数、宽高、`expirationDate`、以及去 query 的 sanitized URL，绝不回带签名的原始 URL；下载诊断的 target 同样去 query。CLI 落盘测试以"信封 JSON 任何处不含签名串"为断言之一。

## 实机核实记录

实施中对真实 ASC 行为的核实结果将逐项落档。账号：Sonara `6761486081`。下表为待核实项（每项写明核实什么、为何要核实）：

| # | 核实项 | 为何要核实（待核实状态） |
|---|---|---|
| 1 | 邀请邮件确切触发点：单独 POST `/betaTesters` 即发邮件，还是仅在关联到含可分发构建的组之后才发？ | 决定 `createBetaTester`/`addTestersToGroup` 的副作用标注精确度；须以一次性丢弃邮箱做监督式走查（待核实） |
| 2 | 删非空测试组：204 级联移除组内测试员，还是对非空组报错？ | 决定 `--force` 前是否必须先读成员；默认保守先读（待核实） |
| 3 | 内部组（`isInternalGroup=true`）是否拒绝 `publicLinkEnabled`/招募条件；外部组创建是否仅需 name+app？ | 决定内部/外部组的 CLI 旗标互斥校验与公开链接动词的适用范围（待核实） |
| 4 | 测试员/应用关系删的 202 vs 204 时序：随后一次读多久反映变更？ | 决定信封是否能断言即时一致性（默认"已受理"口径，待核实） |
| 5 | 加/删测试员、加/删构建的关系数组单次最大批量？ | 决定批量加组工作流的分块大小（待核实） |
| 6 | `betaTesterInvitation` 在 `betaTester` 关系已 `@deprecated` 下当前受支持的创建形态？ | 仅当"重发邀请"动词纳入范围时需要；当前为非目标（待核实） |
| 7 | 给组/单测试员加构建是否发通知？ | 决定 `add-build`/individualTester 加构建的副作用标注（待核实） |
| 8 | `processingState` 从 `PROCESSING→VALID` 的推进时机，确认 `VALID` 是"最新已处理构建"的正确过滤值 | 决定 `findLatestProcessedBuild` 的过滤语义（待核实） |
| 9 | 外部分发是否需要显式 POST `betaAppReviewSubmission`，还是把构建加入外部组即隐含触发审核？同训后续构建能否跳过审核？ | 决定 `assignBuildToBetaGroups` 与 `submitBuildForBetaReview` 的前置关系与文案（待核实） |
| 10 | 出口合规门控：外部审核是否要求 `usesNonExemptEncryption` 设值和/或链接 `appEncryptionDeclaration`（`MISSING_EXPORT_COMPLIANCE` 态）？ | 决定送审前的 preflight 读检查项（待核实） |
| 11 | `expire` 语义：PATCH `expired=true` 经 API 是否不可逆、是否即刻移出测试？ | 印证 `expireBuild` 一次性、`--force` 门控、不冒烟的决策（待核实） |
| 12 | `betaAppReviewDetail` 存在模型：每应用自动存在（任何提交前即可读）还是审核上下文创建后才有？ | 决定能力是否需处理首读 404/空（待核实） |
| 13 | 拒绝后重提交流程：新 POST `betaAppReviewSubmission` vs 自动复审；旧 REJECTED 提交是否仍可读？ | 决定 `submitBuildForBetaReview` 的重提交文案（待核实） |
| 14 | `autoNotifyEnabled` 对构建批准/分配时测试员通知的实际效果？ | 决定 `set-beta-detail` 与分发动词的通知说明（待核实） |
| 15 | `crashLog.logText` 是纯文本、base64 还是 gzip 文本？ | 决定写盘前是否需解码、是否触发 decompress/parse 阶段（契约仅类型为 string，待核实） |
| 16 | 真实 `attributes.screenshots[]` 的形态/数量（单图 vs 多图），url 是否为带 query 签名的完整绝对 URL（如 Analytics 分段） | 决定 origin+path 去 query 的 sanitize 是否照搬（待核实） |
| 17 | screenshot 签名 URL 过期窗口（`expirationDate` 给多久）？ | 决定批量下载是否须"解析即下载"近原子，或可容忍队列（待核实） |
| 18 | screenshot 图片的 Content-Type/实际二进制格式（PNG/JPEG/HEIC）及是否干净返回 Content-Encoding/Content-Length？ | 决定合成扩展名与二进制下载分支的嗅探逻辑（待核实） |
| 19 | 读取/列反馈是否需特定 ASC 角色（App Manager vs Developer vs TestFlight 受限角色）？ | 决定权限错误指引，类比 M5 财务角色 403 的报告性跳过（待核实） |
| 20 | 只读冒烟候选在真实账号（vendor app）的可用性：列组、读组、列组内测试员、列组构建、列测试员（按 app/组过滤）、招募兼容构建预检、招募选项矩阵、读 buildBetaDetail、读 betaAppReviewSubmission 状态、列反馈（计数/元数据） | 决定 `ASC_SMOKE_TESTFLIGHT` 只读步骤集（待核实） |

### 核实结果（2026-06-13 首轮可逆冒烟）

`ASC_SMOKE_TESTFLIGHT=1` 在 Sonara（`6761486081`，team key）跑通，结果落档：

- **#19 已确认**：本 team key 直接可读 crash/screenshot 反馈集合（计数/元数据），无 403——反馈列举对该 key 无需额外角色。权限不足时的报告性跳过分支（类比 M5 财务 403）保留备用，但本账号不触发。
- **#20 已确认（实际走查子集）**：列组（读到 1 组）、读组成员（`listGroupTesters`，has members）、列构建（读到 3，more exist）、列 crash/screenshot 反馈（首页计数）均在真机可用。招募兼容构建预检、招募选项矩阵、`buildBetaDetail` 读、`betaAppReviewSubmission` 状态读本轮**未纳入** `runTestflightCheck`，仍待后续走查。
- **#8 已确认**（经 `builds latest` 真机走查）：`processingState=VALID` 是有效过滤值，`findLatestProcessedBuild`（filter `VALID` + sort `-uploadedDate` + 取首）返回真实最新构建（version 8，`expired:false`），语义成立。
- **只读 CLI 走查已确认**（经构建好的 `dist` CLI，非冒烟直调）：`testflight groups list` / `builds latest` / `testflight feedback list-screenshots` 的信封形态在真实数据上正确（`ok`/`command`/`data`/`pagination.scope`/`rateLimit`/`resolved`）。真实唯一组 `...6e5a` 为 `hasAccessToAllBuilds:true` 的内部组——**印证 finding #3 的 all-builds 预检确有现实意义**（对该组执行 `builds groups add` 会被本地拒绝退出 64，而非把注定失败的请求打到 ASC）。反馈附件下载与 get/list-screenshot 的签名 URL sanitize 因账号内暂无反馈无法真机触发，由离线测试覆盖。
- **可逆建删已确认**：`createBetaGroup`（POST `betaGroups` + app 关系，空组→无邀请邮件）→ `deleteBetaGroup`（DELETE，`finally` 中仅删本次创建）跑通；异步删的"已受理"信封口径在真机成立。注意删的是**空**组，故 #2（非空组级联删）仍待核实。
- **契约形态印证**：上述读/写路径的 path、`filter[app]`/关系 linkage、JSON:API `type` 均被真实 ASC 接受——这是 mock 测试证明不了的部分。
- **仍待核实（高副作用，绝不自动冒烟）**：#1 邀请邮件触发点、#2 非空组级联删、#5 关系批量上限、#7 加构建通知、#8 `VALID` 最新过滤推进时机、#9–#14 送审/出口合规/过期/`autoNotify`、#13 拒后重提交、#15/#16/#17/#18 反馈附件实际形态（需账号内存在真实反馈）。这些须监督式走查（部分用一次性丢弃邮箱），见验证清单末项。

## 验证清单

- [x] 能力层离线集成测试：组/测试员/构建/本地化/送审材料/送审提交/反馈列表与单读的精确 query 与 JSON:API body 断言；必带 filter（`filter[app]`/`filter[build]`）缺失的签名约束；create-only 字段（`isInternalGroup`/`hasAccessToAllBuilds`）不入 UpdateRequest；异步删（202）的"已受理"信封口径；关系数组 POST/DELETE 的 linkage 形态。
- [x] 工作流离线集成测试：反馈截图下载的 **PUT/GET 免认证断言**（外部 CDN host 上 authorization 头为 undefined）、多图序号化落盘、信封无签名 URL、签名 URL 已过期的跳过/警告、crash 日志认证读 + 本地写、批量"下载某应用全部反馈"的逐项失败可收集（continue-on-error，批量退出码取最严逐项结果）；betaBuildLocalization/betaAppLocalization 的 upsert（缺建/存在改）、betaAppReviewDetail 的按 app 解析、find-or-create 复用（不注册 POST 即证未创建）、最新已处理构建解析。
- [x] CLI 离线测试：arg 校验（update 上的 create-only 字段、坏 deviceFamily 过滤格式、缺 `--force`、缺必填 `--app`/`--build`/`--id`、公开链接 enable 确认）→ 退出 64 不触网；成功信封 `resolved` 链充实、列表信封 `pagination.scope` 正确、删除/关系编辑信封形态；落盘 CLI 测试断言磁盘字节且信封 JSON **不含签名 URL**。
- [x] 下载侧 `file-processing` 阶段覆盖：截图二进制分支的 download/write 阶段、crash 写盘的 write 阶段、checksum 阶段对截图**不触发**的有意非行为、阶段判别与退出码 3 映射、CLI hint 配齐（穷尽 `Record<FileProcessingStage>`）。
- [x] `npm run check` 全绿（409 测试）；生成契约零改动；零新增运行时依赖。
- [x] 真实账号只读/可逆冒烟（`ASC_SMOKE_TESTFLIGHT=1`，2026-06-13 通过）：创建并删除一个空测试组（`finally` 中清理、仅删本次创建）、读 builds、读反馈（仅计数/元数据，不下载真人 PII）；招募兼容构建预检、招募选项矩阵、`buildBetaDetail`/送审状态 preflight 本轮未纳入冒烟脚本，留待后续；**绝不冒烟**加测试员、提交 beta 送审、过期构建。
- [ ] 监督式 Skill 走查：经完整 CLI 信封跑通一条只读/可逆链路（列组 → 读组成员 → 读构建 → 列反馈 → 下载一条反馈附件并核对落盘且信封无签名 URL），以及一次有记录的高副作用走查（用一次性丢弃邮箱加一名测试员到组、确认邀请邮件触发——核实项 1）。

## 实现分解

### 新增/变更文件与职责

能力层（`src/capabilities/`）：

- `beta-groups.ts` — betaGroups 的 list/get/create/update/delete、公开链接 PATCH、组↔测试员与组↔构建关系读/编辑（编辑端择一为正）、招募条件读写与清除、招募选项矩阵只读、招募兼容构建预检。
- `beta-testers.ts` — betaTesters 的 list（filter[apps]/[betaGroups]/[builds]/[email]/[inviteType]）/get/create/delete、测试员端组关系（内部别名）、退组、从应用移除。
- `builds.ts` — builds 的 list/get、buildBetaDetail 读取与 `autoNotifyEnabled` PATCH、build↔betaGroups 分发关系（正式编辑端）、individualTesters 读/加/删、`expireBuild`、preReleaseVersion 读取与其构建读取。
- `beta-localizations.ts` — betaBuildLocalization 与 betaAppLocalization 的 list/create/update/delete（"测试须知"与应用级 TestFlight 元数据）。
- `beta-review.ts` — betaAppReviewDetail 读取（filter[app] 必填）与更新、betaAppReviewSubmission 列表（filter[build] 必填）/单读/提交。
- `testflight-feedback.ts` — crash/screenshot 两类提交的 list（app 作用域 + filter）/单读、crashLog 内联文本读（反馈为只读，不提供删除）。

工作流层（`src/workflows/`）：

- `feedback-files.ts` — 反馈附件下载引擎：`downloadScreenshotFeedbackAttachments`（免认证签名 URL 逐图落盘，复用 `downloadExternalFile` 的二进制分支）、`downloadCrashFeedbackLog`（认证内联日志写盘）、`downloadFeedbackAttachments`（一步直达编排：解析目标 → 枚举 → 逐项下载 → 结构化摘要）。
- `beta-distribution.ts` — 少量编排：`ensureBetaGroup`（find-or-create）、`bulkAddTestersToGroup`（逐邮箱 ensure 测试员后单次 linkage POST、按核实出的批量上限分块）、betaLocalization 的 upsert-by-locale、betaAppReviewDetail 的 find-or-read、`findLatestProcessedBuild` 便捷解析。
- `report-files.ts`（变更） — 增加共享免认证 fetch + 去 query + 部分清理 + 阶段标注、但跳过行观察的二进制下载分支，供 `feedback-files.ts` 复用。

CLI 层（`src/cli/`）：

- `commands/testflight.ts` — `testflight` 顶层组，subCommands：`groups`/`testers`/`test-info`/`review-detail`/`feedback`。
- `commands/testflight-groups.ts`、`commands/testflight-testers.ts`、`commands/testflight-feedback.ts`、`commands/testflight-review.ts`（review-detail + test-info）— 各 leaf 动词。
- `commands/builds.ts` — `builds` 顶层域（含 beta-detail/notes/review/groups/testers 子组）与 `pre-release-versions`。
- `commands/testflight-shared.ts` — 跨子组共享的信封字段构造与旗标片段（precedent：`media-shared.ts`）。
- `testflight-flags.ts` — 域内旗标校验器（招募条件过滤格式、create-only 字段拒绝、deviceFamily soft-check；precedent：`media-flags.ts`）。

### CLI 域树（标注副作用动词与其确认旗标）

```
testflight
  groups
    list            --app --name --internal --sort --all/--max-items/--page-limit
    get             <groupId> --include app,builds,betaTesters
    create          --app --name --internal --all-builds --feedback --public-link --public-link-limit
    update          <groupId> --name --feedback/--no-feedback --public-link/--no-public-link --public-link-limit --silicon-mac --apple-vision
    delete          <groupId> --force                         [破坏性 / --force]
    testers         <groupId> --all/--max-items/--page-limit
    add-testers     <groupId> --testers id,id --force         [副作用：发邀请邮件 / --force]
    remove-testers  <groupId> --testers id,id --force         [破坏性 / --force]
    builds          <groupId> --all/--max-items/--page-limit
    public-link     <groupId> --enable/--disable --limit --no-limit   [副作用：公开暴露 / 需确认]
    criteria        get|set|clear <groupId> --filter dF:minOs:maxOs ... [clear 需 --force]
    criteria-build-check  <groupId>
  testers
    list            --app --group --build --email --invite-type --sort --all/--max-items/--page-limit
    get             <testerId> --include apps,betaGroups,builds
    create          --email --first-name --last-name --group id,id --force  [副作用：发邀请邮件 / --force]
    bulk-add        --group --emails-file <path> | --emails a@x,b@y --force [副作用：发邀请邮件 / --force]
    delete          <testerId> --force                        [破坏性 账号级 / --force]
    remove-from-app <testerId> --app id,id --force            [破坏性 / --force]
  test-info         list|set|delete  --app --locale ...(set 旗标) | <localizationId> --force(delete)
  review-detail     get|set          --app(get) | <detailId> --contact-* --demo-account-* --notes(set)
  feedback
    list-crashes      --app --build --tester --device-model --os-version --sort --all/--max-items/--page-limit
    list-screenshots  --app --build --tester --device-model --os-version --sort ...(同上)
    get-crash         --id --include build,tester --with-log
    get-screenshot    --id --include build,tester
    download          --id | --app --kind crash|screenshot|both --output <dir> ...(批量 filter)

builds
  list              --app --pre-release-version --platform --processing-state --version --expired --audience --sort --all
  get               <buildId> --include <rels>
  latest            --app --platform --audience
  expire            <buildId> --force                         [破坏性 单向不可逆 / --force]
  beta-detail       get <buildId> | set <buildId> --auto-notify <true|false>
  notes             list <buildId> --locale | set <buildId> --locale --whats-new | delete <localizationId> --force
  review            status <buildId> | submit <buildId> --force  [副作用：触发真实 beta 审核 / --force]
  groups            add <buildId> --group id... | remove <buildId> --group id... --force  [add 副作用 / remove --force]
  testers           list <buildId> | add <buildId> --tester id... --force | remove <buildId> --tester id... --force  [add 副作用 / --force]
  pre-release-versions list  --app --platform --version
```

### 能力函数用途（命名）

`listBetaGroups`/`getBetaGroup`/`createBetaGroup`/`updateBetaGroup`/`deleteBetaGroup`、`listGroupTesters`/`addTestersToGroup`/`removeTestersFromGroup`、`listGroupBuilds`（可见性只读）、`setPublicLink`、`readRecruitmentCriteria`/`setRecruitmentCriteria`/`clearRecruitmentCriteria`/`listRecruitmentCriterionOptions`/`checkRecruitmentCompatibleBuild`；`listBetaTesters`/`getBetaTester`/`createBetaTester`/`deleteBetaTester`/`removeTesterFromApp`；`listBuilds`/`getBuild`/`findLatestProcessedBuild`/`expireBuild`、`getBuildBetaDetail`/`updateBuildBetaDetail`、`assignBuildToBetaGroups`/`removeBuildFromBetaGroups`、`listBuildIndividualTesters`/`addIndividualTesters`/`removeIndividualTesters`、`listPreReleaseVersions`/`getPreReleaseVersion`/`listPreReleaseVersionBuilds`；`listBetaBuildLocalizations`/`createBetaBuildLocalization`/`updateBetaBuildLocalization`/`deleteBetaBuildLocalization`、`listBetaAppLocalizations`/`createBetaAppLocalization`/`updateBetaAppLocalization`/`deleteBetaAppLocalization`；`getBetaAppReviewDetail`/`updateBetaAppReviewDetail`、`listBetaAppReviewSubmissions`/`getBetaAppReviewSubmission`/`getBuildBetaAppReviewSubmission`/`submitBuildForBetaReview`；`listCrashFeedback`/`getCrashFeedback`/`getCrashLog`/`listScreenshotFeedback`/`getScreenshotFeedback`（反馈只读，无 delete）。工作流：`ensureBetaGroup`/`bulkAddTestersToGroup`/`downloadScreenshotFeedbackAttachments`/`downloadCrashFeedbackLog`/`downloadFeedbackAttachments`。

### 反馈下载工作流步骤

1. 解析目标提交：单 `--id`，或按 `--app` + filter 列举一批（默认单页，沿用 read-scope 配额底护栏）。
2. screenshot 分支：`getScreenshotFeedback` 取 `attributes.screenshots[]`；空则按 not-found 答以"无截图"；`mkdir(dir,{recursive})`（失败为 `write` 阶段）；逐图（按序号顺序）校验 url 存在（否则 upstream "image carries no URL"）、检查 `expirationDate`（已过期则警告/跳过）、`downloadExternalFile(url, 合成文件名)` 走二进制分支落盘。
3. crash 分支：`getCrashLog` 取 `logText`；空/未定义则 not-found；`mkdir` + 把（必要时解码后的）`logText` 写为 `crash-<id>.crash`，写失败映射 `write` 阶段。
4. 批量编排：按 `--kind` 对每条提交分派上述两分支，聚合为 `{ submissions:[{id,kind,savedFiles,skipped,error?}], totals:{files,bytes} }`；**continue-on-error**——单条附件失败（多为签名 URL 过期）记入该条 `error` 字段并继续，绝不因一条拖垮整批；批量退出码取最严的逐项结果。
5. 返回结构化摘要（路径、字节、宽高、`expirationDate`、去 query 的 sanitized URL）；签名原始 URL 绝不入信封。

### 错误 / file-processing 阶段与退出码映射

复用既有下载侧阶段 `download`/`write`（截图二进制分支与 crash 写盘各用其一），如核实出 `logText` 为编码文本则触及既有 `decompress`/`parse`——**无须新增阶段**。全部 `file-processing` 仍映射退出码 3。复用既有错误类（`AscNotFoundError`/`AscInvalidParameterError`/`AscPermissionError`/`AscUpstreamError`/`AscFileProcessingError`），不新增错误类别故 `mapAscErrorToExit` 与 `hintFor` 无须扩展；新增的二进制下载分支若引入新 hint 文案，按 `FILE_PROCESSING_HINTS` 的穷尽 `Record` 约束补齐（缺键即编译失败）。

### registry.ts / SKILL.md / smoke / docs 清单更新点

- `src/cli/registry.ts` — 把 `testflight` 域 `status` 从 `{ implemented: false, milestone: "M7" }` 翻为 `{ implemented: true }` 并更新 `summary`；`builds`/`pre-release-versions` 若作新域则追加 `DomainEntry`；若有任何 TestFlight 任务为 Apple 网页端独有，加入 `API_UNSUPPORTED`（经 `UnsupportedByApiError` → 退出 6）。
- `src/cli/root.ts` — 引入 `testflightCommand`/`buildsCommand`，把 `plannedDomain("testflight")` 替换为实现命令（实现后必须移除 `plannedDomain`，否则 `makePlannedCommand` 抛错）。
- `.claude/skills/app-store-connect/SKILL.md` — 四处镜像：YAML `description` 追加 TestFlight 能力；能力边界把 testflight 从"尚未实现（M7）"移入"现可用"并列动词；任务路由表逐动词加行；conventions 补域内陷阱（加测试员发真实邀请邮件、提交 beta 送审触发真实审核、过期构建不可逆、附件下载写盘并回报落盘路径、`--force` 门控破坏性删、信封不回签名 URL）。
- `scripts/smoke/asc-smoke.mjs` — 加 `runTestflightCheck`，门控于 `ASC_SMOKE_TESTFLIGHT=1`，仅跑只读/可逆步骤（创建+删除空组在 `finally` 清理、读 builds、读反馈计数、只读 preflight），无数据/权限不足按报告性跳过；任何高副作用写不入冒烟。
- `src/index.ts` — 把全部新能力与工作流符号加入 barrel（values + `export type`），供冒烟脚本与测试从 `dist/index.js` 导入。
- `docs/phases/roadmap.md` 与本 `.claude/rules/docs.md` 的 docs 清单 — M7 状态推进、把本文登记进 phases 目录清单。

### 离线测试清单

`tests/capabilities-beta-groups.test.ts`、`capabilities-beta-testers.test.ts`、`capabilities-builds.test.ts`、`capabilities-beta-localizations.test.ts`、`capabilities-beta-review.test.ts`、`capabilities-testflight-feedback.test.ts`（query/body/必带 filter/异步删口径/关系 linkage 形态）；`workflow-feedback.test.ts`（免认证下载、多图落盘、crash 写盘、批量聚合、upsert、find-or-create、最新构建解析）；`cli-testflight.test.ts`、`cli-builds.test.ts`（arg 校验退出 64、成功信封、落盘信封无签名 URL、`--force` 门控）。
