import crypto from "node:crypto";
import { createSessionToken, hashPassword, hashToken, publicUser, verifyPassword } from "../auth.js";

export function registerAuthRoutes(app, { db, nowIso, requireAuth, requireAdmin }) {
  app.post("/api/auth/login", (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = db.prepare("SELECT * FROM users WHERE lower(username) = ?").get(username);
    if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const token = createSessionToken();
    const timestamp = nowIso();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?").run(timestamp);
    db.prepare("INSERT INTO auth_sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent) VALUES (?, ?, ?, ?, ?, ?)")
      .run(hashToken(token), user.id, timestamp, expiresAt, timestamp, req.header("User-Agent") || "");
    db.prepare("UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, user.id);
    res.json({ token, expiresAt, user: publicUser({ ...user, lastLoginAt: timestamp, updatedAt: timestamp }) });
  });

  app.post("/api/auth/register", (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: "invalid_username" });
    if (!name || name.length > 40) return res.status(400).json({ error: "invalid_name" });
    if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return res.status(400).json({ error: "weak_password" });
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)) return res.status(400).json({ error: "invalid_email" });
    if (phone && (!/^[0-9+\s-]{6,24}$/.test(phone))) return res.status(400).json({ error: "invalid_phone" });
    if (db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(username)) return res.status(409).json({ error: "username_exists" });

    const id = crypto.randomUUID();
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO users (
        id, username, name, email, phone, role, passwordHash, status,
        permissions, mustChangePassword, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, 'project_manager', ?, 'active', NULL, 0, ?, ?)
    `).run(id, username, name, email, phone, hashPassword(password), timestamp, timestamp);

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO auth_sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(hashToken(token), id, timestamp, expiresAt, timestamp, req.header("User-Agent") || "");

    res.status(201).json({
      token,
      expiresAt,
      user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)),
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.authUser) });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token) db.prepare("DELETE FROM auth_sessions WHERE tokenHash = ?").run(hashToken(token));
    res.json({ ok: true });
  });

  app.post("/api/auth/change-password", requireAuth, (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!verifyPassword(currentPassword, req.authUser.passwordHash)) return res.status(400).json({ error: "current_password_incorrect" });
    if (newPassword.length < 8) return res.status(400).json({ error: "password_too_short" });
    const timestamp = nowIso();
    db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0, updatedAt = ? WHERE id = ?")
      .run(hashPassword(newPassword), timestamp, req.authUser.id);
    db.prepare("DELETE FROM auth_sessions WHERE userId = ? AND tokenHash != ?")
      .run(req.authUser.id, hashToken(String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "")));
    res.json({ ok: true });
  });

  app.get("/api/accounts", requireAdmin, (_req, res) => {
    const users = db.prepare("SELECT * FROM users ORDER BY createdAt ASC").all().map(publicUser);
    res.json(users);
  });

  app.post("/api/accounts", requireAdmin, (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    if (!/^[a-z0-9._-]{3,32}$/.test(username) || !name || password.length < 8) return res.status(400).json({ error: "invalid_account_fields" });
    if (db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(username)) return res.status(409).json({ error: "username_exists" });
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    db.prepare(`INSERT INTO users (id, username, name, email, phone, role, passwordHash, status, permissions, mustChangePassword, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?, ?)`)
      .run(id, username, name, String(req.body?.email || ""), String(req.body?.phone || ""), String(req.body?.role || "viewer"), hashPassword(password), Array.isArray(req.body?.permissions) ? JSON.stringify(req.body.permissions) : null, timestamp, timestamp);
    res.status(201).json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
  });

  app.put("/api/accounts/:id", requireAdmin, (req, res) => {
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "account_not_found" });
    if (existing.id === req.authUser.id && req.body?.status === "disabled") return res.status(400).json({ error: "cannot_disable_self" });
    const timestamp = nowIso();
    db.prepare(`UPDATE users SET name = ?, email = ?, phone = ?, role = ?, status = ?, permissions = ?, updatedAt = ? WHERE id = ?`)
      .run(String(req.body?.name ?? existing.name), String(req.body?.email ?? existing.email ?? ""), String(req.body?.phone ?? existing.phone ?? ""), String(req.body?.role ?? existing.role), String(req.body?.status ?? existing.status), Array.isArray(req.body?.permissions) ? JSON.stringify(req.body.permissions) : existing.permissions, timestamp, existing.id);
    if (req.body?.status === "disabled") db.prepare("DELETE FROM auth_sessions WHERE userId = ?").run(existing.id);
    res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id)));
  });

  app.post("/api/accounts/:id/reset-password", requireAdmin, (req, res) => {
    const password = String(req.body?.password || "");
    if (password.length < 8) return res.status(400).json({ error: "password_too_short" });
    const timestamp = nowIso();
    const result = db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 1, updatedAt = ? WHERE id = ?").run(hashPassword(password), timestamp, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "account_not_found" });
    db.prepare("DELETE FROM auth_sessions WHERE userId = ?").run(req.params.id);
    res.json({ ok: true });
  });
}
