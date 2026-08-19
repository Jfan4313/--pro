import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const runtimeDir = path.join(rootDir, "data", "runtime");
fs.mkdirSync(runtimeDir, { recursive: true });

const processes = [];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function logFile(name) {
  return path.join(runtimeDir, `${name}-${timestamp()}.log`);
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((items) => items || [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start, limit = 30) {
  for (let port = start; port < start + limit; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`没有找到可用端口：${start}-${start + limit - 1}`);
}

async function isLocalBackendAlive(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function pipeToLog(child, filePath) {
  const stream = fs.createWriteStream(filePath, { flags: "a" });
  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
}

function spawnManaged(command, args, options, name) {
  const child = spawn(command, args, {
    cwd: rootDir,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  const filePath = logFile(name);
  pipeToLog(child, filePath);
  processes.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.log(`${name} 已退出，日志：${filePath}`);
    }
  });
  return { child, filePath };
}

function openUrl(url) {
  if (process.platform === "darwin") {
    spawn("open", [url], { stdio: "ignore" });
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore" });
}

function shutdown() {
  console.log("\n正在关闭智建协同 Pro...");
  for (const child of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  console.clear();
  console.log("智建协同 Pro 桌面启动器");
  console.log("--------------------------------");

  const backendPreferredPort = Number(process.env.LOCAL_API_PORT || 8787);
  let backendPort = backendPreferredPort;
  let backendStarted = false;

  if (await isLocalBackendAlive(backendPreferredPort)) {
    console.log(`本地后端已在运行：http://127.0.0.1:${backendPreferredPort}`);
  } else {
    backendPort = await findFreePort(backendPreferredPort);
    const backend = spawnManaged("node", ["server/index.js"], {
      env: {
        ...process.env,
        // Allow other devices on the same LAN to reach the local backend.
        LOCAL_API_HOST: "0.0.0.0",
        LOCAL_API_PORT: String(backendPort),
      },
    }, "backend");
    backendStarted = true;
    console.log(`正在启动本地后端：http://127.0.0.1:${backendPort}`);
    console.log(`后端日志：${backend.filePath}`);
  }

  const frontendPort = await findFreePort(Number(process.env.LOCAL_FRONTEND_PORT || 3000));
  const frontend = spawnManaged("npx", ["vite", "--force", "--host", "0.0.0.0", "--port", String(frontendPort)], {
    env: {
      ...process.env,
      // Keep API requests relative so the Vite proxy forwards them to the
      // backend without making LAN clients call their own localhost.
      VITE_LOCAL_API_URL: "",
    },
  }, "frontend");

  const url = `http://localhost:${frontendPort}/?launch=${Date.now()}`;
  fs.writeFileSync(path.join(runtimeDir, "latest-url.txt"), `${url}\n`);
  console.log(`正在启动前端页面：${url}`);
  for (const address of getLanAddresses()) {
    console.log(`局域网访问地址：http://${address}:${frontendPort}/`);
  }
  console.log(`前端日志：${frontend.filePath}`);
  console.log(`最新入口记录：${path.join(runtimeDir, "latest-url.txt")}`);
  console.log("--------------------------------");
  console.log("关闭这个终端窗口或按 Ctrl+C，可以结束本次启动器打开的服务。");
  if (!backendStarted) {
    console.log("提示：已有后端服务不会被本启动器关闭。");
  }
  console.log(`\n即将打开：${url}`);

  setTimeout(() => openUrl(url), 1800);

  setInterval(() => {
    const alive = processes.some((child) => child.exitCode === null);
    if (!alive) process.exit(0);
  }, 1500);
}

main().catch((error) => {
  console.error(`启动失败：${error.message}`);
  process.exit(1);
});
