import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import { useFetcher, useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { UserRole } from "~/types/database";

export type NotificationListItem = {
  id: string;
  title: string;
  body: string | null;
  read: boolean | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

function hrefForNotification(
  role: UserRole,
  n: NotificationListItem,
): string | null {
  if (n.entity_type === "campaign_activation" && n.entity_id) {
    return role === "leader"
      ? `/leader/activations/${n.entity_id}`
      : `/affiliate/activations/${n.entity_id}`;
  }
  return null;
}

export function NotificationsBell({
  role,
  unreadCount,
  notifications,
}: {
  role: UserRole;
  unreadCount: number;
  notifications: NotificationListItem[];
}) {
  const fetcher = useFetcher();
  const navigate = useNavigate();

  function onItemClick(notificationId: string, targetHref: string | null) {
    fetcher.submit(
      { intent: "mark-read", notificationId },
      { method: "post", action: "/api/notifications" },
    );
    if (targetHref) navigate(targetHref);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Notificaciones"
          className="relative shrink-0"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-popover text-popover-foreground z-50 max-h-[min(420px,70vh)] w-[min(100vw-2rem,360px)] overflow-y-auto rounded-md border p-1 shadow-md"
          align="end"
          sideOffset={6}
        >
          {notifications.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              Sin notificaciones
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {notifications.map((n) => {
                const href = hrefForNotification(role, n);
                const isUnread = n.read === false || n.read === null;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={cn(
                      "hover:bg-muted flex w-full flex-col gap-0.5 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                      isUnread && "bg-muted/60",
                    )}
                    onClick={() => onItemClick(n.id, href)}
                  >
                    <span className="font-medium leading-snug">{n.title}</span>
                    {n.body ? (
                      <span className="text-muted-foreground line-clamp-3 text-xs">
                        {n.body}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(n.created_at).toLocaleString("es-MX")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
