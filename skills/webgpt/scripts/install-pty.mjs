import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// node-pty 1.1.0's macOS npm prebuild omits the helper's executable bit.
// https://github.com/microsoft/node-pty/issues/850
if (process.platform === 'darwin') {
  const helper = new URL(`../node_modules/node-pty/prebuilds/darwin-${process.arch}/spawn-helper`, import.meta.url);
  if (existsSync(helper)) chmodSync(helper, 0o755);
}

// 1.1.0's Windows output relay leaves its named-pipe server alive after EOF.
// Close that owned relay when its source closes; otherwise finished PTYs keep Node alive.
if (process.platform === 'win32') {
  const file=new URL('../node_modules/node-pty/lib/worker/conoutSocketWorker.js',import.meta.url);
  const source=readFileSync(file,'utf8');
  const marker='    server.listen(conout_1.getWorkerPipeName(conoutPipeName));';
  const cleanup="\n    conoutSocket.once('close', function () { server.close(); worker_threads_1.parentPort?.close(); });";
  if(!source.includes(cleanup)) {
    if(!source.includes(marker)) throw Error('Unexpected node-pty output relay; review the pinned dependency');
    writeFileSync(file,source.replace(marker,marker+cleanup));
  }
}
