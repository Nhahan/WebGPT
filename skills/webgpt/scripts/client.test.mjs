import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { configuration, request, waitForTasks } from './client.mjs';
import { start } from './worker.mjs';

const execute = promisify(execFile);
test('CLI registers project access without a task document or duplicated instructions', () => fixture(async ({dir,config,service,admin})=>{
  const file=join(dir,'config.json');writeFileSync(file,JSON.stringify(config));
  const cli=fileURLToPath(new URL('./client.mjs',import.meta.url));
  const env={...process.env,WEBGPT_CONFIG:file,WEBGPT_DATA_DIR:dir};
  const {stdout}=await execute(process.execPath,[cli,'register','--cwd',dir],{env});
  const task=JSON.parse(stdout);
  const context=(await invoke(service,'get_task',{token:task.token})).structuredContent;
  assert.equal(context.instructions,'');
  assert.equal(context.terminal.cwd,realpathSync(dir));
  await admin('cancel',{id:task.id});
  await assert.rejects(execute(process.execPath,[cli,'register','--cwd'],{env}),/usage/);
}));
test('minimal registration generates unique IDs and CLI waits using the returned ID', () => fixture(async ({dir,config,service,admin})=>{
  const a=await admin('register',{instructions:'First'});
  const b=await admin('register',{instructions:'Second'});
  assert.notEqual(a.id,b.id);
  assert.deepEqual((await invoke(service,'get_task',{token:a.token})).structuredContent.inputs,[]);
  await invoke(service,'submit_result',{token:a.token,status:'completed',summary:'done',result:'done'});
  const file=join(dir,'config.json');writeFileSync(file,JSON.stringify(config));
  const cli=fileURLToPath(new URL('./client.mjs',import.meta.url));
  const env={...process.env,WEBGPT_CONFIG:file,WEBGPT_DATA_DIR:dir};
  const {stdout}=await execute(process.execPath,[cli,'wait',a.id],{env});
  assert.deepEqual(JSON.parse(stdout).events.map(e=>e.id),[a.id]);
  await assert.rejects(execute(process.execPath,[cli,'wait'],{env}),/usage/);
  await admin('cancel',{id:b.id});
}));
test('ack, checked and cancel CLI accept direct task IDs and legacy JSON files', () => fixture(async ({dir,config,service,admin,advance})=>{
  const file=join(dir,'config.json'); writeFileSync(file,JSON.stringify(config));
  const cli=fileURLToPath(new URL('./client.mjs',import.meta.url));
  const env={...process.env,WEBGPT_CONFIG:file,WEBGPT_DATA_DIR:dir};
  const run=(...args)=>execute(process.execPath,[cli,...args],{env});

  for (const mode of ['direct','file']) {
    const ack=await admin('register',{id:`${mode}-ack`,instructions:'ack',inputs:{}});
    await invoke(service,'submit_result',{token:ack.token,status:'completed',summary:'done',result:'done'});
    const checked=await admin('register',{id:`${mode}-checked`,instructions:'checked',inputs:{}});
    const cancelled=await admin('register',{id:`${mode}-cancel`,instructions:'cancel',inputs:{}});
    advance(900000);
    assert.ok((await admin('status')).backupDue.includes(checked.id));

    const argFor=id=>{
      if(mode==='direct') return id;
      const payload=join(dir,`${id}.json`); writeFileSync(payload,JSON.stringify({id})); return payload;
    };
    await run('ack',argFor(ack.id));
    await run('checked',argFor(checked.id));
    await run('cancel',argFor(cancelled.id));

    const status=await admin('status');
    assert.ok(!status.events.some(event=>event.id===ack.id));
    assert.ok(!status.backupDue.includes(checked.id));
    assert.equal((await invoke(service,'get_task',{token:cancelled.token})).isError,true);
  }

  for (const action of ['ack','checked','cancel']) {
    await assert.rejects(run(action),new RegExp(`usage: client\.mjs ${action}`));
    await assert.rejects(run(action,'one','two'),new RegExp(`usage: client\.mjs ${action}`));
  }
}));

test('quiet wait renews empty responses internally and surfaces completion or errors', async () => {
  let calls=0;
  const result=await waitForTasks(['owned'], {}, async (action,payload)=>{
    assert.equal(action,'wait'); assert.deepEqual(payload,{ids:['owned']});
    return ++calls<3 ? {events:[],backupDue:[],settled:false} : {events:[{id:'owned'}],backupDue:[]};
  });
  assert.equal(calls,3); assert.equal(result.events[0].id,'owned');
  await assert.rejects(waitForTasks(['owned'],{},async()=>{throw Error('connection lost');}),/connection lost/);
  assert.equal((await waitForTasks(['owned'],{},async()=>({events:[],backupDue:[],settled:true}))).settled,true);
});

test('scoped wait ignores foreign events and wakes on owned completion or cancellation', () => fixture(async ({service,admin,config})=>{
  const foreign=await admin('register',{id:'foreign',instructions:'Other task',inputs:{}});
  const owned=await admin('register',{id:'owned',instructions:'My task',inputs:{}});
  await invoke(service,'submit_result',{token:foreign.token,status:'completed',summary:'foreign',result:'foreign'});
  let resolved=false;
  const waiting=waitForTasks(['owned'],config).then(v=>{resolved=true;return v;});
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(resolved,false);
  await invoke(service,'submit_result',{token:owned.token,status:'completed',summary:'owned',result:'owned'});
  assert.deepEqual((await waiting).events.map(e=>e.id),['owned']);
  await admin('register',{id:'cancelled',instructions:'Cancel task',inputs:{}});
  const cancelled=waitForTasks(['cancelled'],config);
  await admin('cancel',{id:'cancelled'});
  assert.equal((await cancelled).settled,true);
  await assert.rejects(waitForTasks(['missing'],config),/unknown task/);
  assert.ok((await admin('status')).events.some(e=>e.id==='foreign'));
}));
test('client and worker modules can be imported from stdin scripts', async () => {
  const client = new URL('./client.mjs', import.meta.url).href;
  const worker = new URL('./worker.mjs', import.meta.url).href;
  const stdout = await new Promise((resolve,reject) => {
    const child=execFile(process.execPath,['--input-type=module','-'],(error,stdout)=>error?reject(error):resolve(stdout));
    child.stdin.end(`await import(${JSON.stringify(client)}); await import(${JSON.stringify(worker)}); console.log('imported');`);
  });
  assert.equal(stdout.trim(),'imported');
});
const invoke = async (s, name, args) => {
  const response = await fetch(`http://127.0.0.1:${s.mcpPort}/mcp`, {
    method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  return (await response.json()).result;
};
async function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'webgpt-portable-test-'));
  let clock = 1000;
  let service = await start({ dir, port: 0, controlPort: 0, now: () => clock });
  const config = { dataDir: dir, mcpPort: service.mcpPort, controlPort: service.controlPort };
  const admin = (action, payload) => request(action, payload, config);
  const restart = async () => {
    await service.close();
    service = await start({ dir, port: 0, controlPort: 0, now: () => clock });
    config.mcpPort = service.mcpPort; config.controlPort = service.controlPort;
  };
  try { await run({ dir, get service() { return service; }, config, admin, restart, advance: ms => { clock += ms; } }); }
  finally { await service.close(); rmSync(dir, { recursive: true }); }
}

test('portable config uses absolute paths and independent ports, with explicit overrides', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'webgpt-config-test-'));
  try {
    const file = join(dir, 'config.json');
    const saved = { dataDir: join(dir, 'private data'), mcpPort: 12340, controlPort: 12341 };
    writeFileSync(file, JSON.stringify(saved));
    assert.deepEqual(configuration({ WEBGPT_CONFIG: file }), {...saved, publicMcp:false});
    writeFileSync(file, JSON.stringify({...saved, publicMcp:true}));
    assert.equal(configuration({ WEBGPT_CONFIG: file }).publicMcp, true);
    assert.equal(configuration({ WEBGPT_CONFIG: file, WEBGPT_DATA_DIR: dir }).dataDir, dir);
    for (const invalid of [[], null, { publicMcp:'true' }, { dataDir: 'relative' }, { mcpPort: 0 }, { controlPort: '12341' }, { mcpPort: 43139 }]) {
      writeFileSync(file, JSON.stringify(invalid));
      assert.throws(() => configuration({ WEBGPT_CONFIG: file }));
    }
    assert.throws(() => configuration({ WEBGPT_CONFIG: join(dir, 'missing.json') }), /does not exist/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('client CLI works from an unrelated directory with configured private data', () => fixture(async ({ dir, config }) => {
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify(config));
  const cli = new URL('./client.mjs', import.meta.url);
  const { stdout } = await execute(process.execPath, [fileURLToPath(cli), 'status'], {
    cwd: tmpdir(), env: { ...process.env, WEBGPT_CONFIG: file, WEBGPT_DATA_DIR: dir },
  });
  assert.deepEqual(JSON.parse(stdout), { events: [], backupDue: [] });
  assert.ok(!stdout.includes(readFileSync(join(dir, 'controller.key'), 'utf8')));
}));

test('client and worker CLIs execute through a symlinked installation path', () => fixture(async ({ dir, config }) => {
  const scripts = join(dir, 'installed scripts');
  symlinkSync(dirname(fileURLToPath(import.meta.url)), scripts, process.platform === 'win32' ? 'junction' : 'dir');
  const file = join(dir, 'config.json'); writeFileSync(file, JSON.stringify(config));
  const env = { ...process.env, WEBGPT_CONFIG: file, WEBGPT_DATA_DIR: dir };
  const { stdout } = await execute(process.execPath, [join(scripts, 'client.mjs'), 'status'], { env });
  assert.deepEqual(JSON.parse(stdout), { events: [], backupDue: [] });
  // Startup must actually execute and reject the live owner's lock, not exit silently with code 0.
  await assert.rejects(execute(process.execPath, [join(scripts, 'worker.mjs')], { env }), /data directory locked/);
}));

test('controller authenticates, rejects invalid calls, and returns errors without keys', () => fixture(async ({ service, admin }) => {
  assert.equal((await fetch(`http://127.0.0.1:${service.controlPort}/status`)).status, 401);
  await assert.rejects(admin('unknown'), /unknown/);
  await assert.rejects(admin('status', {}), /payload/);
  await assert.rejects(admin('register'), /payload/);
  await assert.rejects(admin('ack', { id: 'missing' }), /unknown task/);
  await admin('register', { id: 'a', instructions: 'Review', inputs: {} });
  await assert.rejects(admin('register', { id: 'a', instructions: 'Review', inputs: {} }), /invalid task/);
  await assert.rejects(admin('ack', { id: 'a' }), /not complete/);
  await admin('cancel', { id: 'a' });
}));

test('parallel early completions persist, verify their hashes and retry idempotently', () => fixture(async ({ service, admin }) => {
  const a = await admin('register', { id: 'a', instructions: 'Review A', inputs: {} });
  const b = await admin('register', { id: 'b', instructions: 'Review B', inputs: {} });
  const payload = { token: a.token, status: 'completed', summary: 'done', result: 'verified output' };
  await Promise.all([
    invoke(service, 'submit_result', payload),
    invoke(service, 'submit_result', { ...payload, token: b.token, status: 'failed', result: 'partial output' }),
  ]);
  assert.equal((await invoke(service, 'submit_result', payload)).structuredContent.duplicate, true);
  const view = await admin('wait');
  assert.deepEqual(view.events.map(e => e.id).sort(), ['a', 'b']);
  for (const event of view.events) {
    assert.equal(createHash('sha256').update(readFileSync(event.artifact)).digest('hex'), event.sha256);
  }
  await admin('ack', { id: 'a' }); await admin('ack', { id: 'b' });
  assert.deepEqual(await admin('wait'), { events: [], backupDue: [] });
}));

test('15-minute backup checks reset only running tasks and never revive terminal tasks', () => fixture(async ({ service, admin, advance }) => {
  const a = await admin('register', { id: 'a', instructions: 'Review', inputs: {} });
  await admin('register', { id: 'b', instructions: 'Review', inputs: {} });
  advance(899999); assert.deepEqual((await admin('status')).backupDue, []);
  advance(1); assert.deepEqual((await admin('wait')).backupDue, ['a', 'b']);
  await invoke(service, 'submit_result', { token: a.token, status: 'completed', summary: 'done', result: 'done' });
  await admin('checked', { id: 'b' });
  assert.deepEqual((await admin('status')).backupDue, []);
  advance(900000); assert.deepEqual((await admin('status')).backupDue, ['b']);
  await admin('checked', { id: 'a' }); await admin('ack', { id: 'a' });
  await admin('cancel', { id: 'b' });
  advance(900000); assert.deepEqual(await admin('wait'), { events: [], backupDue: [] });
}));

test('a single text-only task survives backup intervals and restart, then completes without file access', () => fixture(async f => {
  const transcript = 'Speaker: Please analyze this complete transcript.\nReviewer: Include the context.';
  const task = await f.admin('register', {
    id: 'transcript-analysis', instructions: 'Analyze the supplied transcript.', inputs: { transcript },
  });
  assert.equal((await invoke(f.service, 'get_task', { token: task.token })).structuredContent.terminal, null);
  assert.equal((await invoke(f.service, 'read_input', { token: task.token, name: 'transcript' })).structuredContent.text, transcript);
  for (const name of ['list_files', 'read_file', 'write_file', 'delete_file']) {
    assert.equal((await invoke(f.service, name, {
      token: task.token, path: name === 'list_files' ? '.' : 'ungranted.txt',
      text: 'not authorized', expectedSha256: null,
    })).isError, true);
  }
  // Advance only the fixture clock: backup checks are not execution deadlines.
  for (const elapsed of [900000, 24 * 60 * 60 * 1000]) {
    f.advance(elapsed);
    assert.deepEqual(await f.admin('status'), { events: [], backupDue: [task.id] });
    assert.equal((await invoke(f.service, 'get_task', { token: task.token })).structuredContent.status, 'running');
    await f.admin('checked', { id: task.id });
    assert.deepEqual(await f.admin('status'), { events: [], backupDue: [] });
  }
  await f.restart();
  assert.equal((await invoke(f.service, 'read_input', { token: task.token, name: 'transcript' })).structuredContent.text, transcript);
  const result = 'Analysis of the supplied transcript; no project changes were requested.';
  assert.equal((await invoke(f.service, 'submit_result', {
    token: task.token, status: 'completed', summary: 'Analysis complete', result,
  })).isError, false);
  f.advance(900000);
  const notice = await f.admin('wait');
  assert.deepEqual(notice.backupDue, []);
  assert.equal(notice.events.length, 1);
  assert.equal(notice.events[0].id, task.id);
  assert.equal(readFileSync(notice.events[0].artifact, 'utf8'), result);
  assert.equal(notice.events[0].sha256, createHash('sha256').update(result).digest('hex'));
  const saved = JSON.parse(readFileSync(join(f.dir, 'state.json'), 'utf8'))[0];
  assert.equal(saved.nextCheck, null);
  assert.equal(saved.terminal, null);
  await f.admin('ack', { id: task.id });
  f.advance(900000);
  assert.deepEqual(await f.admin('wait'), { events: [], backupDue: [] });
}));

test('malformed, invalid and oversized results do not complete a task', () => fixture(async ({ service, admin }) => {
  const a = await admin('register', { id: 'a', instructions: 'Review', inputs: {} });
  const payload = { token: a.token, status: 'completed', summary: 'done', result: 'done' };
  for (const extra of [{ token: 'wrong' }, { status: 'running' }, { summary: 'x'.repeat(2049) }, { result: 'x'.repeat(1048577) }]) {
    assert.equal((await invoke(service, 'submit_result', { ...payload, ...extra })).isError, true);
  }
  const malformed = await fetch(`http://127.0.0.1:${service.mcpPort}/mcp`, { method: 'POST', body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await admin('status')).events.length, 0);
}));

test('worker CLI honors the same config without changing existing data', () => fixture(async ({ dir, config, admin }) => {
  // Occupied ports must fail safely, not displace the existing service.
  const file = join(dir, 'config.json');
  const other = { ...config, dataDir: join(dir, 'port-conflict') };
  writeFileSync(file, JSON.stringify(other));
  await assert.rejects(execute(process.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url))], {
    env: { ...process.env, WEBGPT_CONFIG: file, WEBGPT_DATA_DIR: other.dataDir },
  }), /EADDRINUSE/);
  assert.equal(existsSync(join(other.dataDir, 'worker.lock')), false);
  assert.deepEqual(await admin('status'), { events: [], backupDue: [] });
}));

test('acknowledgment and cancellation retire task access across restarts', () => fixture(async f => {
  const a = await f.admin('register', { id: 'a', instructions: 'private instruction', inputs: { code: 'private input' } });
  const b = await f.admin('register', { id: 'b', instructions: 'cancel me', inputs: { code: 'private' } });
  const payload = { token: a.token, status: 'completed', summary: 'done', result: 'saved evidence' };
  await invoke(f.service, 'submit_result', payload);
  assert.equal((await invoke(f.service, 'submit_result', payload)).structuredContent.duplicate, true);
  await f.admin('ack', { id: 'a' }); await f.admin('cancel', { id: 'b' });
  await f.restart();
  for (const token of [a.token, b.token, undefined]) {
    assert.equal((await invoke(f.service, 'get_task', { token })).isError, true);
    assert.equal((await invoke(f.service, 'read_input', { token, name: 'code' })).isError, true);
  }
  assert.equal((await invoke(f.service, 'submit_result', payload)).isError, true);
  const state = JSON.parse(readFileSync(join(f.dir, 'state.json'), 'utf8'));
  for (const task of state) { assert.equal(task.token, undefined); assert.deepEqual(task.inputs, {}); assert.equal(task.instructions, ''); }
}));

test('one data directory cannot be opened by two workers even on different ports', () => fixture(async f => {
  await assert.rejects(start({ dir: f.dir, port: 0, controlPort: 0 }), /data directory locked/);
  assert.deepEqual(await f.admin('status'), { events: [], backupDue: [] });
  await f.restart();
  assert.deepEqual(await f.admin('status'), { events: [], backupDue: [] });
}));
