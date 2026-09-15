import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {start} from './worker.mjs';
import {request,openProject} from './client.mjs';
const day=86400000;
test('open reuses only live project connections without extending idle expiry or reviving old URLs',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'webgpt-open-reuse-'));let clock=Date.now();
  const service=await start({dir,port:0,controlPort:0,now:()=>clock});
  const config={dataDir:dir,mcpPort:service.mcpPort,controlPort:service.controlPort,publicOrigin:'https://example.com'};
  try{
    const a=await openProject(dir,config,clock);
    assert.equal(a.reused,false);assert.equal(a.token,undefined);
    assert.equal(a.connectionUrl,config.publicOrigin+a.connectionPath);
    clock+=1000;
    const b=await openProject(join(dir,'.'),config,clock);
    assert.equal(b.reused,true);assert.equal(b.id,a.id);assert.equal(b.connectionName,a.connectionName);
    assert.equal(b.idleExpiresAt,a.idleExpiresAt);
    assert.equal(JSON.parse(readFileSync(join(dir,'state.json'),'utf8')).length,1);
    const changedOrigin=await openProject(dir,{...config,publicOrigin:'https://other.example'},clock);
    assert.equal(changedOrigin.id,a.id);assert.notEqual(changedOrigin.connectionName,a.connectionName);
    const different=await openProject(tmpdir(),config,clock);assert.notEqual(different.id,a.id);
    clock+=day;await service.expireIdle();
    const c=await openProject(dir,config,clock);
    assert.equal(c.reused,false);assert.notEqual(c.connectionPath,a.connectionPath);
    assert.notEqual(c.connectionName,a.connectionName);
    assert.equal((await fetch(`http://127.0.0.1:${service.mcpPort}${a.connectionPath}`)).status,404);
    await request('cancel',{id:c.id},config);
    assert.notEqual((await openProject(dir,config,clock)).id,c.id);
    const configPath=join(dir,'config.json');writeFileSync(configPath,JSON.stringify(config));
    const cli=JSON.parse((await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./client.mjs',import.meta.url)),'open'],{cwd:dir,env:{...process.env,WEBGPT_CONFIG:configPath,WEBGPT_DATA_DIR:dir}})).stdout);
    assert.equal(cli.project,realpathSync(dir));assert.equal(cli.reused,true);
  }finally{await service.close();rmSync(dir,{recursive:true});}
});
test('open connection binds its project without prompt tokens and exposes only terminal tools',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'webgpt-open-route-'));let clock=1000;
  let service=await start({dir,port:0,controlPort:0,publicMcp:true,now:()=>clock});
  const admin=(a,p)=>request(a,p,{dataDir:dir,controlPort:service.controlPort});
  const rpc=async(path,method,params={})=>{
    const r=await fetch(`http://127.0.0.1:${service.mcpPort}${path}`,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    return {status:r.status,...await r.json()};
  };
  const execute=async path=>{
    let response=await rpc(path,'tools/call',{name:'exec_command',arguments:{command:`"${process.execPath}" -p "process.cwd()"`}});
    let output='';
    for(;;){
      assert.equal(response.result.isError,false);
      const terminal=response.result.structuredContent;output+=terminal.output;
      if(!terminal.running){assert.equal(terminal.exit_code,0);return output;}
      response=await rpc(path,'tools/call',{name:'write_stdin',arguments:{session_id:terminal.session_id}});
    }
  };
  try{
    const configPath=join(dir,'config.json');
    writeFileSync(configPath,JSON.stringify({dataDir:dir,mcpPort:service.mcpPort,controlPort:service.controlPort}));
    const cli=JSON.parse((await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./client.mjs',import.meta.url)),'open',dir],{env:{...process.env,WEBGPT_CONFIG:configPath,WEBGPT_DATA_DIR:dir}})).stdout);
    assert.ok(cli.connectionPath.startsWith('/open/'));assert.equal(cli.token,undefined);
    await admin('cancel',{id:cli.id});
    const a=await admin('register',{mode:'open',terminal:{cwd:dir}});
    const b=await admin('register',{mode:'open',terminal:{cwd:tmpdir()}});
    const listed=(await rpc(a.connectionPath,'tools/list')).result.tools;
    assert.deepEqual(listed.map(t=>t.name),['exec_command','write_stdin']);
    assert.ok(listed.every(t=>!t.inputSchema.properties.token&&!t.inputSchema.required.includes('token')));
    const init=(await rpc(a.connectionPath,'initialize')).result;
    assert.ok(init.instructions.includes(JSON.stringify(realpathSync(dir))));assert.ok(!init.instructions.includes('submit_result'));
    assert.equal((await execute(a.connectionPath)).trim(),realpathSync(dir));
    assert.equal((await execute(b.connectionPath)).trim(),realpathSync(tmpdir()));
    for(const name of ['submit_result','get_task','read_input'])assert.equal((await rpc(a.connectionPath,'tools/call',{name,arguments:{}})).result.isError,true);
    assert.equal((await rpc(a.connectionPath,'tools/call',{name:'exec_command',arguments:{token:b.token,command:'echo wrong'}})).result.isError,true);
    assert.equal((await rpc('/open/wrong','tools/list')).status,404);
    assert.equal((await rpc('/mcp','tools/list')).status,404);
    const general='/mcp/'+readFileSync(join(dir,'mcp-path.key'),'utf8');
    assert.equal((await rpc(general,'tools/list')).result.tools.length,5);
    await service.close();service=await start({dir,port:0,controlPort:0,publicMcp:true,now:()=>clock});
    assert.equal((await rpc(a.connectionPath,'tools/list')).status,200);
    await admin('cancel',{id:a.id});assert.equal((await rpc(a.connectionPath,'tools/list')).status,404);
    assert.equal((await rpc(b.connectionPath,'tools/list')).status,200);
    clock+=day;assert.equal((await rpc(b.connectionPath,'tools/list')).status,404);
  }finally{await service.close();rmSync(dir,{recursive:true});}
});
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
