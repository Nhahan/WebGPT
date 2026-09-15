import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

// Shared by the worker and controller client; never store configuration in the skill.
export function configuration(env = process.env) {
  const file = env.WEBGPT_CONFIG ?? join(homedir(), '.config', 'webgpt', 'config.json');
  if (env.WEBGPT_CONFIG && !existsSync(file)) throw Error('WEBGPT_CONFIG file does not exist');
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('invalid WebGPT configuration');
  const config = {
    dataDir: env.WEBGPT_DATA_DIR ?? saved.dataDir ?? join(homedir(), '.local', 'share', 'webgpt'),
    mcpPort: saved.mcpPort ?? 43137,
    controlPort: saved.controlPort ?? 43139,
    publicMcp: saved.publicMcp ?? false,
  };
  if (typeof config.dataDir !== 'string' || !isAbsolute(config.dataDir)) throw Error('dataDir must be absolute');
  if (typeof config.publicMcp !== 'boolean') throw Error('publicMcp must be boolean');
  for (const key of ['mcpPort', 'controlPort']) {
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 65535) throw Error('invalid ' + key);
  }
  if (config.mcpPort === config.controlPort) throw Error('MCP and controller ports must differ');
  return config;
}

export async function request(action, payload, config = configuration()) {
  const read = ['wait', 'status'].includes(action);
  if (!read && !['register', 'ack', 'checked', 'cancel'].includes(action)) throw Error('unknown controller action');
  if (read ? payload !== undefined && !(action === 'wait' && Array.isArray(payload?.ids) && payload.ids.length && payload.ids.every(id => typeof id === 'string')) : !payload || typeof payload !== 'object') throw Error('invalid controller payload');
  if (action === 'register') payload = { id: randomUUID(), inputs: {}, ...payload };
  const key = readFileSync(join(config.dataDir, 'controller.key'), 'utf8');
  const query = action === 'wait' && payload ? '?' + new URLSearchParams(payload.ids.map(id => ['id', id])) : '';
  const response = await fetch('http://127.0.0.1:' + config.controlPort + '/' + action + query, {
    method: read ? 'GET' : 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: read ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'controller request failed: ' + response.status);
  return result;
}

// HTTP renewals stay here, not in model turns. Return only actionable task state.
export async function waitForTasks(ids, config = configuration(), read = request) {
  for (;;) {
    const result = await read('wait', { ids }, config);
    if (result.events.length || result.backupDue.length || result.recoveryRequired?.length || result.settled) return result;
  }
}

if (process.argv[1] && process.argv[1] !== '-' && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const [action, ...args] = process.argv.slice(2);
    let result;
    if (action === 'wait') {
      // Accept the previous JSON-file form as well as plain returned IDs.
      const saved = args.length === 1 && existsSync(args[0]) ? JSON.parse(readFileSync(args[0], 'utf8')) : null;
      const ids = saved ? saved.ids ?? [saved.id] : args;
      if (!ids.length) throw Error('usage: client.mjs wait <task-id> [task-id ...]');
      result = await waitForTasks(ids);
    } else {
      const payload = args[0] ? JSON.parse(readFileSync(args[0], 'utf8')) : undefined;
      result = await request(action, payload);
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('WebGPT: ' + error.message);
    process.exitCode = 1;
  }
}
