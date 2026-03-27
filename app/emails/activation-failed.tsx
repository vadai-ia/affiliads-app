import { Link, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type ActivationFailedProps = {
  leaderName: string;
  templateName: string;
  errorSummary: string;
  activationUrl: string;
};

export default function ActivationFailedEmail({
  leaderName,
  templateName,
  errorSummary,
  activationUrl,
}: ActivationFailedProps) {
  return (
    <EmailLayout preview={`Error al crear ${templateName} en Meta`}>
      <Text style={{ fontSize: "16px", margin: "0 0 12px" }}>Hola {leaderName},</Text>
      <Text style={{ fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" }}>
        La activación de <strong>{templateName}</strong> falló al crear o publicar en Meta Ads.
      </Text>
      <Text
        style={{
          fontSize: "13px",
          lineHeight: "18px",
          margin: "0 0 12px",
          padding: "12px",
          backgroundColor: "#fef2f2",
          borderRadius: "6px",
          color: "#991b1b",
        }}
      >
        {errorSummary}
      </Text>
      <Text style={{ fontSize: "15px", margin: "0" }}>
        <Link href={activationUrl}>Abrir solicitud en AfiliAds</Link>
      </Text>
    </EmailLayout>
  );
}
