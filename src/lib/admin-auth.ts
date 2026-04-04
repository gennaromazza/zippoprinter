import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import type { Photographer } from "@/lib/types";

export async function getAuthenticatedPhotographerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, photographer: null as Photographer | null };
  }

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  return { user, photographer };
}
