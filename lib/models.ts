import type { Api, Model } from "@earendil-works/pi-ai";

export const SIDE_CALL_PROVIDER = "anthropic";
export const SIDE_CALL_MODEL = "claude-haiku-4-5";

interface Registry {
  getAvailable(): Model<Api>[];
  isUsingOAuth(model: Model<Api>): boolean;
  getProvider(provider: string): { auth?: { oauth?: { isSubscription?: boolean } } } | undefined;
}

export function sideCallModel(registry: Pick<Registry, "getAvailable">): Model<Api> | undefined {
  const candidates = registry.getAvailable().filter((model) => model.provider === SIDE_CALL_PROVIDER);
  return candidates.find((model) => model.id === SIDE_CALL_MODEL) ?? candidates.sort((a, b) => a.cost.input - b.cost.input)[0];
}

export function usingSubscription(registry: Pick<Registry, "isUsingOAuth" | "getProvider">, model: Model<Api> | undefined): boolean {
  if (!model) return false;
  return registry.isUsingOAuth(model) && registry.getProvider(model.provider)?.auth?.oauth?.isSubscription === true;
}
