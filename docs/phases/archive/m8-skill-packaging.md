# M8 Skill 完备化与发布 — 阶段计划

本文是 [Roadmap](roadmap.md) 中 M8 阶段的详细计划。M0–M7 已交付产品首期六项能力闭环（HEAD 已含 M7 送审/发布），M8 把"能力可用"打磨成"可分发的 Skill"：单文件零安装 CLI 产物、单一来源生成的 SKILL.md、独立 plugin 仓库与 marketplace 注册、从零配置的使用文档，以及一次贯穿"能力描述 / 输入校验 / 用户可读反馈"的口径审计。它检验[架构总览](../architecture/overview.md)的分发态构建策略与[Skill 入口与 CLI 策略](../implementation/skill-interface.md)的运行环境保障在真实分发链路上成立。生态/约定核实于 **2026-06**。

本阶段不新增任何 ASC 能力——所有改动落在打包、分发与文档侧，运行时依赖纪律（三个）不变。

## 目标与退出标准

来自 Roadmap M8"退出标准"，逐条对应到本阶段交付物：

- **新用户按文档从零配置并跑通一个真实任务**——交付一份 plugin README（英文，仓库内文档英文），覆盖凭据（env vars）→ 安装（Claude Code marketplace）→ 一次真实只读任务的端到端路径。
- **Skill 描述准确反映能力边界，agent 不被误导**——本阶段做一次描述/边界审计（M3–M7 已逐域落地，故是审计而非重写）：`description` 触发器、`capabilities` 机器可读图、"works now / not implemented / not possible"三态边界与实际 registry 对齐。
- **分发包安装后零依赖安装步骤即可运行，环境前提仅 Node**——交付一个由 esbuild 打出的自包含 ESM 单文件 `asc.mjs`，内联 jose/openapi-fetch/citty，不含 node_modules、不含 postinstall。
- **经 marketplace 安装的 plugin 与开发态项目级 skill 行为一致**——plugin 载荷由开发仓库单一来源**生成**（不手抄），SKILL.md 正文环境无关、共享；两变体只差"CLI 调用块"与"setup 块"两处，由模板渲染保证不漂移。

附加（M8 范围内、非 Roadmap 显式列出但本阶段承诺）：版本号在 package.json / `CLI_VERSION` / plugin.json / marketplace entry **四处**一致（一个 check 守卫，本仓内三方臂入 `check`、跨仓 marketplace 臂作发布前门）；安全姿态延续——bundle 与仓库均不含凭据，签名 URL / demo 密码维持已交付的脱敏，且由 staging secret-scan 与 plugin `.gitignore` 机械守卫。

## 范围与非目标

**范围**：esbuild 单文件 bundle 脚本（build-time devDependency，产出可审计、不 minify、对未变源码零差异的 `asc.mjs`，并让 `doctor` 对 bundle 自知）；SKILL.md 单一来源模板 + `skill:generate` / `skill:verify`（守 dev 与 plugin 两变体、CRLF 归一）并接入 `npm run check`；`package:plugin` 脚本把 plugin 载荷（清单 + `skills/<name>/SKILL.md` + `cli/asc.mjs` + README + CLAUDE.md + .gitignore）以 allow-list 从单一来源装配进 staging 目录 + secret-scan；plugin.json 与 marketplace entry 内容（短名 `app-store-connect` + 类目 `developer-tools`）；**四处**版本号一致性 check（含 `CLI_VERSION`，本仓三方臂入 `check`、marketplace 臂作发布前门）；plugin README（从零配置 + 凭据 + 确切安装命令 + 用法）；一次能力描述/输入校验/反馈口径的审计；文档更新（修 skill-interface.md 依赖计数、把 esbuild 决策折进 architecture/overview.md 的**三处** tsdown、Roadmap M8 状态、本 `.claude/rules/docs.md` 清单）；发布步骤（`gh repo create sesamehut/appstore-connect-plugin` + push + marketplace 编辑 + push）含 org 建仓/推送两类权限回退。

**非目标**（刻意排除）：

- **跨工具分发（Codex / Gemini）属 M9+**——本阶段只覆盖 **Claude Code**（plugin.json + `skills/` + bundled CLI）。刻意不做 Codex 的 `install/` 脚本与 `gemini-extension.json`。**注意**：sesamehut marketplace 元数据对外宣传是跨工具的，故本阶段把"跨工具"显式标为非目标并留前向指针——README 与 plugin 描述只承诺 Claude Code，不暗示其他运行面已支持。
- **不做 claude.ai / Claude API 运行面**——这两个面受网络与依赖安装限制（见 [Skill 入口与 CLI 策略](../implementation/skill-interface.md)的目标运行面），不在分发目标内，重申 M7 之前的一贯立场。
- **不做 build 二进制上传（pre-built binary）**——bundle 是 JS 文本产物，分发链路不涉及任何编译产物上传到 Apple 或 release 资产托管。
- **不新增任何 ASC 能力**——M8 是打包/分发/文档阶段，能力面冻结在 M7 末态；描述与校验审计只修口径，不加动词。
- **不引入运行时依赖**——esbuild 是 build-time `devDependency`，只出现在打包一步，绝不进入 `dependencies`；运行时三依赖（jose / openapi-fetch / citty）纪律不变，且它们被内联进 bundle 后分发态根本无 `node_modules`。
- **不做发布流程的全自动 CI**——本阶段交付可重复运行的本地脚本与一次手动发布；marketplace 注册是手动编辑数组 + push（与 sesamehut 既有约定一致），版本号靠 check 守卫而非自动 bump。CI 自动发布留 M9+。

## 关键发现与约定

### sesamehut marketplace / plugin 仓库约定（本会话已在磁盘核实）

- **marketplace 仓库**位于 `C:\Source\sesamehut\plugins-marketplace`，清单为 `.claude-plugin/marketplace.json`。清单顶层 `name` 为 **`sesamehut-plugins`**、`owner` 为 "Sesame Hut"。每个 `plugins[]` 条目形态为 `{ name, description, version, category, source:{ source:"url", url:<github .git>, ref:"main" } }`，且 sonara 条目的 `source.url` 实指 **`https://github.com/sesamehut/sonara-plugin.git`**。已见类目：`content-ops`（sonara）、`auth`（auth-client）。**注册是手动编辑该数组 + push**；version 手工同步（无自动化）；用户经 `/plugin marketplace update` 刷新。
- **plugin 仓库**（参照 `sonara-plugin`）布局：`.claude-plugin/plugin.json` 含 `{ name, version, description, author:{name,email}, homepage }`，**无 `skills` 字段**——skills 由 `skills/<name>/SKILL.md` **自动发现**。另含 `README.md`、`CLAUDE.md`、`.gitignore`。`skills/<name>/SKILL.md` 用 YAML frontmatter（`name`、`description`、可选 `compatibility` / `allowed-tools`）。
- **plugin.json `name` 是短产品名、不带 `-plugin` 后缀。** 核实 sonara：`plugin.json.name` = `sonara`、marketplace `entry.name` = `sonara`、而**仓库**才叫 `sonara-plugin`。`-plugin` 只是仓库命名后缀，**不进 plugin.json/marketplace 的 `name`**。这直接决定本项目的取名（见决策"类目与名称"）。
- **安装标识符 = `<entry.name>@<marketplace.name>`。** marketplace 顶层 `name` 为 `sesamehut-plugins`，故 sonara 的安装命令实为 `sonara@sesamehut-plugins`（由磁盘上的 `marketplace.json` 推导）；两步为 `/plugin marketplace add <owner>/plugins-marketplace` 后 `/plugin install <entry.name>@sesamehut-plugins`，用户经 `/plugin marketplace update` 刷新。README 的安装段必须用这个由 `marketplace.json` 推导出的确切后缀，不留占位符。
- **观察到的 owner 分歧（载荷与发布步骤必须正面对齐，不可含糊）。** sonara 这套先例在磁盘上是**自相矛盾**的：用户实际消费的 `marketplace.json` 的 `source.url` 指向 **`github.com/sesamehut`**、顶层 `name` 为 `sesamehut-plugins`；但 sonara-plugin 自带的 `plugin.json.homepage`（`github.com/lanvada/sonara-plugin`）、README 安装命令（`lanvada/plugins-marketplace` + `sonara@lanvada-plugins`）与 CLAUDE.md（"`/plugin install sonara@lanvada-plugins`"）却指向**个人账号 lanvada**——这是 sonara 早期个人账号态的遗留，与现行入库的 marketplace 不一致。**本项目定档以入库 `marketplace.json` 为准（即 `sesamehut` + `sesamehut-plugins`，与用户决策 D1/D2 一致）**：plugin.json `homepage`、README 安装命令、发布步骤的 org 目标统一对齐到 `sesamehut` / `sesamehut-plugins`，绝不沿用 lanvada 后缀；同时承认本机 `gh` 账号是 lanvada（见下方 gh 注记），这正是 org 权限回退存在的原因。
- **寻址**：`${CLAUDE_PLUGIN_ROOT}` = 已安装的 plugin 目录。bundle 化 CLI 在 SKILL.md 中以 `node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" <domain> <verb>` 调用。**注意**：sonara 是 Python 脚本插件、直接随仓发 `.py`，**组织内无 Node bundle 先例**——本项目的 bundle 方案是首例，由我们定义。
- **命名**：plugin 仓库命名 `<product>-plugin`、托管在 `github.com/sesamehut`、分支 `main`。镜像 sonara（app 仓库 `Sonara` → 仓库 `sonara-plugin`，但其 plugin.json/entry `name` 为短名 `sonara`）。本项目 app/dev 仓库为 `appstore-connect-skill` → plugin **仓库** `appstore-connect-plugin`，而 plugin.json/entry 的 **`name` 取短名 `app-store-connect`**（详见决策"类目与名称"）。

### SKILL.md 单一来源事实（模板设计的支点）

- 开发态 SKILL.md 在顶部以 `node "${CLAUDE_SKILL_DIR}/../../../dist/cli/index.js"` 调用 CLI（核实：顶部调用行用 `${CLAUDE_SKILL_DIR}` + 三段 `../`），并含一个**仅开发态**的"One-time setup"块。该 setup 块含**两条带路径的命令**——`npm ci --prefix "${CLAUDE_SKILL_DIR}/../../.."` 与 `npm run build --prefix "${CLAUDE_SKILL_DIR}/../../.."`——外加一行 `doctor`。
- 任务路由表的每一行都是**裸命令**（如 `apps list --bundle-id ...`），无 `node` 前缀——故**正文是环境无关的、可共享的**。
- 两变体之间**只有两处区域不同**：(1) 顶部 CLI-调用代码块（dev: 指向 `dist/cli/index.js`；plugin: 指向 `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs`）；(2) setup 块（dev: 两条 `--prefix`-带路径的 `npm ci` / `npm run build` + `doctor`，全部以 `${CLAUDE_SKILL_DIR}` 为根；plugin: **仅** `doctor`、无 `--prefix`、无 build——bundle 已就绪）。
- 推论：把这两处区域整体抽成占位（含 setup 块里两条 `--prefix` 路径，不能只占位首行调用），其余正文共享一份模板，即可从一个来源同时渲染两变体，结构上不可能漂移。模板的占位与渲染须在 Windows 仓库上做 `\r\n`→`\n` 归一（与契约层 `generate.mjs` 同款），否则 `skill:verify` 会因行尾而误判（见实现分解 (b)）。

### gh / org 权限注记（发布步骤的回退前提）

- 本机 `gh` 账号为 **lanvada**，scope 为 `repo` / `workflow` / `read:org`。在 **sesamehut org 下**新建仓库需要 org 级建仓权限——`gh repo create sesamehut/appstore-connect-plugin` 可能被拒；而即便仓库已存在，lanvada 仍须是 sesamehut org 下该仓库的 collaborator/member 且有 **write** 权限才能 push。即"无建仓权"与"无 push 权"是两种独立失败。发布步骤必须含回退（见"实现分解 (i)"），且回退须覆盖**两种**失败，不能只假定"有人帮忙建空仓后我必能 push"。

## 决策与理由

**D1 发布边界 = 全自动发布含 push。** 流水线最终既**新建并 push** plugin 仓库 `sesamehut/appstore-connect-plugin`，也**编辑并 push** 线上 sesamehut marketplace（在 `plugins[]` 追加本 plugin 条目）。理由：与 sonara 已有的"plugin 仓 + marketplace 条目"两段式分发一致，发布动作可脚本化、可重复，避免每次发版手工拼装载荷出错。发布 org 定档为 **sesamehut**（以入库 `marketplace.json` 为准——关键发现已记 sonara 的 lanvada 遗留仅为个人账号态，本项目不沿用）。**回退前提**：本机 `gh` 账号 lanvada 可能既无 sesamehut org 建仓权、亦无对目标仓的 push 权，故建仓与首推在权限被拒时退回人工（见实现分解 (i)），其余步骤（载荷生成、bundle、版本一致性、marketplace 条目编辑）仍全自动。

**D2 plugin 仓库 = 独立新仓 `appstore-connect-plugin`，载荷由开发仓单一来源生成。** 镜像 sonara（`Sonara` → 仓库 `sonara-plugin`），**不把开发仓库当 plugin**（Roadmap 明确）。注意命名分层：**仓库**名带 `-plugin` 后缀（`appstore-connect-plugin`），但 plugin.json/entry 的 **`name` 取短名 `app-store-connect`**（与 sonara 一致，详见"类目与名称"）。理由：开发仓含源码、测试、生成契约、scripts，体量与信任面都不适合作为面向用户的 plugin；而把 plugin 当成开发仓的一个生成产物（由 `package:plugin` 从单一来源装配），可消除"手抄载荷导致两仓漂移"的最大风险。plugin 仓内容是**生成物**，其 git 历史记录每次发版的载荷快照。

**D3 打包器 = esbuild（build-time devDependency），产出单文件 `asc.mjs`。** esbuild 把 CLI 连同 jose / openapi-fetch / citty 内联成**一个自包含 ESM 文件**，仅靠 Node 即可运行（零安装）。理由：Claude Code 安装 plugin 只是放置目录、无依赖安装钩子，若分发产物要求用户 `npm install`，等于把安装失败留到运行期；单文件把环境前提收缩到"有 Node"。源码保持逐文件可审计（开发态仍纯 tsc），bundle 仅是**生成的分发工件**。esbuild 只在打包一步出现、不进入日常开发环路与运行时依赖，风险面可控。

  - **可审计 + 可复现是 bundle 的硬要求（镜像契约层的确定性纪律）。** D3 承诺"源码可审计"，故 bundle **不做 minify**——分发的 `asc.mjs` 须保持人类可读，minified 单文件不算可审计，二者不可兼得时取可读。打包器版本须钉死（避免 esbuild 升版导致产物漂移），并要求"对未变源码重跑打包产出零差异"，与契约层 `contract:update` 的"同输入→字节一致产物"同构。bundle 目标平台须为 **Node（`platform` 取 node 解析条件）**，以保证 jose 经条件导出走 Node/WebCrypto 路径而非 browser 路径——若误解析到 jose 的 `browser` 条件，ES256 签名会断；故零安装证明里的"真实只读"必须命中**需鉴权的端点**，让 JWT 签名走在被证明的路径上（不是仅对缓存错误跑 `apps list`）。
  - **bundle 须对"自身被打包"自知（否则 `doctor` 会自报损坏）。** 现行 `doctor` 的两项检查会在单文件 bundle 里误判：`checkDependencies` 以**裸 specifier** 动态 `import("jose")`/`import("openapi-fetch")`、`checkBuild` 动态 `import("../index.js")`，在无 `node_modules`、无同级 `index.js` 的 bundle 里都会抛错，使 `doctor` 报 FAIL 并以退出码 2 退出——恰与"零安装证明"相反；且 esbuild 默认会把这些静态字符串 specifier 解析内联，令运行期检查失去意义。故 M8 须让 bundle"自知"：注入一个 build-time 标志（如 esbuild `define`），在 bundled 模式下让这两项检查短路为 `pass`（detail 注明"running from single-file bundle"），与 `preflight.ts`/`root.ts` 已为 `MIN_NODE_VERSION`/`CLI_VERSION` 预留的"bundle 无需文件系统"注释一脉相承——那两处已豁免、依赖/构建两项检查尚未豁免，本阶段补齐（见实现分解 (a)/(g)）。
  - **与架构文档现状的偏差（须在 (h) 修正）**：[架构总览](../architecture/overview.md)当前在**三处**把分发态打包器记为 **tsdown**——技术选型表的"构建"行、"CLI 框架"段（"citty 在 M8 由 tsdown 打进单文件 CLI"）、"测试与构建"段的详细段落。本阶段定档改用 esbuild——理由是 esbuild 是更稳定成熟、被广泛验证的打包器，作为纯 build-time 工具单文件内联无需 tsdown 的 dts/多格式产物能力（CLI 分发不需要类型声明）；overview.md 须把**这三处**全部改记为 esbuild 并以流畅文字说明理由（不是新增决策文件），任一处遗留 tsdown 都会构成跨文档事实冲突。
  - **备选**：tsdown（tsup 继任者，0.x 须钉版本，能出 dts/多格式但本场景用不上）、rollup（配置面更大）、不打包直接随仓发 `node_modules`（违背零安装、放大体积与信任面）。选 esbuild 取其稳定性与单文件内联的直接性。

**D4 跨工具范围 = 仅 Claude Code。** 见非目标。决策记此处以闭合 D1–D4：M8 只交付 Claude Code 形态，Codex / Gemini 留 M9+，README 与描述不超额承诺。

**模板单一来源 = 镜像 `contract:verify` 的"生成 + 校验门"模式。** 取定一个 SKILL.md 模板（含两处占位：CLI-调用块、setup 块）+ 一个 `skill:generate` 脚本 + 一个 `skill:verify` 门接入 `npm run check`。`skill:generate` 用 **dev profile** 渲染出开发态 SKILL.md（提交入库）；`skill:verify` 离线断言"当前入库的开发态 SKILL.md 字节等于模板按 dev profile 重新渲染的结果"，任何手改入库 SKILL.md 而未改模板、或改了模板未再生成，都在 `check` 第一类门上失败（与 `contract:verify` 守生成契约同构）。plugin 态 SKILL.md 不入开发仓，由 `package:plugin` 在打包时按 **plugin profile** 渲染进载荷。
  - **`skill:verify` 须同时守住两个变体、且 fail-closed。** 仅校验 dev SKILL.md 不够——plugin 变体在 `package:plugin` 时新渲染并 push，若它含未填充占位或写错路径会静默上线。故 `skill:verify` 还须在内存里渲染 plugin profile 并断言：(i) 无残留占位 token；(ii) 含 `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs` 且**不含** `dist/cli/index.js`；(iii) 与 dev 变体的共享正文区域字节一致——这样"两变体不漂移"对**两个方向**都可证。失败语义须与 `contract:verify` 一致：模板缺失、入库 SKILL.md 缺失、任一字节不符，都以非零退出（镜像 `verify.mjs` 的 `fail()`），且 `check` 以此为门。
  - **CRLF 归一（Windows 仓库的已知坑）。** 契约层 `contract:generate` 刻意做 `\r\n`→`\n` 归一正是因为这是 Windows 仓库；SKILL.md 的模板/generate/verify **必须**同样归一，否则 `skill:verify` 会随 git `autocrlf` 设置而误失败或误通过。此坑已咬过契约层，这里照搬其解法。
  - **理由**：这是项目已建立、团队已熟悉的"生成产物 + 离线一致性门"心智（契约层即此模式），复用它把"两变体不漂移"变成一个会在本地与 CI 同一道门失败的硬约束，而非靠人记得手抄。**备选**：单文件 SKILL.md 加运行时分支（SKILL.md 无逻辑、无法分支，否决）；让 plugin SKILL.md 也入库再靠 lint 比对（多维护一份入库文件、且 plugin 变体含 `${CLAUDE_PLUGIN_ROOT}` 在开发仓无意义，否决）。选生成 + 校验门最贴合既有约定。

**bundle 载荷布局。** plugin 仓库根：`.claude-plugin/plugin.json`、`README.md`、`CLAUDE.md`、`.gitignore`、`skills/app-store-connect/SKILL.md`（plugin profile）、`cli/asc.mjs`（esbuild 单文件）。SKILL.md 经 `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs` 寻址 CLI。理由：贴合 sonara-plugin 既有布局 + `${CLAUDE_PLUGIN_ROOT}` 寻址惯例，skills 自动发现无需在 plugin.json 声明。

**版本号同步策略（四处，非三处）。** 单一权威源为 `package.json.version`；除 `plugin.json.version` 与 marketplace entry 的 `version` 外，还有**第四处**：CLI 自身的 `CLI_VERSION`（`src/cli/root.ts` 现硬编码 `"0.0.0"`，喂给 `--version` 与 `rootCommand.meta.version`）——它正是用户在 bundle 上跑 `asc.mjs --version` 看到的值，必须纳入同步集，否则会出现 plugin.json 报 `1.0.0` 而 CLI 报 `0.0.0` 的漂移。`version:check` 须**四方相等**断言：`package.json` ↔ `CLI_VERSION`（读源或读 `node dist/cli/index.js --version`）↔ `plugin.json` ↔ marketplace entry。**门的归属须分层**：`package.json ↔ CLI_VERSION ↔ plugin.json` 三方只读本仓，可纳入 `npm run check`；但 marketplace entry 在**另一个仓库**（`plugins-marketplace`）里，`check` 在 CI 无法读到兄弟仓，故含 marketplace 的那一臂只能作**发布前门**（需先把兄弟仓 checkout 出来）。把跨仓比对写成"接入 `check`"是不可执行的，文档据此分层。**首个真实版本号**：package.json 现为 `0.0.0` 且 `private:true`——本阶段须定首个发版号（建议 `0.1.0`，与 sonara 的 `0.1.0` 起点对齐），并确认 `private:true` 不阻碍 bundle/plugin 链路（成立——本项目从不 `npm publish`，只生成 bundle 与 plugin 仓，故 `private:true` 无副作用，文档据此声明）。bump 仍手工（改 package.json 与 `CLI_VERSION` 的单测基准），check 只守一致性，不自动改版本。理由：marketplace 与 plugin.json 历史上靠手工同步（关键发现），最易漂移；一个离线 check 把"发版忘了同步某处"前移到门上。

**类目与名称。** skill 名沿用既有 `app-store-connect`（与开发态一致，触发器/描述不变）。**plugin.json 的 `name` 与 marketplace entry 的 `name` 同取短名 `app-store-connect`**（与 skill 名一致），**只有仓库名带 `-plugin` 后缀**——`appstore-connect-plugin`。这镜像 sonara 已核实的分层（`plugin.json.name`/entry.name = 短名 `sonara`，仓库 = `sonara-plugin`），并避免"marketplace 条目名 vs skill 名分裂"扰乱安装/触发叙事。由此推出的安装命令为：`/plugin marketplace add sesamehut/plugins-marketplace` 后 `/plugin install app-store-connect@sesamehut-plugins`（后缀 `@sesamehut-plugins` 来自 `marketplace.json` 顶层 `name`，非占位）。marketplace 类目提案 **`developer-tools`**（既有类目为 `content-ops` / `auth`，本 plugin 是面向 App Store Connect 的开发者工具，`developer-tools` 比复用 `content-ops` 更准）。

## 实现分解

### (a) esbuild 单文件 bundle 脚本

一个打包脚本：以已构建的 CLI 入口（`dist/cli/index.js`）为起点，用 esbuild 把 CLI 连同三个运行时依赖（jose / openapi-fetch / citty）全部内联，产出**一个面向 Node 基线（≥22.12）的自包含 ESM 文件** `asc.mjs`——不外置任何运行时依赖、不留 `node_modules`。须保留 shebang 使 `node asc.mjs` 与 `./asc.mjs` 皆可。bundle **不 minify**（保持可审计，见 D3），打包器版本钉死、对未变源码重跑产出零差异。须按 D3 让 bundle 对"自身被打包"自知：经 build-time 标志使 `doctor` 的依赖/构建两项检查在 bundled 模式短路为 `pass`，避免单文件里 `doctor` 误自报损坏。WHY：消灭分发态安装步骤；ESM/Node 平台对齐运行面、保证 jose 走 Node/WebCrypto 路径；esbuild 仅在此调用、不入运行时。生成的 `asc.mjs` 是工件、不入开发仓源码树（落 staging / plugin 仓）。

### (b) SKILL.md 单一来源模板 + generate / verify

- **一份 SKILL.md 模板**：SKILL.md 全文，含两处占位（CLI-调用块、setup 块）；正文（边界、reading output、退出码、任务路由表、conventions）原样共享。占位须覆盖 setup 块里**两条带路径的命令**（dev 的 `npm ci --prefix` 与 `npm run build --prefix`），不能只占位首行调用——否则 plugin profile 会漏掉这两条路径而欠参数化。
- **一个 skill-generate 脚本**：按 profile（`dev` / `plugin`）渲染占位——dev 注入 `dist/cli/index.js` 调用块 + 两条 `--prefix`-带路径的 `npm ci`/`npm run build` + `doctor` 的 setup 块；plugin 注入 `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs` 调用块 + **仅 `doctor`、无 `--prefix`** 的精简 setup 块。`skill:generate` 写出开发态 SKILL.md（入库）。渲染须做 `\r\n`→`\n` 归一。
- **一个 skill-verify 门**：离线断言入库开发态 SKILL.md 字节等于按 dev profile 重渲染结果（镜像 `contract:verify` 的 fail-closed：模板/文件缺失或不符即非零退出）；并在内存渲染 plugin profile 断言无残留占位、含 `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs` 且不含 `dist/cli/index.js`、共享正文与 dev 变体一致。接入 `npm run check`（新增 `skill:verify` 为门之一）。
  WHY：把"两变体不漂移"变成对两个方向都有效的硬门；plugin 变体只在打包时渲染、不污染开发仓。

### (c) `package:plugin` 装配脚本

一个装配脚本：把整个 plugin 载荷装配进一个 staging 目录（如 `dist/plugin/`），从单一来源生成每个文件——`.claude-plugin/plugin.json`（`name` 取短名 `app-store-connect`，version/description/author/homepage 从 package.json 派生、homepage 指向 `github.com/sesamehut/appstore-connect-plugin`）、`skills/app-store-connect/SKILL.md`（调 generate 的 plugin profile）、`cli/asc.mjs`（调 bundle）、`README.md`、`CLAUDE.md`、`.gitignore`。

- **装配必须是 allow-list 显式枚举，绝不按目录 glob 从仓根 copy。** 关键发现：仓根此刻就有一把真实 `.p8`（`AuthKey_*.p8`）与 `.env.local`（均 gitignored 但物理在树内，脚本正从此处运行）。任何 `cp -r` / 目录遍历都会把签名 key 扫进 `dist/plugin/` 进而 push 进公开 plugin 仓——正是 M3–M7 一路防的凭据泄漏。故脚本只枚举它**自己生成/拷贝的那几个输出文件**，别无其他来源。
- **plugin 的 `CLAUDE.md` 是一个独立语义的文档、不是开发仓 CLAUDE.md 的副本。** 参照 sonara-plugin 的 CLAUDE.md（"What this repo is / Skill authoring conventions / Maintainer commands / Cross-host packaging"）：它描述的是**分发工件仓**（被安装进 host、不从本仓运行），须写明"此 plugin 仓是生成物，请勿手改，改动归上游开发仓、经 `package:plugin` 重新生成"，并采英文（仓内文档英文）。
- **plugin 的 `.gitignore` 是"无凭据进仓"的机械守卫，须明列。** 至少忽略 `node_modules/`、`.env*`、`*.p8` / key 文件（对自带 `asc.mjs` 零安装的 Node bundle，最重要的不变量就是 node_modules 与凭据永不入 plugin 仓），并镜像 sonara 的 editor/`.claude` 忽略项（`.claude/settings.local.json` 等，保留 `.claude/settings.json`）。让"无凭据"由文件强制，而非仅靠断言。

WHY：plugin 仓内容是**生成物**，发布即同步此 staging 到 plugin 仓，杜绝手抄漂移；staging 可在发布前本地核验（零安装跑通）。须保证装配是确定性的、可重复运行零差异。

### (d) plugin.json + marketplace entry 内容

- plugin.json：`{ name:"app-store-connect"（短名，非仓库名）, version:<从 package.json>, description:<面向用户的能力一句话>, author:{name,email}, homepage:"https://github.com/sesamehut/appstore-connect-plugin" }`，无 `skills` 字段（自动发现）。
- marketplace entry：`{ name:"app-store-connect", description, version, category:"developer-tools", source:{ source:"url", url:"https://github.com/sesamehut/appstore-connect-plugin.git", ref:"main" } }`，追加进 `plugins[]`；用户安装命令随之为 `app-store-connect@sesamehut-plugins`。
  WHY：贴合两类清单的既有形态、`name` 取短名与 skill 名一致（与 sonara 分层一致）；描述只承诺 Claude Code 能力边界、不暗示跨工具。

### (e) 版本一致性 check

一个版本一致性脚本，离线断言**四处** version 相等：`package.json`、`CLI_VERSION`（`src/cli/root.ts` 现硬编码 `0.0.0`；读源或 `node dist/cli/index.js --version`）、生成的/staging 中的 `plugin.json`、`marketplace.json` 本 plugin 条目；任一不等即非零退出并打印差值。**门归属分层**：`package.json ↔ CLI_VERSION ↔ plugin.json` 三方只读本仓，纳入 `npm run check`；含 marketplace entry 的那一臂跨到兄弟仓 `plugins-marketplace`，CI 读不到，只作**发布前门**（须先 checkout 兄弟仓）。本阶段一并定首个发版号（建议 `0.1.0`）。WHY：marketplace/plugin.json/`CLI_VERSION` 历史上靠手工同步最易漂移，门前移失败；跨仓比对不可执行于 `check`，故分层。

### (f) plugin README（英文）

`README.md`（plugin 仓，仓库内文档英文）：从零路径——(1) 前提：Node ≥22.12 + 网络；(2) 凭据：覆盖 `ASC_KEY_ID` / `ASC_ISSUER_ID`（团队 key 必填、个人 key 省略）/ `ASC_PRIVATE_KEY` 或 `ASC_PRIVATE_KEY_PATH`（二选一）/ 可选 `ASC_VENDOR_NUMBER`，到哪里建 key（Users and Access → Integrations）与到哪看 vendor number（描述章节职责，不在本设计文档内复制 env 表）；(3) 安装：须镜像 sonara README 的确切两步形态，给出**具体**目标而非占位——`/plugin marketplace add sesamehut/plugins-marketplace` 后 `/plugin install app-store-connect@sesamehut-plugins`（后缀由 `marketplace.json` 顶层 `name`=`sesamehut-plugins` 推导），强调零依赖安装、bundle 自带；(4) 用法：以 agent 自然语言任务为主、辅以一个 `doctor` 自检入口，指明只读任务可放心跑、高副作用动词需 `--force` 且会触发真实审核/上架。WHY：退出标准"新用户从零跑通"的直接载体；凭据章节复述 SKILL.md 的 env 约定但面向人类读者。

### (g) 描述 / 校验 / 反馈口径审计

不是重写——M3–M7 已逐域落地校验与信封口径。本阶段做一次横切**审计**：(1) `description` 触发器覆盖全部已交付动词、无过时遗漏；(2) `capabilities` 机器可读图与 registry 实现态一致（无 `implemented:false` 残留指向已交付域）；(3) 三态边界（works now / not implemented exit 5 / not possible exit 6）与实际退出码行为对齐；(4) 抽查各域输入校验仍在请求前以退出 64 失败、错误 hint 仍可行动；(5) 信封字段与脱敏（签名 URL、demo 密码）在全域一致。产出为审计结论 + 必要的小修，不引入新能力。

此外一处**非纯审计的代码改动**落在本步（与 (a) 的 bundle 自知配套）：让 `doctor` 的 `checkDependencies`/`checkBuild` 在 bundled 模式下不再以裸 `import("jose")`/`import("../index.js")` 误判，而经 build-time 标志短路为 `pass`——否则零安装证明会因 `doctor` 退出 2 而失败。本阶段**不动** `src/generated/` 与契约清单，`contract:verify`（`check` 第一道门）继续零改动通过；新增的 `skill:verify` / `version:check` 加在该门之后，门序不变。WHY：退出标准"描述准确、不误导 agent"；framing 为审计避免无谓返工，但 bundle 自知是让"零安装证明"成立的硬前置。

### (h) 文档更新

- [Skill 入口与 CLI 策略](../implementation/skill-interface.md)："运行环境保障"段把"运行时依赖仅两个"**修正为三个**（jose / openapi-fetch / citty），与[架构总览](../architecture/overview.md)依赖纪律一致——这是已知陈旧声明（在 skill-interface.md 现行文本第 36 行附近）。
- [架构总览](../architecture/overview.md)：把分发态打包器从 tsdown **改记为 esbuild**，须覆盖**三处** tsdown 出现——技术选型表的"构建"行、"CLI 框架"段（"citty 在 M8 由 tsdown 打进单文件 CLI"）、"测试与构建"段的详细段落——任一处遗留即构成跨文档事实冲突；以流畅文字说明理由（折进既有文本，不新增决策文件）。
- [Roadmap](roadmap.md)：M8 完成后状态推进为已完成，并把本文登记为 M8 阶段计划链接。
- `.claude/rules/docs.md`：先把本文以"Active M8 phase plan"声明加入 `phases/` 目录清单（与现有 M5/M7-* 的 Active 措辞一致）；**M8 完成时**再按归档约定（docs.md + Roadmap 既定）把本文移入 `phases/archive/` 并相应更新清单（与 m6 已在 archive 同例）。
  WHY：docs 结构源真值与事实声明须随本阶段同步更新（docs 规则）。

### (i) 发布步骤（含 org 权限回退）

发布脚本/手册按序：(1) 跑 `package:plugin` 生成 staging 载荷并本地零安装核验 + staging 目录 secret-scan 通过；(2) `version:check`（含 marketplace 那一臂）通过；(3) `gh repo create sesamehut/appstore-connect-plugin`（私有/公开按 sonara 既有取向）→ push staging 内容到 `main`；(4) **仅在 (3) 与一次真实 install smoke 都成功后**，编辑 marketplace 仓 `.claude-plugin/marketplace.json` 追加本 plugin 条目 → push。

**org 权限回退（须覆盖两类失败，且按退出码判定而非靠人察觉）**：
- 脚本须分支于 `gh repo create` 的**退出码/错误信息**确定性识别"建仓被拒"，而非靠人盯日志。
- 若因 lanvada 账号无 sesamehut org 建仓权被拒：回退为由有 org 权限者手工建空仓（或申请权限），脚本退化为"仅 push 到已存在的 `appstore-connect-plugin`"。
- **此回退不止"不能建"，还须覆盖"不能 push"**：lanvada 须先成为 sesamehut org 下该仓库有 **write** 权的 collaborator/member，否则降级 push 同样失败——发布手册须写明降级路径所需的最低访问权，不能假定"别人建好我就能推"。
- 其余步骤（载荷生成、版本一致性、marketplace 条目编辑）保持自动。

**marketplace 编辑的可逆性与原子性**：编辑 `marketplace.json` + push 到共享仓是唯一近乎"对外公开"的动作，但它是普通 git commit、**可经 revert 回退**（这正是验证要求的"可逆"属性）；且须**排在最后**、仅当 plugin 仓已 push 且一次真实 install smoke 已通过后才做，杜绝"marketplace 指向一个尚未就绪的仓"的半发布态。WHY：D1 全自动发布含 push，但关键发现已示 org 建仓权/推送权未必在位，必须可降级而不中断整条链；marketplace 一臂的顺序与可逆性是避免半发布的关键。

## 验证清单

- [ ] **零安装 bundle 证明（兼作无凭据旁证）**：在一个全新临时目录（无 `node_modules`、仅 Node 在场、且**只放 `asc.mjs` 这一个文件**，无任何旁车文件）跑 `node asc.mjs doctor` **通过且退出 0**（依赖/构建两项检查须经 bundle 自知短路为 `pass`），再跑**一次命中需鉴权端点的真实只读**（如 `apps list` / `versions list`，使 JWT 签名走在被证明的路径上，而非仅对缓存错误跑命令）成功——既证 jose/openapi-fetch/citty 真已内联，又证 bundle 无需任何旁车（即无 secret 随行）。
- [ ] **`skill:verify` 门绿（守两个变体）**：入库开发态 SKILL.md 等于模板 dev profile 重渲染；plugin profile 内存渲染无残留占位、含 `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs` 且不含 `dist/cli/index.js`、共享正文与 dev 一致；故意改一处 SKILL.md 不改模板可触发该门失败（反向证明门有效）；CRLF 归一已生效。
- [ ] **新用户从零走查**：按 plugin README 配置凭据 → 跑一次真实只读任务。可执行基线复用既有 `npm run smoke` 的只读路径（已是最小鉴权读、输出无 secret），不另造手动序列；reversible / read-only only，**绝不**跑高副作用动词 submit / cancel / release / 任何 `--force` 写。
- [ ] **marketplace-install 行为一致**：分两层证。**可脚本化的字节级对比**——把 `${CLAUDE_PLUGIN_ROOT}` 指向 staging 目录、对一组固定命令跑 staging 的 `cli/asc.mjs`，与 `dist/cli/index.js` 逐一比对信封/退出码（证行为一致，无需真装）。**需交互式 Claude Code 的部分**——至少做一次真实 marketplace 安装（真实或本地 source 的 marketplace 指向尚未公开/私有仓亦可），确认 skill 自动发现、`${CLAUDE_PLUGIN_ROOT}` 解析、`description` 触发选中 + 自然语言路由，走监督式走查（roadmap 退出标准针对的是**已安装**的 plugin，仅跑 staging 文件不足以覆盖）。
- [ ] **描述准确反映能力边界**：(g) 审计结论——`description`/`capabilities`/三态边界与 registry 实现态一致，无误导。
- [ ] **`npm run check` 全绿，含 `skill:verify`**：契约校验（仍零改动、仍为第一道门）、typecheck、lint、format、test 加新增的 `skill:verify` 与本仓内 `version:check`（三方臂）全部通过；运行时依赖仍为三个（esbuild 仅 devDependency、fflate 仍仅测试用、`src/` 零引用）。
- [ ] **版本一致性 check（四处）**：package.json / `CLI_VERSION` / plugin.json / marketplace entry 四处 version 相等，`version:check` 通过（marketplace 一臂在发布前门、需 checkout 兄弟仓）；故意改一处可触发失败。
- [ ] **安全姿态保持（机械守卫，非断言）**：`package:plugin` 后对 staging 目录做 secret-scan（扫 `*.p8` / `.env` / `*.pem` / `*.key` / PEM 头字节签名），命中即 fail-closed；bundle 与两仓均不含凭据、不嵌 `.env` 或 key（关键发现：仓根此刻就有真实 `.p8` 与 `.env.local`，故装配须 allow-list、绝不 glob 仓根）；签名 URL 与 demo 密码维持已交付脱敏；plugin 载荷中无任何 secret。
- [ ] **发布步骤可执行 + 回退验证**：`package:plugin` + secret-scan → push plugin 仓 → 真实 install smoke → marketplace 条目 + push（最后一步）全链跑通；org 建仓被拒（按退出码判定）时回退路径（含"已有 write 权后 push 到已存在仓"）经核验可用；marketplace 编辑确认可经 git revert 回退。
