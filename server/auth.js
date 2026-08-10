import crypto from "node:crypto";

const KEY_LENGTH = 64;

export const ROLE_PERMISSIONS = {
  admin: ["*"],
  project_manager: ["dashboard", "projects", "lifecycle", "survey", "files", "schedule", "contracts", "materials", "supply", "cost", "personnel", "partners", "collaboration", "organization"],
  surveyor: ["dashboard", "projects", "survey", "files", "schedule", "collaboration"],
  designer: ["dashboard", "projects", "lifecycle", "survey", "files", "collaboration"],
  finance: ["dashboard", "projects", "contracts", "cost", "supply", "files"],
  viewer: ["dashboard", "projects", "files"],
};

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
  try {
    const custom = JSON.parse(user.permissions || "null");
    if (Array.isArray(custom)) return custom;
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
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isDemo: user.id === "admin-local",
  };
}
