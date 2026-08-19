import crypto from "node:crypto";
import { createSessionToken, hashPassword, hashToken, publicUser, verifyPassword } from "../auth.js";

function normalizePhone(value) { return String(value || "").replace(/[\s-]/g, "").trim(); }
function isValidPhone(value) { return /^[0-9+]{6,20}$/.test(value); }
function createLoginSession({ db, user, req, nowIso }) {
  const token = createSessionToken();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?").run(timestamp);
  db.prepare("INSERT INTO auth_sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent) VALUES (?, ?, ?, ?, ?, ?)").run(hashToken(token), user.id, timestamp, expiresAt, timestamp, req.header("User-Agent") || "");
  db.prepare("UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, user.id);
  return { token, expiresAt, user: publicUser({ ...user, lastLoginAt: timestamp, updatedAt: timestamp }) };
}

export function registerAuthRoutes(app, { db, nowIso, requireAuth, requireAdmin, requireAccountManager, wecomNotifier }) {
  app.post("/api/auth/login", (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = db.prepare("SELECT * FROM users WHERE lower(username) = ?").get(username);
    if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    res.json(createLoginSession({ db, user, req, nowIso }));
  });

  app.post("/api/auth/request-otp", (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!isValidPhone(phone)) return res.status(400).json({ error: "invalid_phone" });
    const user = db.prepare("SELECT * FROM users WHERE phone = ? AND status = 'active'").get(phone);
    if (!user) return res.status(404).json({ error: "phone_not_registered" });
    const recent = db.prepare("SELECT createdAt FROM auth_otp_codes WHERE phone = ? ORDER BY createdAt DESC LIMIT 1").get(phone);
    if (recent && Date.now() - new Date(recent.createdAt).getTime() < 60_000) return res.status(429).json({ error: "otp_too_frequent" });
    const code = String(crypto.randomInt(100000, 1000000));
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare("UPDATE auth_otp_codes SET consumedAt = ? WHERE userId = ? AND consumedAt IS NULL").run(createdAt, user.id);
    db.prepare("INSERT INTO auth_otp_codes (id, userId, phone, codeHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), user.id, phone, hashToken(code), expiresAt, createdAt);
    const devMode = process.env.OTP_MODE !== "sms";
    if (devMode) console.log(`[OTP development] ${user.name} (${phone}) verification code: ${code}, expires: ${expiresAt}`);
    void wecomNotifier?.sendMarkdown(`### 登录验证码请求\n>用户：${user.name}\n>手机号：${phone}\n>验证码请查看本地后台日志，不在群内发送。`);
    res.json({ ok: true, expiresIn: 300, devCode: devMode ? code : undefined, delivery: devMode ? "development" : "sms" });
  });

  app.post("/api/auth/login-otp", (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || "").trim();
    const record = db.prepare("SELECT * FROM auth_otp_codes WHERE phone = ? AND consumedAt IS NULL ORDER BY createdAt DESC LIMIT 1").get(phone);
    if (!record || new Date(record.expiresAt).getTime() <= Date.now() || record.attempts >= 5) return res.status(401).json({ error: "invalid_or_expired_otp" });
    if (hashToken(code) !== record.codeHash) {
      db.prepare("UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = ?").run(record.id);
      return res.status(401).json({ error: "invalid_or_expired_otp" });
    }
    db.prepare("UPDATE auth_otp_codes SET consumedAt = ? WHERE id = ?").run(nowIso(), record.id);
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(record.userId);
    if (!user) return res.status(401).json({ error: "invalid_credentials" });
    res.json(createLoginSession({ db, user, req, nowIso }));
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
        permissions, mustChangePassword, companyId, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, 'project_manager', ?, 'active', NULL, 0, 'company-default', ?, ?)
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
    if (!req.authUser.mustChangePassword && !verifyPassword(currentPassword, req.authUser.passwordHash)) return res.status(400).json({ error: "current_password_incorrect" });
    if (newPassword.length < 8) return res.status(400).json({ error: "password_too_short" });
    const timestamp = nowIso();
    db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0, updatedAt = ? WHERE id = ?")
      .run(hashPassword(newPassword), timestamp, req.authUser.id);
    db.prepare("DELETE FROM auth_sessions WHERE userId = ? AND tokenHash != ?")
      .run(req.authUser.id, hashToken(String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "")));
    res.json({ ok: true });
  });

  app.get("/api/accounts", requireAccountManager, (_req, res) => {
    const users = db.prepare("SELECT * FROM users ORDER BY createdAt ASC").all().map(publicUser);
    res.json(users);
  });

  app.post("/api/accounts", requireAccountManager, (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    const phone = normalizePhone(req.body?.phone);
    if (!/^[a-z0-9._+@-]{3,40}$/.test(username) || !name || (!password && !isValidPhone(phone)) || (password && password.length < 8)) return res.status(400).json({ error: "invalid_account_fields" });
    if (db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(username)) return res.status(409).json({ error: "username_exists" });
    if (phone && db.prepare("SELECT id FROM users WHERE phone = ?").get(phone)) return res.status(409).json({ error: "phone_exists" });
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    db.prepare(`INSERT INTO users (id, username, name, email, phone, role, passwordHash, status, permissions, mustChangePassword, companyId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?, ?, ?)`)
      .run(id, username, name, String(req.body?.email || ""), phone, String(req.body?.role || "viewer"), password ? hashPassword(password) : null, Array.isArray(req.body?.permissions) ? JSON.stringify(req.body.permissions) : null, req.authUser.companyId || "company-default", timestamp, timestamp);
    void wecomNotifier?.sendMarkdown(`### 新用户帐号已创建\n>姓名：${name}\n>手机号：${phone || "未填写"}\n>登录方式：${password ? "临时密码" : "开发模式一次性验证码"}`);
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
