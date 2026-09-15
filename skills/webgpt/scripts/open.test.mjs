import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {start} from './worker.mjs';
import {request} from './client.mjs';
const day=86400000;
test('open sessions renew on terminal use, skip supervision, protect running commands and expire autonomously',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'webgpt-open-'));let clock=1000;
  let service=await start({dir,port:0,controlPort:0,now:()=>clock,idleSweepMs:10});
  const config=()=>({dataDir:dir,controlPort:service.controlPort});
  const admin=(a,p)=>request(a,p,config());
  const call=async(name,args)=>{const r=await fetch(`http://127.0.0.1:${service.mcpPort}/mcp`,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return(await r.json()).result;};
  const state=id=>JSON.parse(readFileSync(join(dir,'state.json'),'utf8')).find(t=>t.id===id);
  try{
    const a=await admin('register',{mode:'open',terminal:{cwd:dir}});
    assert.equal(a.mode,'open');assert.equal(a.idleExpiresAt,clock+day);
    clock+=day-1;
    assert.deepEqual(await admin('wait'),{events:[],backupDue:[]});
    await assert.rejects(admin('wait',{ids:[a.id]}),/user-controlled/);
    assert.equal((await call('submit_result',{token:a.token,status:'completed',summary:'x',result:'x'})).isError,true);
    assert.equal((await call('exec_command',{token:a.token,command:'echo OPEN_OK'})).isError,false);
    assert.equal(state(a.id).lastUsed,clock);
    clock+=day-1;await service.expireIdle();assert.ok(state(a.id).token);
    const running=await call('exec_command',{token:a.token,command:`"${process.execPath}" -e "setTimeout(()=>{},200)"`,yield_ms:0});
    assert.equal(running.structuredContent.running,true);
    clock+=day;await service.expireIdle();assert.ok(state(a.id).token);
    await call('write_stdin',{token:a.token,session_id:running.structuredContent.session_id,yield_ms:1000});
    assert.equal(state(a.id).lastUsed,clock);
    await service.close();service=await start({dir,port:0,controlPort:0,now:()=>clock,idleSweepMs:10});
    assert.equal((await call('get_task',{token:a.token})).structuredContent.mode,'open');
    clock+=day;
    // The timer expires the idle connection without a controller/model request.
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(state(a.id).status,'expired');assert.equal(state(a.id).token,undefined);
    assert.equal(state(a.id).nextCheck,null);
    assert.equal((await call('exec_command',{token:a.token,command:'echo forbidden'})).isError,true);
    assert.deepEqual(await admin('status'),{events:[],backupDue:[]});
    const b=await admin('register',{mode:'open',terminal:{cwd:dir}});
    await service.close();clock+=day;
    service=await start({dir,port:0,controlPort:0,now:()=>clock});
    assert.equal(state(b.id).status,'expired');
  }finally{await service.close();rmSync(dir,{recursive:true});}
});
