"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Shared team state stored as a JSONB document in public.app_state, keyed by `key`.
 * Replaces the old artifact `window.storage`. Loads once on mount; writes are
 * debounced upserts.
 */
export function useAppState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          const { error } = await supabase.current
            .from("app_state")
            .upsert({ key, value: resolved as object, updated_at: new Date().toISOString() });
          setStatus(error ? "Could not save — changes may not persist." : "Saved");
          if (!error) setTimeout(() => setStatus((s) => (s === "Saved" ? "" : s)), 1500);
        }, 700);
        return resolved;
      });
    },
    [key]
  );

  return { value, update, loaded, status };
}
