import { Badge } from "@/components/ui/badge";
import type { GroupRole } from "@/types/api";

const ROLE_CONFIG: Record<
  GroupRole,
  { label: string; variant: "accent" | "neutral" | "outline" }
> = {
  OWNER: { label: "Owner", variant: "accent" },
  ADMIN: { label: "Admin", variant: "neutral" },
  MEMBER: { label: "Member", variant: "outline" },
};

export function RoleBadge({ role }: { role: GroupRole }) {
  const config = ROLE_CONFIG[role];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

