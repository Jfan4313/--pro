import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { analyzeIntake } from "../domain/intakeAnalysis.js";
import { analyzeIntakeWithAI, getAIConfig, updateAIConfig } from "../domain/aiService.js";
import {
  buildProjectStoredFile,
  getProjectFolderName,
  getStageFolderName,
} from "../domain/projectFiles.js";
import { createUtilityServices } from "../services/utilityServices.js";

export function registerUtilityRoutes(app, context) {
  const services = createUtilityServices(context);
  const { uploadsDir, nowIso } = context;

  app.get("/api/ai-config", (req, res) => {
    if (req.authUser?.role !== "admin") return res.status(403).json({ error: "admin_required" });
    res.json(getAIConfig(req.authUser.id));
  });
  app.put("/api/ai-config", (req, res) => {
    if (req.authUser?.role !== "admin") return res.status(403).json({ error: "admin_required" });
    try { res.json(updateAIConfig(req.authUser.id, req.body || {})); } catch (error) { res.status(500).json({ error: "ai_config_save_failed", message: error.message }); }
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
    try { res.json(await analyzeIntakeWithAI(req.body || {}, req.authUser?.id || "default")); } catch (error) { res.status(502).json({ error: "ai_unavailable", message: error.message }); }
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
