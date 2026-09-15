// Pure helpers over the caller's documented CUA tab API; no browser transport or private APIs.
const sent = new WeakSet();
const observe = tab => tab.getAXState({ emit: false, disableDiffing: true });
const lines = state => state.split('\n').map(line => line.trim());
const one = (state, predicate) => {
  const matches = lines(state).filter(predicate).map(line => Number(line.match(/^(\d+) /)?.[1]));
  return matches.length === 1 && Number.isInteger(matches[0]) ? matches[0] : null;
};
const location = state => state.match(/Browser tab: .*?URL: "([^"]+)"/)?.[1];
const title = state => state.match(/Browser tab: .*?Title: "([^"]*)"/)?.[1];
const modeLine = mode => mode === 'xh' ? /^(?:매우 높음|Extra High)$/i : /^Pro$/;
const label = line => line.replace(/^\d+ (?:pop up )?button(?: \([^)]*\))? (?:Description: )?/, '').split(', ID:')[0];

export async function sendOnce(tab, prompt, mode = 'xh') {
  if (!['xh', 'pro'].includes(mode)) throw Error('unsupported mode');
  if (sent.has(tab)) throw Error('already sent or attempted; inspect submission, never resend');
  const state = await observe(tab);
  const url = location(state);
  if (!url || !/^https:\/\/chatgpt\.com\/?$/.test(url)) return { status: 'needs_new_chat', url };
  const chosen = one(state, line => /^\d+ (?:pop up )?button/.test(line) && modeLine(mode).test(label(line)));
  if (chosen === null) return { status: 'needs_mode', mode };
  const composer = one(state, line => /^\d+ text entry area/.test(line) && /ID: prompt-textarea(?:,|$)/.test(line));
  if (composer === null) return { status: 'needs_composer' };
  sent.add(tab); // Any subsequent ambiguity must not cause a duplicate user message.
  await tab.click(composer);
  await tab.typeText(prompt);
  await tab.pressKey('Return');
  let after = await observe(tab);
  if (!after.includes(prompt)) after = await observe(tab); // One transition read, never resend.
  return { status: after.includes(prompt) ? 'submitted' : 'submission_unconfirmed', url: location(after), tabId: tab.id };
}

// Caller preserves the result and establishes task ownership; task cleanup is already authorized.
// Never call for user-controlled open sessions or unrelated chats.
export async function deleteAndClose(tab, cua, browserId, expectedUrl) {
  let state = await observe(tab);
  if (!/^https:\/\/chatgpt\.com\/c\/.+/.test(expectedUrl)) return { status: 'target_changed' };
  if (location(state) !== expectedUrl) {
    // ChatGPT replaces a WEB: draft URL with its saved URL; the observed menu ID links them.
    const draft = expectedUrl.match(/\/c\/(WEB:[a-zA-Z0-9-]+)$/)?.[1];
    const sameDraft = draft && lines(state).some(line => line.includes('ID: conversation-options-' + draft) && line.split('ID: conversation-options-')[1].split(',')[0] === draft);
    if (!sameDraft || !/^https:\/\/chatgpt\.com\/c\/[a-f0-9-]+$/.test(location(state) ?? '')) return { status: 'target_changed' };
    expectedUrl = location(state);
  }
  const chatTitle = title(state);
  const menu = one(state, line => /^\d+ button/.test(line) && /ID: conversation-options-/.test(line));
  if (menu === null) return { status: 'needs_menu' };
  await tab.click(menu);
  state = await observe(tab);
  const remove = one(state, line => /^\d+ (?:menuitem )?(?:삭제|Delete)$/.test(line));
  if (remove === null) return { status: 'needs_delete_control' };
  await tab.click(remove);
  state = await observe(tab);
  // A transition may expose only the page header; one fresh read obtains the dialog.
  if (!/채팅을 삭제|Delete chat/i.test(state)) state = await observe(tab);
  const namedInDialog = chatTitle && lines(state).some(line => line.replace(/^\d+ text /, '') === chatTitle);
  if (location(state) !== expectedUrl || !namedInDialog || !/채팅을 삭제|Delete chat/i.test(state)) return { status: 'needs_dialog_verification' };
  const confirm = one(state, line => /^\d+ button (?:삭제|Delete)$/.test(line));
  if (confirm === null) return { status: 'needs_confirmation_control' };
  await tab.click(confirm);
  state = await observe(tab);
  if (!/^https:\/\/chatgpt\.com\/?$/.test(location(state) ?? '')) return { status: 'deletion_unconfirmed' };
  await tab.close();
  const tabs = await cua.listTabs({ browser: browserId, emit: false });
  return { status: tabs.some(other => other.id === tab.id) ? 'tab_close_unconfirmed' : 'deleted_and_closed', tabId: tab.id };
}
