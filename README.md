# MsgDock（信港）

**一次接入，消息通达。**

MsgDock 是面向 Web 系统的开源多渠道 IM 消息推送引擎，旨在通过统一 API、渠道适配器和可靠的异步投递机制，将业务通知发送到微信、钉钉、飞书和企业微信等平台。

> 当前版本：**0.2.0 渠道插件化**。已实现管理控制台、应用鉴权、通知投递与可信内置插件，提供一个 Docker 镜像、一个容器的部署方式。真实 IM 平台仍需要配置已授权的机器人凭证；模拟平台验证不代表已完成真实企业环境联调。

## 快速启动

需要支持 Linux 容器的 Docker。克隆本仓库后运行：

```sh
docker build -t msgdock:0.2.0 .
docker run -d --name msgdock --restart unless-stopped --stop-timeout 90 -p 127.0.0.1:3300:3000 -v msgdock-data:/data msgdock:0.2.0
docker exec msgdock cat /data/secrets/setup-token
```

打开 <http://localhost:3300>，使用初始化令牌创建管理员。也可以执行 `docker compose up --build -d`，同样只会启动一个容器。内置 PostgreSQL、Redis、API、Worker 和控制台；所有业务数据与加密密钥保存在 `/data` 持久化卷中。

进入控制台后按“添加渠道 → 创建应用并授权目标 → 生成 API Key → 发送测试”的顺序接入。API Key 通过 `Authorization: Bearer <API_KEY>` 传递。新应用默认鉴权；显式选择非鉴权后只开放该应用的发送入口。

[部署、升级与备份](docs/deployment.md) · [0.2.0 版本说明](docs/releases/v0.2.0.md) · [渠道插件开发](docs/channel-plugins.md) · [OpenAPI 契约](docs/openapi.json)

## 设计文档

- [系统设计文档](docs/system-design.md)：技术栈、前后端代码组织、模块边界、消息投递、数据模型、安全与部署设计。
- [控制台首页原型](docs/prototypes/home.md)：投递概览、渠道状态、最近投递和 API 接入示例。
- [渠道插件约定](docs/channel-plugins.md)：SDK、注册、Schema 表单、执行边界、版本固定与插件发布。

## 项目目标

- **统一接入**：业务系统通过统一 HTTP API 提交通知。
- **部署简单**：默认一个 Docker 镜像、一个容器，内置前后端、Worker、PostgreSQL 和 Redis。
- **可选鉴权**：发送接口默认采用 `Authorization: Bearer <API_KEY>`；支持按应用显式开启非鉴权发送。
- **多渠道适配**：按平台及接入方式分别实现群机器人、应用消息与智能机器人适配器。
- **可靠投递**：持久化任务，支持幂等、限流、重试、消息过期与投递状态查询。
- **灵活配置**：集中管理渠道实例、接收目标、订阅主题和消息模板。
- **可追踪**：记录投递日志、平台错误码与重试历史。
- **可扩展**：按渠道能力逐步加入交互卡片、事件回调和媒体消息。

## 计划接入的渠道

| 平台 | 接入方向 | 状态 |
| --- | --- | --- |
| 企业微信 | 群 Webhook 机器人 | 已实现文本适配；智能机器人与自建应用后续增加 |
| 飞书 | 自定义群机器人 | 已实现文本适配与可选签名；应用机器人后续增加 |
| 钉钉 | 企业机器人群消息 | 已实现 AppKey / AppSecret / RobotCode 与开放会话目标适配 |
| 微信 | 公众号、小程序订阅消息及官方 ClawBot 接口 | 后续按具体产品场景接入 |

各渠道的发送范围、消息格式、频率限制和交互能力，以平台官方开放能力及实际授权为准。

## 初步架构

```text
业务系统 → 统一 API → 消息与投递任务 → 后台 Worker → 插件注册中心 / 宿主执行器 → 渠道插件 → IM 平台
```

业务系统提交业务事件、接收目标和模板数据；核心负责路由、渲染、投递及结果追踪。每种接入方式是独立插件包，声明配置、目标、消息能力和实例限额；控制台根据插件目录生成表单。官方插件随镜像构建和启动注册，当前支持 HTTP 文本；WebSocket 或长轮询渠道后续接入。

## 开发路线

- [x] 确定首版范围、技术栈与 API 契约。
- [x] 实现应用鉴权、渠道实例与不可变模板版本。
- [x] 实现首批文本适配器与测试发送流程；真实平台联调待配置凭证后完成。
- [x] 实现持久化投递、并发幂等、实例限流、受控重试与状态查询。
- [x] 增加管理控制台、投递记录、操作审计与单容器部署。
- [x] 统一插件 SDK、独立渠道包、注册中心、Schema 表单与投递版本固定。
- [ ] 外部离线插件安装、兼容迁移与隔离执行。
- [ ] 多管理员角色、自动数据保留策略、严格顺序与高可用扩容。
- [ ] 按渠道能力扩展交互回调与媒体消息。

## 开发与验证

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

前端按 Feature-based 组织，后端按 NestJS 业务模块组织；API 与 Worker 使用独立入口并复用共享业务包。构建时生成 OpenAPI 和前端请求类型。自动化容器集成测试见 `.github/workflows/ci.yaml`；测试实例与正式实例的数据卷分离。

## 许可证

Copyright (C) 2026 MsgDock contributors.

本项目采用 **GNU Affero General Public License v3.0 only**，SPDX 标识符为 `AGPL-3.0-only`。完整条款见 [LICENSE](LICENSE)。

允许商业使用和二次开发。分发受许可证覆盖的衍生版本时，须按 AGPLv3 提供对应源码并遵守相同许可要求；若修改本项目后通过网络提供服务，须向与该修改版远程交互的用户提供获取对应源码的机会。仅在私下修改自用、不分发且不向其他用户提供网络交互服务，并不要求将修改公开发布。

以上为便于理解的简要说明，具体权利和义务以许可证正文为准。
