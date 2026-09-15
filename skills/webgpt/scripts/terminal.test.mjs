import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Terminals, terminalGrant } from './terminal.mjs';
import { start, tools } from './worker.mjs';
import { request } from './client.mjs';

const nodeCommand = code => `"${process.execPath}" -e "${code.replaceAll('"','\\"')}"`;
async function finish(terminals, owner, result) {
  let output=result.output;
  const deadline=Date.now()+15000;
  while(result.running) {
    assert.ok(Date.now()<deadline,`Test command did not finish. Output: ${JSON.stringify(output)}`);
    result=await terminals.read(owner,{session_id:result.session_id});output+=result.output;
  }
  return {...result,output};
}
async function fixture(run) {
  const dir=mkdtempSync(join(tmpdir(),'webgpt-terminal-'));
  const terminals=new Terminals();
  try {await run(terminals,dir,terminalGrant({cwd:dir}));}
  finally {terminals.stop();rmSync(dir,{recursive:true,force:true});}
}
test('shell directly creates, reads, edits and deletes files; cwd supports spaces and Unicode',()=>fixture(async(t,dir)=>{
  const cwd=join(dir,'한글 project');mkdirSync(cwd);
  const grant=terminalGrant({cwd});
  const run=async code=>finish(t,'a',await t.execute('a',grant,{command:nodeCommand(code)}));
  assert.equal((await run("require('fs').writeFileSync('file.txt','before'); console.log(process.cwd())")).exit_code,0);
  assert.equal(readFileSync(join(cwd,'file.txt'),'utf8'),'before');
  assert.equal((await run("require('fs').writeFileSync('file.txt','after'); console.log(require('fs').readFileSync('file.txt','utf8'))")).output.trim(),'after');
  await run("require('fs').unlinkSync('file.txt')");assert.equal(existsSync(join(cwd,'file.txt')),false);
}));
test('all output is returned, failures carry exit status, commands persist between calls',()=>fixture(async(t,dir,grant)=>{
  const result=await finish(t,'a',await t.execute('a',grant,{command:nodeCommand("process.stdout.write('x'.repeat(1500000));process.stderr.write('error');process.exitCode=7"),yield_ms:0}));
  assert.equal(result.output.length,1500005);assert.equal(result.exit_code,7);
  const delayed=await t.execute('a',grant,{command:nodeCommand("setTimeout(()=>console.log('later'),100)"),yield_ms:0});
  assert.equal(delayed.running,true);assert.match((await finish(t,'a',delayed)).output,/later/);
}));
test('PTY accepts interactive input and supports interrupt',()=>fixture(async(t,dir,grant)=>{
  const s=await t.execute('a',grant,{command:nodeCommand("console.log(process.stdin.isTTY);process.stdin.once('data',x=>{console.log('received:'+x);process.exit(0)})"),tty:true});
  let output=s.output;
  const next=await t.read('a',{session_id:s.session_id,input:'hello\n'});
  output+=(await finish(t,'a',next)).output;
  assert.match(output,/true/);assert.match(output,/received:hello/);
  const running=await t.execute('a',grant,{command:nodeCommand('setInterval(()=>{},1000)'),tty:true,yield_ms:0});
  const stopped=await t.read('a',{session_id:running.session_id,signal:'SIGKILL'});
  assert.equal((await finish(t,'a',stopped)).running,false);
}));
test('tokens gate terminal ownership; no legacy file grants silently become full shell',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'webgpt-shell-mcp-'));
  const s=await start({dir,port:0,controlPort:0});
  const config={dataDir:dir,controlPort:s.controlPort};
  const invoke=async(name,args)=>(await (await fetch(`http://127.0.0.1:${s.mcpPort}/mcp`,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})).json()).result;
  try {
    assert.deepEqual(tools.map(t=>t.name),['exec_command','write_stdin','get_task','read_input','submit_result']);
    await assert.rejects(request('register',{id:'old',instructions:'old',inputs:{},workspace:{root:dir,mode:'edit'}},config),/explicitly authorize/);
    const a=await request('register',{id:'a',instructions:'work',inputs:{},terminal:{cwd:dir}},config);
    const b=await request('register',{id:'b',instructions:'text',inputs:{}},config);
    assert.equal((await invoke('exec_command',{token:b.token,command:'echo forbidden'})).isError,true);
    assert.equal((await invoke('exec_command',{token:'wrong',command:'echo forbidden'})).isError,true);
    const running=await invoke('exec_command',{token:a.token,command:nodeCommand('setInterval(()=>{},1000)'),yield_ms:0});
    assert.equal(running.isError,false);
    assert.equal((await invoke('write_stdin',{token:b.token,session_id:running.structuredContent.session_id})).isError,true);
    await request('cancel',{id:'a'},config);
    assert.equal((await invoke('write_stdin',{token:a.token,session_id:running.structuredContent.session_id})).isError,true);
  }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
