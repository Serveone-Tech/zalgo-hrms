import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "./api";
import { useToast } from "@/components/ui/toast";
import type { ApiResponse } from "@hrms/shared-types";

export const useGet = <T,>(key: unknown[], url: string, enabled = true) =>
  useQuery({ queryKey: key, enabled, queryFn: async () => (await api.get<ApiResponse<T>>(url)).data });

export const useAction = <B = unknown, R = unknown>(invalidate: unknown[][] = []) => {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ method = "post", url, body }: { method?: "post" | "put" | "delete"; url: string; body?: B }) =>
      (await api.request<ApiResponse<R>>({ method, url, data: body })).data,
    onSuccess: (d) => { toast(d.message); invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k })); },
    onError: (e) => toast(errMsg(e), "error"),
  });
};
