import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { analyzeIntake } from "../domain/intakeAnalysis.js";
import { analyzeIntakeWithAI, debugAI, getAIConfig, getAIEntityGlossary, getAIKey, resolveTranscriptionEndpoint, transcribeAudio, updateAIConfig, updateAIEntityGlossary } from "../domain/aiService.js";
import { getCompanyKnowledge } from "../domain/companyEntities.js";
import { isCompanyManager } from "../auth.js";
import {
  buildProjectStoredFile,
  getProjectFolderName,
  getStageFolderName,
} from "../domain/projectFiles.js";
import { createUtilityServices } from "../services/utilityServices.js";

export function registerUtilityRoutes(app, context) {
  const services = createUtilityServices(context);
  const { db, uploadsDir, nowIso, parseJson } = context;

  const currentUser = (req) => req.authUser || db.prepare("SELECT * FROM users WHERE id = 'admin-local'").get();
  const authenticatedUser = (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: "authentication_required" }); return null; }
    return req.authUser;
  };

  app.get("/api/ai-config", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const config = getAIConfig(user.companyId || "company-default");
    res.json(isCompanyManager(user) ? config : { configured: config.configured, model: config.model, hasKey: config.hasKey, endpoint: "", timeoutMs: config.timeoutMs, updatedAt: config.updatedAt });
  });
  app.put("/api/ai-config", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    if (!isCompanyManager(user)) return res.status(403).json({ error: "company_admin_required" });
    const body = req.body || {};
    if (typeof body.endpoint !== "string" || typeof body.model !== "string") {
      return res.status(400).json({ error: "invalid_ai_config", message: "API 地址和模型名称不能为空且必须是文本" });
    }
    try {
      res.json(updateAIConfig(user.companyId || "company-default", body));
    } catch (error) {
      console.error("Failed to persist company AI config:", error);
      res.status(500).json({ error: "ai_config_save_failed", message: "服务端无法写入 AI 配置文件，请检查 data 目录权限" });
    }
  });

  app.get("/api/company-entities", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const glossary = getAIEntityGlossary(user.companyId || "company-default");
    const knowledge = getCompanyKnowledge(db, glossary);
    res.json({ entities: knowledge.entities.map((entity) => ({ ...entity, matchType: "existing", confidence: 1 })), projects: knowledge.projects });
  });

  app.get("/api/ai-entity-glossary", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    if (!isCompanyManager(user)) return res.status(403).json({ error: "company_admin_required" });
    res.json({ entries: getAIEntityGlossary(user.companyId || "company-default") });
  });

  app.put("/api/ai-entity-glossary", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    if (!isCompanyManager(user)) return res.status(403).json({ error: "company_admin_required" });
    try {
      res.json({ entries: updateAIEntityGlossary(user.companyId || "company-default", req.body?.entries) });
    } catch (error) {
      res.status(400).json({ error: "invalid_glossary", message: error.message });
    }
  });

  app.get("/api/user-settings", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const companyId = user.companyId || "company-default";
    let row = db.prepare("SELECT value, updatedAt FROM user_settings WHERE companyId = ? AND userId = ?").get(companyId, user.id);
    if (!row) {
      const legacy = db.prepare("SELECT value FROM app_data WHERE key = 'appSettings'").get();
      const timestamp = nowIso();
      const value = parseJson(legacy?.value, {});
      db.prepare("INSERT INTO user_settings (companyId, userId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(companyId, user.id, JSON.stringify(value), timestamp, timestamp);
      row = { value: JSON.stringify(value), updatedAt: timestamp };
    }
    res.json({ value: parseJson(row.value, {}), updatedAt: row.updatedAt });
  });

  app.put("/api/user-settings", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const companyId = user.companyId || "company-default";
    const value = req.body?.value && typeof req.body.value === "object" ? req.body.value : {};
    const timestamp = nowIso();
    db.prepare(`INSERT INTO user_settings (companyId, userId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(companyId, userId) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`)
      .run(companyId, user.id, JSON.stringify(value), timestamp, timestamp);
    res.json({ value, updatedAt: timestamp });
  });

  app.get("/api/ai-usage", (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const companyId = user.companyId || "company-default";
    const manager = isCompanyManager(user);
    const conditions = ["events.companyId = ?"];
    const params = [companyId];
    if (!manager) { conditions.push("events.userId = ?"); params.push(user.id); }
    else if (req.query.userId) { conditions.push("events.userId = ?"); params.push(String(req.query.userId)); }
    if (req.query.from) { conditions.push("events.createdAt >= ?"); params.push(String(req.query.from)); }
    if (req.query.to) { conditions.push("events.createdAt <= ?"); params.push(String(req.query.to)); }
    if (req.query.model) { conditions.push("events.model = ?"); params.push(String(req.query.model)); }
    if (["success", "error", "timeout"].includes(String(req.query.status || ""))) { conditions.push("events.status = ?"); params.push(String(req.query.status)); }
    const where = conditions.join(" AND ");
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize || 20)));
    const page = Math.max(1, Number(req.query.page || 1));
    const summary = db.prepare(`SELECT COUNT(*) AS calls, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes, SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures, COALESCE(SUM(inputTokens), 0) AS inputTokens, COALESCE(SUM(outputTokens), 0) AS outputTokens, COALESCE(SUM(totalTokens), 0) AS totalTokens FROM ai_usage_events events WHERE ${where}`).get(...params);
    const byUser = db.prepare(`SELECT events.userId, users.name, users.username, COUNT(*) AS calls, COALESCE(SUM(events.inputTokens), 0) AS inputTokens, COALESCE(SUM(events.outputTokens), 0) AS outputTokens, COALESCE(SUM(events.totalTokens), 0) AS totalTokens FROM ai_usage_events events JOIN users ON users.id = events.userId WHERE ${where} GROUP BY events.userId, users.name, users.username ORDER BY totalTokens DESC, calls DESC`).all(...params);
    const total = db.prepare(`SELECT COUNT(*) AS count FROM ai_usage_events events WHERE ${where}`).get(...params).count;
    const records = db.prepare(`SELECT events.*, users.name AS userName, users.username FROM ai_usage_events events JOIN users ON users.id = events.userId WHERE ${where} ORDER BY events.createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    res.json({ summary, byUser, records, pagination: { page, pageSize, total } });
  });

  app.post("/api/upload", (req, res) => {
    const { filename, contentBase64 } = req.body;
    if (!filename || !contentBase64) return res.status(400).json({ error: "filename_and_content_required" });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    const target = path.join(uploadsDir, storedName);
    fs.writeFileSync(target, Buffer.from(contentBase64, "base64"));
    res.status(201).json({ id: crypto.randomUUID(), filename: safeName, url: `/uploads/${storedName}`, createdAt: nowIso() });
  });

  app.post("/api/intake/analyze", async (req, res) => {
    const inputType = req.body?.inputType;
    if (!["text", "image", "audio"].includes(inputType)) {
      return res.status(400).json({ error: "invalid_input_type" });
    }
    try {
      const body = { ...(req.body || {}) };
      if (inputType === "audio" && body.attachmentUrl) {
        const filename = path.basename(String(body.attachmentUrl).split("?")[0]);
        body.attachmentPath = path.join(uploadsDir, filename);
      }
      res.json(await analyzeIntakeWithAI(body, currentUser(req), db));
    } catch (error) { res.status(502).json({ error: "ai_unavailable", message: error.message }); }
  });

  app.post("/api/intake/transcribe", async (req, res) => {
    const user = currentUser(req);
    const attachmentUrl = String(req.body?.attachmentUrl || "");
    if (!attachmentUrl) return res.status(400).json({ error: "audio_required", message: "缺少音频文件" });
    const config = getAIConfig(user.companyId || "company-default");
    const apiKey = getAIKey(user.companyId || "company-default");
    if (!config.configured) return res.status(503).json({ error: "ai_not_configured", message: "AI 地址或 API Key 未配置", model: config.model, endpoint: resolveTranscriptionEndpoint(config.endpoint) });
    try {
      const filename = path.basename(attachmentUrl.split("?")[0]);
      const transcript = await transcribeAudio(path.join(uploadsDir, filename), config, apiKey);
      if (!transcript) return res.status(502).json({ error: "empty_transcript", message: "语音服务没有返回文字", model: config.model });
      res.json({ transcript, model: config.model });
    } catch (error) { res.status(502).json({ error: "transcription_failed", message: error.message, model: config.model, endpoint: resolveTranscriptionEndpoint(config.endpoint) }); }
  });

  app.post("/api/ai-debug", async (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    if (!isCompanyManager(user)) return res.status(403).json({ error: "company_admin_required" });
    const supplied = req.body && typeof req.body === "object" ? req.body : {};
    const override = supplied.endpoint || supplied.model || supplied.apiKey ? { endpoint: supplied.endpoint, model: supplied.model, timeoutMs: supplied.timeoutMs, apiKey: supplied.apiKey } : null;
    const result = await debugAI(user, db, override);
    res.status(result.ok ? 200 : 502).json(result);
  });

  app.get("/api/file-settings", (_req, res) => {
    res.json(services.getFileSettings());
  });

  app.put("/api/file-settings", (req, res) => {
    const current = services.getFileSettings();
    const rootPath = String(req.body?.rootPath || current.rootPath).trim();
    if (!rootPath) return res.status(400).json({ error: "root_path_required" });

    const next = {
      rootPath: path.resolve(rootPath),
      autoRename: req.body?.autoRename !== false,
      autoCreateFolders: req.body?.autoCreateFolders !== false,
    };

    try {
      services.ensureFileRoot(next.rootPath);
      services.writeAppDataValue("fileSettings", next, req);
      res.json({ ...services.getFileSettings(), savedAt: nowIso() });
    } catch (error) {
      res.status(500).json({ error: "file_root_unavailable", message: error.message });
    }
  });

  app.post("/api/file-settings/open", (_req, res) => {
    const rootPath = services.getFileSettings().rootPath;
    try {
      const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
      spawn(command, [rootPath], { detached: true, stdio: "ignore" }).unref();
      res.json({ ok: true, rootPath });
    } catch (error) {
      res.status(500).json({ error: "file_root_open_failed", message: error.message });
    }
  });

  app.post("/api/projects/:projectId/folders/init", (req, res) => {
    const project = { ...(req.body?.project || {}), id: req.params.projectId };
    const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
    if (!project.name && !project.projectName) return res.status(400).json({ error: "project_required" });

    try {
      const result = services.ensureProjectStageFolders(project, stages);
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      res.status(500).json({ error: "folder_init_failed", message: error.message });
    }
  });

  app.post("/api/projects/folders/init-all", (req, res) => {
    const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
    const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
    if (projects.length === 0) return res.status(400).json({ error: "projects_required" });

    try {
      const initialized = projects
        .filter((project) => project?.id && (project.name || project.projectName))
        .map((project) => services.ensureProjectStageFolders(project, stages));
      res.status(201).json({ ok: true, count: initialized.length, initialized });
    } catch (error) {
      res.status(500).json({ error: "folder_init_all_failed", message: error.message });
    }
  });

  app.post("/api/projects/:projectId/stages/:stageId/upload", (req, res) => {
    const { project: rawProject, stage: rawStage, fileType, filename, contentBase64 } = req.body || {};
    if (!filename || !contentBase64) return res.status(400).json({ error: "filename_and_content_required" });

    const project = { ...(rawProject || {}), id: req.params.projectId };
    const stage = { ...(rawStage || {}), id: req.params.stageId };
    if (!project.name && !project.projectName) return res.status(400).json({ error: "project_required" });
    if (!stage.name) return res.status(400).json({ error: "stage_required" });

    try {
      services.ensureProjectStageFolders(project, [stage]);
      const rootPath = services.ensureFileRoot();
      const projectFolder = getProjectFolderName(project);
      const stageFolder = getStageFolderName(stage);
      const targetDir = path.join(rootPath, projectFolder, stageFolder, "已归档");
      fs.mkdirSync(targetDir, { recursive: true });

      const { originalBase, version, storedName } = buildProjectStoredFile({ project, stage, fileType, filename, targetDir });
      const targetPath = path.join(targetDir, storedName);
      const cleanBase64 = String(contentBase64).replace(/^data:.*?;base64,/, "");
      fs.writeFileSync(targetPath, Buffer.from(cleanBase64, "base64"));

      const relativePath = path.relative(rootPath, targetPath);
      res.status(201).json({
        id: crypto.randomUUID(),
        projectId: project.id,
        stageId: stage.id,
        fileType: fileType || originalBase,
        originalName: filename,
        originalBase,
        storedName,
        version,
        relativePath,
        absolutePath: targetPath,
        uploadedAt: nowIso(),
      });
    } catch (error) {
      res.status(500).json({ error: "project_file_upload_failed", message: error.message });
    }
  });

  app.post("/api/projects/:projectId/files/list", (req, res) => {
    const project = { ...(req.body?.project || {}), id: req.params.projectId };
    const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
    if (!project.name && !project.projectName) return res.status(400).json({ error: "project_required" });

    try {
      res.json(services.listProjectFilesFromDisk({ project, stages }));
    } catch (error) {
      res.status(500).json({ error: "project_files_list_failed", message: error.message });
    }
  });

  app.get("/api/project-files/download", (req, res) => {
    const resolved = services.resolveProjectFile(req.query.relativePath);
    if (!resolved) return res.status(404).json({ error: "file_not_found" });
    res.download(resolved.absolutePath);
  });

  app.post("/api/backup/export", (_req, res) => {
    res.json({ ok: true, path: services.exportBackup() });
  });
}
