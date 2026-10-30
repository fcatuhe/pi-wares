import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listUsage } from "../shared/usage";

const FIVE_MINUTES = 5 * 60_000;

function usageKey(hostId: string) {
  return ["usage-pace", hostId] as const;
}

export function useUsage(hostId: string) {
  const list = useRpc(listUsage);
  return useQuery({
    queryKey: usageKey(hostId),
    queryFn: () => list({ refresh: false }),
    staleTime: 60_000,
    refetchInterval: FIVE_MINUTES,
  });
}

export function useRefreshUsage(hostId: string) {
  const list = useRpc(listUsage);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => list({ refresh: true }),
    onSuccess: (data) => queryClient.setQueryData(usageKey(hostId), data),
  });
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
