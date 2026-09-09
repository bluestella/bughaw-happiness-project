"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useAppState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();
  const supabase = useRef(createClient());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.current
        .from("app_state")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.value && typeof data.value === "object") {
        setValue((prev) => ({ ...prev, ...(data.value as T) }));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          const { error } = await supabase.current
            .from("app_state")
            .upsert({ key, value: resolved as object, updated_at: new Date().toISOString() });
          if (statusTimer.current) clearTimeout(statusTimer.current);
          if (error) {
            setStatus("Could not save — changes may not persist.");
          } else {
            setStatus("Saved");
            statusTimer.current = setTimeout(() => {
              setStatus((s) => (s === "Saved" ? "" : s));
            }, 1500);
          }
        }, 700);
        return resolved;
      });
    },
    [key]
  );

  return { value, update, loaded, status };
}
