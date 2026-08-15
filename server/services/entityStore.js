export function saveEntity({ db, toEntity, insertSyncEvent, emitEvent, nowIso, clientId, userId, resource, id, payload, deletedAt = null, baseVersion, req }) {
  const existing = db.prepare("SELECT * FROM entity_records WHERE resource = ? AND id = ?").get(resource, id);
  if (existing && typeof baseVersion === "number" && existing.version > baseVersion) {
    return {
      conflict: {
        operation: { resource, recordId: id, payload, baseVersion, clientId: clientId(req), createdAt: nowIso(), type: deletedAt ? "delete" : "upsert" },
        serverRecord: toEntity(existing),
        reason: "version_conflict",
      },
    };
  }

  const timestamp = nowIso();
  const metadata = {
    createdAt: existing?.createdAt || payload.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt,
    version: (existing?.version || 0) + 1,
    clientId: clientId(req),
    updatedBy: userId(req),
  };
  const storedPayload = { ...payload };
  for (const key of ["id", "createdAt", "updatedAt", "deletedAt", "version", "clientId", "updatedBy"]) {
    delete storedPayload[key];
  }

  db.prepare(`
    INSERT INTO entity_records (resource, id, payload, createdAt, updatedAt, deletedAt, version, clientId, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(resource, id) DO UPDATE SET
      payload = excluded.payload,
      updatedAt = excluded.updatedAt,
      deletedAt = excluded.deletedAt,
      version = excluded.version,
      clientId = excluded.clientId,
      updatedBy = excluded.updatedBy
  `).run(resource, id, JSON.stringify(storedPayload), metadata.createdAt, metadata.updatedAt, metadata.deletedAt, metadata.version, metadata.clientId, metadata.updatedBy);

  const record = { ...storedPayload, id, ...metadata };
  const serverVersion = insertSyncEvent({
    resource,
    recordId: id,
    operation: deletedAt ? "delete" : "upsert",
    payload: record,
    clientId: metadata.clientId,
    updatedBy: metadata.updatedBy,
  });
  emitEvent({ type: "entity_changed", resource, record, serverVersion });
  return { record, serverVersion };
}
