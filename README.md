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
- 项目资料默认目录: `data/project-files`
- 备份目录: `data/backups`
- 备份 API: `POST http://localhost:8787/api/backup/export`

## 项目文件管理

在左侧“项目资料”里可以查看各项目阶段归档文件、生成当前阶段资料夹和下载已归档资料。在“系统设置 → 文件管理”里可以调整项目资料保存位置。生命周期阶段里上传的资料会由软件自动规范命名，并保存到对应项目、阶段、已归档文件夹中。新建项目默认只生成立项阶段资料夹，项目推进到后续阶段后再生成对应阶段资料夹，减少无用空目录。

## 离线与同步

前端会把最近数据缓存到 IndexedDB。离线时的变更会进入本地 outbox，恢复连接后自动推送到本地后端。第一版文件上传和工作群消息建议保持在线使用。

## 公网部署

公网版本采用单域名架构：网页、`/api` 和 `/uploads` 均通过同一个 HTTPS 域名访问，避免手机跨端口保存失败。生产构建会自动启用账号登录。

完整的 Nginx、systemd、环境变量和 HTTPS 配置见 [deploy/README.md](deploy/README.md)。
