import { redirect } from "react-router";
import { requireAffiliate } from "~/lib/auth.server";
import type { Route } from "./+types/_affiliate._index";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAffiliate(request);
  throw redirect("/affiliate/dashboard");
}
