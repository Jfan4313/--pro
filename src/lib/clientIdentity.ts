const CLIENT_ID_KEY = "zhijian-client-id";
const USER_ID_KEY = "zhijian-user-id";
export const AUTH_TOKEN_KEY = "zhijian-auth-token";

export function getClientId() {
  let clientId = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function getUserId() {
  return window.localStorage.getItem(USER_ID_KEY) || "admin-local";
}

export function setUserId(userId: string | null) {
  if (userId) window.localStorage.setItem(USER_ID_KEY, userId);
  else window.localStorage.removeItem(USER_ID_KEY);
}
