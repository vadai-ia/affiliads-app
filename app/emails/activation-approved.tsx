import { Link, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type ActivationApprovedProps = {
  affiliateName: string;
  templateName: string;
  campaignUrl: string;
};

export default function ActivationApprovedEmail({
  affiliateName,
  templateName,
  campaignUrl,
}: ActivationApprovedProps) {
  return (
    <EmailLayout preview={`Tu campaña ${templateName} está activa en Meta`}>
      <Text style={{ fontSize: "16px", margin: "0 0 12px" }}>Hola {affiliateName},</Text>
      <Text style={{ fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" }}>
        Tu campaña <strong>{templateName}</strong> ya está activa en Meta Ads.
      </Text>
      <Text style={{ fontSize: "15px", margin: "0" }}>
        <Link href={campaignUrl}>Ver detalle en AfiliAds</Link>
      </Text>
    </EmailLayout>
  );
}
