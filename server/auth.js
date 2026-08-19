import crypto from "node:crypto";

const KEY_LENGTH = 64;

export const ROLE_PERMISSIONS = {
  admin: ["*"],
  company_admin: ["dashboard", "projects", "lifecycle", "survey", "files", "schedule", "acceptance", "contracts", "materials", "supply", "cost", "personnel", "partners", "collaboration", "organization", "accounts", "settings"],
  project_manager: ["dashboard", "projects", "lifecycle", "survey", "files", "schedule", "acceptance", "contracts", "materials", "supply", "cost", "personnel", "partners", "collaboration", "organization", "settings"],
  surveyor: ["dashboard", "projects", "survey", "files", "schedule", "collaboration", "settings"],
  designer: ["dashboard", "projects", "lifecycle", "survey", "files", "collaboration", "settings"],
  finance: ["dashboard", "projects", "contracts", "cost", "supply", "files", "settings"],
  viewer: ["dashboard", "projects", "files", "settings"],
  construction_leader: ["dashboard", "projects", "survey", "files", "schedule", "collaboration", "organization", "settings"],
};

export const COMPANY_MANAGEABLE_ROLES = ["project_manager", "surveyor", "designer", "finance", "viewer", "construction_leader"];

export function isCompanyManager(user) {
  return user?.role === "admin" || user?.role === "company_admin";
}

export function canManageAccount(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  if (actor.role === "admin") return true;
  return actor.role === "company_admin"
    && actor.companyId === target.companyId
    && COMPANY_MANAGEABLE_ROLES.includes(target.role);
}

export function canAssignRole(actor, role) {
  if (actor?.role === "admin") return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
  return actor?.role === "company_admin" && COMPANY_MANAGEABLE_ROLES.includes(role);
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash = "") {
  const [algorithm, salt, expectedHex] = String(storedHash).split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function permissionsForUser(user) {
  if (!user) return [];
  if (user.role === "admin") return ["*"];
  try {
    const custom = JSON.parse(user.permissions || "null");
    if (Array.isArray(custom)) {
      const permissions = new Set([...custom, "settings"]);
      if (user.role === "company_admin") permissions.add("accounts");
      else permissions.delete("accounts");
      return [...permissions];
    }
  } catch {
    // Fall back to role defaults.
  }
  return ROLE_PERMISSIONS[user.role] || [];
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    role: user.role,
    status: user.status,
    permissions: permissionsForUser(user),
    companyId: user.companyId || "company-default",
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isDemo: user.id === "admin-local",
  };
}
