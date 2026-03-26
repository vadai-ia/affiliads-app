import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  layout("routes/_auth.tsx", [
    route("login", "routes/_auth.login.tsx"),
    route("register", "routes/_auth.register.tsx"),
    route("auth/callback", "routes/_auth.callback.tsx"),
    route("invite/:token", "routes/_auth.invite.$token.tsx"),
  ]),
  route("leader", "routes/_leader.tsx", [
    index("routes/_leader._index.tsx"),
    route("affiliates", "routes/_leader.affiliates.tsx"),
  ]),
  route("affiliate", "routes/_affiliate.tsx", [
    index("routes/_affiliate._index.tsx"),
  ]),
  route("api/health", "routes/api.health.tsx"),
] satisfies RouteConfig;
