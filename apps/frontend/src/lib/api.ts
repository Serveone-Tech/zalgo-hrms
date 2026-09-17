import axios, { AxiosError } from "axios";
import type { ApiResponse, LoginResponse } from "@hrms/shared-types";
import { useAuth } from "@/store/auth";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";
export const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, "");
export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((cfg) => {
  const { accessToken, viewingCompanyId } = useAuth.getState();
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  if (viewingCompanyId) cfg.headers["x-company-id"] = viewingCompanyId; // super admin support view
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError<ApiResponse>) => {
    const code = err.response?.data?.code;
    if (code === "ONBOARDING_INCOMPLETE" && location.pathname !== "/onboarding") { window.location.href = "/onboarding"; return Promise.reject(err); }
    if (code === "SUBSCRIPTION_EXPIRED" && !location.pathname.startsWith("/app/subscription")) { window.location.href = "/app/subscription"; return Promise.reject(err); }

    const original = err.config as typeof err.config & { _retry?: boolean };
    if (err.response?.status === 401 && !original._retry && !original.url?.includes("/auth/")) {
      original._retry = true;
      refreshing ??= (async () => {
        const { refreshToken, setSession, logout } = useAuth.getState();
        if (!refreshToken) { logout(); return null; }
        try {
          const { data } = await axios.post<ApiResponse<LoginResponse>>(`${API_URL}/auth/refresh`, { refreshToken });
          setSession(data.data!);
          return data.data!.accessToken;
        } catch { logout(); return null; }
        finally { refreshing = null; }
      })();
      const token = await refreshing;
      if (token) { original.headers.Authorization = `Bearer ${token}`; return api(original); }
    }
    return Promise.reject(err);
  },
);

export const errMsg = (e: unknown) => {
  const ax = e as AxiosError<ApiResponse & { errors?: Record<string, string[]> }>;
  const d = ax.response?.data;
  if (d?.errors) return Object.entries(d.errors).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ");
  return d?.message ?? ax.message ?? "Something went wrong";
};
