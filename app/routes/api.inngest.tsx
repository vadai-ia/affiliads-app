import { serve } from "inngest/remix";
import { inngest } from "~/lib/inngest/client";
import { inngestFunctions } from "~/lib/inngest/functions";
import type { Route } from "./+types/api.inngest";

const handler = serve({
  client: inngest,
  functions: [...inngestFunctions],
});

export async function loader({ request }: Route.LoaderArgs) {
  return handler({ request });
}

export async function action({ request }: Route.ActionArgs) {
  return handler({ request });
}
