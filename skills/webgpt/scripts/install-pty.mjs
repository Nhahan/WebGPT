import { chmodSync, existsSync } from 'node:fs';

// node-pty 1.1.0's macOS npm prebuild omits the helper's executable bit.
// https://github.com/microsoft/node-pty/issues/850
if (process.platform === 'darwin') {
  const helper = new URL(`../node_modules/node-pty/prebuilds/darwin-${process.arch}/spawn-helper`, import.meta.url);
  if (existsSync(helper)) chmodSync(helper, 0o755);
}
