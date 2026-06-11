# Skill 入口与 CLI 策略

本文描述 Skill 入口层的形态与设计约束。依据为 Anthropic 官方 Agent Skills 规范与 anthropics/skills 官方示例（核实于 **2026-06**，来源见文末）。

## 目标运行面

本 Skill 需要 Node.js 运行时和对 `api.appstoreconnect.apple.com` 的网络访问，因此目标运行面是 **Claude Code**（脚本运行在用户机器上，网络与 Node 可用）。Claude API 的代码执行容器无网络、不可安装依赖，claude.ai 的网络取决于用户设置——这两个运行面不在当前范围内。SKILL.md 需通过 `compatibility` 字段声明 Node 版本与网络要求。

## 入口形态：单一 CLI + 子命令

能力以一个可执行入口暴露，按用户任务组织子命令（应用与版本、元数据与本地化、TestFlight、报表、媒体、评论等）。选择依据见[架构总览](../architecture/overview.md)；对 agent 的含义是：

- **黑盒调用**——agent 运行命令、读取输出，不阅读实现源码；命令通过自描述帮助暴露参数。这是官方示例对 fragile 流程的推荐用法："运行这个脚本"而不是"参考这个脚本的算法"。
- **低自由度**——认证签发、分页、报表下载、媒体上传属于顺序敏感、易错的流程，官方最佳实践明确这类操作应给 agent 精确的执行指令而非开放式提示。
- **集中口径**——参数校验、错误输出、退出码语义收敛在一个入口，能力增长不会让 agent 面对一堆行为不一致的脚本。

## SKILL.md 设计

SKILL.md 按官方"路由器"模式编写，自身保持精简（官方预算：正文 500 行 / 5000 token 以内）：

- **描述即触发器**——`description` 以第三人称写明能力与触发场景（App Store Connect、TestFlight、报表、元数据等关键词），这是 agent 在众多技能中选中本 Skill 的唯一依据。
- **渐进披露**——SKILL.md 只含凭据配置、快速上手和"任务 → 参考文件"的路由表；各任务域的详细用法放在按域拆分的 reference 文件中，按需加载，引用层级保持一层深。
- **执行意图明确**——路由指向的是"运行某个子命令"，并给出确切的命令行形态。

## 任务组织与输出约定

- 子命令建模用户任务（如"读取版本元数据""下载某日销售报表"），不暴露原始 HTTP 资源操作。
- 输出区分机器可读结果与人可读诊断：正常结果以结构化形式输出，错误与进度类信息走诊断通道，agent 与用户都能各取所需。
- 错误信息遵循官方"solve, don't punt"原则：在 CLI 内部把 ASC 错误转译为可行动的提示（缺哪类凭据、需要什么角色、参数哪里不合法），而不是抛出原始响应让 agent 自行调试。
- 按[产品范围](../product/api-scope.md)的硬性要求，输出必须区分"Apple API 不支持"与"本项目暂未实现"，并对需要网页端的动作给出人工处理说明。

## 运行环境保障

Skill 形态没有"保证脚本能跑"的官方机制（核实于 2026-06）：SKILL.md 的 `compatibility` 字段仅是声明性文本，Claude Code 不校验它，也没有 Skill 安装钩子可自动执行依赖安装；官方示例库的通行模式是"声明要求 + 让 agent 现场解决"——脚本因缺依赖失败后，agent 依 SKILL.md 给出的确切命令自行安装并重试。本项目按三道防线落实：

- **安装面最小化**——运行时依赖仅两个（见[架构总览](../architecture/overview.md)的依赖纪律），无原生编译、无 postinstall 脚本，首次安装几秒内完成，失败空间极小。
- **声明加自愈指引**——`compatibility` 声明 Node 基线与网络要求；SKILL.md 的安装命令一律带显式路径指向 Skill 自身目录（npm ci 配合入库的 lockfile，依赖树确定），杜绝 agent 在用户项目的工作目录里误装出 node_modules；CLI 入口做 preflight 自检（Node 版本、依赖可加载、凭据环境变量齐全），失败时输出"缺什么、怎么补"，不抛裸堆栈。
- **分发态消灭安装步骤**——对外发布的 Skill 包内置单文件 CLI 产物（构建策略见[架构总览](../architecture/overview.md)），不含 node_modules、不要求任何安装命令，环境前提只剩 Node 本身。

## 凭据

凭据一律经环境变量提供，Skill 包内不含任何凭据；SKILL.md 的配置一节只说明需要哪些变量、到哪里创建 key。

## 分发路径

开发期作为项目级 Skill 存放于仓库内（随版本库提交），npm 依赖在 Skill 目录本地安装、不做全局安装；对外分发走 Claude Code 的 plugin/marketplace 机制，分发包内是打好的单文件 CLI。需要打包上传的运行面（claude.ai、Claude API）受网络与依赖限制，暂不作为分发目标。

## 来源

- [Agent Skills 规范](https://agentskills.io/specification)
- [Agent Skills 最佳实践](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Claude Code Skills 文档](https://code.claude.com/docs/en/skills)
- [anthropics/skills 官方示例库](https://github.com/anthropics/skills)
