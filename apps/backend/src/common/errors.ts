export class AppError extends Error {
  constructor(public status: number, message: string, public code = "ERROR", public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, code = "BAD_REQUEST", d?: unknown) => new AppError(400, m, code, d);
export const unauthorized = (m = "Authentication required") => new AppError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "You do not have permission for this action") => new AppError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found") => new AppError(404, m, "NOT_FOUND");
export const conflict = (m: string, code = "CONFLICT") => new AppError(409, m, code);
export const limitReached = (m: string) => new AppError(402, m, "SUBSCRIPTION_LIMIT_REACHED");
export const moduleLocked = (mod: string) => new AppError(403, `The ${mod} module is not included in your subscription`, "MODULE_NOT_AVAILABLE");
