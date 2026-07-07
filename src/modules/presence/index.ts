export * from "./types";
export {
  presenceRef,
  presenceRootRef,
  connectedInfoRef,
  mapPathToActivityTab,
  isOnLearnRoute,
} from "./paths";
export {
  isPresenceOnline,
  STALE_MS,
  ACTIVITY_TIMEOUT,
  WRITE_THROTTLE_MS,
  ACTIVITY_WRITE_THROTTLE_MS,
} from "./isOnline";
export {
  attachGlobalPresence,
  writePresenceOnline,
  writePresenceOffline,
  cancelPresenceOnDisconnect,
  writeCurrentActivity,
} from "./rtdb";
export { learnActivityStore } from "./learnActivityStore";
export {
  GlobalPresenceProvider,
  useGlobalPresenceMap,
  type PresenceMap,
} from "./GlobalPresenceContext";
export { usePresenceEntry, useIsOnline } from "./hooks";
