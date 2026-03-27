import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { ActionResult } from "~/lib/errors";
import type { UploadedProof } from "~/lib/activations";

type UploadProofResponse = ActionResult<UploadedProof>;

type GeoRow = {
  id: string;
  label: string;
  country_code: string;
};

type TemplateForActivation = {
  id: string;
  name: string;
  copy_base: string;
  campaign_objective: string;
  min_budget: string;
  max_budget: string;
  assets: { file_url: string; file_type: "image" | "video" }[];
};

type BankRow = {
  bank_name: string;
  account_holder: string;
  account_number: string;
  clabe: string | null;
  instructions: string | null;
};

type ActivationWizardProps = {
  template: TemplateForActivation;
  geos: GeoRow[];
  bank: BankRow | null;
  landingUrl: string;
  actionError?: ActionResult | null;
};

export function ActivationWizard({
  template,
  geos,
  bank,
  landingUrl,
  actionError,
}: ActivationWizardProps) {
  const minB = Number(template.min_budget);
  const maxB = Number(template.max_budget);

  const [step, setStep] = useState(1);
  const [selectedGeoId, setSelectedGeoId] = useState(geos[0]?.id ?? "");
  const [budget, setBudget] = useState(
    () =>
      String(
        Number.isFinite(minB) && Number.isFinite(maxB)
          ? Math.min(maxB, Math.max(minB, minB))
          : "",
      ),
  );

  const [proof, setProof] = useState<UploadedProof | null>(null);
  const uploadFetcher = useFetcher<UploadProofResponse>();
  const navigation = useNavigation();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const processedUploadRef = useRef<string | null>(null);

  useEffect(() => {
    const payload = uploadFetcher.data;
    if (!payload || payload.error || !payload.data) return;
    if (processedUploadRef.current === payload.data.storagePath) return;
    processedUploadRef.current = payload.data.storagePath;
    queueMicrotask(() => {
      setProof(payload.data!);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    });
  }, [uploadFetcher.data]);

  const proofJson = useMemo(
    () => (proof ? JSON.stringify(proof) : ""),
    [proof],
  );
  const submitting = navigation.state === "submitting";

  const previewAsset = template.assets[0];

  function copyLanding() {
    void navigator.clipboard.writeText(landingUrl);
  }

  function copyBank(field: string) {
    void navigator.clipboard.writeText(field);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-xs">
        {[1, 2, 3, 4, 5].map((n) => (
          <Badge key={n} variant={step === n ? "default" : "outline"}>
            {n}
          </Badge>
        ))}
      </div>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ubicación</CardTitle>
            <CardDescription>
              Elige una de las zonas permitidas para esta campaña.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {geos.length === 0 ? (
              <p className="text-destructive text-sm">
                Este template no tiene geos configuradas. Contacta a tu líder.
              </p>
            ) : (
              <div className="space-y-2">
                {geos.map((geo) => (
                  <label
                    key={geo.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
                  >
                    <input
                      type="radio"
                      name="geo_pick"
                      value={geo.id}
                      checked={selectedGeoId === geo.id}
                      onChange={() => setSelectedGeoId(geo.id)}
                    />
                    <div>
                      <p className="font-medium">{geo.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {geo.country_code}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <Button
              type="button"
              disabled={!selectedGeoId}
              onClick={() => setStep(2)}
            >
              Siguiente
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Presupuesto</CardTitle>
            <CardDescription>
              Indica el monto a invertir (entre {minB} y {maxB}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget_input">Monto</Label>
              <Input
                id="budget_input"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={minB}
                max={maxB}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <input
              type="range"
              min={minB}
              max={maxB}
              step="1"
              value={Number(budget) || minB}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirmación</CardTitle>
            <CardDescription>
              Revisa el resumen antes de ver los datos de pago.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">{template.name}</p>
              <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                {template.copy_base}
              </p>
            </div>
            {previewAsset ? (
              <div className="overflow-hidden rounded-md border">
                {previewAsset.file_type === "image" ? (
                  <img
                    src={previewAsset.file_url}
                    alt=""
                    className="max-h-48 w-full object-cover"
                  />
                ) : (
                  <video
                    src={previewAsset.file_url}
                    className="max-h-48 w-full object-cover"
                    controls
                    muted
                  />
                )}
              </div>
            ) : null}
            <div className="text-sm">
              <p>
                <span className="text-muted-foreground">Geo: </span>
                {geos.find((g) => g.id === selectedGeoId)?.label ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Presupuesto: </span>
                {budget}
              </p>
              <p>
                <span className="text-muted-foreground">Landing: </span>
                <span className="break-all">{landingUrl}</span>
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={copyLanding}
              >
                Copiar landing
              </Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Atrás
              </Button>
              <Button type="button" onClick={() => setStep(4)}>
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pago por transferencia</CardTitle>
            <CardDescription>
              Transfiere el monto exacto indicado y conserva tu comprobante.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold">Monto a pagar: {budget}</p>
            {!bank ? (
              <p className="text-destructive text-sm">
                Tu organización aún no configuró datos bancarios. Avísale a tu
                líder.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Banco: </span>
                  {bank.bank_name}
                </p>
                <p>
                  <span className="text-muted-foreground">Titular: </span>
                  {bank.account_holder}{" "}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyBank(bank.account_holder)}
                  >
                    Copiar
                  </Button>
                </p>
                <p>
                  <span className="text-muted-foreground">Cuenta: </span>
                  {bank.account_number}{" "}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyBank(bank.account_number)}
                  >
                    Copiar
                  </Button>
                </p>
                {bank.clabe ? (
                  <p>
                    <span className="text-muted-foreground">CLABE: </span>
                    {bank.clabe}{" "}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyBank(bank.clabe!)}
                    >
                      Copiar
                    </Button>
                  </p>
                ) : null}
                {bank.instructions ? (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {bank.instructions}
                  </p>
                ) : null}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                Atrás
              </Button>
              <Button
                type="button"
                disabled={!bank}
                onClick={() => setStep(5)}
              >
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader>
            <CardTitle>Comprobante</CardTitle>
            <CardDescription>
              Sube una imagen (JPG/PNG) o PDF del comprobante de transferencia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <uploadFetcher.Form
              method="post"
              action="/api/upload"
              encType="multipart/form-data"
              className="space-y-3"
            >
              <input type="hidden" name="purpose" value="payment_proof" />
              <Input
                ref={uploadInputRef}
                type="file"
                name="file"
                accept="image/png,image/jpeg,application/pdf"
                required
              />
              {uploadFetcher.data?.error ? (
                <p className="text-destructive text-sm">
                  {uploadFetcher.data.message}
                </p>
              ) : null}
              <Button type="submit" disabled={uploadFetcher.state !== "idle"}>
                {uploadFetcher.state !== "idle" ? "Subiendo…" : "Subir comprobante"}
              </Button>
            </uploadFetcher.Form>

            {proof ? (
              <p className="text-sm text-green-600">
                Comprobante listo ({proof.fileType}).
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Debes subir el comprobante antes de enviar la solicitud.
              </p>
            )}

            <Form method="post" className="space-y-4">
              <input type="hidden" name="template_id" value={template.id} />
              <input type="hidden" name="selected_geo_id" value={selectedGeoId} />
              <input type="hidden" name="budget" value={budget} />
              <input type="hidden" name="proof_json" value={proofJson} />

              {actionError?.error && actionError.message ? (
                <p className="text-destructive text-sm">{actionError.message}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(4)}>
                  Atrás
                </Button>
                <Button type="submit" disabled={submitting || !proof}>
                  {submitting ? "Enviando…" : "Enviar solicitud"}
                </Button>
                <Button asChild type="button" variant="ghost">
                  <Link to={`/affiliate/campaigns/${template.id}`}>Cancelar</Link>
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
