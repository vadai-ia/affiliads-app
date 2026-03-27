import { data, Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { requireLeader } from "~/lib/auth.server";
import {
  actionError,
  actionSuccess,
  formatZodFieldErrors,
  type ActionResult,
} from "~/lib/errors";
import { getSupabaseAdmin } from "~/lib/supabase.admin.server";
import type { Route } from "./+types/_leader.settings.bank";

const bankSchema = z.object({
  bank_name: z.string().min(1, "El banco es obligatorio"),
  account_holder: z.string().min(1, "El titular es obligatorio"),
  account_number: z.string().min(1, "La cuenta es obligatoria"),
  clabe: z.string().optional(),
  instructions: z.string().optional(),
});

type BankActionData = ActionResult;

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const { data: bankDetails } = await supabase
    .from("bank_details")
    .select(
      "bank_name, account_holder, account_number, clabe, instructions, updated_at",
    )
    .eq("org_id", user.orgId)
    .maybeSingle();

  return data({ bankDetails }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers, user } = await requireLeader(request);
  const admin = getSupabaseAdmin();
  const formData = await request.formData();
  const parsed = bankSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      actionError("Revisa el formulario", formatZodFieldErrors(parsed.error)),
      { headers },
    );
  }

  const payload = {
    org_id: user.orgId,
    bank_name: parsed.data.bank_name,
    account_holder: parsed.data.account_holder,
    account_number: parsed.data.account_number,
    clabe: parsed.data.clabe || null,
    instructions: parsed.data.instructions || null,
  };

  const { error } = await supabase
    .from("bank_details")
    .upsert(payload, { onConflict: "org_id" });

  if (error) {
    return data(actionError(error.message), { headers });
  }

  await admin.from("activity_log").insert({
    org_id: user.orgId,
    user_id: user.id,
    entity_type: "bank_details",
    entity_id: user.orgId,
    action: "bank_details.saved",
    metadata: {
      has_clabe: Boolean(payload.clabe),
      has_instructions: Boolean(payload.instructions),
      bank_name: payload.bank_name,
    },
  });

  return data(actionSuccess(undefined, "Datos bancarios guardados."), { headers });
}

export default function LeaderSettingsBank({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<BankActionData>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const bankDetails = loaderData.bankDetails;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Datos bancarios</h1>
        <p className="text-muted-foreground text-sm">
          Esta información la verá el afiliado al momento de pagar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuenta de cobro</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="max-w-2xl space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bank_name">Banco</Label>
                <Input
                  id="bank_name"
                  name="bank_name"
                  defaultValue={bankDetails?.bank_name ?? ""}
                  required
                />
                {actionData?.error && actionData.fieldErrors?.bank_name ? (
                  <p className="text-destructive text-sm">
                    {actionData.fieldErrors.bank_name}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_holder">Titular</Label>
                <Input
                  id="account_holder"
                  name="account_holder"
                  defaultValue={bankDetails?.account_holder ?? ""}
                  required
                />
                {actionData?.error && actionData.fieldErrors?.account_holder ? (
                  <p className="text-destructive text-sm">
                    {actionData.fieldErrors.account_holder}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_number">Número de cuenta</Label>
                <Input
                  id="account_number"
                  name="account_number"
                  defaultValue={bankDetails?.account_number ?? ""}
                  required
                />
                {actionData?.error && actionData.fieldErrors?.account_number ? (
                  <p className="text-destructive text-sm">
                    {actionData.fieldErrors.account_number}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="clabe">CLABE</Label>
                <Input
                  id="clabe"
                  name="clabe"
                  defaultValue={bankDetails?.clabe ?? ""}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Instrucciones</Label>
              <textarea
                id="instructions"
                name="instructions"
                defaultValue={bankDetails?.instructions ?? ""}
                className="border-input bg-background min-h-32 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                placeholder="Ejemplo: enviar comprobante con referencia del afiliado."
              />
            </div>

            {actionData?.error ? (
              <p className="text-destructive text-sm">{actionData.message}</p>
            ) : null}
            {actionData && !actionData.error ? (
              <p className="text-sm text-green-600">{actionData.message}</p>
            ) : null}

            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : "Guardar datos bancarios"}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
