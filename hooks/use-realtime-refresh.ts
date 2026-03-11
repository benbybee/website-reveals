"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribes to Supabase Realtime changes on the given tables
 * and calls the corresponding callback when a change is detected.
 */
export function useRealtimeRefresh(
  subscriptions: { table: string; onChange: () => void }[]
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    let channel = supabase.channel("admin-realtime");

    for (const sub of subscriptions) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: sub.table },
        () => {
          sub.onChange();
        }
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
