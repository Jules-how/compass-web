const query = new URLSearchParams(location.search);
const modes = ['ready','empty','loading','error','refresh-error','accepted','dismissed','save-error'];
let mode = modes.includes(query.get('state')) ? query.get('state') : 'ready';
let activeTab = 'today';
let decision = mode === 'accepted' ? 'accepted' : mode === 'dismissed' ? 'dismissed' : 'proposed';
let note = '', localTasks = [], selected = new Set(), returnFocus = null, busy = false;
const key = 'compass.folio.home-reference.note';
try { note = sessionStorage.getItem(key) || ''; } catch {}
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const dialogContent = document.querySelector('#dialog-content');
const live = 'https://compass-web-eosin.vercel.app';
const concept = screen => `../round-2/concept.html?direction=folio&screen=${screen}`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  inbox:'<path d="M4 4h16v16H4zM4 14h5l2 3h2l2-3h5"/>',
  tasks:'<path d="m3 6 2 2 3-4m-5 10 2 2 3-4M12 6h9M12 14h9M4 21h17"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
  outbound:'<path d="M4 6h15m-5-5 5 5-5 5M4 13h6M4 20h15"/>',
  crm:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 5a3 3 0 0 1 0 6m1 4a4 4 0 0 1 3 4v2"/>',
  clients:'<path d="M3 8h18v13H3zM8 8V3h8v5M3 14h18M10 12v4h4v-4"/>',
  planning:'<path d="M5 3h14v18H5zM9 7h6m-6 5h6m-6 5h4"/>',
  installs:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3 3v4l3 3 3 1 1 3h4l1-3 3-1 3-3v-4l-3-3-3-1-1-3Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  external:'<path d="M13 4h7v7m0-7L9 15M8 4H4v16h16v-4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  time:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  refresh:'<path d="M20 7V2m0 5h-5M4 17v5m0-5h5M4 9a8 8 0 0 1 14-5l2 3M4 17l2 3A8 8 0 0 0 20 15"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  pen:'<path d="m4 16 12-12 4 4L8 20H4v-4Zm9-9 4 4"/>',
  folder:'<path d="M3 5h7l3 3h8v12H3Z"/>',
  warning:'<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3v1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.folder}</svg>`;
const brand = `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="11.5" stroke="currentColor" stroke-width="1.2"/><path d="m9 19 3-9 8-3-3 9Z" fill="currentColor"/><circle cx="14.5" cy="13" r="1.5" fill="var(--rail)"/></svg>compass`;
const button = (label, action, type = '', extra = '') => `<button class="btn ${type}" data-action="${action}" ${extra}>${label}</button>`;
const external = (label, route, type = '') => `<a class="btn ${type}" href="${live}${route}" target="_blank" rel="noopener" aria-label="${escape(label)}, opens existing Compass in a new tab">${label}${icon('external')}</a>`;
const pill = (label, type = '') => `<span class="pill ${type}">${type === 'success' ? icon('check') : ''}${label}</span>`;
const groups = [
  ['Your day', [['Home','home','home.html'],['Inbox','inbox',concept('inbox')],['Tasks','tasks',live+'/tasks'],['Calendar','calendar',live+'/sales/outbound']]],
  ['Workspaces', [['Outbound','outbound',concept('outbound')],['CRM','crm',live+'/leads'],['Clients','clients',live+'/clients'],['Installs','installs',live+'/operations/installs'],['Planning','planning',live+'/planning']]]
];
function navLink([name, glyph, href]) {
  if (name === 'Calendar') return `<button class="nav-link" style="width:100%;text-align:left" data-action="calendar" aria-haspopup="dialog">${icon(glyph)}Calendar</button>`;
  return `<a class="nav-link" href="${href}" ${name === 'Home' ? 'aria-current="page"' : ''} ${href.startsWith(live) ? 'target="_blank" rel="noopener" aria-label="'+name+', opens existing Compass in a new tab"' : ''}>${icon(glyph)}${name}${name === 'Home' ? '<span class="nav-dot" aria-hidden="true"></span>' : ''}</a>`;
}
function navigation() {return groups.map(([title, links]) => `<div class="nav-group"><p class="eyebrow">${title}</p>${links.map(navLink).join('')}</div>`).join('');}
function announce(text) { document.querySelector('#announcement').textContent = text; }
function workRow(glyph, title, description, action, label) {
  const inside = `<span class="action-label">${label}</span>${icon('arrow')}`;
  return `<li class="work-row"><span class="work-icon">${icon(glyph)}</span><div><h3>${title}</h3><p>${description}</p></div>${action === 'editor' ? `<a class="btn" href="${concept('editor')}" aria-label="Continue Sydney Hvac draft">${inside}</a>` : button(inside,action,'',`aria-label="${label}: ${title}"`)}</li>`;
}
function localRows() {
  if (!localTasks.length) return '';
  return `<section class="work-section" aria-labelledby="captured-title"><div class="section-head"><h3 id="captured-title">Captured work</h3><span class="small">This preview</span></div><ul class="work-list">${localTasks.map((task, i) => `<li class="work-row local-task ${task.status === 'completed' ? 'done' : ''}"><button data-action="task:${i}" aria-label="${task.status === 'completed' ? 'Reopen' : 'Complete'} ${escape(task.title)}" aria-pressed="${task.status === 'completed'}">${task.status === 'completed' ? icon('check') : '<span aria-hidden="true">○</span>'}</button><div><h3>${escape(task.title)}</h3><p>${task.status === 'completed' ? 'Completed' : 'Not started'} · from capture</p></div></li>`).join('')}</ul></section>`;
}
function briefPaper() {
  const accepted = decision === 'accepted', dismissed = decision === 'dismissed';
  return `<article class="paper" aria-labelledby="brief-heading"><div class="row paper-meta"><span class="eyebrow">Daily brief / 08 Sep</span>${pill(accepted ? 'Accepted' : dismissed ? 'Dismissed' : 'Review needed', accepted ? 'success' : dismissed ? '' : 'warning')}</div>
    ${accepted ? `<div class="notice success" role="status">${icon('check')}<div><strong>Brief accepted.</strong><p>Review the existing candidates, then continue the draft.</p></div></div>` : dismissed ? `<div class="notice neutral" role="status">${icon('info')}<div><strong>Proposal dismissed.</strong><p>Your previous next campaigns are retained. You can keep working below.</p></div></div>` : ''}
    <section class="brief"><p class="eyebrow">${accepted ? 'Ready for your review' : dismissed ? 'The work stays in view' : 'Your next decision'}</p><h2 id="brief-heading">One precise draft.<br>Built on the right companies.</h2><p>Review the existing Sydney installation candidates for fit and prior contact. Then finish the Sydney Hvac sequence.</p><div class="actions">${accepted ? button('Review inventory '+icon('arrow'),'inventory','primary') : dismissed ? `<a class="btn primary" href="${concept('editor')}">Continue draft ${icon('arrow')}</a>` : button('Review the brief '+icon('arrow'),'brief','primary','id="review-brief" aria-haspopup="dialog"')}${accepted || dismissed ? button('Read the brief','brief','text','id="review-brief" aria-haspopup="dialog"') : `<a class="btn text" href="${concept('editor')}">Open draft ${icon('arrow')}</a>`}</div></section>
    <section class="work-section" aria-labelledby="work-heading"><div class="section-head"><h3 id="work-heading">Ready to move</h3><span class="small">From your brief</span></div><ul class="work-list">
      ${workRow('crm','Sydney installation candidates','Check relevance and previous contact.','inventory','Review')}
      ${workRow('pen','Sydney Hvac sequence','Draft · copy and opener review outstanding.','editor','Continue')}
      ${workRow('clients','Payment connection','Verify receiving instructions before signing.','payment','Review')}
    </ul></section>${localRows()}
    <div class="capture-strip"><div><h3>Loose ends belong here.</h3><p>${note ? 'A note is waiting for your review.' : 'Capture now. Decide what it becomes.'}</p></div>${button(note ? 'Review note' : 'Jot a note','capture','','aria-haspopup="dialog"')}</div></article>`;
}
function emptyPaper() {
  return `<article class="paper state-paper"><div class="empty-icon">${icon('folder')}</div><p class="eyebrow">Your brief</p><h2>No brief to review yet.</h2><p>Capture what’s on your mind, or open Tasks to choose your next piece of work.</p><div class="actions">${button('Capture a thought','capture','primary')}${external('Open Tasks','/tasks','text')}</div>${localRows()}</article>`;
}
function loadingPaper() {
  return `<section class="paper loading-paper" aria-busy="true" aria-label="Loading your daily brief"><p class="eyebrow" role="status">Loading your brief…</p><div aria-hidden="true"><div class="skeleton title"></div><div class="skeleton title short"></div><div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton button"></div><div class="skeleton row-skeleton"></div><div class="skeleton row-skeleton"></div><div class="skeleton row-skeleton"></div></div></section>`;
}
function errorPaper() {
  return `<section class="paper state-paper"><div class="empty-icon">${icon('warning')}</div><p class="eyebrow">Home unavailable</p><h2>Your brief couldn’t load.</h2><p role="alert">We couldn’t retrieve your work. Try again, or open Tasks while the connection recovers.</p><div class="actions">${button('Try again '+icon('refresh'),'retry','primary')}${external('Open Tasks','/tasks','text')}</div></section>`;
}
function waitingPaper() {
  if (mode === 'empty') return `<article class="paper state-paper"><div class="empty-icon">${icon('time')}</div><h2>Nothing waiting here.</h2><p>Blocked work appears here with its reason and any agreed follow-up date.</p>${button('Back to today','tab:today','text')}</article>`;
  return `<article class="paper waiting-paper"><div class="row paper-meta"><span class="eyebrow">Waiting / client decisions</span>${pill('1 item')}</div><h2>Give the decision room.</h2><p>Keep external waits visible without making them today’s top action.</p><section class="waiting-record"><p class="eyebrow">Roof Safety</p><h3>Await their internal decision.</h3><p>Roof Safety asked for website and advertising ideas for two companies. They’ll speak with their boss before deciding.</p><dl class="fact-list"><div><dt>Task status</dt><dd>Blocked</dd></div><div><dt>Waiting on</dt><dd>Their internal decision</dd></div><div><dt>Follow-up date</dt><dd>Not agreed</dd></div></dl><div class="actions"><a class="btn primary" href="${concept('inbox')}">Read the context ${icon('arrow')}</a>${external('Open Tasks','/tasks','text')}</div></section></article>`;
}
function notesPaper() {
  return `<article class="paper notes-paper"><div class="row paper-meta"><span class="eyebrow">Captured / working notes</span>${pill(note ? 'Review pending' : 'No notes')}</div><h2>${note ? 'A thought worth sorting.' : 'A place for loose ends.'}</h2><p>${note ? 'Keep it as a note, or review what should become a task.' : 'Get the thought down before it interrupts the work. You choose what becomes a task.'}</p>${note ? `<p class="note-preview">${escape(note)}</p>` : ''}<div class="actions">${button(note ? 'Review note' : 'Capture a thought','capture','primary','aria-haspopup="dialog"')}</div>${localRows()}</article>`;
}
function margin() {
  if (mode === 'loading' || mode === 'error') return `<aside class="margin"><section class="pinned"><p class="eyebrow">Your workspace</p><h2>The work has a home.</h2><p>Tasks, Inbox and Outbound remain accessible from navigation.</p></section></aside>`;
  return `<aside class="margin" aria-label="Supporting context">${mode === 'empty' ? `<section class="pinned"><p class="eyebrow">A clear desk</p><h2>Choose what matters next.</h2><p>Your next action can begin with a task or a thought. There’s no need to fill every space.</p>${external('Open Tasks','/tasks','text')}</section>` : `<section class="pinned"><p class="eyebrow">Waiting on someone else</p><h2>Roof Safety’s<br>next move.</h2><p>They’re reviewing websites and advertising internally. The decision is with them.</p><span class="wait-stamp">${icon('time')}No follow-up date agreed</span>${button('Read the context '+icon('arrow'),'waiting','text','aria-haspopup="dialog"')}</section>`}
    <section class="aside-section" aria-labelledby="outbound-heading"><div class="row"><h2 id="outbound-heading">Outbound snapshot</h2><button class="icon-button" data-action="source" aria-label="About the Outbound snapshot" aria-haspopup="dialog">${icon('info')}</button></div><dl class="metric-row"><div><dt>Sent that day</dt><dd>162</dd></div><div><dt>Reply rate</dt><dd>1.3%</dd></div></dl><p class="source-note"><strong>Instantly · 8 September</strong>Last snapshot at 18:27 AEST</p><p class="source-status">${icon('info')}Check current sending status in Outbound.</p></section>
    <section class="aside-section" aria-labelledby="inbox-heading"><div class="row"><h2 id="inbox-heading">In the Inbox</h2><span class="small">Retained items</span></div><div class="queue-counts">${[['Agents',4],['Instantly',50],['Leads',33]].map(([name,count]) => `<a href="${concept('inbox')}" aria-label="${name}, ${count} retained items, open Inbox"><span>${name}</span><strong>${count}</strong></a>`).join('')}</div></section>
  </aside>`;
}
function content() {
  if (mode === 'loading') return loadingPaper();
  if (mode === 'error') return errorPaper();
  return activeTab === 'waiting' ? waitingPaper() : activeTab === 'notes' ? notesPaper() : mode === 'empty' ? emptyPaper() : briefPaper();
}
function render(focusId) {
  app.innerHTML = `<div class="shell"><aside class="side"><a class="brand" href="home.html" aria-label="Compass Home">${brand}</a><nav aria-label="Primary">${navigation()}</nav><div class="side-foot">${navLink(['Settings','settings',live+'/settings'])}<div class="profile"><span class="avatar">JH</span><div>Jules<small>Switchflow</small></div></div></div></aside><div class="workspace"><header class="top"><div class="location">Switchflow <span>/</span> Your day</div><a class="brand mobile-brand" href="home.html" aria-label="Compass Home">${brand}</a><div class="top-right"><span class="small">Tuesday, 8 September</span><span class="avatar">JH</span><button class="icon-button" id="workspace-menu" data-action="menu" aria-label="Open workspace navigation" aria-haspopup="dialog">${icon('menu')}</button></div></header>
    <main class="main" id="main" tabindex="-1"><div class="page-head"><div><h1>A little more clarity.</h1><p>Tuesday, 8 September · Your working day</p></div>${button(icon('plus')+'<span class="capture-label">Capture a thought</span>','capture','','id="capture-top" aria-label="Capture a thought" aria-haspopup="dialog"')}</div>
    ${mode === 'refresh-error' ? `<div class="notice" role="alert">${icon('warning')}<div><strong>Home couldn’t refresh.</strong><p>Your last snapshot is still here. Check the connection and try again.</p></div>${button('Retry '+icon('refresh'),'retry','','id="retry-refresh"')}</div>` : ''}
    <div class="folder-nav" role="tablist" aria-label="Home folders">${[['today',"Today’s brief"],['waiting','Waiting'],['notes','Captured']].map(([id,label]) => `<button class="folder-tab" id="tab-${id}" role="tab" aria-selected="${activeTab === id}" aria-controls="folder-panel" tabindex="${activeTab === id ? 0 : -1}" data-action="tab:${id}">${label}${id === 'waiting' && !['empty','loading','error'].includes(mode) ? '<span class="tab-count">1</span>' : id === 'notes' && note ? '<span class="tab-count" aria-label="note waiting">•</span>' : ''}</button>`).join('')}</div>
    <div class="home-layout"><div id="folder-panel" role="tabpanel" aria-labelledby="tab-${activeTab}" tabindex="0">${content()}</div>${margin()}</div>
    <footer class="prototype-footer"><span>Folio Home reference · 8 September snapshot · local interactions only</span><a href="index.html" target="_top">Review sizes & states ${icon('arrow')}</a></footer></main></div></div>
    <nav class="mobile-nav" aria-label="Mobile primary"><a href="home.html" aria-current="page">${icon('home')}Home</a><a href="${concept('inbox')}">${icon('inbox')}Inbox</a><a href="${concept('outbound')}">${icon('outbound')}Outbound</a><button id="mobile-more" data-action="menu" aria-haspopup="dialog">${icon('menu')}More</button></nav>`;
  if (focusId) document.getElementById(focusId)?.focus({preventScroll:true});
}
function show(title, body, initialSelector = '.close', className = '') {
  if (!dialog.open) {
    const current = document.activeElement;
    returnFocus = {node:current,id:current?.id,action:current?.dataset?.action,text:current?.textContent};
  }
  dialog.className = className;
  dialogContent.innerHTML = `<p class="eyebrow dialog-label">Compass / Your day</p><h2 class="dialog-title" id="dialog-title">${title}</h2>${body}`;
  if (!dialog.open) {dialog.showModal();document.body.classList.add('modal-open');}
  dialog.querySelector(initialSelector)?.focus({preventScroll:true});
}
dialog.addEventListener('close', () => {
  const captureField = dialog.querySelector('#capture-input');
  if(captureField){note=captureField.value;saveDraft();render();}
  document.body.classList.remove('modal-open');
  const replacement = [...app.querySelectorAll('[data-action]')].find(el => el.dataset.action === returnFocus?.action && el.textContent === returnFocus?.text);
  const el = returnFocus?.node?.isConnected ? returnFocus.node : document.getElementById(returnFocus?.id || '') || replacement || document.querySelector('#capture-top');
  el?.focus({preventScroll:true});
});
function briefDialog() {
  show('Today’s brief', `<p class="dialog-intro">Review existing installation candidates and finish one precise draft.</p><div class="dialog-note"><h3>Prepare and validate.</h3><p>Start with existing Sydney companies. Check relevance and previous contact before assigning a qualified cohort. Copy and opener review are still outstanding.</p></div><p class="dialog-copy">Smart Handy is followed up. Roof Safety awaits an internal decision. Signing awaits a payment connection.</p><details><summary class="btn text">Campaign proposal and current next</summary><p class="dialog-copy">Recommended: Sydney Locksmith | 65 | Sep.</p><p class="dialog-copy">The snapshot also contains Sydney Hvac, Melbourne Plumber and HVAC | AU | 50 | capture 24 aug. Review the campaign context before changing next.</p></details>${decision === 'proposed' ? `<div class="actions dialog-actions">${button('Accept brief','accept','primary')}${button('Dismiss proposal','dismiss')}</div><p class="dialog-foot">Acceptance resolves today’s proposal. It does not activate a campaign. This reference simulates the decision locally.</p>` : `<div class="notice ${decision === 'accepted' ? 'success' : 'neutral'}"><div>Brief ${decision}. ${decision === 'dismissed' ? 'Previous next campaigns are retained.' : 'Continue with candidate and copy review.'}</div></div><div class="actions dialog-actions">${button('Back to Home','close','primary')}</div><p class="dialog-foot">Decision shown only in this reference.</p>`}`);
}
function captureDialog(error = '') {
  show('Capture a thought', `<p class="dialog-intro">Write freely. Keep it as a note, or choose what becomes a task.</p><label class="field-label" for="capture-input">What’s on your mind?</label><textarea id="capture-input" aria-describedby="capture-help${error ? ' capture-error' : ''}" ${error ? 'aria-invalid="true"' : ''} placeholder="A thought, a loose end, something to come back to…">${escape(note)}</textarea><p id="capture-help" class="field-help">One thought per line helps when you review. Draft kept in this browser tab.</p>${error ? `<p class="field-error" id="capture-error" role="alert">${error}</p>` : ''}<div class="actions dialog-actions">${button('Review as tasks','organize','primary')}${button('Keep as a note','keep-note')}</div><p class="dialog-foot">Local preview. Nothing is added to live Compass.</p>`, '#capture-input');
}
function saveDraft() { try {sessionStorage.setItem(key,note);} catch {} }
function reviewTasks() {
  const suggestions = note.split('\n').map(s=>s.trim()).filter(Boolean);
  selected = new Set(suggestions.map((_,i)=>i));
  show('Choose what becomes work.', `<p class="dialog-intro">Review each thought before adding it to Tasks.</p><ul class="check-list">${suggestions.map((title,i)=>`<li><label class="check-label"><input type="checkbox" name="task-selection" value="${i}" checked><span>${escape(title)}</span></label></li>`).join('')}</ul><p id="selection-summary" class="small">${suggestions.length} selected</p><p id="selection-error" class="field-error" role="alert" hidden></p><div class="actions dialog-actions">${button('Add selected tasks','add-tasks','primary','id="add-selected"')}${button('Edit note','capture')}</div><p class="dialog-foot">This preview uses each line as a task title. Production retains Compass’s existing reorganise-and-select flow.</p>`);
}
function setTab(id, focus = true) { activeTab=id;render(focus?'tab-'+id:undefined); }
async function retry() {
  const prior = mode;
  const retryButton = app.querySelector('[data-action="retry"]');
  if (busy) return;
  busy=true;
  if (retryButton) {retryButton.disabled=true;retryButton.textContent='Retrying…';retryButton.setAttribute('aria-busy','true');}
  announce('Retrying Home.');
  await new Promise(resolve=>setTimeout(resolve,650));
  mode='ready';busy=false;render('tab-today');
  announce(prior==='refresh-error' ? 'Retry complete. Showing the available reference snapshot.' : 'Home loaded. The daily brief is ready to review.');
}
document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || trigger.disabled) return;
  const action = trigger.dataset.action;
  if(action==='close') {dialog.close();return;}
  if(action.startsWith('tab:')) {setTab(action.split(':')[1]);return;}
  if(action==='brief') {briefDialog();return;}
  if(action==='accept'||action==='dismiss') {
    if (mode==='save-error') {
      let error=dialog.querySelector('#decision-error');
      if(!error){error=document.createElement('div');error.id='decision-error';error.className='notice';error.setAttribute('role','alert');dialog.querySelector('.dialog-actions').before(error);}
      error.textContent='The decision couldn’t save. Your brief is unchanged. Try again when the connection recovers.';
      trigger.textContent=action==='accept'?'Retry acceptance':'Retry dismissal';
      mode='ready';return;
    }
    decision=action==='accept'?'accepted':'dismissed';
    render();dialog.close();announce(`Brief ${decision} in this preview.`);return;
  }
  if(action==='retry') {await retry();return;}
  if(action==='capture') {captureDialog();return;}
  if(action==='organize'||action==='keep-note') {
    note=dialog.querySelector('#capture-input').value;saveDraft();
    if(!note.trim()){captureDialog('Write a thought before continuing.');return;}
    if(action==='organize'){reviewTasks();return;}
    render();dialog.close();announce('Note kept. Review it from Captured.');return;
  }
  if(action==='add-tasks') {
    if(!selected.size){const err=dialog.querySelector('#selection-error');err.hidden=false;err.textContent='Choose at least one task, or go back to your note.';dialog.querySelector('input')?.focus();return;}
    const titles=note.split('\n').map(s=>s.trim()).filter(Boolean);
    const chosen=titles.filter((_,i)=>selected.has(i));
    localTasks.push(...chosen.map((title)=>({title,status:'not-started',priority:3,notes:'From capture · local reference'})));
    note=titles.filter((_,i)=>!selected.has(i)).join('\n');saveDraft();render();
    show(`${chosen.length} task${chosen.length===1?'':'s'} added.`, `<div class="status-symbol">${icon('check')}</div><p class="dialog-intro">Your selected thoughts are now in Captured work.</p><ul class="saved-list">${chosen.map(title=>`<li>${escape(title)}</li>`).join('')}</ul><div class="actions dialog-actions">${button('Back to Home','close','primary')}</div><p class="dialog-foot">Saved for this preview only. No live task created.</p>`);
    announce(`${chosen.length} tasks added in this preview.`);return;
  }
  if(action.startsWith('task:')) {
    const index=Number(action.split(':')[1]),task=localTasks[index];task.status=task.status==='completed'?'not-started':'completed';render();
    app.querySelector(`[data-action="task:${index}"]`)?.focus({preventScroll:true});announce(`${task.title}: ${task.status==='completed'?'completed':'reopened'}.`);return;
  }
  if(action==='menu') {
    show('Your workspace', `<nav class="nav-columns" aria-label="All destinations">${navigation()}<div class="nav-group"><p class="eyebrow">Workspace</p>${navLink(['Settings','settings',live+'/settings'])}</div></nav><p class="dialog-foot">Home is the current reference. Inbox and Outbound open the earlier Folio concepts; other destinations open existing Compass.</p>`, '.close', 'nav-dialog');return;
  }
  if(action==='calendar') {
    show('Campaign calendar', `<p class="dialog-intro">Review campaign dates and the sending plan.</p><p class="dialog-copy">The current Calendar lives inside Outbound. Open Outbound and choose Calendar from its view switcher.</p><div class="actions dialog-actions">${external('Open Outbound','/sales/outbound','primary')}${button('Back to Home','close','text')}</div>`);return;
  }
  if(action==='waiting') {
    show('Roof Safety’s next move.', `<p class="dialog-intro">The conversation happened. Roof Safety asked for website and advertising ideas for two companies, and will speak with their boss before deciding.</p><dl class="fact-list"><div><dt>Task status</dt><dd>Blocked</dd></div><div><dt>Follow-up date</dt><dd>Not agreed</dd></div></dl><div class="dialog-note"><h3>Waiting stays separate.</h3><p>There is no agreed action date to put at the top of today’s work.</p></div><div class="actions dialog-actions"><a class="btn primary" href="${concept('inbox')}">Open the context ${icon('arrow')}</a>${button('Back to Home','close','text')}</div><p class="dialog-foot">Source: the 8 September task snapshot.</p>`);return;
  }
  if(action==='inventory') {
    show('Review existing candidates.', `<p class="dialog-intro">Start with Greater Sydney residential ducted installation and replacement companies.</p><div class="dialog-note"><h3>Check before assigning a cohort.</h3><p>Confirm the published homeowner quote journey, source evidence and previous contact. Research fit is not sales qualification.</p></div><p class="dialog-copy">Qualified cohort assignment and final review remain outstanding.</p><div class="actions dialog-actions">${external('Open CRM','/leads','primary')}<a class="btn text" href="${concept('editor')}">Continue draft ${icon('arrow')}</a></div>`);return;
  }
  if(action==='payment') {
    show('Connect the payment details.', `<p class="dialog-intro">Signing awaits a payment connection and verified receiving instructions.</p><div class="dialog-note"><h3>Resolve the receiving instructions.</h3><p>Check the current connection and account details before sending an agreement for signing.</p></div><div class="actions dialog-actions">${external('Open Settings','/settings','primary')}${button('Back to Home','close','text')}</div><p class="dialog-foot">No payment details or connection status have been inferred beyond the saved brief.</p>`);return;
  }
  if(action==='source') {
    show('A snapshot, with its source.', `<p class="dialog-intro">Instantly reported 162 sent that day and a 1.3% reply rate in the snapshot from 8 September at 18:27 AEST.</p><div class="dialog-note"><h3>Check current sending status.</h3><p>The later Outbound view did not show live campaigns. Open Outbound before acting on the sending state.</p></div><p class="dialog-copy">Inbox counts are retained items by source. They are not a count of new unread replies.</p><div class="actions dialog-actions"><a class="btn primary" href="${concept('outbound')}">Open Outbound ${icon('arrow')}</a>${button('Back to Home','close','text')}</div>`);
  }
});
document.addEventListener('input', event => {
  if(event.target.id==='capture-input'){note=event.target.value;saveDraft();event.target.removeAttribute('aria-invalid');const err=document.querySelector('#capture-error');if(err)err.hidden=true;}
});
document.addEventListener('change', event => {
  if(event.target.name==='task-selection') {
    const n=Number(event.target.value);event.target.checked?selected.add(n):selected.delete(n);
    document.querySelector('#selection-summary').textContent=`${selected.size} selected`;
  }
});
document.addEventListener('keydown', event => {
  if (dialog.open && event.key === 'Tab') {
    const items=[...dialog.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    return;
  }
  if(!event.target.matches('[role="tab"]'))return;
  const tabs=['today','waiting','notes'],index=tabs.indexOf(activeTab);
  const next=event.key==='ArrowRight'?tabs[(index+1)%3]:event.key==='ArrowLeft'?tabs[(index+2)%3]:event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:null;
  if(next){event.preventDefault();setTab(next);}
});
render();
