import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, LoginResponse, ModuleKey, Permission } from "@hrms/shared-types";

type State = {
  user: AuthUser | null; accessToken: string | null; refreshToken: string | null;
  viewingCompanyId: string | null; // super admin support view
  setSession: (s: LoginResponse) => void;
  setUser: (u: AuthUser) => void;
  setViewingCompany: (id: string | null) => void;
  logout: () => void;
  can: (...p: Permission[]) => boolean;
  hasModule: (m: ModuleKey) => boolean;
};

export const useAuth = create<State>()(persist((set, get) => ({
  user: null, accessToken: null, refreshToken: null, viewingCompanyId: null,
  setSession: (s) => set({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
  setUser: (user) => set({ user }),
  setViewingCompany: (viewingCompanyId) => set({ viewingCompanyId }),
  logout: () => set({ user: null, accessToken: null, refreshToken: null, viewingCompanyId: null }),
  can: (...p) => { const u = get().user; if (!u) return false; if (u.permissions === "*") return true; return p.every((x) => (u.permissions as Permission[]).includes(x)); },
  hasModule: (m) => { const u = get().user; return u?.type === "super_admin" || !!u?.modules.includes(m); },
}), { name: "hrms-auth" }));
