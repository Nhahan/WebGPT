import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import * as pty from 'node-pty';

export function terminalGrant(input) {
  if (input == null) return null;
  if (typeof input.cwd !== 'string' || !isAbsolute(input.cwd)) throw Error('terminal.cwd must be absolute');
  const cwd = realpathSync(input.cwd);
  if (!statSync(cwd).isDirectory()) throw Error('terminal.cwd must be a directory');
  return { cwd };
}

// The cwd is a convenience, not a sandbox. Commands inherit the worker user's OS access.
export class Terminals {
  sessions = new Map();

  async execute(owner, grant, {command, cwd, shell, tty = false, yield_ms = 1000}) {
    if (!grant) throw Error('terminal access not granted');
    if (typeof command !== 'string') throw Error('command must be a string');
    if (!Number.isFinite(yield_ms) || yield_ms < 0 || typeof tty !== 'boolean') throw Error('invalid terminal options');
    cwd ??= grant.cwd;
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw Error('cwd must be absolute');
    shell ??= process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/sh');
    const cmdShell = process.platform === 'win32' && /(?:^|[\\/])cmd(?:\.exe)?$/i.test(shell);
    const args = cmdShell ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command];
    const id = randomUUID();
    const session = {owner, output:'', exit_code:null, signal:null, done:false, listeners:new Set()};
    const notify = () => { for (const f of [...session.listeners]) f(); };
    if (tty) {
      const child = pty.spawn(shell, cmdShell ? args.join(' ') : args, {cwd, env:process.env, name:'xterm-256color', cols:120, rows:30});
      session.write = text => child.write(text);
      session.kill = signal => {
        if(process.platform !== 'win32') child.kill(signal);
        else if(signal === 'SIGINT') child.write('\u0003');
        else child.kill();
      };
      child.onData(text => {session.output += text; notify();});
      child.onExit(({exitCode, signal}) => {session.done=true; session.exit_code=exitCode; session.signal=signal ?? null; notify();});
    } else {
      const child = spawn(shell, args, {cwd, env:process.env, windowsVerbatimArguments:cmdShell, detached:process.platform !== 'win32', stdio:'pipe'});
      session.write = text => child.stdin.write(text);
      session.kill = signal => {
        if (!child.pid) return;
        // Killing cmd.exe alone leaves its command alive and its pipes open on Windows.
        if (process.platform === 'win32') {
          const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});
          killer.on('error',()=>child.kill(signal));
        }
        else { try { process.kill(-child.pid, signal); } catch(e) { if(e.code !== 'ESRCH') throw e; } }
      };
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        stream.on('data', text => {session.output += text; notify();});
      }
      child.stdin.on('error', () => {});
      child.on('error', error => {session.output += error.message;});
      child.on('close', (code, signal) => {session.done=true; session.exit_code=code; session.signal=signal; notify();});
    }
    this.sessions.set(id, session);
    return this.read(owner, {session_id:id, yield_ms});
  }

  async read(owner, {session_id, input = '', signal, yield_ms = 1000}) {
    const s = this.sessions.get(session_id);
    if (!s || s.owner !== owner) throw Error('unknown terminal session');
    if (typeof input !== 'string' || !Number.isFinite(yield_ms) || yield_ms < 0) throw Error('invalid terminal input');
    if (signal && !['SIGINT','SIGTERM','SIGKILL'].includes(signal)) throw Error('invalid signal');
    if (!s.done && input) s.write(input);
    if (!s.done && signal) s.kill(signal);
    // Yield the HTTP call, not the command. No command timeout or output truncation.
    if (!s.done && !s.output && yield_ms > 0) await new Promise(resolve => {
      let timer;
      const finish = () => {clearTimeout(timer); s.listeners.delete(finish); resolve();};
      s.listeners.add(finish);
      timer = setTimeout(finish, Math.min(yield_ms, 25000));
    });
    const output = s.output; s.output = '';
    const result = {session_id, output, running:!s.done, exit_code:s.exit_code, signal:s.signal};
    if (s.done) this.sessions.delete(session_id);
    return result;
  }

  stop(owner) {
    for (const [id, s] of this.sessions) if (owner === undefined || s.owner === owner) {
      if (!s.done) s.kill('SIGKILL');
      this.sessions.delete(id);
    }
  }
}
