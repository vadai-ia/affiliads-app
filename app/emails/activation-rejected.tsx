import { Link, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type ActivationRejectedProps = {
  affiliateName: string;
  templateName: string;
  reason: string;
  campaignUrl: string;
};

export default function ActivationRejectedEmail({
  affiliateName,
  templateName,
  reason,
  campaignUrl,
}: ActivationRejectedProps) {
  return (
    <EmailLayout preview={`Actualización sobre ${templateName}`}>
      <Text style={{ fontSize: "16px", margin: "0 0 12px" }}>Hola {affiliateName},</Text>
      <Text style={{ fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" }}>
        Tu solicitud para <strong>{templateName}</strong> no fue aprobada.
      </Text>
      <Text
        style={{
          fontSize: "14px",
          lineHeight: "20px",
          margin: "0 0 12px",
          padding: "12px",
          backgroundColor: "#f4f4f5",
          borderRadius: "6px",
        }}
      >
        Motivo: {reason}
      </Text>
      <Text style={{ fontSize: "15px", margin: "0" }}>
        <Link href={campaignUrl}>Ver solicitud en AfiliAds</Link>
      </Text>
    </EmailLayout>
  );
}
