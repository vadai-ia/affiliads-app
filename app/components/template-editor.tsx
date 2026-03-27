import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { ActionResult } from "~/lib/errors";
import {
  type GeoInput,
  type TemplatePayload,
  type UploadedAsset,
  templateObjectives,
} from "~/lib/templates";

type UploadActionData = ActionResult<UploadedAsset>;

type TemplateEditorProps = {
  title: string;
  description: string;
  submitLabel: string;
  cancelTo: string;
  actionError?: ActionResult | null;
  initialValue?: TemplatePayload;
};

const defaultTemplateValue: TemplatePayload = {
  name: "",
  campaignObjective: "OUTCOME_LEADS",
  copyBase: "",
  minBudget: 0,
  maxBudget: 0,
  status: "draft",
  assets: [],
  geos: [
    {
      label: "",
      countryCode: "MX",
      region: null,
      city: null,
      radiusKm: null,
    },
  ],
};

export function TemplateEditor({
  title,
  description,
  submitLabel,
  cancelTo,
  actionError,
  initialValue,
}: TemplateEditorProps) {
  const initial = initialValue ?? defaultTemplateValue;
  const uploadFetcher = useFetcher<UploadActionData>();
  const navigation = useNavigation();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const processedUploadRef = useRef<string | null>(null);

  const [step, setStep] = useState(1);
  const [name, setName] = useState(initial.name);
  const [campaignObjective, setCampaignObjective] = useState(
    initial.campaignObjective,
  );
  const [copyBase, setCopyBase] = useState(initial.copyBase);
  const [minBudget, setMinBudget] = useState(String(initial.minBudget || ""));
  const [maxBudget, setMaxBudget] = useState(String(initial.maxBudget || ""));
  const [status, setStatus] = useState(initial.status);
  const [assets, setAssets] = useState<UploadedAsset[]>(initial.assets);
  const [geos, setGeos] = useState<GeoInput[]>(initial.geos);

  useEffect(() => {
    const payload = uploadFetcher.data;
    if (!payload || payload.error || !payload.data) return;
    if (processedUploadRef.current === payload.data.storagePath) return;
    processedUploadRef.current = payload.data.storagePath;
    queueMicrotask(() => {
      setAssets((current) => [...current, payload.data!]);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    });
  }, [uploadFetcher.data]);

  const assetsJson = useMemo(() => JSON.stringify(assets), [assets]);
  const geosJson = useMemo(() => JSON.stringify(geos), [geos]);
  const submitting = navigation.state === "submitting";

  function updateGeo(index: number, patch: Partial<GeoInput>) {
    setGeos((current) =>
      current.map((geo, geoIndex) =>
        geoIndex === index ? { ...geo, ...patch } : geo,
      ),
    );
  }

  function moveAsset(index: number, direction: -1 | 1) {
    setAssets((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function moveGeo(index: number, direction: -1 | 1) {
    setGeos((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Button
            key={n}
            type="button"
            variant={step === n ? "default" : "outline"}
            size="sm"
            onClick={() => setStep(n)}
          >
            Paso {n}
          </Button>
        ))}
      </div>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Info base</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template_name">Nombre</Label>
              <Input
                id="template_name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Campaña para leads CDMX"
              />
              {actionError?.error && actionError.fieldErrors?.name ? (
                <p className="text-destructive text-sm">
                  {actionError.fieldErrors.name}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign_objective">Objetivo</Label>
              <select
                id="campaign_objective"
                value={campaignObjective}
                onChange={(event) =>
                  setCampaignObjective(
                    event.currentTarget.value as TemplatePayload["campaignObjective"],
                  )
                }
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              >
                {templateObjectives.map((objective) => (
                  <option key={objective} value={objective}>
                    {objective}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Copy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="copy_base">Texto del anuncio</Label>
            <textarea
              id="copy_base"
              value={copyBase}
              onChange={(event) => setCopyBase(event.currentTarget.value)}
              className="border-input bg-background min-h-40 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              placeholder="Describe la oferta base que verá el afiliado."
            />
            {actionError?.error && actionError.fieldErrors?.copyBase ? (
              <p className="text-destructive text-sm">
                {actionError.fieldErrors.copyBase}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <uploadFetcher.Form
              method="post"
              action="/api/upload"
              encType="multipart/form-data"
              className="space-y-3"
            >
              <Input
                ref={uploadInputRef}
                type="file"
                name="file"
                accept="image/png,image/jpeg,video/mp4"
                required
              />
              {uploadFetcher.data?.error ? (
                <p className="text-destructive text-sm">
                  {uploadFetcher.data.message}
                </p>
              ) : null}
              <Button type="submit" disabled={uploadFetcher.state !== "idle"}>
                {uploadFetcher.state !== "idle" ? "Subiendo…" : "Subir asset"}
              </Button>
            </uploadFetcher.Form>

            <div className="space-y-3">
              {assets.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aún no hay assets subidos.
                </p>
              ) : (
                assets.map((asset, index) => (
                  <div
                    key={`${asset.storagePath}-${index}`}
                    className="flex flex-col gap-3 rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {asset.originalName ?? asset.storagePath}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {asset.fileType === "image" ? "Imagen" : "Video"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => moveAsset(index, -1)}
                        >
                          Subir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => moveAsset(index, 1)}
                        >
                          Bajar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            setAssets((current) =>
                              current.filter((_, assetIndex) => assetIndex !== index),
                            )
                          }
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                    {asset.fileType === "image" ? (
                      <img
                        src={asset.fileUrl}
                        alt={asset.originalName ?? "Asset"}
                        className="h-40 w-full rounded-md object-cover"
                      />
                    ) : (
                      <video
                        src={asset.fileUrl}
                        controls
                        className="h-40 w-full rounded-md object-cover"
                      />
                    )}
                  </div>
                ))
              )}
              {actionError?.error && actionError.fieldErrors?.assets ? (
                <p className="text-destructive text-sm">
                  {actionError.fieldErrors.assets}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Geografías permitidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {geos.map((geo, index) => (
              <div key={index} className="space-y-3 rounded-md border p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nombre visible</Label>
                    <Input
                      value={geo.label}
                      onChange={(event) =>
                        updateGeo(index, { label: event.currentTarget.value })
                      }
                      placeholder="CDMX Centro"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Input
                      value={geo.countryCode}
                      onChange={(event) =>
                        updateGeo(index, {
                          countryCode: event.currentTarget.value.toUpperCase(),
                        })
                      }
                      placeholder="MX"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Región / estado</Label>
                    <Input
                      value={geo.region ?? ""}
                      onChange={(event) =>
                        updateGeo(index, {
                          region: event.currentTarget.value || null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciudad</Label>
                    <Input
                      value={geo.city ?? ""}
                      onChange={(event) =>
                        updateGeo(index, { city: event.currentTarget.value || null })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Radio en km (opcional)</Label>
                    <Input
                      type="number"
                      value={geo.radiusKm ?? ""}
                      onChange={(event) =>
                        updateGeo(index, {
                          radiusKm: event.currentTarget.value
                            ? Number(event.currentTarget.value)
                            : null,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => moveGeo(index, -1)}
                  >
                    Subir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => moveGeo(index, 1)}
                  >
                    Bajar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={geos.length === 1}
                    onClick={() =>
                      setGeos((current) =>
                        current.filter((_, geoIndex) => geoIndex !== index),
                      )
                    }
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setGeos((current) => [
                  ...current,
                  {
                    label: "",
                    countryCode: "MX",
                    region: null,
                    city: null,
                    radiusKm: null,
                  },
                ])
              }
            >
              Agregar geo
            </Button>
            {actionError?.error && actionError.fieldErrors?.geos ? (
              <p className="text-destructive text-sm">
                {actionError.fieldErrors.geos}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader>
            <CardTitle>Presupuesto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="min_budget">Mínimo</Label>
              <Input
                id="min_budget"
                type="number"
                min="0"
                step="0.01"
                value={minBudget}
                onChange={(event) => setMinBudget(event.currentTarget.value)}
              />
              {actionError?.error && actionError.fieldErrors?.minBudget ? (
                <p className="text-destructive text-sm">
                  {actionError.fieldErrors.minBudget}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_budget">Máximo</Label>
              <Input
                id="max_budget"
                type="number"
                min="0"
                step="0.01"
                value={maxBudget}
                onChange={(event) => setMaxBudget(event.currentTarget.value)}
              />
              {actionError?.error && actionError.fieldErrors?.maxBudget ? (
                <p className="text-destructive text-sm">
                  {actionError.fieldErrors.maxBudget}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 6 ? (
        <Card>
          <CardHeader>
            <CardTitle>Revisión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <p>
                <span className="font-medium">Nombre:</span> {name || "Sin nombre"}
              </p>
              <p>
                <span className="font-medium">Objetivo:</span> {campaignObjective}
              </p>
              <p>
                <span className="font-medium">Assets:</span> {assets.length}
              </p>
              <p>
                <span className="font-medium">Geos:</span> {geos.length}
              </p>
              <p>
                <span className="font-medium">Presupuesto:</span> {minBudget || "0"} -{" "}
                {maxBudget || "0"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template_status">Estado final</Label>
              <select
                id="template_status"
                value={status}
                onChange={(event) =>
                  setStatus(event.currentTarget.value as TemplatePayload["status"])
                }
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              >
                <option value="draft">Guardar como draft</option>
                <option value="active">Publicar como active</option>
              </select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Form method="post" className="space-y-4">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="campaign_objective" value={campaignObjective} />
        <input type="hidden" name="copy_base" value={copyBase} />
        <input type="hidden" name="min_budget" value={minBudget} />
        <input type="hidden" name="max_budget" value={maxBudget} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="assets_json" value={assetsJson} />
        <input type="hidden" name="geos_json" value={geosJson} />

        {actionError?.error && actionError.message ? (
          <p className="text-destructive text-sm">{actionError.message}</p>
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : submitLabel}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to={cancelTo}>Cancelar</Link>
          </Button>
        </div>
      </Form>
    </div>
  );
}
