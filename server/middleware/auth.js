import { hashToken } from "../auth.js";

export function createAuthMiddleware({ db, apiAuthRequired, nowIso }) {
  function findAuthenticatedUser(req) {
    const authorization = req.header("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : req.query?.token;
    if (!token) return null;
    return db.prepare(`
      SELECT users.* FROM auth_sessions
      JOIN users ON users.id = auth_sessions.userId
      WHERE auth_sessions.tokenHash = ? AND auth_sessions.expiresAt > ? AND users.status = 'active'
    `).get(hashToken(token), nowIso());
  }

  function requireAuth(req, res, next) {
    const user = findAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "authentication_required" });
    req.authUser = user;
    next();
  }

  function requireApiAuth(req, res, next) {
    const user = findAuthenticatedUser(req);
    if (user) req.authUser = user;
    if (apiAuthRequired && !user) return res.status(401).json({ error: "authentication_required" });
    next();
  }

  function requireAdmin(req, res, next) {
    return requireAuth(req, res, () => {
      if (req.authUser.role !== "admin") return res.status(403).json({ error: "admin_required" });
      next();
    });
  }

  function requireAccountManager(req, res, next) {
    return requireAuth(req, res, () => {
      let customPermissions = [];
      try { customPermissions = JSON.parse(req.authUser.permissions || "[]"); } catch { /* use role permissions below */ }
      const canManageAccounts = req.authUser.role === "admin"
        || req.authUser.role === "project_manager"
        || customPermissions.includes("organization")
        || customPermissions.includes("accounts");
      if (!canManageAccounts) return res.status(403).json({ error: "organization_account_manager_required" });
      next();
    });
  }

  return { requireAuth, requireApiAuth, requireAdmin, requireAccountManager };
}
