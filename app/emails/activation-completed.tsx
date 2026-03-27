import { Link, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type ActivationCompletedProps = {
  affiliateName: string;
  templateName: string;
  budgetLabel: string;
  spendLabel: string;
  campaignUrl: string;
};

export default function ActivationCompletedEmail({
  affiliateName,
  templateName,
  budgetLabel,
  spendLabel,
  campaignUrl,
}: ActivationCompletedProps) {
  return (
    <EmailLayout preview={`Campaña ${templateName} completada por presupuesto`}>
      <Text style={{ fontSize: "16px", margin: "0 0 12px" }}>Hola {affiliateName},</Text>
      <Text style={{ fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" }}>
        La campaña <strong>{templateName}</strong> alcanzó el umbral de presupuesto acordado y fue
        marcada como completada en AfiliAds (gasto acumulado hoy: {spendLabel}, presupuesto:{" "}
        {budgetLabel}).
      </Text>
      <Text style={{ fontSize: "15px", margin: "0" }}>
        <Link href={campaignUrl}>Ver resumen en AfiliAds</Link>
      </Text>
    </EmailLayout>
  );
}
