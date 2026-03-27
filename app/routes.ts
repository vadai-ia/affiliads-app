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
    route("templates", "routes/_leader.templates._index.tsx"),
    route("templates/new", "routes/_leader.templates.new.tsx"),
    route("templates/:id/edit", "routes/_leader.templates.$id.edit.tsx"),
    route("settings/bank", "routes/_leader.settings.bank.tsx"),
    route("settings/meta", "routes/_leader.settings.meta.tsx"),
    route("activations", "routes/_leader.activations._index.tsx"),
    route("activations/:id", "routes/_leader.activations.$id.tsx"),
  ]),
  route("affiliate", "routes/_affiliate.tsx", [
    index("routes/_affiliate._index.tsx"),
    route("dashboard", "routes/_affiliate.dashboard.tsx"),
    route("campaigns", "routes/_affiliate.campaigns._index.tsx"),
    route("campaigns/:id", "routes/_affiliate.campaigns.$id.tsx"),
    route("activate/:id", "routes/_affiliate.activate.$id.tsx"),
    route("activations", "routes/_affiliate.activations._index.tsx"),
    route("activations/:id", "routes/_affiliate.activations.$id.tsx"),
  ]),
  route("api/health", "routes/api.health.tsx"),
  route("api/upload", "routes/api.upload.tsx"),
  route("api/inngest", "routes/api.inngest.tsx"),
] satisfies RouteConfig;
