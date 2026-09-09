"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type TeamDirectoryEntry = { email: string; note: string };

export function useTeamDirectory() {
  const supabase = useMemo(() => createClient(), []);
  const [directory, setDirectory] = useState<TeamDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("list_team_directory");
      setDirectory((data ?? []) as TeamDirectoryEntry[]);
      setLoading(false);
    })();
  }, [supabase]);

  return { directory, loading };
}
