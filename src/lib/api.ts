const BASE_URL = (import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:3001')).replace(/\/$/, "");
const TOKEN_KEY = "local_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──

export interface LocalUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  permissions: Record<string, string>;
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ token: string; user: LocalUser }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiLogout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" }).catch(() => {});
  clearToken();
}

export async function apiGetMe(): Promise<LocalUser> {
  return request("/api/auth/me");
}

// ── Shipments ──

export async function apiGetShipments(): Promise<any[]> {
  return request("/api/shipments");
}

export async function apiGetShipment(id: string): Promise<any> {
  return request(`/api/shipments/${id}`);
}

export async function apiCreateShipment(shipment: any): Promise<any> {
  return request("/api/shipments", {
    method: "POST",
    body: JSON.stringify(shipment),
  });
}

export async function apiBulkCreateShipments(
  shipments: any[]
): Promise<{ added: number; skipped?: number }> {
  return request("/api/shipments/bulk", {
    method: "POST",
    body: JSON.stringify({ shipments }),
  });
}

export async function apiUpdateShipment(id: string, shipment: any): Promise<any> {
  return request(`/api/shipments/${id}`, {
    method: "PUT",
    body: JSON.stringify(shipment),
  });
}

export async function apiDeleteShipment(id: string): Promise<void> {
  return request(`/api/shipments/${id}`, { method: "DELETE" });
}

export async function apiPatchShipment(id: string, patch: Record<string, any>): Promise<any> {
  return request(`/api/shipments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ── Master Data ──

export interface MasterDataRow {
  id: string;
  category: string;
  value: string;
  code?: string | null;
}

export async function apiGetMasterData(category?: string): Promise<MasterDataRow[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return request(`/api/master-data${qs}`);
}

export async function apiAddMasterData(
  category: string,
  value: string,
  code?: string | null
): Promise<MasterDataRow> {
  return request("/api/master-data", {
    method: "POST",
    body: JSON.stringify({ category, value, code }),
  });
}

export async function apiBulkAddMasterData(
  category: string,
  values: Array<string | { value: string; code?: string | null }>
): Promise<{ added: number; skipped: number }> {
  return request("/api/master-data/bulk", {
    method: "POST",
    body: JSON.stringify({ category, values }),
  });
}

export async function apiUpdateMasterData(
  id: string,
  patch: { value?: string; code?: string | null }
): Promise<MasterDataRow> {
  return request(`/api/master-data/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function apiDeleteMasterData(id: string): Promise<void> {
  return request(`/api/master-data/${id}`, { method: "DELETE" });
}

// ── Settings / Branding ──

export interface BrandingSettings {
  companyName: string;
  logoUrl: string;
  logoWidth: number;
  logoHeight: number;
}

export async function apiGetSettings(): Promise<BrandingSettings> {
  return request("/api/settings");
}

export async function apiUpdateSettings(settings: BrandingSettings): Promise<BrandingSettings> {
  return request("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// Excel Import/Export settings
export async function apiGetExcelSettings(): Promise<any> {
  return request("/api/settings/excel");
}

export async function apiUpdateExcelSettings(settings: any): Promise<any> {
  return request("/api/settings/excel", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ── Users ──

export interface UserRow {
  id: string;
  email: string;
  display_name?: string | null;
  roles: string[];
  permissions: Record<string, string>;
}

export async function apiGetUsers(): Promise<UserRow[]> {
  return request("/api/users");
}

export async function apiCreateUser(payload: {
  email: string;
  password: string;
  display_name?: string;
  role?: string;
  permissions?: Record<string, string>;
}): Promise<UserRow> {
  return request("/api/users", { method: "POST", body: JSON.stringify(payload) });
}

export async function apiUpdateUser(
  id: string,
  patch: { display_name?: string; password?: string; email?: string }
): Promise<UserRow> {
  return request(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function apiDeleteUser(id: string): Promise<void> {
  return request(`/api/users/${id}`, { method: "DELETE" });
}

export async function apiGetUserPermissions(id: string): Promise<Record<string, string>> {
  return request(`/api/users/${id}/permissions`);
}

export async function apiSetUserPermissions(
  id: string,
  permissions: Record<string, string>
): Promise<void> {
  return request(`/api/users/${id}/permissions`, {
    method: "PUT",
    body: JSON.stringify(permissions),
  });
}

export async function apiSetUserRoles(id: string, roles: string[]): Promise<void> {
  return request(`/api/users/${id}/roles`, {
    method: "PUT",
    body: JSON.stringify({ roles }),
  });
}
