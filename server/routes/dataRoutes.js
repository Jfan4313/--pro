import crypto from "node:crypto";
import { saveEntity } from "../services/entityStore.js";

export function registerDataRoutes(app, context) {
  const { db, parseJson, toEntity, insertSyncEvent, getServerVersion, emitEvent, nowIso, clientId, userId } = context;
  const persistEntity = (options) => saveEntity({ ...context, ...options });

  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", serverVersion: getServerVersion() })}\n\n`);
    context.clients.add(res);
    req.on("close", () => context.clients.delete(res));
  });

  app.get("/api/app-data/:key", (req, res) => {
    const row = db.prepare("SELECT * FROM app_data WHERE key = ?").get(req.params.key);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({ key: row.key, value: parseJson(row.value), updatedAt: row.updatedAt, version: row.version });
  });

  app.put("/api/app-data/:key", (req, res) => {
    const timestamp = nowIso();
    const existing = db.prepare("SELECT version FROM app_data WHERE key = ?").get(req.params.key);
    const version = (existing?.version || 0) + 1;
    db.prepare(`
      INSERT INTO app_data (key, value, createdAt, updatedAt, version, clientId, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updatedAt = excluded.updatedAt,
        version = excluded.version,
        clientId = excluded.clientId,
        updatedBy = excluded.updatedBy
    `).run(req.params.key, JSON.stringify(req.body.value), timestamp, timestamp, version, clientId(req), userId(req));
    const serverVersion = insertSyncEvent({
      resource: "app_data",
      recordId: req.params.key,
      operation: "upsert",
      payload: { key: req.params.key, value: req.body.value, updatedAt: timestamp, version },
      clientId: clientId(req),
      updatedBy: userId(req),
    });
    emitEvent({ type: "app_data_changed", key: req.params.key, value: req.body.value, version, serverVersion });
    res.json({ key: req.params.key, value: req.body.value, updatedAt: timestamp, version });
  });

  app.get("/api/:resource", (req, res) => {
    const includeDeleted = req.query.includeDeleted === "true";
    const rows = db.prepare(`
      SELECT * FROM entity_records
      WHERE resource = ? ${includeDeleted ? "" : "AND deletedAt IS NULL"}
      ORDER BY updatedAt DESC
    `).all(req.params.resource);
    res.json(rows.map(toEntity));
  });

  app.get("/api/:resource/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM entity_records WHERE resource = ? AND id = ?").get(req.params.resource, req.params.id);
    if (!row || row.deletedAt) return res.status(404).json({ error: "not_found" });
    res.json(toEntity(row));
  });

  app.post("/api/:resource", (req, res) => {
    const id = req.body.id || crypto.randomUUID();
    const result = persistEntity({ resource: req.params.resource, id, payload: req.body, baseVersion: req.body.baseVersion, req });
    if (result.conflict) return res.status(409).json(result.conflict);
    res.status(201).json(result.record);
  });

  app.put("/api/:resource/:id", (req, res) => {
    const result = persistEntity({ resource: req.params.resource, id: req.params.id, payload: req.body, baseVersion: req.body.baseVersion, req });
    if (result.conflict) return res.status(409).json(result.conflict);
    res.json(result.record);
  });

  app.delete("/api/:resource/:id", (req, res) => {
    const existing = db.prepare("SELECT * FROM entity_records WHERE resource = ? AND id = ?").get(req.params.resource, req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    const result = persistEntity({ resource: req.params.resource, id: req.params.id, payload: parseJson(existing.payload, {}), deletedAt: nowIso(), baseVersion: Number(req.query.baseVersion || existing.version), req });
    if (result.conflict) return res.status(409).json(result.conflict);
    res.json(result.record);
  });

  app.post("/api/sync/pull", (req, res) => {
    const sinceVersion = Number(req.body.sinceVersion || 0);
    const rows = db.prepare("SELECT * FROM sync_events WHERE version > ? ORDER BY version ASC").all(sinceVersion);
    res.json({
      changes: rows.map((row) => ({
        version: row.version,
        resource: row.resource,
        recordId: row.recordId,
        operation: row.operation,
        payload: parseJson(row.payload),
        createdAt: row.createdAt,
        clientId: row.clientId,
        updatedBy: row.updatedBy,
      })),
      serverVersion: getServerVersion(),
    });
  });

  app.post("/api/sync/push", (req, res) => {
    const operations = Array.isArray(req.body.operations) ? req.body.operations : [];
    const applied = [];
    const conflicts = [];
    for (const operation of operations) {
      const payload = operation.payload || {};
      const result = persistEntity({
        resource: operation.resource,
        id: operation.recordId || payload.id || crypto.randomUUID(),
        payload,
        deletedAt: operation.type === "delete" ? nowIso() : null,
        baseVersion: operation.baseVersion,
        req,
      });
      if (result.conflict) conflicts.push(result.conflict);
      else applied.push(result.record);
    }
    res.json({ applied, conflicts, serverVersion: getServerVersion() });
  });
}
