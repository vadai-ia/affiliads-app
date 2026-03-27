import { z } from "zod";

export const templateObjectives = [
  "OUTCOME_LEADS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_AWARENESS",
] as const;

export const templateStatuses = ["draft", "active"] as const;

export const templateListStatuses = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;

export const uploadedAssetSchema = z.object({
  fileUrl: z.string().url("URL de asset inválida"),
  storagePath: z.string().min(1, "Path de storage inválido"),
  fileType: z.enum(["image", "video"]),
  originalName: z.string().nullable().optional(),
});

export const geoInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, "La geo necesita un nombre"),
  countryCode: z.string().min(2, "Código de país inválido").max(2),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  radiusKm: z.number().int().positive().nullable().optional(),
});

export const templatePayloadSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio"),
    campaignObjective: z.enum(templateObjectives),
    copyBase: z.string().min(1, "El copy es obligatorio"),
    minBudget: z.coerce.number().positive("Presupuesto mínimo inválido"),
    maxBudget: z.coerce.number().positive("Presupuesto máximo inválido"),
    status: z.enum(templateStatuses),
    assets: z.array(uploadedAssetSchema).min(1, "Sube al menos un asset"),
    geos: z.array(geoInputSchema).min(1, "Agrega al menos una geo"),
  })
  .refine((value) => value.maxBudget >= value.minBudget, {
    message: "El presupuesto máximo debe ser mayor o igual al mínimo",
    path: ["maxBudget"],
  });

export type UploadedAsset = z.infer<typeof uploadedAssetSchema>;
export type GeoInput = z.infer<typeof geoInputSchema>;
export type TemplatePayload = z.infer<typeof templatePayloadSchema>;

export function formatBudget(value: number): string {
  return value.toFixed(2);
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

export function parseTemplatePayloadFromFormData(formData: FormData) {
  const assets = parseJsonField(formData.get("assets_json"), z.array(uploadedAssetSchema));
  const geos = parseJsonField(formData.get("geos_json"), z.array(geoInputSchema));

  return templatePayloadSchema.parse({
    name: formData.get("name"),
    campaignObjective: formData.get("campaign_objective"),
    copyBase: formData.get("copy_base"),
    minBudget: formData.get("min_budget"),
    maxBudget: formData.get("max_budget"),
    status: formData.get("status"),
    assets,
    geos,
  });
}

export function statusBadgeVariant(status: string) {
  switch (status) {
    case "active":
      return "default";
    case "paused":
      return "secondary";
    case "archived":
      return "destructive";
    default:
      return "outline";
  }
}
