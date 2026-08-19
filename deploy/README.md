# 智建协同 Pro 公网部署

## 自动发布

仓库已配置 GitHub Actions 自动发布流程：每次推送到 `main` 分支后，系统会自动完成类型检查、生产构建、上传、服务重启和公网健康检查。部署失败时服务器会自动恢复上一个可用版本。

日常发布只需要：

1. 提交代码。
2. 将提交推送到 GitHub 的 `main` 分支。

单纯的本地提交不会触发发布；必须完成“推送”。如果使用的客户端提供“提交并推送”按钮，点击一次即可发布。

自动发布使用仓库 Secret `DEPLOY_SSH_KEY`。该密钥在服务器端通过强制命令限制，只能执行本项目的部署脚本，不能用于普通 SSH 登录。

默认部署域名为 `project.zero-carbon.online`。如果以后改用其他子域名，请同时修改：

- `deploy/nginx/zhijian-pro.conf` 中的 `server_name`
- `/etc/zhijian-pro.env` 中的 `APP_ORIGIN`

## 1. DNS

在阿里云云解析中添加 A 记录：

- 主机记录：`project`
- 记录值：服务器公网 IPv4

## 2. 阿里云现有服务器（Docker + Caddy）

当前 `8.138.177.223` 已由 `solar-platform-caddy-1` 容器占用 80/443。
服务器若无法从 Docker Hub 拉取 Node 镜像，可直接使用 systemd 运行后台，
再由 Caddy 通过 Docker 网关 `172.18.0.1:8787` 访问。

Docker 可用时，将项目上传到 `/opt/zhijian-pro` 后：

```bash
sudo mkdir -p /var/lib/zhijian-pro
sudo cp deploy/production.env.example .env.production
sudo chmod 600 .env.production
sudo nano .env.production
docker compose -f deploy/docker-compose.aliyun.yml build
docker compose -f deploy/docker-compose.aliyun.yml up -d
```

把 `deploy/Caddyfile.project-snippet` 的站点块追加到
`/opt/solar/solar-operations-platform/deploy/Caddyfile`，验证后热加载：

```bash
docker exec solar-platform-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec solar-platform-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

访问 `https://project.zero-carbon.online`。手机摄像头需要 HTTPS。

## 3. 全新服务器（Node + Nginx）

建议使用 Ubuntu 22.04/24.04，并预先安装 Node.js 20+、Nginx 和 Certbot。

```bash
sudo mkdir -p /opt/zhijian-pro /var/lib/zhijian-pro
sudo chown -R "$USER":www-data /opt/zhijian-pro
sudo chown -R www-data:www-data /var/lib/zhijian-pro
```

将项目代码上传到 `/opt/zhijian-pro` 后执行：

```bash
cd /opt/zhijian-pro
npm ci
npm run build
npm prune --omit=dev
```

生产构建会自动启用登录，不需要设置 `VITE_AUTH_REQUIRED`。

## 4. 配置后台服务

```bash
sudo cp deploy/production.env.example /etc/zhijian-pro.env
sudo chmod 600 /etc/zhijian-pro.env
sudo nano /etc/zhijian-pro.env
```

必须修改 `INITIAL_ADMIN_PASSWORD`。首次启动后，请登录并再次修改管理员密码。不要把真实密码提交到 Git。

安装并启动服务：

```bash
sudo cp deploy/zhijian-pro.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zhijian-pro
sudo systemctl status zhijian-pro
```

检查本机后台：

```bash
curl http://127.0.0.1:8787/api/health
```

## 5. 配置域名与 HTTPS

```bash
sudo cp deploy/nginx/zhijian-pro.conf /etc/nginx/sites-available/zhijian-pro
sudo ln -s /etc/nginx/sites-available/zhijian-pro /etc/nginx/sites-enabled/zhijian-pro
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d project.zero-carbon.online
```

Certbot 完成后，访问 `https://project.zero-carbon.online`。手机摄像头需要 HTTPS。

## 6. 防火墙

公网只开放 80 和 443。不要开放 8787；Node 服务只监听 `127.0.0.1`。

## 7. 数据与备份

持久化数据位于 `/var/lib/zhijian-pro`：

- SQLite：`zhijian-local.sqlite`
- 现场照片：`uploads/`
- 项目资料：`project-files/`
- 本地备份：`backups/`
- 公司 AI 配置：`ai-config.json`（服务端保存，权限应为 `0600`）

至少每天备份该目录。照片量开始增长后，应迁移至阿里云 OSS，避免占满 40GB 系统盘。
