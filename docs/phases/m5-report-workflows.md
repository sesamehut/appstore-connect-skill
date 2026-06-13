# M5 报表工作流 — 阶段计划

本文是 [Roadmap](roadmap.md) 中 M5 阶段的详细计划。目标：交付第一个多步骤工作流——销售/财务报表的同步下载链路与 Analytics 报表的异步多步链路——以真实能力检验[架构总览](../architecture/overview.md)中工作流层的设计。策略依据为[请求模型与流程策略](../implementation/request-model.md)的报表流程一节、[Skill 入口与 CLI 策略](../implementation/skill-interface.md)的输出口径与[产品范围](../product/api-scope.md)的硬性设计要求。Apple 行为核实于 **2026-06**。

## 目标与退出标准

来自 Roadmap：

- 报表从发起请求到本地结构化结果全链路可用。
- 轮询与状态推进细节不泄漏给业务调用方。
- 个人 key 与团队 key 的权限差异有明确反馈。

## 范围与非目标

**范围**：销售与财务报表的同步下载（参数组合校验、gzip 解压、解析摘要、可选 JSON 转换）；Analytics 报表的异步链路（报表请求创建与幂等 ensure、报表/实例/分段枚举、分段下载与完整性校验、按"报表名 + 日期"一步直达下载）；`file-processing` 错误族（下载/解压/解析/校验/写盘阶段可区分）；vendor number 配置（`ASC_VENDOR_NUMBER` 环境变量与 `--vendor` 旗标）；CLI `reports` 域（销售/财务/Analytics 三子域）；冒烟脚本的报表步骤扩展；SKILL.md 与能力注册表更新。

**非目标**（刻意排除，后续按需引入）：

- 不做报表内容的业务聚合或字段映射——解析结果保留 Apple 原始字段语义，行级消费留给调用方（[请求模型](../implementation/request-model.md)的既定边界）。
- 不做定时轮询或后台守护——Analytics 首份数据需 1–2 天，等待属于任务级决策，CLI 单次调用如实报告"尚无数据"而不是挂起等待。
- 不做 `file-processing` 错误族的上传/提交阶段——那是 M6 媒体上传的语义，本阶段只落下载侧的五个阶段。
- 不做报表缓存或增量同步——报表是不可变服务端工件，重复下载幂等且成本可见，缓存策略留给真实使用模式出现后再设计。

## 决策与理由

**流式写盘，绝不整体缓冲报表体。** DETAILED 销售报表与 Analytics 分段文件可达数百 MB，而 CLI 约定 stdout 只承载 JSON 信封。工作流层把响应体经单一流水线（gzip 嗅探 → 压缩字节 MD5 → 条件解压 → 行观察 → 写盘）落到磁盘，返回元数据摘要（路径、字节数、行数、表头、分隔符），内存占用与报表体积无关。信封承载摘要，文件承载明细，agent 需要行级数据时自行读文件或用 `--format json` 的转换产物。

**gzip 以 magic bytes 嗅探，不信任 Content-Type/Content-Encoding。** Apple 把 gzip 作为载荷传输（`Content-Type: application/a-gzip`），而 undici 只在 `Content-Encoding: gzip` 时自动解压——真实 ASC、分段所在 CDN 与测试 mock 三种环境的行为可能不一致。嗅探首两字节（`0x1f 0x8b`）让流水线在"已解压"与"未解压"两种世界里都正确，代价是一次首块预读。

**JSON 转换从磁盘二次遍历，不并入下载流水线。** `--format json` 的转换失败（stage `parse`）不应损失已经落地的原始文件；二次遍历也让下载流水线保持单一职责。转换产物以 header 行作键、值全字符串、Apple 字段名原样——与"不做业务映射"的边界一致。

**分段下载绝不经过带认证的 client。** Analytics 分段的 `url` 是外部 CDN 的短时效签名地址，免认证；若复用带认证的请求层，Bearer token 会泄漏给第三方主机。分段下载自建 `createRetryingFetch`（请求层早已为 M6 预告该模式），离线测试以"分段请求不携带 authorization 头"为最关键断言。分段顺序下载：可审计、不占 ASC 配额、段数小，并发是无当前需求的优化。

**checksum 校验失败保留 `.corrupt` 证据文件。** 完整性校验不符时把已写文件改名 `<path>.corrupt` 再抛 stage `checksum` 错误——字节留给人工诊断，重跑覆盖幂等。checksum 算法与基准（压缩或解压字节）Apple 未文档化，先假定 MD5 over 压缩字节，实机核实后修正（hash tee 的位置是一行改动）。

**`ensure-request` 幂等：先 list 后 create，绝不自动删除。** 存在活跃（非 stopped）请求即复用；只有 stopped 请求时按 Apple 官方恢复路径直接创建新请求，结果如实报告旧请求已停止。删除会丢弃 Apple 侧已积累数据并重置 1–2 天等待，破坏性恢复留给显式 `delete-request` 动词——延续 M4 对破坏性操作的立场。`ONGOING` 为默认 accessType：持续生成、读取即保活，是稳态选择；`ONE_TIME_SNAPSHOT` 留给历史回填的显式选项。

**销售/财务下载直接生活在工作流层，不另设能力层转发。** 单行 HTTP 调用与多步文件处理（流、嗅探、解压、摘要）不可分割，按架构边界整体属于工作流层；拆出一个"返回原始流"的能力函数只会把一个职责劈在两层，无复用收益。Analytics 的五类资源读写则是标准单请求操作，按能力层模板（`customer-reviews.ts`）落在 `src/capabilities/analytics-reports.ts`，工作流层只做串联与文件处理。

**`file-processing` 映射到退出码 3，不新增退出码。** 退出码按 agent 的下一步动作划分（M4 决策）：文件处理失败的下一步与其他请求路径失败相同——读 stderr 的 `error[file-processing]` 与 stage 提示后重跑或上报。更细的阶段区分已由 stderr 机器可读地承载。

**报表"该日期不存在"做 404 增强，不泄漏到通用 hint。** 销售/财务的 404 语义高度参数相关（日报约一天后出现、周报需周结日、财报需财务月关账、过老的日报会过期），工作流层捕获归一后的 not-found 错误并重抛参数感知的可行动消息，保留原始 `apiErrors` 与请求上下文；CLI 的通用 hint 表保持资源无关。

**vendor number 是账号配置，不是凭据。** 新增可选环境变量 `ASC_VENDOR_NUMBER`（`--vendor` 旗标优先），不进认证层的 `ASC_ENV_VARS`——认证层不长报表知识。API 无法读取 vendor number，缺失时的用法错误与 `doctor` 的可选检查都指向 ASC 网页（Payments and Financial Reports）。

**日期校验数据驱动，只查格式不查语义。** 频率↔日期格式表（DAILY/WEEKLY=YYYY-MM-DD、MONTHLY=YYYY-MM、YEARLY=YYYY）做成数据结构，用法错误能精确说出"MONTHLY 期望 YYYY-MM，例如 2026-05"。官方文档对格式描述笼统（统一写 YYYY-MM-DD），与社区已知行为有出入——实机核实后表项一行修正。周结日（周六/周日）不做本地校验，语义进 404 增强文案。

## 实机核实记录

实施中对真实 ASC 行为的核实结果，逐项落档：

| # | 核实项 | 结果 |
|---|---|---|
| 1 | 销售/财务 200 响应是否带 `Content-Encoding`（影响 undici 自动解压） | 已核实（2026-06-13）：销售 200 以 gzip 载荷传输，`wasGzipped: true`——undici 未自动解压（若带 `Content-Encoding: gzip` 则预解压、`wasGzipped` 应为 false），magic-byte 嗅探 + `node:zlib` gunzip 实机生效；落盘为 TSV（`delimiter: tab`）。压缩前字节做 MD5 的基准下游沿用 |
| 2 | 分段 checksum 算法与基准（假定 MD5 over 压缩字节） | 待核实（需 Analytics 实例数据，预计 2026-06-14/15） |
| 3 | 分段文件格式（CSV vs TSV、是否 gzip） | 待核实（需 Analytics 实例数据）；销售/财务报表已确认为 gzip 载荷的 TSV |
| 4 | 各频率 `filter[reportDate]` 真实接受格式 | 已核实（2026-06-13）：DAILY=`YYYY-MM-DD`（2026-06-11/09 成功）、WEEKLY=`YYYY-MM-DD`（须周日，见 #5）、MONTHLY=`YYYY-MM`（2026-05 成功，29 行）。社区已知格式成立，校验表无需修正 |
| 5 | WEEKLY 报表的周结日 | 已核实（2026-06-13）：**周日**。2026-05-31、06-07（周日）下载成功；周六（06-06、06-13）被 ASC 拒为 invalid-parameter「please specify the date of the Sunday ending the desired week」。ASC 自校验周结日，故本地只查格式、周结语义交 ASC/404 文案的决策成立 |
| 6 | stopped 请求共存时新建请求是否 409 | 待核实（账号现无 stopped 请求，需自然进入 inactivity 后才能实测；复用/新建两分支均有离线测试兜底） |
| 7 | 报表端点是否有独立于 3500/h 的更严配额 | 已核实（2026-06-13）：销售与 analytics 端点响应头均为 `user-hour-lim:3600`，未见独立更严配额 |
| — | Analytics 报表请求创建记录（id、accessType、创建日期） | 已执行（2026-06-13）：app `6761486081`，请求 id `e4bc99be-a9d9-4643-878b-7cf44067f829`，accessType `ONGOING`，`created: true`，无 stopped 旧请求；重跑 `ensure-request` 返回同一 id 且 `created: false`，幂等复用实机验证通过。首份数据预计 2026-06-14/15 生成 |
| — | Analytics 链路实机观察（数据生成前，2026-06-13） | 报表**目录**在创建请求当日即可列出（约 80+ 个报表定义，含 "App Downloads Standard" id `r3-e4bc…`，category `COMMERCE`）；其实例列表为 0——1–2 天等待的是**实例**而非目录。一步直达 `download` 实机命中"无实例"分支，输出 1–2 天指引并以 exit 3 收尾，与离线测试一致 |
| — | vendor number 确认（2026-06-13） | vendor number = `94111823`（8 位，见 Business 页法律实体区块）。对照测试三态印证：作 vendor 时 `8467091398`（右上角面包屑的 Provider/Team ID）被拒为 invalid-parameter「Invalid vendor number specified」，纯假号 `00000000` 触发 UNEXPECTED_ERROR，而 `94111823` 仅在无数据时回 NOT_FOUND（被接受）。已写入 `.env.local`（未入库） |
| — | 销售报表实机下载（2026-06-13） | 成功：DAILY（06-11、06-09 各 1 行）、WEEKLY（05-31、06-07）、MONTHLY（2026-05，29 行）。`--format json` 转换产物与原始 TSV 并存、保留 Apple 原始字段语义（值全字符串、表头原样）；env vendor 解析、`...1823` 掩码、增强 404、invalid vendor → invalid-parameter 均实机验证。app 为 Sonara（`6761486081`），仅免费下载 |
| — | 财务报表实机结果（2026-06-13） | 路径已验证：认证通过、key 具财务角色（**无 403**）、vendor/region/fiscal 均被接受，增强 404 文案（财务月 + 区域 + ZZ 汇总 + vendor 掩码）正确渲染；financeReports 端点不按枚举校验 region（非法 `XX` 亦回 404）。但该账号零货币收入（仅免费下载，Developer Proceeds 全 0.00），Apple 不生成任何财报，故「成功下载」终态在此账号不可演示——与冒烟「缺报表=报告性跳过」口径一致 |
| — | 监督式 Skill 走查：销售下载（2026-06-13） | 独立 subagent 仅凭 SKILL.md + CLI 完成「下载 2026-06-11 日报并要一份 JSON」：先按手册「ask the command itself」跑 `--help`，再 `reports sales download --date 2026-06-11 --format json --output <file>`（exit 0），正确解析信封并如实转告落盘路径，全程不读/不回显凭据；落盘 TSV/JSON 与信封一致。**发现**：用户说「存到文件夹」时 `--output` 是文件路径（非目录，analytics 才用 `--output-dir`），agent 靠 `--help` + 复用默认命名绕过——已在 SKILL.md conventions 补一句澄清。Analytics 下载走查待实例数据 |

## 验证清单

- [x] `file-processing` 错误族：分类、stage 判别、退出码映射、CLI hint 经单元与集成测试覆盖。
- [x] 销售/财务下载离线集成测试：精确 query 断言、gzip 与预解压双形态、截断 gzip → `decompress` 阶段错误、403 个人/团队 key 文案、404 增强消息、`--format json` 深比较。
- [x] Analytics 全链路离线测试：ensure-request 三分支（复用/创建/stopped 新建）、报表名 0 命中与多命中反馈、分段下载不携带 authorization 头、checksum 不符 `.corrupt` 改名。
- [x] CLI 信封与退出码路径（64=日期/vendor 用法错误；3=增强 404 与 file-processing）经进程内集成测试覆盖；`resolved` 块承载 Analytics 中间解析链。
- [x] `npm run check` 全绿；生成契约零改动；零新增运行时依赖。
- [~] 真实账号（2026-06-13）：销售报表 DAILY/WEEKLY/MONTHLY 下载成功（核实项 1/4/5 已记录）✅；财务报表路径已验证（key 具财务角色无 403、增强 404 正确），但账号零收入故无财报、成功终态不可演示；**Analytics 一步直达全链路成功（核实项 2/3）待实例数据生成（约 2026-06-14/15）**。
- [x] `npm run smoke`（含报表只读步骤）在测试账号通过（2026-06-13）：销售 2026-06-10 实下成功（2 行、gzip、28 列），财务/Analytics 下载步骤按设计报告性跳过（无财报/无实例），`smoke check passed`。
- [~] 通过 Claude Code 实际调用 Skill 完成"下载某天销售报表"（可做）与"下载某 Analytics 报表"（**待实例数据**）真实任务，信封 `resolved`/摘要与落盘文件核对一致。
