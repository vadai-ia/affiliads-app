import { data } from "react-router";
import { z } from "zod";
import { requireUser } from "~/lib/auth.server";
import { actionError, actionSuccess } from "~/lib/errors";
import type { Route } from "./+types/api.notifications";

const markReadSchema = z.object({
  intent: z.literal("mark-read"),
  notificationId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  const { supabase, user, headers } = await requireUser(request);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const parsed = markReadSchema.safeParse(raw);
  if (!parsed.success) {
    return data(actionError("Solicitud inválida"), { headers, status: 400 });
  }

  const { notificationId } = parsed.data;

  const { data: row, error: findErr } = await supabase
    .from("notifications")
    .select("id")
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (findErr) {
    return data(actionError(findErr.message), { headers, status: 500 });
  }
  if (!row) {
    return data(actionError("Notificación no encontrada"), { headers, status: 404 });
  }

  const { error: upErr } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (upErr) {
    return data(actionError(upErr.message), { headers, status: 500 });
  }

  return data(actionSuccess({ marked: true }), { headers });
}
