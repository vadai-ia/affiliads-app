import { z } from "zod";

export const activationStatuses = [
  "pending_payment",
  "pending_approval",
  "rejected",
  "activating",
  "active",
  "paused",
  "completed",
  "failed",
] as const;

export const uploadedProofSchema = z.object({
  fileUrl: z.string().url("URL de comprobante inválida"),
  storagePath: z.string().min(1),
  fileType: z.enum(["image", "pdf"]),
  originalName: z.string().nullable().optional(),
});

export type UploadedProof = z.infer<typeof uploadedProofSchema>;

export const activationSubmitSchema = z.object({
  template_id: z.string().uuid(),
  selected_geo_id: z.string().uuid(),
  budget: z.coerce.number().positive("El monto debe ser mayor a 0"),
  proof: uploadedProofSchema,
});

export type ActivationSubmitPayload = z.infer<typeof activationSubmitSchema>;

/** `baseDomain` sin protocolo, p.ej. `afiliads.com` */
export function buildAffiliateLandingUrl(
  baseDomain: string,
  subdomain: string | null,
): string {
  const sub = subdomain?.trim().toLowerCase();
  if (!sub) {
    throw new Error("Falta subdominio del afiliado");
  }
  const host = baseDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return `https://${sub}.${host}`;
}

export function parseJsonField<T>(
  rawValue: FormDataEntryValue | null,
  schema: z.ZodType<T>,
): T {
  if (typeof rawValue !== "string") {
    throw new Error("Payload JSON inválido");
  }
  const parsed = JSON.parse(rawValue) as unknown;
  return schema.parse(parsed);
}

export function parseActivationSubmitFromFormData(formData: FormData) {
  const proof = parseJsonField(formData.get("proof_json"), uploadedProofSchema);
  return activationSubmitSchema.parse({
    template_id: formData.get("template_id"),
    selected_geo_id: formData.get("selected_geo_id"),
    budget: formData.get("budget"),
    proof,
  });
}

export function activationStatusBadgeVariant(
  status: (typeof activationStatuses)[number],
) {
  switch (status) {
    case "active":
      return "default";
    case "pending_approval":
    case "pending_payment":
      return "secondary";
    case "rejected":
    case "failed":
      return "destructive";
    case "activating":
      return "outline";
    default:
      return "outline";
  }
}
