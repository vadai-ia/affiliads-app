import { Inngest } from "inngest";

function inferInngestEnv() {
  const explicitEnv = process.env.INNGEST_ENV?.trim();
  if (explicitEnv) {
    return explicitEnv;
  }

  const signingKey = process.env.INNGEST_SIGNING_KEY?.trim();
  if (!signingKey || signingKey.startsWith("signkey-branch-")) {
    return undefined;
  }

  const match = signingKey.match(/^signkey-([\w]+)-/);
  return match?.[1];
}

/** Cliente único de Inngest para eventos y registro de funciones. */
export const inngest = new Inngest({
  id: "afiliads",
  name: "AfiliAds",
  env: inferInngestEnv(),
});
