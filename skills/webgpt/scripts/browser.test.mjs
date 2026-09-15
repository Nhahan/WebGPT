import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendOnce, deleteAndClose } from './browser.mjs';
const header = url => `Browser tab: 1, Title: "Owned task", URL: "${url}".\n`;
const home = header('https://chatgpt.com/') + '3 pop up button (collapsed) 매우 높음, ID: mode\n4 text entry area (settable) Description: ChatGPT와 채팅, ID: prompt-textarea';
function tab(states) { return { id:'1', actions:[], async getAXState(options){assert.equal(options.emit,false);return states.length>1?states.shift():states[0];}, async click(i){this.actions.push(['click',i]);}, async typeText(t){this.actions.push(['type',t]);},async pressKey(k){this.actions.push(['key',k]);},async close(){this.actions.push(['close']);} }; }
test('send batches a grounded selected mode and one message, refusing retries and mismatches',async()=>{
  const t=tab([home,header('https://chatgpt.com/c/a')+'Hello']);
  assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return']]);
  await assert.rejects(sendOnce(t,'Again'),/already sent/);
  const wrong=tab([home]);assert.equal((await sendOnce(wrong,'Hello','pro')).status,'needs_mode');assert.deepEqual(wrong.actions,[]);
});
test('cleanup batches exact chat deletion and closure, but stops on authorization or target mismatch',async()=>{
  const url='https://chatgpt.com/c/a';
  const states=[header(url)+'5 button Description: More, ID: conversation-options-a',header(url)+'6 삭제',header(url)+'7 container 채팅을 삭제하시겠습니까?\n8 text Owned task\n9 button 삭제',header('https://chatgpt.com/')];
  const t=tab([...states]);const cua={listTabs:async()=>[]};
  assert.equal((await deleteAndClose(t,cua,'1',url)).status,'authorization_required');assert.deepEqual(t.actions,[]);
  assert.equal((await deleteAndClose(t,cua,'1',url,true)).status,'deleted_and_closed');assert.deepEqual(t.actions,[['click',5],['click',6],['click',9],['close']]);
  const changed=tab([header('https://chatgpt.com/c/other')]);assert.equal((await deleteAndClose(changed,cua,'1',url,true)).status,'target_changed');assert.deepEqual(changed.actions,[]);
  const wrongDialog=tab([states[0],states[1],header(url)+'7 container 채팅을 삭제하시겠습니까?\n8 text Other task\n9 button 삭제']);
  assert.equal((await deleteAndClose(wrongDialog,cua,'1',url,true)).status,'needs_dialog_verification');
  assert.deepEqual(wrongDialog.actions,[['click',5],['click',6]]);
});
test('delayed submission is observed once without resending; draft URL resolves only via its matching menu',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123', saved='https://chatgpt.com/c/abc-456';
  const t=tab([home,header(draft),header(draft)+'Hello',header(saved)+'5 button Description: More, ID: conversation-options-WEB:abc-123',header(saved)+'6 삭제',header(saved)+'7 container 채팅을 삭제하시겠습니까?\n8 text Owned task\n9 button 삭제',header('https://chatgpt.com/')]);
  assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  assert.equal((await deleteAndClose(t,{listTabs:async()=>[]},'1',draft,true)).status,'deleted_and_closed');
  const other=tab([header(saved)+'5 button Description: More, ID: conversation-options-WEB:other']);
  assert.equal((await deleteAndClose(other,{listTabs:async()=>[]},'1',draft,true)).status,'target_changed');
  assert.deepEqual(other.actions,[]);
});
