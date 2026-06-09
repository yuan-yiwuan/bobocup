import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * 客户端挂载标志（hydration 安全）。服务端快照返回 false、客户端返回 true，
 * 用于依赖用户时区/本地化的渲染，避免 server/client 不一致。
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
