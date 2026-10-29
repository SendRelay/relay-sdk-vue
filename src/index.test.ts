import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick, ref } from 'vue';
import { createRelay, useEtaCountdown, useTaskTracker } from './index';

function fakeClient() {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  return {
    on: vi.fn((event: string, handler: (payload: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)!.delete(handler);
    }),
    emit(event: string, payload: any) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
    listen: vi.fn(async () => {}),
    stopListening: vi.fn(async () => {}),
    listeners: () => [...handlers.values()].reduce((n, set) => n + set.size, 0),
  };
}

const flush = async () => {
  await Promise.resolve();
  await nextTick();
};

afterEach(() => vi.useRealTimers());

describe('useTaskTracker', () => {
  it('renders live status and ETA, and stops on unmount', async () => {
    const client = fakeClient();
    const Order = defineComponent({
      setup() {
        const { status, eta, connection } = useTaskTracker('t1');
        return () => h('p', `${connection.value} ${status.value ?? 'waiting'} ${eta.value ? `${eta.value.meters}m` : 'no-eta'}`);
      },
    });
    const wrapper = mount(Order, { global: { plugins: [createRelay(client as any)] } });
    await flush();
    expect(client.listen).toHaveBeenCalledWith('t1');

    client.emit('TASK_IN_PROGRESS', { taskId: 't1', status: 'IN_PROGRESS', currentStageIndex: 1 });
    client.emit('RIDER_LOCATION_UPDATE', {
      taskId: 't1',
      location: { latitude: 6.45, longitude: 3.39 },
      eta: { stageIndex: 1, seconds: 300, meters: 1800 },
      timestamp: new Date().toISOString(),
    });
    await nextTick();
    expect(wrapper.text()).toBe('live IN_PROGRESS 1800m');

    wrapper.unmount();
    await flush();
    expect(client.stopListening).toHaveBeenCalledWith('t1');
    expect(client.listeners()).toBe(0);
  });

  it('follows the task ID ref and pauses when disabled', async () => {
    const client = fakeClient();
    const id = ref<string | null>(null);
    const enabled = ref(true);
    const scope = effectScope();
    const tracked = scope.run(() => useTaskTracker(id, { client: client as any, enabled }))!;
    expect(tracked.connection.value).toBe('idle');

    id.value = 'a';
    await flush();
    expect(client.listen).toHaveBeenLastCalledWith('a');
    id.value = 'b';
    await flush();
    expect(client.stopListening).toHaveBeenCalledWith('a');
    expect(client.listen).toHaveBeenLastCalledWith('b');

    enabled.value = false;
    await flush();
    expect(client.stopListening).toHaveBeenLastCalledWith('b');
    expect(tracked.connection.value).toBe('idle');
    scope.stop();
  });

  it('explains how to fix a missing plugin', () => {
    const scope = effectScope();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => scope.run(() => useTaskTracker('t1'))).toThrow('createRelay plugin');
    spy.mockRestore();
    scope.stop();
  });
});

describe('useEtaCountdown', () => {
  it('counts down to arrivesAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    const scope = effectScope();
    const eta = ref({ stageIndex: 0, seconds: 90, meters: 500, arrivesAt: '2026-10-28T10:01:30.000Z', updatedAt: '2026-10-28T10:00:00.000Z' });
    const left = scope.run(() => useEtaCountdown(eta))!;
    expect(left.value).toBe(90);
    vi.advanceTimersByTime(30_000);
    expect(left.value).toBe(60);
    (eta as any).value = null;
    expect(left.value).toBeNull();
    scope.stop();
  });
});
