/**
 * Official Relay Vue bindings: install the `createRelay` plugin once and call
 * `useTaskTracker(taskId)` in any component that shows a delivery. Works in Nuxt too.
 *
 * Built on `@relay-sdk/sdk-browser`. Every framework binding wraps the same `createTaskTracker`
 * store, so Vue, React, Svelte and React Native behave identically.
 *
 * @packageDocumentation
 */

import {
  RelayRealtimeClient,
  createTaskTracker,
  type RelayRealtimeClientOptions,
  type TaskTrackerOptions,
  type TaskTrackerState,
  type TrackedEta,
} from '@relay-sdk/sdk-browser';
import {
  computed,
  inject,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type App,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';

export * from '@relay-sdk/sdk-browser';

export const RelayClientKey: InjectionKey<RelayRealtimeClient> = Symbol('relay-client');

/**
 * A Vue plugin that provides one realtime client to the whole app.
 *
 * @example
 * ```ts
 * app.use(createRelay({ getToken: (taskIds) => fetchTrackingToken(taskIds) }));
 * ```
 */
export function createRelay(clientOrOptions: RelayRealtimeClient | RelayRealtimeClientOptions) {
  // Duck-typed rather than instanceof, so a client from a second copy of sdk-browser still works.
  const client =
    typeof (clientOrOptions as RelayRealtimeClient).listen === 'function'
      ? (clientOrOptions as RelayRealtimeClient)
      : new RelayRealtimeClient(clientOrOptions as RelayRealtimeClientOptions);
  return {
    client,
    install(app: App) {
      app.provide(RelayClientKey, client);
    },
  };
}

/** The realtime client provided by `createRelay`. */
export function useRelayClient(): RelayRealtimeClient {
  const client = inject(RelayClientKey, null);
  if (!client) throw new Error('useRelayClient needs the createRelay plugin: app.use(createRelay({ getToken }))');
  return client;
}

export interface UseTaskTrackerOptions extends TaskTrackerOptions {
  /** Set false to pause tracking (default true). */
  enabled?: MaybeRefOrGetter<boolean>;
  /** Use this client instead of the one from `createRelay`. */
  client?: RelayRealtimeClient;
}

/** State before a task ID is known, or while tracking is disabled. */
export function idleTrackerState(taskId = ''): TaskTrackerState {
  return {
    taskId,
    connection: 'idle',
    status: null,
    currentStageIndex: null,
    rider: null,
    eta: null,
    events: [],
    finished: false,
    error: null,
  };
}

type TrackerRefs = { [K in keyof TaskTrackerState]: ComputedRef<TaskTrackerState[K]> };

/**
 * Live status, rider position and ETA for one task, as refs. Follows `taskId` when it changes and
 * stops listening when the component (or effect scope) goes away.
 *
 * @example
 * ```ts
 * const { status, rider, eta, connection } = useTaskTracker(() => props.taskId);
 * ```
 */
export function useTaskTracker(
  taskId: MaybeRefOrGetter<string | null | undefined>,
  options: UseTaskTrackerOptions = {},
): TrackerRefs & { state: Readonly<Ref<TaskTrackerState>> } {
  const { enabled = true, client: given, ...trackerOptions } = options;
  const client = given ?? useRelayClient();
  const state = shallowRef<TaskTrackerState>(idleTrackerState(toValue(taskId) ?? ''));

  watch(
    () => [toValue(taskId), toValue(enabled)] as const,
    ([id, on], _old, onCleanup) => {
      if (!id || !on) {
        state.value = idleTrackerState(id ?? '');
        return;
      }
      const tracker = createTaskTracker(client, id, trackerOptions);
      state.value = tracker.getState();
      const unsubscribe = tracker.subscribe((next) => {
        state.value = next;
      });
      void tracker.start();
      onCleanup(() => {
        unsubscribe();
        void tracker.stop();
      });
    },
    { immediate: true },
  );

  const refs = Object.fromEntries(
    (Object.keys(idleTrackerState()) as Array<keyof TaskTrackerState>).map((key) => [key, computed(() => state.value[key])]),
  ) as TrackerRefs;
  return { ...refs, state };
}

/**
 * Seconds left until `eta.arrivesAt`, ticking once a second. Null when there's no ETA.
 *
 * @example
 * ```ts
 * const { eta } = useTaskTracker(taskId);
 * const secondsLeft = useEtaCountdown(eta);
 * ```
 */
export function useEtaCountdown(eta: MaybeRefOrGetter<TrackedEta | null>): ComputedRef<number | null> {
  const now = ref(Date.now());
  const timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  onScopeDispose(() => clearInterval(timer));
  return computed(() => {
    const value = toValue(eta);
    return value ? Math.max(0, Math.round((Date.parse(value.arrivesAt) - now.value) / 1000)) : null;
  });
}
