import {
  clamp,
  type RangeControls,
  type RangeStatus,
  type ShotSettings,
} from './types';
type Registry = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerRangeTools(
  api: RangeControls,
  getStatus: () => RangeStatus,
  setShot: (s: ShotSettings) => void,
) {
  const registry = (document as Document & { modelContext?: Registry })
    .modelContext;
  if (!registry?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools = [
    {
      name: 'read_throwabone_range',
      description:
        'Read the current practice range, readiness, and recent throw results.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const s = getStatus();
        return {
          ready: s.ready,
          phase: s.phase,
          down: s.down,
          guards: s.guards,
          throws: s.throws,
          recent: s.history.slice(-5).map(({ path, ...r }) => r),
        };
      },
    },
    {
      name: 'throw_bone',
      description:
        'Configure and release one bone on the visible practice range. Fails if a throw is still moving.',
      inputSchema: {
        type: 'object',
        properties: {
          aim: { type: 'number', minimum: -1.65, maximum: 1.65 },
          power: { type: 'number', minimum: 0.15, maximum: 1 },
          loft: { type: 'number', minimum: 8, maximum: 45 },
          spin: { type: 'number', minimum: 0, maximum: 5 },
        },
        required: ['aim', 'power', 'loft', 'spin'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        if (!input || typeof input !== 'object')
          throw new Error('A complete throw configuration is required.');
        const s = input as ShotSettings;
        const limits = {
          aim: [-1.65, 1.65],
          power: [0.15, 1],
          loft: [8, 45],
          spin: [0, 5],
        };
        if (Object.keys(s).some((k) => !Object.hasOwn(limits, k)))
          throw new Error('Unknown throw parameter.');
        for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
          const [min, max] = limits[key];
          if (!Number.isFinite(s[key]) || clamp(s[key], min, max) !== s[key])
            throw new Error(`Invalid ${key}.`);
        }
        if (!getStatus().ready)
          throw new Error('The range is not ready for another throw.');
        setShot({ ...s });
        api.setShot(s);
        api.throwBone();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const state = getStatus();
        return {
          released: true,
          throwNumber: state.throws,
          phase: state.phase,
        };
      },
    },
  ];
  for (const tool of tools)
    try {
      void Promise.resolve(
        registry.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  return () => lifecycle.abort();
}
