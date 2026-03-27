import { Link, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type NewActivationRequestProps = {
  leaderName: string;
  templateName: string;
  affiliateName: string;
  activationUrl: string;
};

export default function NewActivationRequestEmail({
  leaderName,
  templateName,
  affiliateName,
  activationUrl,
}: NewActivationRequestProps) {
  return (
    <EmailLayout preview={`${affiliateName} envió una solicitud para ${templateName}`}>
      <Text style={{ fontSize: "16px", margin: "0 0 12px" }}>Hola {leaderName},</Text>
      <Text style={{ fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" }}>
        <strong>{affiliateName}</strong> envió una solicitud de activación para la campaña{" "}
        <strong>{templateName}</strong> con comprobante de pago pendiente de revisión.
      </Text>
      <Text style={{ fontSize: "15px", margin: "0" }}>
        <Link href={activationUrl}>Revisar solicitud en AfiliAds</Link>
      </Text>
    </EmailLayout>
  );
}
