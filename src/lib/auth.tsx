import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "./apiClient";
import { AUTH_TOKEN_KEY, setUserId } from "./clientIdentity";

const AUTH_USER_KEY = "zhijian-auth-user";
const AUTH_EXPIRY_KEY = "zhijian-auth-expiry";
const viteEnv = (import.meta as any).env || {};
const AUTH_REQUIRED = viteEnv.PROD || viteEnv.VITE_AUTH_REQUIRED === "true";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  permissions: string[];
  companyId: string;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  isDemo?: boolean;
}

const GUEST_USER: AuthUser = {
  id: "guest-local",
  username: "guest",
  name: "免登录试用",
  email: "",
  phone: "",
  role: "admin",
  status: "active",
  permissions: ["*"],
  companyId: "company-demo",
  mustChangePassword: false,
  isDemo: true,
};

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ devCode?: string; expiresIn: number; delivery: string }>;
  loginWithOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

function readCachedUser(): AuthUser | null {
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => AUTH_REQUIRED ? readCachedUser() : GUEST_USER);
  const [loading, setLoading] = useState(AUTH_REQUIRED);

  const storeUser = (next: AuthUser | null) => {
    setUser(next);
    setUserId(next?.id || null);
    if (next) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(AUTH_USER_KEY);
  };

  useEffect(() => {
    if (!AUTH_REQUIRED) {
      setUser(GUEST_USER);
      setUserId(GUEST_USER.id);
      setLoading(false);
      return;
    }
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    const expiresAt = window.localStorage.getItem(AUTH_EXPIRY_KEY);
    if (!token || (expiresAt && new Date(expiresAt).getTime() <= Date.now())) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_EXPIRY_KEY);
      storeUser(null);
      setLoading(false);
      return;
    }
    apiClient.getCurrentUser()
      .then((response) => storeUser(response.user))
      .catch((error: any) => {
        if (error?.status === 401) {
          window.localStorage.removeItem(AUTH_TOKEN_KEY);
          window.localStorage.removeItem(AUTH_EXPIRY_KEY);
          storeUser(null);
        }
        // With no network, keep the last verified account for offline field work.
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    async login(username, password) {
      const response = await apiClient.login(username, password);
      window.localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      window.localStorage.setItem(AUTH_EXPIRY_KEY, response.expiresAt);
      storeUser(response.user);
      window.dispatchEvent(new CustomEvent("zhijian-auth-changed"));
    },
    async requestOtp(phone) {
      return apiClient.requestOtp(phone);
    },
    async loginWithOtp(phone, code) {
      const response = await apiClient.loginWithOtp(phone, code);
      window.localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      window.localStorage.setItem(AUTH_EXPIRY_KEY, response.expiresAt);
      storeUser(response.user);
      window.dispatchEvent(new CustomEvent("zhijian-auth-changed"));
    },
    async logout() {
      if (!AUTH_REQUIRED) {
        storeUser(GUEST_USER);
        return;
      }
      try { await apiClient.logout(); } catch { /* Clear this device even when offline. */ }
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_EXPIRY_KEY);
      storeUser(null);
      window.dispatchEvent(new CustomEvent("zhijian-auth-changed"));
    },
    async changePassword(currentPassword, newPassword) {
      await apiClient.changePassword(currentPassword, newPassword);
      if (user) storeUser({ ...user, mustChangePassword: false });
    },
    can(permission) {
      return Boolean(user && (user.permissions.includes("*") || user.permissions.includes(permission)));
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
