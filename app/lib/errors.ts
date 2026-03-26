import type { ZodError } from "zod";

export type ActionError = {
  error: true;
  message: string;
  fieldErrors?: Record<string, string>;
  code?: string;
};

export type ActionSuccess<T = void> = {
  error: false;
  data?: T;
  message?: string;
};

export type ActionResult<T = void> = ActionError | ActionSuccess<T>;

export function actionSuccess<T = void>(
  data?: T,
  message?: string,
): ActionSuccess<T> {
  return { error: false, data, message };
}

export function actionError(
  message: string,
  fieldErrors?: Record<string, string>,
  code?: string,
): ActionError {
  return { error: true, message, fieldErrors, code };
}

export function formatZodFieldErrors(
  zodError: ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of zodError.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key] = issue.message;
    }
  }
  return out;
}
