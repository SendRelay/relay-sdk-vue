# @relay-sdk/vue

Official [Relay](https://sendrelay.com.ng) Vue bindings: show a delivery's status, the rider on a map and a live arrival time with one composable. Works in Nuxt.

```bash
npm install @relay-sdk/vue
```

```ts
// main.ts: your server mints the token with its API key (relay.auth.createWebSocketToken).
app.use(createRelay({ getToken: (taskIds) => fetchTrackingToken(taskIds) }));
```

```vue
<script setup lang="ts">
import { useEtaCountdown, useTaskTracker } from '@relay-sdk/vue';

const props = defineProps<{ taskId: string }>();
const { status, rider, eta, connection } = useTaskTracker(() => props.taskId);
const secondsLeft = useEtaCountdown(eta);
</script>

<template>
  <p>
    {{ status ?? 'Finding a rider' }}
    <span v-if="secondsLeft !== null"> · arriving in {{ Math.ceil(secondsLeft / 60) }} min</span>
  </p>
</template>
```

`useTaskTracker` returns refs for `status`, `rider`, `eta`, `events`, `connection`, `finished` and `error`. It follows the task ID when it changes and stops listening when the component unmounts. In Nuxt, install the plugin in a `.client.ts` plugin.

Everything from `@relay-sdk/sdk-browser` is re-exported. [Full documentation](https://docs.sendrelay.com.ng/sdks/vue-sdk)
