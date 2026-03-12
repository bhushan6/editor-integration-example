# TSL Graph Inspector postMessage Protocol

This document defines the iframe integration contract between a host app (for example the three.js Inspector) and the TSL Graph standalone editor.

## Scope

- Transport: `window.postMessage`
- Direction: Host <-> Editor iframe
- Current command surface:
  - `tsl:command:load`
  - `tsl:command:clear-graph`
  - `tsl:command:set-root-material`
  - `tsl:command:get-graph`
  - `tsl:command:get-code`
  - `tsl:command:get-uniform-schema`
  - `tsl:command:set-uniform-values`
- No built-in persistence bridge. Host decides when/how to persist.

## Envelope

All messages use the same envelope:

```ts
type Envelope<T = unknown> = {
  source: string;
  type: string;
  requestId?: string;
  payload?: T;
  error?: string;
};
```

### Source values

- Host messages: `source: "tsl-graph-host"`
- Editor messages: `source: "tsl-graph-editor"`

## Message catalog

### Editor -> Host

1. `tsl:event:ready`
- Purpose: Editor iframe is mounted and command channel is ready.
- Payload:

```ts
{
  version: 1;
  enabledGraphs: Array<"material" | "postprocessing">;
}
```

2. `tsl:event:graph-changed`
- Purpose: Lightweight invalidation signal for graph edits.
- Payload:

```ts
{
  revision: number; // monotonically increasing within the session
}
```

3. `tsl:event:uniforms-changed`
- Purpose: Notify host that uniform values/schema changed.
- Payload:

```ts
{
  uniforms: Array<{
    scope: "node" | "global";
    id: string;
    name: string;
    uniformType: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
    value: unknown;
  }>;
}
```

### Host -> Editor

1. `tsl:command:load`
- Purpose: Host-driven graph hydration/replacement.
- Payload:

```ts
{
  graphData: unknown;
}
```

2. `tsl:command:clear-graph`
- Purpose: Host-driven graph reset (clears current graph in editor).
- Payload: none.

2. `tsl:command:set-root-material`
- Purpose: Set and lock the root material node type.
- Payload:

```ts
{
  materialType: "material/node" | "material/standard" | "material/basic" | "material/physical" | "material/phong" | "material/sprite";
}
```

3. `tsl:command:get-graph`
- Purpose: Pull full graph JSON on demand.
- Payload: optional/unused.

4. `tsl:command:get-code`
- Purpose: Pull compiled code on demand.
- Payload: optional/unused.
- `material.code` is returned as an applier function: `tslGraph(material)`.
- Material declaration (`const material = new ...`) is omitted.
- `material.code` uses runtime uniform IDs and returns a uniform map.
- Custom helpers from `@/lib/tsl-utils` used by the graph are inlined into `material.code`, so hosts do not need that module import.
- Response includes imports grouped by module for material and postprocessing code.

5. `tsl:command:get-uniform-schema`
- Purpose: Pull current uniform schema/values on demand.
- Payload: optional/unused.

6. `tsl:command:set-uniform-values`
- Purpose: Patch one or more uniforms by id/scope.
- Payload:

```ts
{
  updates: Array<{
    scope: "node" | "global";
    id: string;
    value: unknown;
  }>;
}
```

Note:
- Node uniform updates are applied against the material root graph. If material root is not active, those node updates are rejected with a reason.

### Editor command responses

1. `tsl:response:load`

```ts
{
  ok: true;
}
```

2. `tsl:response:clear-graph`

```ts
{
  ok: true;
}
```

3. `tsl:response:set-root-material`

```ts
{
  ok: true;
  materialType: "material/node" | "material/standard" | "material/basic" | "material/physical" | "material/phong" | "material/sprite";
}
```

4. `tsl:response:get-graph`

```ts
{
  graphData: unknown;
}
```

5. `tsl:response:get-code`

```ts
{
  enabledGraphs: Array<"material" | "postprocessing">;
  material: {
    code: string | null;
    error: string | null;
    imports: Array<{ from: string; imports: string[] }>;
  };
  postprocessing: {
    code: string | null;
    functionName: string | null;
    error: string | null;
    imports: Array<{ from: string; imports: string[] }>;
  };
}
```

Note:
- `material.code` excludes the `const material = new ...` block.
- `material.code` keeps `material.* = ...` assignments inside `tslGraph(material)`.
- `material.code` converts runtime helper calls into direct `uniform(...)` refs.
- `material.imports` excludes material class symbols (e.g. `MeshStandardNodeMaterial`) because the host provides the material instance.
- `tslGraph(material)` returns `{ uniforms }` where:
  - `uniforms` is a map keyed by uniform id
  - each value is the uniform reference
- Post-processing code remains separate in `postprocessing.code`.

6. `tsl:response:get-uniform-schema`

```ts
{
  uniforms: Array<{
    scope: "node" | "global";
    id: string;
    name: string;
    uniformType: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
    value: unknown;
  }>;
}
```

7. `tsl:response:set-uniform-values`

```ts
{
  ok: boolean;
  uniforms: Array<{
    scope: "node" | "global";
    id: string;
    name: string;
    uniformType: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
    value: unknown;
  }>;
  rejected?: Array<{
    scope: "node" | "global";
    id: string;
    reason: string;
  }>;
}
```

If any command fails, editor returns `error` on the envelope with the same `requestId`.

## Lifecycle and timing

Recommended host behavior:

1. Create iframe URL:
- `/editor/standalone?docId=<id>&graphs=material&targetOrigin=<host-origin>`

2. Listen for messages and validate:
- `event.origin`
- `source`
- `requestId` for command/response matching

3. On `tsl:event:ready`:
- Optionally send `tsl:command:set-root-material` with the selected `materialType`.
- Editor can stay blank until host chooses a material/graph and sends `tsl:command:load`.

4. On `tsl:event:graph-changed`:
- Debounce and call:
  - `tsl:command:get-code` for live preview/application
  - `tsl:command:get-graph` when needed for persistence/export

5. On `tsl:event:uniforms-changed`:
- Sync inspector-side uniform UI using the provided uniform list.

6. Persist graph in host app:
- Keep your own debounce policy and persist `graphData` pulled through `tsl:command:get-graph`.

## Security and reliability guidance

1. Always validate message origin in production.
2. Avoid `targetOrigin="*"` outside local development.
3. Use request timeouts for host-issued commands.
4. Match responses by `requestId` only.
5. Treat `graphData` as untrusted input; validate before storing.

## Minimal host command helper

```ts
async function command<T = unknown>(type: string, payload?: unknown): Promise<T> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  iframe.contentWindow?.postMessage(
    { source: "tsl-graph-host", type, requestId, payload },
    editorOrigin
  );
  // resolve from message listener by matching requestId
  // reject on timeout
}
```
