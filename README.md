<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# 智建协同 Pro

本项目已从 AI Studio 原型调整为“前端 PWA + 本地 Express 后端 + SQLite 数据库”的本地协同系统。云后端暂时不是运行依赖。

View your app in AI Studio: https://ai.studio/apps/9e7d87b5-cdf2-44fd-aac3-8244b3bfeefa

## 本地运行

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. 启动本地后端:
   `npm run dev:server`
3. 另开一个终端启动前端:
   `npm run dev:client`

也可以用一个命令同时启动:
`npm run dev:local`

## 桌面启动器

macOS 下可以直接双击项目根目录里的 `智建协同 Pro.command` 启动软件。启动器会自动启动本地后端和前端，并打开浏览器页面。

也可以在终端运行:
`npm run desktop`

启动器会自动寻找可用端口，强制刷新前端缓存，并把日志写入 `data/runtime`。最新打开地址会记录在 `data/runtime/latest-url.txt`。关闭启动器打开的终端窗口，或在终端里按 `Ctrl+C`，即可关闭本次启动器打开的服务。

## 局域网访问

前端会监听 `0.0.0.0:3000`，后端会监听 `0.0.0.0:8787`。启动后，终端会显示类似 `http://192.168.x.x:3000/` 的 Network 地址。手机和其他电脑在同一局域网内访问这个地址即可。

## 本地数据

- SQLite 数据库: `data/zhijian-local.sqlite`
- 上传文件目录: `data/uploads`
- 历史服务器项目资料目录: `data/project-files`
- 备份目录: `data/backups`
- 备份 API: `POST http://localhost:8787/api/backup/export`

## 项目文件管理

在左侧“项目资料”或“系统设置 → 文件管理”中授权一台归档电脑上的本机文件夹。新建项目会按“项目编号_项目名称”自动生成当前阶段及下一阶段资料夹，每个阶段包含“待提交”“已归档”和“文件清单.json”；项目推进后会继续幂等补建下一阶段。生命周期上传的新资料只写入该本机授权目录，项目与文件索引仍参与数据同步；未授权设备可以查看索引，但不能下载本机原文件。`data/project-files` 中的历史服务器资料继续保留并兼容下载，不会自动迁移、改名或删除。

归档能力通过统一的 `ArchiveStorageProvider` 接口接入，当前实现为浏览器 File System Access API，本期不绑定具体云厂商，后续可以增加对象存储或 SaaS Provider 而无需改动项目与生命周期业务流程。

## 离线与同步

前端会把最近数据缓存到 IndexedDB。离线时的变更会进入本地 outbox，恢复连接后自动推送到本地后端。第一版文件上传和工作群消息建议保持在线使用。

## 公网部署

公网版本采用单域名架构：网页、`/api` 和 `/uploads` 均通过同一个 HTTPS 域名访问，避免手机跨端口保存失败。生产构建会自动启用账号登录。

完整的 Nginx、systemd、环境变量和 HTTPS 配置见 [deploy/README.md](deploy/README.md)。

## 企业微信机器人通知

在企业微信群中添加“消息推送/群机器人”，复制 Webhook 地址后，将它配置到服务端环境变量 `WECOM_WEBHOOK_URL`，然后重启后端。系统会在新建工作安排、提交反馈、确认完成时推送消息，并在 `WECOM_DAILY_REMINDER_HOUR` 指定的时间推送逾期和待确认汇总。Webhook 是敏感凭证，只能配置在服务端，不能提交到前端或 Git。

新帐号支持手机号一次性验证码首次登录。当前尚未接入短信服务商，开发模式下验证码会显示在本地登录页并写入后台日志；验证码不会发送到企业微信群。后续接入短信服务商时，只需替换服务端验证码发送层并设置 `OTP_MODE=sms`。
