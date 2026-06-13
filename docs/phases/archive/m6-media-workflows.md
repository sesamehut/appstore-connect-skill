# M6 媒体素材工作流 — 阶段计划

本文是 [Roadmap](../roadmap.md) 中 M6 阶段的详细计划。目标：交付截图与预览素材的**上传链路**——继 M5 报表"下载侧"之后的第二类多步骤工作流，方向相反（本地 → 远端 + 服务端异步处理状态机），用来检验[架构总览](../../architecture/overview.md)中工作流层的设计在反方向上同样成立。策略依据为[请求模型与流程策略](../../implementation/request-model.md)的媒体上传一节、[Skill 入口与 CLI 策略](../../implementation/skill-interface.md)的输出口径与[产品范围](../../product/api-scope.md)的硬性设计要求。Apple 行为核实于 **2026-06**。

## 目标与退出标准

来自 Roadmap：

- 单张截图与整组素材上传在测试应用验证通过。
- 流程中断后可以诊断出停在哪个阶段。

## 范围与非目标

**范围**：截图与预览的完整生命周期（set 的 list/create/delete、资产的 list/upload/upload-set/delete/reorder/status）；四步上传流程（预约 reserve → 传输 transfer → 提交 commit → 确认 confirm）；免认证的分片传输原语；上传侧 `file-processing` 错误阶段（`transfer-read`/`transfer`/`commit`/`processing`）；预览的视频处理状态机（`videoDeliveryState` 与 `assetDeliveryState` 双终态）；version+locale → localization 解析与 set 的 find-or-create；CLI `media` 域（screenshots/previews 两子树）；冒烟脚本的 `ASC_SMOKE_MEDIA` 上传即删步骤；SKILL.md 与能力注册表更新。

**非目标**（刻意排除，后续按需引入）：

- 不做 build 二进制上传——明确不在产品首期范围，且走的是 Apple 另一套（仍在演进的）多部分上传模型。
- 不做中断后的自动续传——对过期上传计划重放分片不可靠；重跑 `upload` 预约全新资产，悬挂资产由 `delete` 显式清理。
- 不做 `upload-set --replace`（先清空再上传）——属锁定范围外的扩展；默认追加语义已满足退出标准，替换留给真实使用模式出现后再设计。
- 不做素材内容校验（尺寸、编码是否合规）——那是 Apple 异步处理的职责，本地只校验文件存在性与参数格式，内容问题由 `processing` 终态如实回报。
- 不做预览的真机冒烟——视频转码耗时分钟级，不适合放进读多写少的冒烟脚本；只冒烟截图。

## 关键发现：唯一 API 路径已被弃用（但仍可用、无替代）

当前规范（4.4，2026-06 采集）中，`appScreenshots` / `appScreenshotSets` / `appPreviews` / `appPreviewSets` 的**全部** CRUD 端点都标注 `@deprecated`，但它们是上传商店截图/预览的**唯一** API 路径，且持续有效。Apple 的新版多部分上传模型只覆盖 build 与 background-asset，截图/预览尚未迁移，也没有发布替代端点。因此本阶段以这套唯一可用端点实现，并把弃用依赖严格隔离（见下文决策）。这**不是** `API_UNSUPPORTED` 条目——能力是被支持的，只是经由弃用端点；无需重新生成契约，M6 是纯手写代码覆盖既有生成类型，与 M5 同构。

## 决策与理由

**对弃用资源的依赖收敛在两个能力文件，向上只暴露非弃用别名。** 截图与预览的逐字 CRUD 落在 `app-screenshots.ts` 与 `app-previews.ts` 两个能力文件，`@typescript-eslint/no-deprecated` 仅对这两个文件关闭、别处一律保留。传输原语、编排引擎、CLI、错误模型全部与"资产种类/弃用与否"无关；未来 Apple 出替代模型时，只改这两个文件与引擎里的两个 descriptor。弃用状态写入能力文件头注释、SKILL.md 与本文，镜像 M5 对"短时效签名 URL"的注记方式。**一个泄漏点单独处理**：规范只对 `AppPreview.assetDeliveryState` 这一个成员加了**行内** `@deprecated`（截图侧同名成员没有），直接在工作流层读取会越过隔离边界——故把两类资产的 delivery-state 读取都下沉为能力文件里的访问器函数，工作流层分类时只看返回的非弃用结构，连这个单成员泄漏也封在边界内。

**传输原语结构性免认证，绝不复用带认证的 client。** 预约返回的上传计划指向外部主机的短时效签名地址，免认证；若复用带 Bearer 的请求层，token 会泄漏给第三方主机。分片传输自建裸 `createRetryingFetch`（请求层早在 M5 就为此预告该模式），headers 只取上传计划给定的 `requestHeaders`，显式设 `Content-Length`，绝不附 `Authorization`。这是 M5 分段下载免认证的逆向镜像；离线测试以"PUT 不携带 authorization 头"为最关键断言。失败分片的诊断 target 用**去 query** 的 URL——签名在 query 里，是机密。

**分片流式传输，绝不整体缓冲素材体。** 预览可达数百 MB。每个上传操作按其 `[offset, length)` 开一段文件读流直接作为请求体（`duplex: "half"`），显式声明长度；整文件 MD5 也单独一遍流式计算，不与传输读复用。内存占用与素材体积无关。**重试陷阱**：流不可重放，client 级重试会半消费 ranged 流，故传输原语自持每片重试（有界次数 + full-jitter 退避），每次**重建全新请求 + 全新 ranged 流**。

**编排引擎用一个 descriptor 接缝参数化，绝不在内部分支资产种类。** 截图与预览两条流程近乎相同，差异（资产类型名、`displayType`/`previewType`、预览多一个视频状态与两个属性）全部下沉到一个小 descriptor（`reserve`/`commit`/`get`/`extract` 方法）。引擎只串 reserve → transfer → commit → confirm，对种类无感。两类唯一的实质分叉在 `extract` 的状态分类：截图看 `assetDeliveryState`，预览需 `assetDeliveryState` **且** `videoDeliveryState` 都 COMPLETE 才算完成，任一 FAILED 即终态失败——干净隔离在 descriptor。

**checksum 基准是源文件原始字节，与 M5 下载侧相反。** 上传 commit 的 `sourceFileChecksum` 是整个源文件的 MD5（无压缩），而 M5 分段下载校验的是 Apple 传输的压缩字节 MD5。两个方向基准相反，契约的 `fileSize` / `sourceFileChecksum` 语义印证了这一点。

**默认 block-and-poll + 硬超时 + 独立 `status` 兜底，超时不报错。** 延续 M5"解决而非甩锅"：reserve→transfer→commit 始终同步，之后轮询直到终态或预算耗尽。**超时仍在处理不算失败**：字节确实已上传，工作流成功返回并置 `pollTimedOut`，CLI 信封带 `statusCommand` 指引用户用 `status` 续查；stdout-成功仍诚实。轮询用注入 `sleep` 接缝（同 `RetryOptions.sleep`，离线测试零等待），默认预算截图 60s、预览 600s（视频转码慢）。`--no-wait` 在 commit 后立即返回。

**`transfer` 与 `processing` 分立，正是退出标准"诊断停在哪阶段"。** 终态 FAILED 是服务端**内容**拒绝（尺寸、编码错），此时字节已正常上传——映射到 `file-processing` 的 `processing` 阶段，携带 Apple 的 `assetDeliveryState`/`videoDeliveryState` 错误明细与资产 id。它与传输阶段的 `transfer` 失败彼此区分，让"停在哪一步"可机器判别。

**上传侧 `file-processing` 新增四个阶段，不新增 `reserve` 阶段，仍映射退出码 3。** 新增 `transfer-read`（本地文件/区间读失败）、`transfer`（ranged PUT 失败）、`commit`（提交 PATCH 被拒，多为 checksum 不符）、`processing`（异步终态 FAILED）。失败的 reserve 已被请求层归一为 invalid-parameter 等，不重复造阶段。退出码沿用 M4/M5 的划分——文件处理失败的下一步与其他请求路径失败相同（读 stderr 的 `error[file-processing]` 与 stage 提示后重跑或上报），更细的阶段区分已由 stderr 机器可读地承载。每个新阶段配一条可行动 hint。

**set 幂等 find-or-create：经 localization 的 related 读，绝不自动删、绝不用全局 set 列表。** 镜像 M5 的 `ensureAnalyticsReportRequest`：经 localization 的 related 读列出**本 localization** 的 set（正确作用域，避开自定义产品页/实验 localization 的全局 set），按 `displayType`/`previewType` 匹配则复用、否则新建，经 `created` 标志上报。并发双建（TOCTOU）不加锁——真实 agent 用法顺序，M5 亦不守卫并发建请求。

**上传是追加而非覆盖；`upload-set --reorder` 用合并后的全量成员排序。** ASC 允许一个 set 含多张截图，重跑 `upload` 追加新资产并回显新 id（意外但正确，文档说明）。`upload-set` 按文件名顺序上传整个目录；`--reorder` 时读取 set 当前全量成员，排成"本批次领先 + 原有成员在后"再 PATCH 关系——ASC 原子替换整个关系并拒绝部分/超集列表，故必须覆盖恰好的当前成员。

**CLI 本地校验先于任何请求（用法错误退出 64）。** `--file`/`--dir` 存在性、`--frame-time-code` 的 `HH:MM:SS[.fff]` 格式、`--order` 非空且去重、`--dir` 至少含一个对应扩展名的文件——都在发请求前以 `CliUsageError`（退出 64）失败。**`fileSize` 一律由本地 `stat` 计算、绝不由用户传**：它是预约必填项，本地算保证与所发字节一致，消除一类 commit 拒绝。**enum 本地 soft-check**：因 find-or-create 先按 `displayType`/`previewType` 匹配 set，typo 会预约错位——本地校验生成的 union（不符抛 64 并列已知值、注明 Apple 权威），同 M5 `resolveAccessType` 的"工作流先分支于该值故本地校验"情形。纯格式校验排在文件系统 `stat` 之前，让最根本的用法错误先暴露。

**预览 mimeType 由扩展名自动推断，在工作流层而非 CLI。** 整组预览上传的每个文件扩展名可能不同（`.mov`/`.mp4`/`.m4v`），mimeType 必须逐文件确定。故推断落在 `uploadPreview` 内（未显式指定时按文件名推断、未知扩展名则省略该字段交 Apple 处理），`--mime-type` 仍可覆盖。这比把推断放在 CLI 更稳——整组流复用同一入口即逐文件正确，单一来源不漂移。

**整组目录流在工作流层，CLI 只解析目录。** 目录枚举 + 排序 + 逐文件上传 + 可选重排是工作流职责（`uploadScreenshotSet`/`uploadPreviewSet`），可在工作流层独立测试；CLI 只负责把 `--dir` 读成有序文件列表（哪些扩展名算素材是 CLI 的输入约定）。顺序上传（非并发池）延续 M5 分段下载的取舍：可审计、中断时干净停在某文件、前序资产已落地可经 `list`/`delete` 诊断与清理。

## 实机核实记录

实施中对真实 ASC 行为的核实结果，逐项落档。

**2026-06-13 真机核实完成**：凭据已通过真实 ASC 认证（Sonara `6761486081`）。先在 live 版本 1.1.1 的真实截图上核实**读侧**——`list-sets` 经 localization 的 related 读返回 `APP_IPHONE_65` set；`list` 返回 6 张截图，均带 `fileName`/`fileSize`/`sourceFileChecksum` 且 `assetDeliveryState.state` 为 `COMPLETE`；`resolved`（version→locale→localizationId）链与弃用成员 `assetDeliveryState` 访问器在真实数据上正确解码。随后因 Sonara 6 个版本全部 `READY_FOR_SALE`、无可编辑版本，经 API 临时新建一个可编辑草稿版本 1.1.2（`PREPARE_FOR_SUBMISSION`，ASC 自动继承 zh-Hans/en-US localization），在其上完成**上传链路**核实：

- `ASC_SMOKE_MEDIA=1` 冒烟（工作流函数直连）：find-or-create set → reserve → **免认证 PUT（10592 字节、1 op，Apple 签名 URL 接受）** → commit（源文件 MD5）→ confirm 轮询至 `COMPLETE`（Apple 接受 1290×2796 的 `APP_IPHONE_67`）→ delete 截图 → delete 本次创建的 set。
- CLI 走查（监督式，走完整 citty 信封）：`upload` 两张到同一 display type，第一张 `setCreated:true`、第二张 `setCreated:false` 且 set 成员数变为 2（**追加非覆盖**核实）；信封 `resolved` 链充实、`finalState:COMPLETE`，**任何字段都不含签名上传 URL**（`uploadOperations` 提交后为 null、`assetToken` 仅为资产路径、`templateUrl` 为公开 CDN 缩略图）。`delete-set --force` 对 2 成员 set 返回 `deletedScreenshots:2`（**级联删除**核实）。
- 中断恢复核实：经 `reserveAppScreenshot` 只预约不传输，资产停在 `AWAITING_UPLOAD`，可经 `list` 诊断、经 `delete` 清理——直接对应退出标准"诊断停在哪个阶段"。

**过程中发现并修复一处冒烟脚本缺陷**：`solidColorPng` 依赖的 `const CRC32_TABLE` 声明在顶层 `await` 流之后，而媒体检查在该流中调用它——常量仍在暂时性死区，触发 `ReferenceError`。此前因无可编辑版本、媒体检查始终跳过而未暴露，正是真机核实才命中。已把该常量上移到 `await` 流之前。

**一处 Apple API 限制（验证方法的副作用，已落档）**：草稿版本 1.1.2 验证完毕后无法经 API 删除——`DELETE /v1/appStoreVersions/{id}` 返回 `STATE_ERROR: Only the first version of any platform can be deleted`。我创建的全部测试截图/set 均已删除，该草稿版本回到 ASC 新建"下一版本"的自然继承态（仅含从 1.1.1 继承的 `APP_IPHONE_65` set），但版本本身需在 ASC 网页端处理或留作下一版本。**结论**：冒烟脚本刻意复用既有可编辑版本（而非新建）正是为规避此不可逆性；新建版本仅适合一次性人工核实。

下表逐项结果：

| # | 核实项 | 结果 |
|---|---|---|
| 1 | 预约响应 `uploadOperations` 形态（单/多 op、`requestHeaders` 内容、是否含 `Content-Type`） | ✅ 已核实（2026-06-13 小 PNG 单 op、`requestHeaders` 在场；免认证 PUT 被接受即印证其内容正确；提交后 `uploadOperations` 转为 null） |
| 2 | 免认证 PUT 是否被 Apple 签名 URL 接受（最关键安全断言的真机印证） | ✅ 已核实（2026-06-13 冒烟与 CLI 各完成一次：10592 字节经免认证 PUT 上传，Apple 签名 URL 接受，confirm 至 `COMPLETE`；信封任何字段不含签名 URL） |
| 3 | commit `sourceFileChecksum` 基准（假定源文件原样 MD5） | ✅ 已核实（2026-06-13 以源文件原样 MD5 提交，Apple 接受并处理至 `COMPLETE`；live 既有截图的 `sourceFileChecksum` 亦为 32 位 MD5 hex 印证格式） |
| 4 | confirm 状态推进真实枚举序列（`AWAITING_UPLOAD`→`UPLOAD_COMPLETE`→`COMPLETE`） | ✅ 已核实（2026-06-13 reserve 后实测停在 `AWAITING_UPLOAD`，完整上传后轮询至 `COMPLETE`；小图处理在 60s 预算内完成） |
| 5 | 预览 `videoDeliveryState` 处理时延与 `previewFrameImage` 状态 | ⏳ 未核实（预览刻意不冒烟，视频转码分钟级；留待监督式预览走查，默认预览轮询预算 600s） |
| 6 | `delete-set` 对非空 set 的级联 vs 拒绝行为 | ✅ 已核实（2026-06-13 `delete-set --force` 对 2 成员 set 返回 `deleted:true`、`deletedScreenshots:2`，Apple 级联删除 set 及其截图；空 set 返回 `deletedScreenshots:0`） |
| 7 | `APP_IPHONE_67` 当前接受尺寸（冒烟假定 1290×2796 portrait） | ✅ 已核实（2026-06-13 1290×2796 portrait 被 Apple 接受并处理至 `COMPLETE`，未触发 `processing` FAILED） |
| 8 | 重跑 `upload` 的追加（非覆盖）行为 | ✅ 已核实（2026-06-13 同 display type 连传两张：第二张 `setCreated:false` 复用 set，set 成员数变为 2，追加非覆盖） |
| 9 | 悬挂 `AWAITING_UPLOAD` 资产可经 `list`/`delete` 诊断清理 | ✅ 已核实（2026-06-13 只预约不传输的资产经 `list` 显示 `state:AWAITING_UPLOAD`、经 `delete` 干净清理） |

## 验证清单

- [x] 传输原语单元测试（`media-files.test.ts`）：整文件 MD5 对照基准、单/多 op ranged PUT（免认证、区间正确、`Content-Length`）、5xx 每片重试换新流、持久 5xx 去 query target、非 429 的 4xx 不重试、空/畸形 op → upstream 错误。
- [x] 工作流集成测试（`workflow-media.test.ts`）：四步 interceptor 编排、**PUT 免认证断言**、find-or-create 复用（不注册 set-POST 即证未创建）、多 op ranged 长度、`processing` FAILED 携 Apple 原因、轮询超时返回 `pollTimedOut` 不抛、预览双状态（asset COMPLETE 但 video PROCESSING 必须续轮询）、视频 FAILED → `processing`、预览 mime 推断、整组上传 + `--reorder` 全量成员排序、`status` 单次读不轮询。
- [x] CLI 测试（`cli-media.test.ts`）：arg 校验（坏 enum、缺/坏 `--file`、畸形 timecode、重复 `--order`、空 `--dir`）→ 退出 64 不触网；成功信封 `resolved` 链充实、JSON 任何处**无签名 URL**；`delete` 信封。
- [x] 上传侧 `file-processing` 四阶段：分类、stage 判别、退出码 3 映射、CLI hint 配齐（穷尽 `Record<FileProcessingStage>`）。
- [x] 弃用依赖收敛在两个能力文件（eslint 局部豁免、单成员泄漏下沉为访问器）；引擎/传输/CLI/错误模型与弃用无关。
- [x] `npm run check` 全绿；生成契约零改动；零新增运行时依赖。
- [x] 真实账号上传即删（2026-06-13 完成，截图）：`ASC_SMOKE_MEDIA=1` 冒烟在临时草稿版本 1.1.2 上跑通 reserve→免认证 PUT→commit→confirm `COMPLETE`→delete 截图→delete set；核实项 1–4、6–9 全部 ✅，详见上文与实机核实记录表。修复了暴露出的 `CRC32_TABLE` 暂时性死区缺陷。预览（核实项 5）仍刻意不冒烟。
- [x] 监督式 Skill 走查（2026-06-13 完成，截图）：经完整 CLI 信封 `upload` 两张并确认 `COMPLETE`，校验 `resolved` 链、追加语义与**信封无签名 URL**，随后 `delete`/`delete-set` 清理。预览的监督式走查待后续（视频转码时延）。
