import { redirect } from "next/navigation";
import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminsManager } from "@/app/platform/admins/admins-manager";

export default async function PlatformAdminsPage() {
  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    redirect("/platform");
  }

  if (!hasPlatformRole(auth.context.admin.role, "owner_admin")) {
    redirect("/platform");
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_admins")
    .select("id, auth_user_id, email, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Gestione accessi piattaforma</CardDescription>
        <CardTitle>Amministratori</CardTitle>
        <p className="text-sm text-muted-foreground">
          Aggiungi, modifica ruoli o disattiva amministratori della piattaforma. Solo owner_admin puo gestire questa sezione.
        </p>
      </CardHeader>
      <CardContent>
        <AdminsManager
          admins={data || []}
          currentUserId={auth.context.userId}
        />
      </CardContent>
    </Card>
  );
}
