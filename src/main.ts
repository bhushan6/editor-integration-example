import './index.css';

type Envelope<T = unknown> = {
  source: string;
  type: string;
  requestId?: string;
  payload?: T;
  error?: string;
};

const HOST_SOURCE = 'tsl-graph-host' as const;
const EDITOR_SOURCE = 'tsl-graph-editor' as const;

type GraphKind = 'material' | 'postprocessing';

type MaterialType =
  | 'material/node'
  | 'material/standard'
  | 'material/basic'
  | 'material/physical'
  | 'material/phong'
  | 'material/sprite';

type MaterialClass =
  | 'NodeMaterial'
  | 'MeshStandardNodeMaterial'
  | 'MeshBasicNodeMaterial'
  | 'MeshPhysicalNodeMaterial'
  | 'MeshPhongNodeMaterial'
  | 'SpriteNodeMaterial';

type UniformType = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'color';
type UniformValue =
  | number
  | boolean
  | string
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];

type UniformSchemaEntry = {
  scope: 'node' | 'global';
  id: string;
  name: string;
  uniformType: UniformType;
  value: UniformValue;
};

type LoadCommandPayload = { graphData: unknown };
type LoadResponsePayload = { ok: true };
type ClearGraphResponsePayload = { ok: true };

type SetRootMaterialPayload = { materialType: MaterialType };
type SetRootMaterialResponsePayload = { ok: true; materialType: MaterialType };

type GetGraphResponsePayload = { graphData: unknown };

type GetCodeResponsePayload = {
  enabledGraphs: GraphKind[];
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
};

type GetUniformSchemaResponsePayload = { uniforms: UniformSchemaEntry[] };

type SetUniformValuesPayload = {
  updates: Array<{ scope: 'node' | 'global'; id: string; value: UniformValue }>;
};
type SetUniformValuesResponsePayload = {
  ok: boolean;
  uniforms: UniformSchemaEntry[];
  rejected?: Array<{ scope: 'node' | 'global'; id: string; reason: string }>;
};

type EditorReadyPayload = { version: 1; enabledGraphs: GraphKind[] };
type EditorGraphChangedPayload = { revision: number };
type UniformsChangedPayload = { uniforms: UniformSchemaEntry[] };

type EditorMessage =
  | (Envelope<EditorReadyPayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:event:ready' })
  | (Envelope<EditorGraphChangedPayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:event:graph-changed' })
  | (Envelope<UniformsChangedPayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:event:uniforms-changed' })
  | (Envelope<LoadResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:load' })
  | (Envelope<ClearGraphResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:clear-graph' })
  | (Envelope<GetGraphResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:get-graph' })
  | (Envelope<GetCodeResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:get-code' })
  | (Envelope<SetRootMaterialResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:set-root-material' })
  | (Envelope<GetUniformSchemaResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:get-uniform-schema' })
  | (Envelope<SetUniformValuesResponsePayload> & { source: typeof EDITOR_SOURCE; type: 'tsl:response:set-uniform-values' });

type HostMessage =
  | (Envelope<LoadCommandPayload> & { source: typeof HOST_SOURCE; type: 'tsl:command:load'; requestId: string })
  | (Envelope<undefined> & { source: typeof HOST_SOURCE; type: 'tsl:command:clear-graph'; requestId: string })
  | (Envelope<undefined> & { source: typeof HOST_SOURCE; type: 'tsl:command:get-graph'; requestId: string })
  | (Envelope<undefined> & { source: typeof HOST_SOURCE; type: 'tsl:command:get-code'; requestId: string })
  | (Envelope<undefined> & { source: typeof HOST_SOURCE; type: 'tsl:command:get-uniform-schema'; requestId: string })
  | (Envelope<SetRootMaterialPayload> & {
    source: typeof HOST_SOURCE;
    type: 'tsl:command:set-root-material';
    requestId: string;
  })
  | (Envelope<SetUniformValuesPayload> & {
    source: typeof HOST_SOURCE;
    type: 'tsl:command:set-uniform-values';
    requestId: string;
  });

type HostCommandType =
  | 'tsl:command:load'
  | 'tsl:command:clear-graph'
  | 'tsl:command:get-graph'
  | 'tsl:command:get-code'
  | 'tsl:command:set-root-material'
  | 'tsl:command:get-uniform-schema'
  | 'tsl:command:set-uniform-values';

type EditorResponseType =
  | 'tsl:response:load'
  | 'tsl:response:clear-graph'
  | 'tsl:response:get-graph'
  | 'tsl:response:get-code'
  | 'tsl:response:set-root-material'
  | 'tsl:response:get-uniform-schema'
  | 'tsl:response:set-uniform-values';

const RESPONSE_BY_COMMAND: Record<HostCommandType, EditorResponseType> = {
  'tsl:command:load': 'tsl:response:load',
  'tsl:command:clear-graph': 'tsl:response:clear-graph',
  'tsl:command:get-graph': 'tsl:response:get-graph',
  'tsl:command:get-code': 'tsl:response:get-code',
  'tsl:command:set-root-material': 'tsl:response:set-root-material',
  'tsl:command:get-uniform-schema': 'tsl:response:get-uniform-schema',
  'tsl:command:set-uniform-values': 'tsl:response:set-uniform-values',
};

type PendingRequest = {
  expectedType: EditorResponseType;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: number;
};

const selectedMaterialId = 'mat-123';
const selectedMaterialClass: MaterialClass = 'MeshStandardNodeMaterial';

const frameEl = document.getElementById('tsl-graph-frame');
if (!(frameEl instanceof HTMLIFrameElement)) {
  throw new Error('Missing #tsl-graph-frame iframe');
}
const iframe = frameEl;

const editorUrl = new URL('https://www.tsl-graph.xyz/editor/standalone');
editorUrl.searchParams.set('docId', selectedMaterialId);
editorUrl.searchParams.set('graphs', 'material');
editorUrl.searchParams.set('targetOrigin', '*'); // dev only
iframe.src = editorUrl.toString();

const editorOrigin = new URL(iframe.src).origin;

let isReady = false;
let resolveReady!: () => void;
const editorReady = new Promise<void>((r) => (resolveReady = r));

const pending = new Map<string, PendingRequest>();

const STORAGE_PREFIX = 'tsl-editor:host-demo';

function storageKeyForDoc(docId: string): string {
  return `${STORAGE_PREFIX}:${docId}`;
}

function loadGraphFromStorage(docId: string): unknown | null {
  const raw = window.localStorage.getItem(storageKeyForDoc(docId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn('Invalid graph JSON in localStorage, ignoring.', error);
    return null;
  }
}

function saveGraphToStorage(docId: string, graphData: unknown): void {
  window.localStorage.setItem(storageKeyForDoc(docId), JSON.stringify(graphData));
}

function clearGraphInStorage(docId: string): void {
  window.localStorage.removeItem(storageKeyForDoc(docId));
}

function makeRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function postToEditor(message: HostMessage) {
  console.log('[TSL_MESSAGE] OUT:', message.type, message);
  iframe.contentWindow?.postMessage(message, editorOrigin);
}

function isEditorMessage(value: unknown): value is EditorMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as { source?: unknown; type?: unknown };
  return msg.source === EDITOR_SOURCE && typeof msg.type === 'string';
}

function materialClassToType(materialClass: MaterialClass): MaterialType {
  switch (materialClass) {
    case 'MeshStandardNodeMaterial':
      return 'material/standard';
    case 'MeshPhysicalNodeMaterial':
      return 'material/physical';
    case 'MeshPhongNodeMaterial':
      return 'material/phong';
    case 'MeshBasicNodeMaterial':
      return 'material/basic';
    case 'SpriteNodeMaterial':
      return 'material/sprite';
    case 'NodeMaterial':
      return 'material/node';
  }
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toColor(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#ffffff';
}

function toVector(v: unknown, len: 2 | 3 | 4): number[] {
  const src = Array.isArray(v) ? v : [v];
  const defaults = len === 4 ? [0, 0, 0, 1] : [0, 0, 0];
  return Array.from({ length: len }, (_, i) => toNumber(src[i], defaults[i] ?? 0));
}

function makeVectorValue(values: number[], len: 2 | 3 | 4): UniformValue {
  if (len === 2) return [values[0] ?? 0, values[1] ?? 0];
  if (len === 3) return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}

function normalizeUniformValue(entry: UniformSchemaEntry, raw: unknown): UniformValue {
  switch (entry.uniformType) {
    case 'float':
      return toNumber(raw, 0);
    case 'int':
      return Math.round(toNumber(raw, 0));
    case 'bool':
      return Boolean(raw);
    case 'color':
      return toColor(raw);
    case 'vec2':
      return makeVectorValue(toVector(raw, 2), 2);
    case 'vec3':
      return makeVectorValue(toVector(raw, 3), 3);
    case 'vec4':
      return makeVectorValue(toVector(raw, 4), 4);
  }
}

function uniformKey(u: Pick<UniformSchemaEntry, 'scope' | 'id'>): string {
  return `${u.scope}:${u.id}`;
}

let uniformsCache = new Map<string, UniformSchemaEntry>();

async function command(type: 'tsl:command:load', payload: LoadCommandPayload): Promise<LoadResponsePayload>;
async function command(type: 'tsl:command:clear-graph'): Promise<ClearGraphResponsePayload>;
async function command(type: 'tsl:command:get-graph'): Promise<GetGraphResponsePayload>;
async function command(type: 'tsl:command:get-code'): Promise<GetCodeResponsePayload>;
async function command(type: 'tsl:command:get-uniform-schema'): Promise<GetUniformSchemaResponsePayload>;
async function command(
  type: 'tsl:command:set-root-material',
  payload: SetRootMaterialPayload
): Promise<SetRootMaterialResponsePayload>;
async function command(
  type: 'tsl:command:set-uniform-values',
  payload: SetUniformValuesPayload
): Promise<SetUniformValuesResponsePayload>;
async function command(type: HostCommandType, payload?: unknown): Promise<unknown> {
  await editorReady;
  const requestId = makeRequestId();
  const expectedType = RESPONSE_BY_COMMAND[type];

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      reject(new Error(`Timeout for ${type}`));
    }, 5000);

    pending.set(requestId, { expectedType, resolve, reject, timer });

    let message: HostMessage;
    switch (type) {
      case 'tsl:command:load':
        message = { source: HOST_SOURCE, type, requestId, payload: payload as LoadCommandPayload };
        break;
      case 'tsl:command:clear-graph':
        message = { source: HOST_SOURCE, type, requestId };
        break;
      case 'tsl:command:set-root-material':
        message = { source: HOST_SOURCE, type, requestId, payload: payload as SetRootMaterialPayload };
        break;
      case 'tsl:command:set-uniform-values':
        message = { source: HOST_SOURCE, type, requestId, payload: payload as SetUniformValuesPayload };
        break;
      case 'tsl:command:get-graph':
      case 'tsl:command:get-code':
      case 'tsl:command:get-uniform-schema':
        message = { source: HOST_SOURCE, type, requestId };
        break;
    }

    postToEditor(message);
  });
}

async function commandLoad(payload: LoadCommandPayload): Promise<LoadResponsePayload> {
  return command('tsl:command:load', payload);
}

async function clearGraph(): Promise<ClearGraphResponsePayload> {
  const response = await command('tsl:command:clear-graph');
  // if you want to clear the graph from storage as well
  // clearGraphInStorage(selectedMaterialId);
  return response as ClearGraphResponsePayload;
}

async function getGraph(): Promise<GetGraphResponsePayload> {
  return command('tsl:command:get-graph');
}

async function getCode(): Promise<GetCodeResponsePayload> {
  return command('tsl:command:get-code');
}

async function getUniformSchema(): Promise<GetUniformSchemaResponsePayload> {
  return command('tsl:command:get-uniform-schema');
}

async function setUniformValues(payload: SetUniformValuesPayload): Promise<SetUniformValuesResponsePayload> {
  return command('tsl:command:set-uniform-values', payload);
}

async function commandSetRootMaterial(
  payload: SetRootMaterialPayload
): Promise<SetRootMaterialResponsePayload> {
  return command('tsl:command:set-root-material', payload);
}

function updateUniformCache(uniforms: UniformSchemaEntry[]) {
  uniformsCache = new Map(uniforms.map((u) => [uniformKey(u), u]));
}

async function applyRootMaterialLock(materialClass: MaterialClass) {
  try {
    await commandSetRootMaterial({ materialType: materialClassToType(materialClass) });
    console.log('Root material locked:', materialClass);
  } catch (err) {
    console.error('Failed to set root material:', err);
  }
}

async function patchUniform(entry: UniformSchemaEntry, rawValue: unknown) {
  const value = normalizeUniformValue(entry, rawValue);
  const result = await setUniformValues({
    updates: [{ scope: entry.scope, id: entry.id, value }],
  });

  if (!result.ok && result.rejected?.length) {
    console.warn('Uniform update rejected:', result.rejected);
  }

  updateUniformCache(result.uniforms);
  renderUniformUI(result.uniforms);
}

function renderUniformUI(uniforms: UniformSchemaEntry[]) {
  const container = document.getElementById('uniforms');
  if (!container) return;

  container.innerHTML = '';
  if (uniforms.length === 0) {
    container.textContent = 'No uniforms';
    return;
  }

  uniforms.forEach((entry) => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '220px 1fr';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.marginBottom = '8px';

    const label = document.createElement('div');
    label.textContent = `${entry.name} (${entry.scope}, ${entry.uniformType})`;
    label.style.fontFamily = 'monospace';
    label.style.fontSize = '12px';
    row.appendChild(label);

    const inputWrap = document.createElement('div');

    if (entry.uniformType === 'bool') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(entry.value);
      input.addEventListener('change', () => void patchUniform(entry, input.checked));
      inputWrap.appendChild(input);
    } else if (entry.uniformType === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = toColor(entry.value);
      input.addEventListener('change', () => void patchUniform(entry, input.value));
      inputWrap.appendChild(input);
    } else if (entry.uniformType === 'vec2' || entry.uniformType === 'vec3' || entry.uniformType === 'vec4') {
      const len = entry.uniformType === 'vec2' ? 2 : entry.uniformType === 'vec3' ? 3 : 4;
      const vals = toVector(entry.value, len);
      const inputs: HTMLInputElement[] = [];

      for (let i = 0; i < len; i++) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = String(vals[i]);
        input.style.width = '90px';
        input.style.marginRight = '6px';
        input.addEventListener('change', () => {
          const next = inputs.map((el) => toNumber(el.value, 0));
          void patchUniform(entry, makeVectorValue(next, len));
        });
        inputs.push(input);
        inputWrap.appendChild(input);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = entry.uniformType === 'int' ? '1' : '0.01';
      input.value = String(toNumber(entry.value, 0));
      input.addEventListener('change', () => {
        const num = toNumber(input.value, 0);
        void patchUniform(entry, entry.uniformType === 'int' ? Math.round(num) : num);
      });
      inputWrap.appendChild(input);
    }

    row.appendChild(inputWrap);
    container.appendChild(row);
  });
}

async function refreshCodePanel() {
  try {
    const code = await getCode();
    console.log('Generated code:', code);

    const el = document.getElementById('code');
    if (el) el.innerText = code.material.code ?? '';
  } catch (err) {
    console.error('Failed to fetch code:', err);
  }
}

const PERSIST_DEBOUNCE_MS = 500;
let persistTimer: number | null = null;
let persistInFlight = false;
let persistQueued = false;

async function persistGraphNow() {
  if (persistInFlight) {
    persistQueued = true;
    return;
  }

  persistInFlight = true;
  try {
    const graph = await getGraph();
    saveGraphToStorage(selectedMaterialId, graph.graphData);
  } catch (err) {
    console.error('Failed to persist graph:', err);
  } finally {
    persistInFlight = false;
    if (persistQueued) {
      persistQueued = false;
      void persistGraphNow();
    }
  }
}

function schedulePersistGraph() {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
  }
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistGraphNow();
  }, PERSIST_DEBOUNCE_MS);
}

window.addEventListener('message', async (event: MessageEvent) => {
  if (event.origin !== editorOrigin) return;
  if (!isEditorMessage(event.data)) return;

  const msg = event.data;
  console.log('[TSL_MESSAGE] IN:', msg.type, msg);

  if (msg.requestId && msg.type.startsWith('tsl:response:')) {
    const waiter = pending.get(msg.requestId);
    if (!waiter) return;
    if (msg.type !== waiter.expectedType) return;

    pending.delete(msg.requestId);
    window.clearTimeout(waiter.timer);

    if (msg.error) waiter.reject(new Error(msg.error));
    else waiter.resolve(msg.payload);
    return;
  }

  if (msg.type === 'tsl:event:ready') {
    if (!isReady) {
      isReady = true;
      resolveReady();
    }

    const saved = loadGraphFromStorage(selectedMaterialId);

    try {
      if (saved !== null) {
        await commandLoad({ graphData: saved });
        console.log('Loaded graph from localStorage:', selectedMaterialId);
      }
    } catch (err) {
      console.error('Initial load failed:', err);
    }

    try {
      const schema = await getUniformSchema();
      updateUniformCache(schema.uniforms);
      renderUniformUI(schema.uniforms);
    } catch (err) {
      console.error('Failed to fetch uniform schema:', err);
    }

    await refreshCodePanel();
    return;
  }

  if (msg.type === 'tsl:event:graph-changed') {
    const revision = msg.payload?.revision ?? -1;
    console.log('Graph changed revision:', revision);

    await refreshCodePanel();
    schedulePersistGraph();
    return;
  }

  if (msg.type === 'tsl:event:uniforms-changed') {
    const uniforms = msg.payload?.uniforms ?? [];
    updateUniformCache(uniforms);
    renderUniformUI(uniforms);
    return;
  }
});

const applyBasicMaterialBtn = document.getElementById('apply-basic-material');
applyBasicMaterialBtn?.addEventListener('click', () => {
  applyRootMaterialLock('MeshBasicNodeMaterial');
});

const applyStandardMaterialBtn = document.getElementById('apply-standard-material');
applyStandardMaterialBtn?.addEventListener('click', () => {
  applyRootMaterialLock('MeshStandardNodeMaterial');
});

const applyPhysicalMaterialBtn = document.getElementById('apply-physical-material');
applyPhysicalMaterialBtn?.addEventListener('click', () => {
  applyRootMaterialLock('MeshPhysicalNodeMaterial');
});

const applyPhongMaterialBtn = document.getElementById('apply-phong-material');
applyPhongMaterialBtn?.addEventListener('click', () => {
  applyRootMaterialLock('MeshPhongNodeMaterial');
});

const applySpriteMaterialBtn = document.getElementById('apply-sprite-material');
applySpriteMaterialBtn?.addEventListener('click', () => {
  applyRootMaterialLock('SpriteNodeMaterial');
});

const jsonInput = document.getElementById('json-input');
jsonInput?.addEventListener('change', () => {
  const file = jsonInput?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const json = JSON.parse(e.target?.result as string);
    commandLoad({ graphData: json });
  };
  reader.readAsText(file);
});

const clearGraphBtn = document.getElementById('clear-graph');
clearGraphBtn?.addEventListener('click', async () => {
  try {
    await clearGraph();
    console.log('Graph cleared');
    await refreshCodePanel();
    renderUniformUI([]);
  } catch (err) {
    console.error('Failed to clear graph:', err);
  }
});
