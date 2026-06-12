# M4 元数据与评论能力、最小 Skill 入口 — 阶段计划

本文是 [Roadmap](../roadmap.md) 中 M4 阶段的详细计划。目标：把读能力面扩展为读写能力面（版本级与应用级元数据与本地化、评论读取与开发者回复），并第一次以 Skill 形态暴露既有能力。策略依据为[架构总览](../../architecture/overview.md)的能力层与 Skill 入口形态、[Skill 入口与 CLI 策略](../../implementation/skill-interface.md)与[产品范围](../../product/api-scope.md)的硬性设计要求，Apple 行为核实于 **2026-06**。

## 目标与退出标准

来自 Roadmap：

- 元数据与本地化更新链路在测试账号验证通过，评论读取与回复可用。
- 通过 agent 实际调用 Skill 完成一次真实任务，例如读取应用元数据并修改一处文案。

## 范围与非目标

**范围**：appInfos 读取与两级本地化能力（appStoreVersionLocalizations 与 appInfoLocalizations 的列表、详情、更新、新增语言）；评论读取（按应用/按版本、过滤与排序）与开发者回复（读取、创建或替换）；覆盖既有与新增能力的最小 CLI 入口（citty 子命令、结构化输出、退出码语义、preflight 自检）与 SKILL.md 路由；集成测试与冒烟脚本扩展（含环境变量门控的写回路）。

**非目标**（刻意排除，后续阶段按需引入）：

- 不做本地化删除（移除语言）——属破坏性操作，留待真实需求出现时连同确认/防误触设计一起引入。
- 不做 `appInfos` 的 PATCH——契约中该操作仅承载类目关系（categories-only），不是文案元数据，对应能力留给后续里程碑。
- 不做列表读取的 include 关系展开——分页收集器只保留 `data`，展开 `included` 需要分页层先扩展信封，留作后续扩展点；实例读取（getAppInfo、getCustomerReview）不受此限。
- 不做报表、媒体、TestFlight 能力（M5/M6/M7）；CLI 以可见 stub 如实报告"暂未实现 + 计划里程碑"。
- 不做分发态打包（M8）；本阶段 Skill 以仓库内项目级形态运行于开发构建。

## 决策与理由

**写操作模板：属性类型自契约请求 schema 派生、JSON:API 信封内化、返回完整响应文档。** 这是仓库的第一笔写操作，模板将被后续所有写能力复用。属性入参直接采用生成契约的 `…CreateRequest`/`…UpdateRequest` 的 `data.attributes` 类型原样透传——它与资源 schema 的属性在可空性与可选性上不同构（缺省=不变、`null`=清除、字符串=设置的三态语义只在请求 schema 上成立），任何包装层都得重新编码这套语义并随契约升级漂移。`data.type`、`data.id` 与 `relationships` 在能力函数内构造，调用方只传裸 id；字面量路径下 openapi-fetch 的请求体全类型化，写错资源 type 字符串无法通过类型检查。写操作与详情读取一致返回完整响应文档，创建场景天然携带服务端分配的 id。

**不做客户端可编辑性预校验。** Apple 未发布契约级的"哪个字段在哪个版本状态可编辑"矩阵（属性文档为空），任何客户端矩阵都是手工维护的民间知识，且版本状态模型仍在演进（`appVersionState` 取代 `appStoreState`、新增状态值）。越状态写入由 ASC 以 409/422 拒绝，请求层已将其归一为带 JSON:API source pointer 的参数错误——这比客户端合成的拒绝信息更准确。能力函数的文档注释承载人类需要的经验规则（如 whatsNew 在首个版本不可用、promotionalText 任何状态可改），CLI 层据此把 409 转译为可行动提示。

**开发者回复命名为 `setCustomerReviewResponse`，承载 upsert 语义。** Apple 文档明确 POST `customerReviewResponses` 在已有回复时直接覆盖（create-or-replace），发布为异步（先 `PENDING_PUBLISH`）。"set" 如实表达"设置即替换"，避免 create/update 双动词暗示不存在的状态区分。命名陷阱一并固定：契约中 `CustomerReviewResponse` 是单条评论的响应文档，开发者回复资源是 `CustomerReviewResponseV1`——照搬 Apple 原名加注释消歧，不发明新名。读取侧的真实行为（2026-06 实测）：无回复时 `GET /v1/customerReviews/{id}/response` 返回 **200 + `data: null`** 而非 404，且生成类型声称 `data` 不可空——能力层把这一形态转为统一的 not-found 错误，离线测试同时覆盖 404 与 200-null 两种形态。

**CLI 以自有错误漏斗驱动 citty，而非交给 `runMain`。** citty 的默认主驱动自带错误处理与退出语义，与本项目"错误分类 → 退出码 + 可行动诊断"的口径冲突。入口以 `runCommand` 自驱，所有命令处理器只抛错，单点漏斗把 AscError 分类、用法错误、"暂未实现/不支持"映射为退出码与 stderr 诊断；`--help` 解析走自有命令注册表（注册表本就是 `capabilities` 命令的数据源）。框架选型判断见[架构总览](../../architecture/overview.md)。

**子命令建模用户任务：`metadata app` 与 `metadata version` 双子域同构动词。** 元数据按 ASC 网页端的心智模型分为"应用信息"与"版本页"两个任务子域，动词完全同构（list/get/update/add-locale），agent 只需学一种形态；"添加语言"是用户任务 `add-locale`，底层映射到本地化 create。应用级元数据的 appInfo 中间资源由 CLI 内部解析（默认取可编辑态，`--live` 切换，`--app-info` 逃生口），解析结果写入输出信封的 `resolved` 块如实报告——"solve, don't punt"。版本级元数据显式要求 `--version <id>`：哪个版本可编辑是 agent 能自行读取并推理的可见数据，不值得隐藏。

**输出双通道：stdout 仅承载结果信封，失败时为空。** 成功输出为单个 JSON 信封（`ok`、`command`、契约原样的 `data`、列表附 `pagination` 诚实诊断与限流快照、可选 `resolved`）；错误、提示、进度一律走 stderr（`error[分类]` + `hint` 转译 + 条件性 api-errors/进度/限流行）。"解析 stdout"对 agent 无条件安全，分页截断信息让任务反馈可以如实表述"读了多少、还有多少"。

**退出码扩展冒烟脚本先例。** 0 成功 / 1 意外 / 2 凭据·配置 / 3 归一 ASC 错误的既有语义保持，新增 4（限流，含余量地板）、5（本项目暂未实现）、6（Apple API 不支持）、64（用法错误，BSD EX_USAGE）。划分标准是"agent 的下一步动作不同"；更细的错误区分已由 stderr 的分类前缀机器可读地承载，不再膨胀退出码。

**"暂未实现"与"Apple API 不支持"由注册表驱动，形态不同。** 命令注册表是能力状态的唯一事实源：已规划域（TestFlight/报表/媒体）生成可见 stub 子命令，出现在帮助中、接受任意尾随参数、运行即退出码 5 并指名计划里程碑——agent 撞上时得到的是事实而非"未知命令"；API 不支持的任务（改/删评论与评分、审核沟通、协议银行、key 管理）没有可执行的命令，经 `capabilities` 命令与 SKILL.md 呈现并给出网页端指引，退出码 6 保留给运行期命中的 API 边界。这是[产品范围](../../product/api-scope.md)硬性要求的落点。

**preflight 双层：入口引导守卫 + `doctor` 离线全检。** 每次调用先做内联 Node 版本检查与守卫式动态加载（依赖缺失输出"在哪里执行 npm ci"而非裸堆栈，对应 Skill 运行环境保障的自愈指引）；`doctor` 命令离线检查 Node 版本、依赖可加载、构建产物、凭据环境变量（只报变量名与 key 形态，绝不回显值），逐项附修复文案。联网验证仍归 `npm run smoke`，doctor 不发网络请求。

**冒烟写回路选 promotionalText，评论回复刻意不进冒烟。** 门控写回路（`ASC_SMOKE_WRITE=1`）选版本本地化的 promotionalText：它是唯一在任何版本状态（含在售版本）都可编辑且不触发重新送审的文案字段，读原值 → 写标记 → 读回断言 → finally 还原，可重复且不留痕；还原失败时打印本地化 id 与原值（公开商店文案，非敏感）供人工恢复。评论回复不进冒烟：公开可见并通知评论者、upsert 覆盖不可还原、测试账号未必有评论——离线请求体断言已全覆盖，真实验证留给人工监督的 agent 任务走查。

**SKILL.md 单文件路由器，reference 拆分推迟。** M4 命令面规模下，按域拆 reference 文件只会增加一层间接；每个子命令的 `--help` 已自描述参数，SKILL.md 承载触发描述、凭据配置、能力边界三清单、任务→命令路由表与输出口径即可，全文远低于官方预算。安装与运行命令一律带显式路径（`${CLAUDE_SKILL_DIR}` 替换变量），杜绝在用户工作目录误装依赖。

## 验证清单

- [x] 两级本地化的列表/详情/更新/新增语言经离线集成测试覆盖：查询串序列化、PATCH/POST 请求体深比较（含 `null` 清除透传与 relationships 构造）、409/422/403/404 归一语义。
- [x] 评论读取的过滤、排序、`exists[publishedResponse]` 布尔序列化与分页经测试覆盖；`getCustomerReviewResponse` 在无回复时上抛资源不存在错误；回复 POST 请求体断言通过。
- [x] CLI 信封字段（data/pagination/resolved/rateLimit）与各退出码路径（2/3/4/5/64）经进程内集成测试覆盖；stub 域输出计划里程碑；`--help` 在根与叶子层可用。
- [x] `doctor` 在缺失/冲突环境变量下逐项输出"缺什么、怎么补"，全绿环境退出码 0。
- [x] `npm run check` 全绿；生成契约零改动；新增运行时依赖仅 citty（判断先于代码写入架构总览）。
- [x] `npm run smoke`（只读，含新增 appInfos/本地化/评论读取步骤）与 `ASC_SMOKE_WRITE=1 npm run smoke`（promotionalText 写回路）在测试账号通过（2026-06-12：versions 真实 cursor 翻页；zh-Hans promotionalText 写回路打标、读回、还原无残留）。
- [x] 通过 Claude Code 实际调用 Skill 完成真实任务走查（2026-06-12）：读取两级元数据；改 en-US promotionalText 并经 `--from-json` 的 `null` 清除还原；appInfo 解析双路径（默认可编辑态在无候选时给出带候选清单的 not-found、`--live` 命中在售 appInfo 并写入 `resolved` 块）；评论列表、`--unanswered` 过滤（`exists[publishedResponse]` 实机生效）。账号全部版本在售，`add-locale` 走通的是真实 409 归一拒绝路径（"Cannot create localization after the app version has been submitted for review"，source pointer 与 hint 完整）；真正新增语言需要可编辑版本，待账号出现草稿版本后可复验。走查中发现并修复：无回复时 ASC 对 `GET …/response` 返回 200 + `data: null`（而非离线假设的 404），能力层补齐转统一 not-found。
- [x] 评论回复（`reviews respond`）经用户批准后真实发布（2026-06-12）：`--body-file` 提交、返回 `PENDING_PUBLISH`、`get-response` 读回一致；附带验证了无回复时 200-null 转 not-found 的修复。
