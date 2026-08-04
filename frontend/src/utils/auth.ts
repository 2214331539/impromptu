import type { Role } from "../types";

export function homeForRole(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/app";
}
