(() => {
  'use strict';
  const BASE_DATA = window.JEE_RUSH_DATA || [];
  let DATA = [];
  const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];
  const SUBJECT_META = {
    Physics: { short: 'PHY', icon: 'ϟ', color: 'physics', description: '20 chapters in your supplied sequence.' },
    Chemistry: { short: 'CHEM', icon: '⚗', color: 'chemistry', description: '19 chapters in your supplied sequence.' },
    Mathematics: { short: 'MATHS', icon: '∑', color: 'mathematics', description: '15 chapters in your supplied sequence.' }
  };
  const STORAGE_KEY = 'jee-rush-os-v2';
  const DEFAULT_START_DATE = '2026-11-29';
  const DEFAULT_SETTINGS = {
    displayName: '', startDate: DEFAULT_START_DATE, rotation: 'Physics,Chemistry,Mathematics', lecturesPerDay: 1,
    theme: 'dark', accent: '#ff9d42', density: 'comfortable', textSize: 'standard', dateFormat: 'long',
    showStats: true, showSubjectCards: true, showUpcoming: true, upcomingCount: 4, showChapterNumbers: true,
    animations: true, openLinksNewTab: true, confirmReset: true
  };
  let activeView = 'dashboard';
  let activeFilter = 'All';
  let searchQuery = '';
  let syncTimer = null;
  let toastTimer = null;
  let cloudReady = false;
  let currentUser = null;
  let activatingUserId = null;
  let supabaseClient = null;
  let cloudChannel = null;

  const $ = (id) => document.getElementById(id);
  const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateObj = (iso) => new Date(`${iso}T12:00:00`);
  const fmtDate = (iso, options = null) => {
    if (!iso) return '';
    if (options) return dateObj(iso).toLocaleDateString('en-IN', options);
    const format = state?.settings?.dateFormat || 'long';
    if (format === 'iso') return iso;
    if (format === 'short') return dateObj(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    return dateObj(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const addDays = (iso, days) => { const d = dateObj(iso); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const fmtShortDate = (iso) => dateObj(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
  const fmtWeekday = (iso) => dateObj(iso).toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16)});

  function loadState(key = STORAGE_KEY) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.progress) return { progress: parsed.progress, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }, updatedAt: parsed.updatedAt || 0 };
      }
    } catch (e) { console.warn('Could not load saved progress', e); }
    return { progress: {}, settings: { ...DEFAULT_SETTINGS }, updatedAt: 0 };
  }
  let state = loadState();
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };

  function rebuildSchedule() {
    const settings = state.settings || DEFAULT_SETTINGS;
    const queues = Object.fromEntries(SUBJECTS.map(subject => [subject, BASE_DATA.filter(x => x.subject === subject).sort((a,b) => a.chapterNo - b.chapterNo)]));
    const requested = String(settings.rotation || DEFAULT_SETTINGS.rotation).split(',').map(x => x.trim());
    const rotation = requested.length === 3 && new Set(requested).size === 3 && requested.every(x => SUBJECTS.includes(x)) ? requested : SUBJECTS;
    const positions = Object.fromEntries(SUBJECTS.map(subject => [subject, 0]));
    const scheduled = [];
    let pointer = 0;
    const perDay = Math.max(1, Math.min(3, Number(settings.lecturesPerDay) || 1));
    const start = /^\d{4}-\d{2}-\d{2}$/.test(settings.startDate || '') ? settings.startDate : DEFAULT_START_DATE;
    while (scheduled.length < BASE_DATA.length) {
      for (let slot = 0; slot < perDay && scheduled.length < BASE_DATA.length; slot++) {
        let picked = null;
        for (let tries = 0; tries < rotation.length; tries++) {
          const subject = rotation[pointer % rotation.length];
          pointer++;
          if (positions[subject] < queues[subject].length) {
            picked = queues[subject][positions[subject]++];
            break;
          }
        }
        if (!picked) break;
        scheduled.push({ ...picked, date: addDays(start, Math.floor(scheduled.length / perDay)) });
      }
    }
    DATA = scheduled;
  }
  const DEFAULT_SUPABASE = {
    url: 'https://bztsnkejidzjjlaghtly.supabase.co',
    key: 'sb_publishable_Cef2U5pCDcDJp9DUpe36KA_8DrAetWc'
  };
  const stateStorageKey = () => currentUser ? `${STORAGE_KEY}:${currentUser.id}` : STORAGE_KEY;
  const hasLocalState = (key) => { try { return !!localStorage.getItem(key); } catch { return false; } };
  function saveLocalState() {
    try { localStorage.setItem(stateStorageKey(), JSON.stringify(state)); }
    catch (e) { showToast('Could not save locally. Export a backup.'); }
  }
  function progressFor(item) {
    const p = state.progress[item.id] || {};
    return { lecture: !!p.lecture, practice: !!p.practice };
  }
  function isComplete(item) { const p = progressFor(item); return p.lecture && p.practice; }
  function counts() {
    let lecture = 0, practice = 0, complete = 0;
    DATA.forEach(item => { const p = progressFor(item); if (p.lecture) lecture++; if (p.practice) practice++; if (p.lecture && p.practice) complete++; });
    return { lecture, practice, complete, total: DATA.length, percent: DATA.length ? Math.round(complete / DATA.length * 100) : 0 };
  }
  function persist(scheduleSync = true) {
    state.updatedAt = Date.now();
    saveLocalState();
    renderAll();
    if (scheduleSync && currentUser) scheduleCloudSync();
  }
  function showToast(message) {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function subjectClass(subject) { return subject.toLowerCase(); }
  function pill(subject) { return `<span class="subject-pill ${subjectClass(subject)}">${escapeHtml(SUBJECT_META[subject].short)}</span>`; }
  function checksMarkup(item, compact = false) {
    const p = progressFor(item);
    return `<div class="chapter-checks">
      <label class="task-check"><input type="checkbox" data-check="lecture" data-id="${item.id}" ${p.lecture?'checked':''}><span>${compact?'Lecture':'Lecture complete'}</span></label>
      <label class="task-check"><input type="checkbox" data-check="practice" data-id="${item.id}" ${p.practice?'checked':''}><span>${compact?'Practice':'Question practice'}</span></label>
    </div>`;
  }
  function rowMarkup(item, options = {}) {
    const p = progressFor(item);
    const index = String(item.chapterNo).padStart(2,'0');
    const compact = !!options.compact;
    const schedule = options.schedule || false;
    return `<article class="chapter-row ${compact?'compact-row':''}" data-item="${item.id}">
      <div class="chapter-index">${index}</div>
      <div class="chapter-main"><div class="chapter-title">${escapeHtml(item.chapter)}</div><div class="chapter-subline">${pill(item.subject)} <span>·</span> <span>${fmtDate(item.date)}</span></div></div>
      <div class="chapter-actions">${checksMarkup(item, compact)}<a class="video-link" href="${item.url}" target="${state.settings.openLinksNewTab ? '_blank' : '_self'}" rel="noopener noreferrer" title="Open supplied YouTube lecture">▶ Open lecture ↗</a></div>
    </article>`;
  }
  function scheduleMarkup(item) {
    const p = progressFor(item); const done = p.lecture && p.practice;
    return `<article class="schedule-day" data-item="${item.id}">
      <div class="schedule-date"><strong>${fmtShortDate(item.date)}</strong><small>${fmtWeekday(item.date)} · ${fmtDate(item.date)}</small></div>
      <div class="schedule-detail"><div class="chapter-title">${escapeHtml(item.chapter)}</div><div class="chapter-subline">${pill(item.subject)} <span>·</span> Chapter ${String(item.chapterNo).padStart(2,'0')}</div></div>
      <div class="schedule-task-status">${checksMarkup(item,true)}<span class="${done?'complete-badge':'pending-badge'}">${done?'COMPLETE':'IN PROGRESS'}</span><a class="video-link" href="${item.url}" target="${state.settings.openLinksNewTab ? '_blank' : '_self'}" rel="noopener noreferrer">▶ ↗</a></div>
    </article>`;
  }
  function nextItem() {
    const sorted = [...DATA].sort((a,b) => a.date.localeCompare(b.date));
    const today = isoToday();
    return sorted.find(item => !isComplete(item) && item.date >= today) || sorted.find(item => !isComplete(item)) || sorted[sorted.length-1];
  }
  function renderStats() {
    const c = counts();
    $('overallPercent').textContent = `${c.percent}%`;
    $('overallCount').textContent = `${c.complete} / ${c.total} chapters`;
    $('overallBar').style.width = `${c.percent}%`;
    $('lectureCount').textContent = c.lecture;
    $('lectureBar').style.width = `${c.lecture / c.total * 100}%`;
    $('practiceCount').textContent = c.practice;
    $('practiceBar').style.width = `${c.practice / c.total * 100}%`;
  }
  function renderFocus() {
    const item = nextItem();
    if (!item) { $('focusCard').innerHTML = '<div class="empty-state">No chapters found.</div>'; return; }
    const today = isoToday();
    const dateLabel = item.date === today ? 'Planned for today' : item.date > today ? `Upcoming · ${fmtDate(item.date)}` : `Next incomplete · originally planned ${fmtDate(item.date)}`;
    const p = progressFor(item);
    $('focusHeading').textContent = item.date === today ? 'Today’s lecture' : 'Your next lecture';
    $('focusCard').innerHTML = `<div class="focus-left"><div class="focus-meta">${pill(item.subject)}<span class="date-pill">${fmtDate(item.date)}</span></div><h3 class="focus-title">${escapeHtml(item.chapter)}</h3><p class="focus-date">${dateLabel} · Chapter ${String(item.chapterNo).padStart(2,'0')}</p><div class="check-row">${checksMarkup(item,false)}</div></div><div class="focus-actions"><a class="primary-button" href="${item.url}" target="${state.settings.openLinksNewTab ? '_blank' : '_self'}" rel="noopener noreferrer">▶ Open lecture <span>↗</span></a><button class="secondary-button" data-go="curriculum">View chapter list</button></div>`;
  }
  function renderSubjectCards() {
    $('subjectCards').innerHTML = SUBJECTS.map(subject => {
      const items = DATA.filter(x => x.subject === subject); const c = { lecture:0, practice:0, complete:0 };
      items.forEach(item => { const p=progressFor(item); if(p.lecture)c.lecture++; if(p.practice)c.practice++; if(p.lecture&&p.practice)c.complete++; });
      const meta = SUBJECT_META[subject]; const pct = Math.round(c.complete/items.length*100);
      return `<button class="subject-card" data-subject-open="${subject}"><div class="subject-card-top"><span class="subject-icon ${meta.color}">${meta.icon}</span><span class="subject-count">${String(items.length).padStart(2,'0')} CHAPTERS</span></div><h3>${subject}</h3><p>${meta.description}</p><div class="mini-track"><span style="width:${pct}%;background:${subject==='Physics'?'var(--accent)':subject==='Chemistry'?'var(--green)':'var(--blue)'}"></span></div><div class="subject-foot"><span>${c.complete} complete</span><span>${pct}%</span></div></button>`;
    }).join('');
  }
  function renderUpcoming() {
    const today = isoToday();
    const sorted = [...DATA].sort((a,b) => a.date.localeCompare(b.date));
    let items = sorted.filter(x => x.date >= today && !isComplete(x));
    if (!items.length) items = sorted.filter(x => !isComplete(x));
    items = items.slice(0, Math.max(1, Math.min(12, Number(state.settings.upcomingCount) || 4)));
    $('upcomingList').innerHTML = items.length ? items.map(x => rowMarkup(x,{compact:true})).join('') : '<div class="empty-state">Every chapter is complete. Excellent work.</div>';
  }
  function renderCurriculum() {
    const query = searchQuery.trim().toLowerCase();
    const filtered = DATA.filter(item => (activeFilter === 'All' || item.subject === activeFilter) && (!query || `${item.chapter} ${item.subject} ${item.chapterNo}`.toLowerCase().includes(query)));
    const subjects = activeFilter === 'All' ? SUBJECTS : [activeFilter];
    $('curriculumGroups').innerHTML = subjects.map(subject => {
      const items = filtered.filter(x => x.subject === subject);
      if (!items.length) return '';
      const all = DATA.filter(x => x.subject === subject); const done = all.filter(isComplete).length;
      return `<section class="curriculum-group"><div class="group-heading"><div class="group-heading-left"><span class="subject-icon ${SUBJECT_META[subject].color}">${SUBJECT_META[subject].icon}</span><div><h2>${subject}</h2><small>${all.length} chapters · original order</small></div></div><span class="group-progress">${done} / ${all.length} COMPLETE</span></div><div class="chapter-list">${items.map(x=>rowMarkup(x)).join('')}</div></section>`;
    }).join('') || '<div class="table-card"><div class="empty-state">No chapters match your search.</div></div>';
  }
  function renderSchedule() {
    const q = ($('scheduleSearch')?.value || '').trim().toLowerCase(); const status = $('scheduleStatus')?.value || 'all';
    const sorted = [...DATA].sort((a,b)=>a.date.localeCompare(b.date));
    const filtered = sorted.filter(item => {
      const match = `${item.chapter} ${item.subject} ${item.date}`.toLowerCase().includes(q);
      const done = isComplete(item);
      return match && (status === 'all' || (status === 'complete' ? done : !done));
    });
    $('scheduleList').innerHTML = filtered.length ? filtered.map(scheduleMarkup).join('') : '<div class="empty-state">No scheduled chapters match these filters.</div>';
  }
  function applySettings() {
    const s = state.settings || DEFAULT_SETTINGS;
    const chosenTheme = s.theme === 'system' ? ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark') : (s.theme || 'dark');
    document.body.dataset.theme = chosenTheme;
    document.body.dataset.density = s.density || 'comfortable';
    document.body.dataset.textSize = s.textSize || 'standard';
    document.body.classList.toggle('no-motion', !s.animations);
    document.body.classList.toggle('hide-chapter-numbers', !s.showChapterNumbers);
    document.documentElement.style.setProperty('--accent', s.accent || DEFAULT_SETTINGS.accent);
    const accentMap = { '#ff9d42':'#ffc06f', '#7c83ff':'#aeb2ff', '#4bbf9b':'#86e0c4', '#55a7ff':'#9bcaff', '#ef6b9a':'#ffabc5', '#c28aff':'#ddbbff', '#e0b341':'#f5d778' };
    document.documentElement.style.setProperty('--accent-2', accentMap[s.accent] || s.accent || DEFAULT_SETTINGS.accent);
    $('statsGrid').hidden = !s.showStats;
    $('subjectBreakdownSection').hidden = !s.showSubjectCards;
    $('subjectCards').hidden = !s.showSubjectCards;
    $('upcomingSection').hidden = !s.showUpcoming;
    $('upcomingTable').hidden = !s.showUpcoming;
    $('upcomingSectionLabel').textContent = `Showing next ${s.upcomingCount} chapters`;
    const greeting = s.displayName.trim() ? `Keep the streak moving, ${s.displayName.trim()}.` : 'Keep the streak moving.';
    $('dashboardGreeting').textContent = greeting;
    $('dashboardStartDate').textContent = `${fmtShortDate(s.startDate)} ${dateObj(s.startDate).getFullYear()}`;
    $('sidebarStartDate').textContent = fmtDate(s.startDate);
    $('scheduleDays').textContent = String(Math.ceil(DATA.length / Math.max(1, Number(s.lecturesPerDay) || 1)));
    $('scheduleSubheading').textContent = `Starts ${fmtDate(s.startDate)} · ${s.lecturesPerDay} lecture${Number(s.lecturesPerDay) === 1 ? '' : 's'} per day · ${String(s.rotation).replaceAll(',', ' → ')}.`;
  }
  function renderAll() { applySettings(); renderStats(); renderFocus(); renderSubjectCards(); renderUpcoming(); renderCurriculum(); renderSchedule(); }
  function setView(view) {
    activeView = view;
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${view}View`));
    document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    $('breadcrumbCurrent').textContent = view.charAt(0).toUpperCase()+view.slice(1);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function toggleCheck(id, key, checked) {
    if (!state.progress[id]) state.progress[id] = {};
    state.progress[id][key] = checked;
    persist(true);
  }
  function updateSyncIndicator(text, mode='') {
    const el = $('syncStatus');
    if (el) { el.className = `sync-indicator ${mode}`; el.innerHTML = `<span class="status-dot"></span> ${escapeHtml(text)}`; }
    const footer = $('footerSaveStatus');
    if (footer) footer.textContent = mode === 'error' ? 'Cloud sync needs attention.' : mode === 'syncing' ? 'Syncing progress…' : currentUser ? 'Signed in · cloud sync enabled.' : 'Sign in to sync your progress.';
  }
  function setSettingsStatus(text, mode='') { const el=$('settingsStatus'); if(el){el.textContent=text;el.className=`inline-status ${mode}`;} }
  function showAuthMessage(text, mode='') {
    const el = $('authMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `auth-message ${mode}`;
    el.hidden = !text;
  }
  function setAuthMode(mode) {
    const signup = mode === 'signup';
    $('authMode').value = mode;
    $('authTitle').textContent = signup ? 'Create your account.' : 'Welcome back.';
    $('authSubtitle').textContent = signup ? 'Your progress will follow you across PC and Android.' : 'Sign in to continue your JEE preparation.';
    $('authSubmit').textContent = signup ? 'Create account' : 'Log in';
    $('authModeToggle').textContent = signup ? 'Already have an account? Log in' : 'New here? Create an account';
    $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
    $('forgotPassword').hidden = signup;
    showAuthMessage('');
  }
  function authErrorMessage(error) {
    const msg = String(error?.message || 'Something went wrong. Please try again.');
    if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
    if (/email not confirmed/i.test(msg)) return 'Verify your email using the confirmation link, then log in.';
    if (/user already registered/i.test(msg)) return 'An account with this email already exists. Log in instead.';
    if (/password should be at least/i.test(msg)) return 'Use a password that meets the minimum length requirement.';
    return msg;
  }
  async function submitAuth(event) {
    event.preventDefault();
    const mode = $('authMode').value;
    const email = $('authEmail').value.trim().toLowerCase();
    const password = $('authPassword').value;
    if (!email || !password) { showAuthMessage('Enter your email and password.', 'error'); return; }
    const button = $('authSubmit'); button.disabled = true; button.textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';
    showAuthMessage('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) await activateSession(data.session);
        else showAuthMessage('Account created. Verify your email if prompted, then log in with the same account on PC and Android.', 'success');
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await activateSession(data.session);
      }
    } catch (error) {
      showAuthMessage(authErrorMessage(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = $('authMode').value === 'signup' ? 'Create account' : 'Log in';
    }
  }
  async function requestPasswordReset() {
    const email = $('authEmail').value.trim().toLowerCase();
    if (!email) { showAuthMessage('Enter your email address first.', 'error'); $('authEmail').focus(); return; }
    const button = $('forgotPassword'); button.disabled = true;
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
      if (error) throw error;
      showAuthMessage('If an account exists for this email, a password reset link will be sent. Check your inbox.', 'success');
    } catch (error) { showAuthMessage(authErrorMessage(error), 'error'); }
    finally { button.disabled = false; }
  }
  async function activateSession(session) {
    if (!session?.user) return;
    if (activatingUserId === session.user.id) return;
    if (currentUser?.id === session.user.id && cloudReady) return;
    activatingUserId = session.user.id;
    currentUser = session.user;
    const accountKey = stateStorageKey();
    const hadAccountState = hasLocalState(accountKey);
    state = loadState(accountKey);
    state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    // Migrate existing guest-only progress into the first account on this device.
    if (!hadAccountState && hasLocalState(`jee-rush-os-v1:${session.user.id}`)) state = loadState(`jee-rush-os-v1:${session.user.id}`);
    else if (!hadAccountState && hasLocalState('jee-rush-os-v1')) state = loadState('jee-rush-os-v1');
    state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    rebuildSchedule();
    document.body.classList.add('authenticated');
    $('authScreen').hidden = true;
    updateSyncIndicator('Loading cloud progress…', 'syncing');
    renderAll();
    try { await syncCloud({ initial: true }); subscribeCloudRealtime(); } finally { activatingUserId = null; }
  }
  async function syncCloud(options = {}) {
    if (!supabaseClient || !currentUser) return false;
    clearTimeout(syncTimer);
    syncTimer = null;
    updateSyncIndicator('Syncing progress…', 'syncing');
    try {
      const { data: remote, error } = await supabaseClient
        .from('jee_rush_user_state')
        .select('state,client_updated_at,server_updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (error) throw error;
      const remoteState = remote?.state;
      const remoteTime = Number(remoteState?.updatedAt || (remote?.client_updated_at ? Date.parse(remote.client_updated_at) : 0)) || 0;
      if (remoteState && remoteState.progress && remoteTime >= Number(state.updatedAt || 0)) {
        state = { progress: remoteState.progress || {}, settings: { ...DEFAULT_SETTINGS, ...(remoteState.settings || {}) }, updatedAt: remoteTime };
        rebuildSchedule();
        saveLocalState();
      } else {
        const payload = { progress: state.progress || {}, settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) }, updatedAt: Number(state.updatedAt) || Date.now() };
        const { error: saveError } = await supabaseClient.from('jee_rush_user_state').upsert({
          user_id: currentUser.id,
          state: payload,
          client_updated_at: new Date(payload.updatedAt).toISOString()
        }, { onConflict: 'user_id' });
        if (saveError) throw saveError;
        state = payload;
        saveLocalState();
      }
      cloudReady = true;
      updateSyncIndicator('Cloud sync connected');
      if (options.manual) setSettingsStatus('Sync complete. Your account is connected on this device.', 'success');
      renderAll();
      return true;
    } catch (error) {
      cloudReady = false;
      updateSyncIndicator('Cloud sync error', 'error');
      if (options.manual) setSettingsStatus(error.message || 'Could not sync. Check your internet connection.', 'error');
      console.error('JEE Rush cloud sync failed:', error);
      return false;
    }
  }
  function subscribeCloudRealtime() {
    if (!supabaseClient || !currentUser) return;
    if (cloudChannel) supabaseClient.removeChannel(cloudChannel);
    cloudChannel = supabaseClient.channel(`jee-rush-state-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jee_rush_user_state', filter: `user_id=eq.${currentUser.id}` }, payload => {
        const remoteState = payload.new?.state;
        const remoteTime = Number(remoteState?.updatedAt || (payload.new?.client_updated_at ? Date.parse(payload.new.client_updated_at) : 0)) || 0;
        if (!remoteState?.progress || remoteTime <= Number(state.updatedAt || 0) || syncTimer) return;
        state = { progress: remoteState.progress || {}, settings: { ...DEFAULT_SETTINGS, ...(remoteState.settings || {}) }, updatedAt: remoteTime };
        rebuildSchedule(); saveLocalState(); renderAll(); updateSyncIndicator('Cloud changes received');
      }).subscribe();
  }
  function scheduleCloudSync() {
    clearTimeout(syncTimer);
    if (!currentUser) { updateSyncIndicator('Sign in to sync'); return; }
    updateSyncIndicator('Changes saved locally');
    syncTimer = setTimeout(() => syncCloud(), 900);
  }
  function openSettings() {
    $('settingsModal').hidden = false;
    $('settingsAccountEmail').textContent = currentUser?.email || 'Not signed in';
    document.querySelectorAll('[data-setting]').forEach(el => { const value = state.settings[el.dataset.setting]; if (el.type === 'checkbox') el.checked = !!value; else if (value !== undefined) el.value = value; });
    setSettingsStatus(cloudReady ? 'Your progress is synced to your account.' : 'Progress saves locally and syncs when connected.');
  }
  function closeSettings() { $('settingsModal').hidden = true; }
  async function logout() {
    if (!confirm('Log out of JEE Rush OS on this device? Your cloud progress will remain in your account.')) return;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      currentUser = null;
      state = { progress: {}, settings: { ...DEFAULT_SETTINGS }, updatedAt: 0 };
      rebuildSchedule();
      document.body.classList.remove('authenticated');
      $('settingsModal').hidden = true;
      $('authScreen').hidden = false;
      $('authPassword').value = '';
      setAuthMode('login');
      showAuthMessage('You have been logged out.', 'success');
      updateSyncIndicator('Sign in to sync');
    } catch (error) { showToast(authErrorMessage(error)); }
  }
  function exportBackup() {
    const payload = { app: 'JEE Rush OS', version: 2, exportedAt: new Date().toISOString(), progress: state.progress, settings: state.settings, updatedAt: state.updatedAt };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`jee-rush-progress-${isoToday()}.json`; a.click(); URL.revokeObjectURL(url); showToast('Progress backup exported.');
  }
  async function importBackup(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed.progress !== 'object' || !parsed.progress) throw new Error('This file does not look like a JEE Rush OS progress backup.');
      const validIds = new Set(DATA.map(x=>x.id)); const clean = {};
      Object.entries(parsed.progress).forEach(([id,p]) => { if(validIds.has(id) && p && typeof p==='object') clean[id]={lecture:!!p.lecture,practice:!!p.practice}; });
      if (!confirm('Import this backup? It will replace the current local checklist progress.')) return;
      state={progress:clean,settings:{...DEFAULT_SETTINGS,...(parsed.settings||state.settings)},updatedAt:Date.now()}; rebuildSchedule(); persist(true); showToast('Backup imported.'); setSettingsStatus('Backup imported.','success');
    } catch(e) { showToast(e.message || 'Could not import this backup.'); }
    $('importBackup').value='';
  }
  function resetProgress() {
    if (state.settings.confirmReset && !confirm('Reset all 54 chapters’ lecture and question-practice checkboxes for this account? Export a backup first if needed.')) return;
    state={...state,progress:{},updatedAt:Date.now()}; persist(true); showToast('All checkboxes have been reset.'); setSettingsStatus('Progress reset on this device.','success');
  }

  document.addEventListener('click', (event) => {
    const check = event.target.closest('input[data-check]');
    if (check) { toggleCheck(check.dataset.id, check.dataset.check, check.checked); return; }
    const nav = event.target.closest('[data-view]'); if(nav){setView(nav.dataset.view);return;}
    const go = event.target.closest('[data-go]'); if(go){setView(go.dataset.go);return;}
    const subj = event.target.closest('[data-subject-open]'); if(subj){activeFilter=subj.dataset.subjectOpen; $('searchInput').value='';searchQuery='';document.querySelectorAll('.filter-tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeFilter));renderCurriculum();setView('curriculum');return;}
    const filter = event.target.closest('[data-filter]'); if(filter){activeFilter=filter.dataset.filter;document.querySelectorAll('.filter-tab').forEach(b=>b.classList.toggle('active',b===filter));renderCurriculum();return;}
  });
  function handleSettingChange(el) {
    const key = el.dataset.setting;
    if (!key) return;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (key === 'lecturesPerDay' || key === 'upcomingCount') value = Number(value);
    if (key === 'displayName') value = String(value).slice(0, 40);
    if (key === 'startDate' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return showToast('Choose a valid start date.');
    state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}), [key]: value };
    if (['startDate','rotation','lecturesPerDay'].includes(key)) rebuildSchedule();
    persist(true);
    if (key === 'startDate' || key === 'rotation' || key === 'lecturesPerDay') showToast('Study plan updated.');
    else showToast('Preference saved.');
  }
  document.querySelectorAll('[data-setting]').forEach(el => el.addEventListener('change', () => handleSettingChange(el)));
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (state.settings.theme === 'system') applySettings(); });
  $('resetSettings').addEventListener('click', () => {
    if (!confirm('Restore all appearance, dashboard and schedule preferences to defaults? Your progress will not be deleted.')) return;
    state.settings = { ...DEFAULT_SETTINGS }; rebuildSchedule(); persist(true); openSettings(); showToast('Settings restored to defaults.');
  });
  $('openSettings').addEventListener('click',openSettings); $('topSettings').addEventListener('click',openSettings); $('closeSettings').addEventListener('click',closeSettings);
  $('settingsModal').addEventListener('click',e=>{if(e.target===$('settingsModal'))closeSettings();});
  $('syncNow').addEventListener('click',()=>syncCloud({manual:true}));
  $('logoutButton').addEventListener('click',logout);
  $('authForm').addEventListener('submit',submitAuth);
  $('authModeToggle').addEventListener('click',()=>setAuthMode($('authMode').value === 'signup' ? 'login' : 'signup'));
  $('forgotPassword').addEventListener('click',requestPasswordReset);
  $('exportBackup').addEventListener('click',exportBackup); $('importBackup').addEventListener('change',e=>{if(e.target.files?.[0])importBackup(e.target.files[0]);}); $('resetProgress').addEventListener('click',resetProgress);
  $('searchInput').addEventListener('input',e=>{searchQuery=e.target.value;renderCurriculum();});
  $('scheduleSearch').addEventListener('input',renderSchedule); $('scheduleStatus').addEventListener('change',renderSchedule);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('settingsModal').hidden)closeSettings();});

  setAuthMode('login');
  rebuildSchedule();
  renderAll();
  try {
    if (!window.supabase?.createClient) throw new Error('Supabase client library did not load. Check your internet connection and reload.');
    supabaseClient = window.supabase.createClient(DEFAULT_SUPABASE.url, DEFAULT_SUPABASE.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session?.user && (!currentUser || currentUser.id !== session.user.id)) {
        // Defer network work out of the auth callback to avoid locking the auth client.
        setTimeout(() => activateSession(session), 0);
      } else if (!session?.user && currentUser) {
        currentUser = null;
        cloudReady = false;
        if (cloudChannel) { supabaseClient.removeChannel(cloudChannel); cloudChannel = null; }
        state = { progress: {}, settings: { ...DEFAULT_SETTINGS }, updatedAt: 0 };
        rebuildSchedule();
        document.body.classList.remove('authenticated');
        $('authScreen').hidden = false;
        updateSyncIndicator('Sign in to sync');
      }
    });
    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (data.session) activateSession(data.session);
      else { $('authScreen').hidden = false; updateSyncIndicator('Sign in to sync'); }
    }).catch(error => showAuthMessage(error.message || 'Could not connect to authentication.', 'error'));
  } catch (error) {
    $('authScreen').hidden = false;
    showAuthMessage(error.message, 'error');
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
