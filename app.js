// SpotMAC — boosters de cartes, collection, marché, échanges, garage de scans (Supabase)
const $ = s => document.querySelector(s);

const LABEL = { commune: 'Commune', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };
const RORDER = { legendaire: 0, epique: 1, rare: 2, commune: 3 };
const MILESTONES = [{ n: 50, mac: 25 }, { n: 100, mac: 75 }, { n: 250, mac: 400 }];
const QUARTER_MS = 91 * 24 * 3600 * 1000;
const PAGE = 120;

// Silhouettes des cartes (dessins SpotMAC)
const SIL = {
  berline: ['M8 36 L10 26 Q12 22 20 21 L36 19 L48 10 Q52 8 60 8 L80 8 Q88 8 94 14 L100 20 Q112 22 114 28 L114 36 Z', 'M40 19 L50 11 Q53 10 60 10 L80 10 Q86 10 91 15 L95 19 Z', [30, 94], 7],
  sport:   ['M3 39 L4 33 Q5 30 15 29 L38 27 L58 19 Q65 16.5 75 16.5 L85 17.5 Q94 19.5 104 27 Q115 29 118 34 L118 39 Z', 'M54 26 L63 20.5 Q67 19 75 19 L84 20 Q89 21 96 26 Z', [25, 99], 6.5],
  suv:     ['M8 38 L8 24 Q10 19 18 18 L30 17 L40 7 Q42 5 48 5 L88 5 Q94 5 98 10 L104 17 Q114 19 114 26 L114 38 Z', 'M34 17 L42 8 Q44 7 48 7 L88 7 Q92 7 95 11 L100 17 Z', [30, 92], 8],
  break:   ['M8 36 L9 25 Q11 21 20 20 L34 19 L44 9 Q46 7 52 7 L100 7 Q105 7 107 12 L112 22 Q114 26 114 30 L114 36 Z', 'M38 19 L46 10 Q48 9 52 9 L99 9 Q103 9 105 13 L108 19 Z', [30, 94], 7],
  van:     ['M8 38 L8 14 Q8 6 16 6 L96 6 Q104 6 108 14 L114 26 L114 38 Z', 'M78 8 L96 8 Q102 8 105 14 L110 24 L78 24 Z', [30, 94], 7],
  pickup:  ['M6 36 L6 24 L36 24 L42 10 Q44 7 50 7 L72 7 Q76 7 78 11 L84 22 Q108 23 114 28 L114 36 Z', 'M46 9 L72 9 Q75 9 76 12 L81 21 L42 21 Z', [24, 96], 7]
};
function silhouette(body) {
  const [b, w, wheels, r] = SIL[body] || SIL.berline;
  return `<svg viewBox="0 0 120 48" aria-hidden="true"><path d="${b}" fill="rgba(255,255,255,.88)"/><path d="${w}" fill="rgba(20,22,28,.75)"/>` +
    wheels.map(x => `<circle cx="${x}" cy="${38}" r="${r}" fill="#15171d"/><circle cx="${x}" cy="38" r="${r * 0.45}" fill="rgba(255,255,255,.55)"/>`).join('') + '</svg>';
}

const cfg = window.SPOTMAC_CONFIG || {};
const configured = !!(cfg.url && cfg.key && !cfg.url.startsWith('COLLE') && window.supabase);
const sb = configured ? window.supabase.createClient(cfg.url, cfg.key) : null;

let session = null, me = null, M = {}, MODELS = [], BRANDS = [], booster = null;
window.M = M;

// ---------- Utilitaires ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => session?.user?.id;
const norm = s => (s || '').trim().toLowerCase();
const photoUrl = p => p ? sb.storage.from('photos').getPublicUrl(p).data.publicUrl : '';
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR');
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
}
async function q(req) { const { data, error } = await req; if (error) throw new Error(error.message); return data; }
async function call(fn, args = {}) { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; }
async function fetchAll(build) {   // Supabase renvoie 1000 lignes max par requête
  const out = [];
  for (let from = 0; ; from += 1000) { const rows = await q(build().range(from, from + 999)); out.push(...rows); if (rows.length < 1000) break; }
  return out;
}
const fail = e => toast(e.message || 'Erreur');
const years = m => m.y0 ? `${m.y0}–${m.y1 || ''}` : '';
function price(m) {
  let p = { commune: 1, rare: 2, epique: 5 }[m.rarity] || (m.small ? 100 : 50);
  if (me?.fav_brand && norm(m.brand) === norm(me.fav_brand)) p *= 2;
  return p;
}
function timeLeft(d) {
  let m = Math.round((new Date(d) - Date.now()) / 60000);
  if (m <= 0) return 'terminée';
  const j = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); m = m % 60;
  return j ? `${j} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
function button(label, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.onclick = fn; return b; }

// ---------- Carte dessinée ----------
function cardHTML(m, { count = 0, locked = 0, size = '' } = {}) {
  if (!m) return '<div class="tcard"><div class="tc-name">?</div></div>';
  return `<div class="tcard r-${m.rarity} ${size}" data-mid="${m.id}">
    <div class="tc-top"><span class="tc-brand">${esc(m.brand)}</span><span class="tc-gem"></span></div>
    <div class="tc-mono">${esc(m.brand[0])}</div>
    <div class="tc-art">${silhouette(m.body)}</div>
    <div class="tc-name">${esc(m.model)}</div>
    <div class="tc-sub">${esc([m.gen, years(m)].filter(Boolean).join(' · '))}</div>
    <div class="tc-rar">${LABEL[m.rarity]}</div>
    ${m.small ? '<div class="tc-ribbon">Série limitée</div>' : ''}
    ${count > 1 ? `<span class="tc-count">×${count}</span>` : ''}
    ${locked ? '<span class="tc-lock">🔒</span>' : ''}
  </div>`;
}
const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

// ---------- Base des voitures ----------
async function loadModels() {
  const rows = await (await fetch('models.json')).json();
  MODELS = rows.map(([id, brand, model, gen, y0, y1, rarity, small, body]) => ({ id, brand, model, gen, y0, y1, rarity, small, body }));
  MODELS.forEach(m => M[m.id] = m);
  BRANDS = [...new Set(MODELS.map(m => m.brand))].sort((a, b) => a.localeCompare(b, 'fr'));
  const opts = '<option value="">— Choisis une marque —</option>' + BRANDS.map(b => `<option>${esc(b)}</option>`).join('');
  ['#favBrand', '#welcomeBrand', '#scanBrand'].forEach(s => $(s).innerHTML = opts);
}

// ---------- Navigation ----------
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.v));
$('#btnProfile').onclick = () => go('profile');
$('#btnRanking').onclick = () => go('ranking');
$('#btnBackRanking').onclick = () => go('ranking');
$('#btnBackGarage').onclick = () => go('garage');
$('#btnGoScan').onclick = () => go('scan');
let current = 'login';
function showView(v) {
  current = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  const tab = { scan: 'garage', player: null, ranking: null, profile: null }[v] ?? v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === tab));
  if (v === 'scan') startCamera(); else stopCamera();
  window.scrollTo(0, 0);
}
function go(v) {
  if (!session) return showView('login');
  showView(v);
  const load = { booster: loadBooster, collection: loadCollection, market: loadMarket, trades: loadTrades,
    garage: loadGarage, ranking: loadRanking, profile: renderProfile }[v];
  if (load) load().catch(fail);
  if (v !== 'booster') refreshMe().catch(() => {});
}

// ---------- Connexion ----------
let loginMode = 'in', recovering = false;
function showRecovery() { showView('login'); $('#view-login .login').classList.add('hidden'); $('#newPassForm').classList.remove('hidden'); }
document.querySelectorAll('#loginTabs button').forEach(b => b.onclick = () => {
  loginMode = b.dataset.m;
  document.querySelectorAll('#loginTabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#btnLogin').textContent = loginMode === 'in' ? 'Se connecter' : 'Créer mon compte';
  $('#loginPass').autocomplete = loginMode === 'in' ? 'current-password' : 'new-password';
  $('#btnForgot').classList.toggle('hidden', loginMode !== 'in');
  $('#loginInfo').textContent = '';
});
const AUTH_ERR = { 'Invalid login credentials': 'E-mail ou mot de passe incorrect', 'Email not confirmed': 'Confirme d’abord ton e-mail avec le lien reçu',
  'User already registered': 'Ce compte existe déjà : connecte-toi', 'Email rate limit exceeded': 'Trop d’e-mails envoyés : réessaie dans une heure' };
const authMsg = e => AUTH_ERR[e.message] || e.message;
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim(), password = $('#loginPass').value, btn = $('#btnLogin');
  btn.disabled = true;
  try {
    if (loginMode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) $('#loginInfo').textContent = 'Compte créé ! Clique sur le lien reçu par e-mail pour le confirmer (regarde les spams), puis reviens ici et connecte-toi.';
    }
  } catch (err) { toast(authMsg(err)); }
  finally { btn.disabled = false; }
};
$('#btnForgot').onclick = async () => {
  const email = $('#loginEmail').value.trim();
  if (!email) return toast('Entre d’abord ton e-mail');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) return toast(authMsg(error));
  $('#loginInfo').textContent = 'E-mail envoyé : clique sur le lien pour choisir un nouveau mot de passe.';
};
$('#newPassForm').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $('#newPass').value });
  if (error) return toast(authMsg(error));
  recovering = false; $('#newPassForm').classList.add('hidden'); $('#view-login .login').classList.remove('hidden');
  toast('Mot de passe changé !'); go('booster');
};
$('#btnLogout').onclick = async () => { await sb.auth.signOut(); };

async function boot() {
  const logged = !!session;
  ['#nav', '#btnProfile', '#btnRanking'].forEach(s => $(s).classList.toggle('hidden', !logged));
  if (!logged) {
    me = null; $('#macBalance').textContent = 0;
    return showView('login');
  }
  try { await refreshMe(); } catch (e) { return fail(e); }
  if (recovering) return showRecovery();
  if (!me) { showView('booster'); return $('#welcome').showModal(); }
  go('booster');
}
async function refreshMe() {
  if (!session) return;
  me = await q(sb.from('profiles').select('*').eq('id', uid()).maybeSingle());
  $('#macBalance').textContent = me?.mac ?? 0;
  if (!me) return;
  const { count } = await sb.from('trades').select('id', { count: 'exact', head: true }).eq('to_user', uid()).eq('status', 'pending');
  $('#tradeDot').classList.toggle('hidden', !count);
  booster = await call('booster_status');
  updateBoosterBadge();
}
$('#welcomeForm').onsubmit = async e => {
  e.preventDefault();
  try {
    await call('create_profile', { p_pseudo: $('#welcomePseudo').value.trim(), p_fav: $('#welcomeBrand').value });
    $('#welcome').close(); await refreshMe(); toast(`Bienvenue ${me.pseudo} !`); go('booster');
  } catch (err) { fail(err); }
};
$('#welcome').addEventListener('cancel', e => e.preventDefault());

// ---------- Boosters ----------
let tick = null, nextAt = 0;
function updateBoosterBadge() {
  const n = booster ? booster.available + booster.bonus : 0;
  $('#boosterNum').textContent = n; $('#boosterNum').classList.toggle('hidden', !n);
}
function renderBoosterStatus() {
  if (!booster) return;
  const n = booster.available + booster.bonus;
  $('#bCount').textContent = n ? `🎁 ${n} booster${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}` : 'Aucun booster pour l’instant';
  $('#bCount').title = '';
  $('#btnOpen').disabled = !n;
  const bonusTxt = booster.bonus ? ` · dont ${booster.bonus} bonus` : '';
  clearInterval(tick);
  if (booster.next_in == null) { $('#bNext').textContent = `Stock plein (${booster.max}/${booster.max})${bonusTxt}`; return; }
  nextAt = Date.now() + booster.next_in * 1000;
  const upd = () => {
    const s = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
    $('#bNext').textContent = `Prochain booster dans ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · stock ${booster.available}/${booster.max}${bonusTxt}`;
    if (s <= 0) { clearInterval(tick); if (current === 'booster') loadBooster().catch(() => {}); }
  };
  upd(); tick = setInterval(upd, 1000);
}
async function loadBooster() {
  $('#reveal').classList.add('hidden'); $('#boosterZone').classList.remove('hidden');
  booster = await call('booster_status'); updateBoosterBadge(); renderBoosterStatus();
}
$('#btnOpen').onclick = openBooster;
$('#btnAgain').onclick = async () => { await loadBooster(); if (booster.available + booster.bonus) openBooster(); };
$('#btnToCollection').onclick = () => go('collection');
async function openBooster() {
  $('#btnOpen').disabled = true;
  $('#pack').classList.add('shake');
  let cards;
  try { cards = await call('open_booster'); } catch (e) { $('#pack').classList.remove('shake'); $('#btnOpen').disabled = false; return fail(e); }
  await new Promise(r => setTimeout(r, 500));
  $('#pack').classList.remove('shake');
  $('#boosterZone').classList.add('hidden'); $('#reveal').classList.remove('hidden');
  startDeck(cards.map(c => M[c.model_id]));
  booster = await call('booster_status'); updateBoosterBadge();
  $('#btnAgain').textContent = booster.available + booster.bonus ? `Ouvrir le suivant (${booster.available + booster.bonus})` : 'Plus de booster';
  $('#btnAgain').disabled = !(booster.available + booster.bonus);
}

// Ouverture carte par carte : on retourne la carte du dessus, puis elle s'envole et laisse la suivante
function startDeck(ms) {
  const deck = $('#deck'), summary = $('#revealGrid');
  deck.innerHTML = ''; deck.classList.remove('hidden'); summary.classList.add('hidden'); summary.innerHTML = '';
  $('#deckDone').classList.add('hidden'); $('#btnSkip').classList.remove('hidden');
  $('#deckHint').textContent = 'Touche la carte pour la retourner';
  ms.forEach((m, k) => {
    const f = el(`<div class="flip deck-card r-${m?.rarity}" style="--k:${k};z-index:${10 - k}"><div class="inner">
      <div class="face back-face"><b>Spot<span>MAC</span></b><small>${k + 1} / ${ms.length}</small></div>
      <div class="face front-face">${cardHTML(m, { size: 'big deckc' })}</div></div></div>`);
    deck.appendChild(f);
  });
  const items = [...deck.children]; let i = 0;
  const finish = () => {
    deck.onclick = null; deck.classList.add('hidden'); $('#btnSkip').classList.add('hidden');
    $('#deckHint').textContent = 'Ton booster :';
    ms.forEach(m => { const c = el(cardHTML(m)); c.onclick = () => openCard(m, null); summary.appendChild(c); });
    summary.classList.remove('hidden'); $('#deckDone').classList.remove('hidden');
  };
  deck.onclick = () => {
    const f = items[i], m = ms[i]; if (!f) return;
    if (!f.classList.contains('open')) {
      f.classList.add('open');
      if (m?.rarity === 'legendaire') toast(m.small ? '🔥 LÉGENDAIRE · SÉRIE LIMITÉE !' : '🔥 LÉGENDAIRE !');
      else if (m?.rarity === 'epique') toast('✨ Épique !');
      $('#deckHint').textContent = i < items.length - 1 ? 'Touche pour passer à la suivante' : 'Touche pour voir ton booster';
    } else {
      f.classList.add('gone'); i++;
      setTimeout(() => f.remove(), 450);
      if (i >= items.length) setTimeout(finish, 300); else $('#deckHint').textContent = 'Touche la carte pour la retourner';
    }
  };
  $('#btnSkip').onclick = finish;
}

// ---------- Collection ----------
let myGroups = [], colFilter = 'all', colShown = PAGE;
function groupCards(cards) {
  const g = {};
  for (const c of cards) {
    const x = g[c.model_id] ||= { m: M[c.model_id], ids: [], free: [], locked: 0 };
    x.ids.push(c.id); if (c.locked) x.locked++; else x.free.push(c.id);
  }
  return Object.values(g).filter(x => x.m).sort((a, b) => RORDER[a.m.rarity] - RORDER[b.m.rarity] || a.m.brand.localeCompare(b.m.brand) || a.m.model.localeCompare(b.m.model));
}
const matches = (m, s) => !s || norm(`${m.brand} ${m.model} ${m.gen}`).includes(s);
async function loadCollection() {
  const cards = await fetchAll(() => sb.from('cards').select('id,model_id,locked').eq('owner', uid()).order('created_at'));
  myGroups = groupCards(cards);
  const pct = (myGroups.length / MODELS.length * 100);
  $('#progBar').style.width = Math.max(pct, 0.5) + '%';
  $('#progTxt').textContent = `${myGroups.length} / ${MODELS.length} voitures (${pct.toFixed(1)} %) · ${cards.length} cartes`;
  const dupValue = myGroups.reduce((s, g) => s + Math.max(0, Math.min(g.free.length, g.ids.length - 1)) * price(g.m), 0);
  $('#btnSellDup').textContent = dupValue ? `Vendre tous les doublons (+${dupValue} MAC)` : 'Aucun doublon à vendre';
  $('#btnSellDup').disabled = !dupValue; delete $('#btnSellDup').dataset.armed;
  colShown = PAGE; renderCollection();
}
function renderCollection() {
  const s = norm($('#colSearch').value);
  const list = myGroups.filter(g => (colFilter === 'all' || (colFilter === 'dup' ? g.ids.length > 1 : g.m.rarity === colFilter)) && matches(g.m, s));
  const grid = $('#colGrid'); grid.innerHTML = '';
  list.slice(0, colShown).forEach(g => {
    const c = el(cardHTML(g.m, { count: g.ids.length, locked: g.locked }));
    c.onclick = () => openCard(g.m, g); grid.appendChild(c);
  });
  $('#colMore').classList.toggle('hidden', list.length <= colShown);
  $('#colEmpty').classList.toggle('hidden', list.length > 0);
  $('#colEmpty').textContent = myGroups.length ? 'Aucune carte ne correspond.' : 'Ta collection est vide : ouvre ton premier booster !';
}
$('#colSearch').oninput = () => { colShown = PAGE; renderCollection(); };
$('#colMore').onclick = () => { colShown += PAGE; renderCollection(); };
document.querySelectorAll('#colFilters button').forEach(b => b.onclick = () => {
  colFilter = b.dataset.f; colShown = PAGE;
  document.querySelectorAll('#colFilters button').forEach(x => x.classList.toggle('on', x === b));
  renderCollection();
});
$('#btnSellDup').onclick = async () => {
  const b = $('#btnSellDup');
  if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Confirmer : vendre les doublons'; return; }
  try { const r = await call('sell_duplicates'); toast(`${r.cards} doublons vendus : +${r.mac} MAC`); go('collection'); } catch (e) { fail(e); }
};

// ---------- Fiche d'une carte ----------
let specToken = 0;
function dialogBase(m, meta) {
  $('#dlgVisual').innerHTML = cardHTML(m, { size: 'big' });
  $('#dlgTitle').textContent = `${m.brand} ${m.model}`;
  $('#dlgMeta').textContent = meta.filter(Boolean).join(' · ');
  $('#dlgExtra').innerHTML = ''; $('#dlgActions').innerHTML = '';
  loadSpecs(m);
}
async function loadSpecs(m) {
  const box = $('#dlgSpecs'), token = ++specToken;
  box.innerHTML = '<p class="hint">Chargement de la fiche technique…</p>';
  let d = null;
  try { d = await window.WIKI.details(m); } catch (e) {}
  if (token !== specToken) return;
  const base = [['Génération', m.gen], ['Années', years(m)], ['Rareté', LABEL[m.rarity] + (m.small ? ' · série limitée (< 1 000 ex.)' : '')]].filter(r => r[1]);
  const rows = [...base, ...(d?.rows || [])];
  if (d?.photo) {
    const img = $('#dlgVisual .tc-art');
    if (img) { img.innerHTML = `<img src="${esc(d.photo.src)}" alt="">`; img.classList.add('photo'); }
  }
  box.innerHTML = `<h4>Fiche technique</h4>
    <table class="specs">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    ${d?.rows?.length ? '' : '<p class="hint">Pas de fiche détaillée trouvée pour ce modèle.</p>'}
    ${d?.extract ? `<p class="extract">${esc(d.extract)}</p>` : ''}
    ${d ? `<p class="credit">Infos : <a href="${esc(d.url)}" target="_blank" rel="noopener">Wikipédia — ${esc(d.title)}</a>${d.title && d.rows.length ? ' (les chiffres peuvent concerner tout le modèle, pas seulement cette génération)' : ''}</p>` : ''}
    ${d?.photo ? `<p class="credit">Photo : ${esc(d.photo.artist)}${d.photo.license ? ' · ' + esc(d.photo.license) : ''} · <a href="${esc(d.photo.link)}" target="_blank" rel="noopener">Wikimedia Commons</a></p>` : ''}`;
}
const close = () => button('Fermer', 'ghost', () => $('#carDialog').close());
function openCard(m, g, other = null) {
  if (!m) return;
  dialogBase(m, [LABEL[m.rarity] + (m.small ? ' · série limitée' : ''), m.gen, years(m),
    g && !other ? `Tu en as ${g.ids.length}${g.locked ? ` (${g.locked} bloquée${g.locked > 1 ? 's' : ''})` : ''}` : '',
    !other ? `Revente : ${price(m)} MAC` : '']);
  const acts = $('#dlgActions');
  if (g && !other && g.free.length) {
    const sell = button(`Vendre 1 (${price(m)} MAC)`, 'big', async () => {
      if (!sell.dataset.armed) { sell.dataset.armed = 1; sell.textContent = `Confirmer : +${price(m)} MAC`; return; }
      try { const p = await call('sell_card', { p_card: g.free[g.free.length - 1] }); $('#carDialog').close(); toast(`+${p} MAC`); go('collection'); } catch (e) { fail(e); }
    });
    acts.append(sell, button('Mettre aux enchères', 'ghost', () => auctionForm(m, g.free[g.free.length - 1])), close());
  } else if (other && other.free.length) {
    acts.append(button('Proposer un échange', 'big', () => tradeForm(m, other.free[0])), close());
  } else acts.append(close());
  $('#carDialog').showModal();
}
function auctionForm(m, cardId) {
  $('#dlgExtra').innerHTML = `<label>Prix de départ (MAC) <input type="number" id="aucStart" min="1" value="${price(m)}"></label>
    <label>Durée <select id="aucHours"><option value="1">1 heure</option><option value="6">6 heures</option>
    <option value="24" selected>24 heures</option><option value="48">48 heures</option><option value="72">72 heures</option></select></label>`;
  $('#dlgActions').innerHTML = '';
  $('#dlgActions').append(button('Lancer l’enchère', 'big', async () => {
    try {
      await call('create_auction', { p_card: cardId, p_start: parseInt($('#aucStart').value, 10) || 1, p_hours: parseInt($('#aucHours').value, 10) });
      $('#carDialog').close(); toast('Enchère lancée !'); go('market');
    } catch (e) { fail(e); }
  }), button('Annuler', 'ghost', () => $('#carDialog').close()));
}
async function tradeForm(target, targetCardId) {
  let groups;
  try { groups = groupCards(await fetchAll(() => sb.from('cards').select('id,model_id,locked').eq('owner', uid()).eq('locked', false))); }
  catch (e) { return fail(e); }
  if (!groups.length) return toast('Tu n’as aucune carte disponible à proposer');
  let picked = null;
  $('#dlgExtra').innerHTML = `<p class="hint">Choisis la carte que tu proposes en échange :</p>
    <input class="search" id="pickSearch" placeholder="Rechercher dans tes cartes…"><div class="pick" id="pick"></div>`;
  const draw = () => {
    const s = norm($('#pickSearch').value), box = $('#pick'); box.innerHTML = '';
    groups.filter(g => matches(g.m, s)).slice(0, 40).forEach(g => {
      const c = el(cardHTML(g.m, { count: g.ids.length }));
      c.onclick = () => { picked = g.free[0]; box.querySelectorAll('.tcard').forEach(x => x.classList.toggle('on', x === c)); };
      box.appendChild(c);
    });
  };
  $('#pickSearch').oninput = draw; draw();
  $('#dlgActions').innerHTML = '';
  $('#dlgActions').append(button('Envoyer la proposition', 'big', async () => {
    if (!picked) return toast('Choisis une carte');
    try { await call('propose_trade', { p_offered: picked, p_requested: targetCardId }); $('#carDialog').close(); toast('Proposition envoyée !'); go('trades'); }
    catch (e) { fail(e); }
  }), button('Annuler', 'ghost', () => $('#carDialog').close()));
}

// ---------- Marché (enchères) ----------
async function loadMarket() {
  await sb.rpc('settle_auctions');
  const list = await q(sb.from('auctions')
    .select('id,start_price,best_bid,best_bidder,ends_at,seller,card:cards(id,model_id),seller_p:profiles!auctions_seller_fkey(pseudo)')
    .eq('closed', false).order('ends_at'));
  const box = $('#auctions'); box.innerHTML = '';
  if (!list.length) box.innerHTML = '<p class="empty">Aucune enchère en cours.</p>';
  for (const a of list) {
    const m = M[a.card?.model_id]; if (!m) continue;
    const mineA = a.seller === uid(), lead = a.best_bidder === uid();
    const row = el(`<div class="row${lead ? ' me' : ''}">${cardHTML(m, { size: 'mini' })}
      <div class="txt"><b>${esc(m.brand)} ${esc(m.model)}</b>
      <small>${LABEL[m.rarity]} · ${mineA ? 'ta carte' : 'par ' + esc(a.seller_p?.pseudo)}</small>
      <small>${a.best_bid ? `Meilleure offre : <b>${a.best_bid} MAC</b>${lead ? ' (toi)' : ''}` : `Départ : ${a.start_price} MAC`} · fin dans ${timeLeft(a.ends_at)}</small></div>
      <div class="btns"></div></div>`);
    const btns = row.querySelector('.btns');
    if (mineA && !a.best_bid) btns.append(button('Annuler', 'small alt', async () => {
      try { await call('cancel_auction', { p_auction: a.id }); toast('Enchère annulée'); go('market'); } catch (e) { fail(e); }
    }));
    if (!mineA && !lead) btns.append(button('Enchérir', 'small', () => bidDialog(a, m)));
    row.querySelector('.tcard').onclick = () => { dialogBase(m, [LABEL[m.rarity], m.gen, years(m)]); $('#dlgActions').append(close()); $('#carDialog').showModal(); };
    box.appendChild(row);
  }
}
function bidDialog(a, m) {
  const min = a.best_bid ? a.best_bid + 1 : a.start_price;
  dialogBase(m, [LABEL[m.rarity], m.gen, years(m)]);
  $('#dlgExtra').innerHTML = `<label>Ton offre (minimum ${min} MAC, tu as ${me?.mac ?? 0} MAC)
    <input type="number" id="bidAmount" min="${min}" value="${min}"></label>
    <p class="hint">Tes MAC sont bloqués pendant l’enchère et rendus si quelqu’un enchérit plus haut.</p>`;
  $('#dlgActions').append(button('Valider l’offre', 'big', async () => {
    try { await call('place_bid', { p_auction: a.id, p_amount: parseInt($('#bidAmount').value, 10) }); $('#carDialog').close(); toast('Offre placée !'); go('market'); }
    catch (e) { fail(e); }
  }), button('Annuler', 'ghost', () => $('#carDialog').close()));
  $('#carDialog').showModal();
}

// ---------- Échanges ----------
async function loadTrades() {
  const list = await q(sb.from('trades')
    .select('id,from_user,to_user,offered:cards!trades_offered_card_fkey(id,model_id),requested:cards!trades_requested_card_fkey(id,model_id),from_p:profiles!trades_from_user_fkey(pseudo),to_p:profiles!trades_to_user_fkey(pseudo)')
    .eq('status', 'pending').order('created_at', { ascending: false }));
  const inBox = $('#tradesIn'), outBox = $('#tradesOut'); inBox.innerHTML = ''; outBox.innerHTML = '';
  const name = c => { const m = M[c?.model_id]; return m ? `${esc(m.brand)} ${esc(m.model)}` : '?'; };
  for (const t of list) {
    const incoming = t.to_user === uid();
    const row = el(`<div class="row"><div class="swap">${cardHTML(M[t.offered?.model_id], { size: 'mini' })}⇄${cardHTML(M[t.requested?.model_id], { size: 'mini' })}</div>
      <div class="txt">${incoming
        ? `<b>${esc(t.from_p?.pseudo)}</b><small>te propose sa ${name(t.offered)} contre ta ${name(t.requested)}</small>`
        : `<b>À ${esc(t.to_p?.pseudo)}</b><small>ta ${name(t.offered)} contre sa ${name(t.requested)}</small>`}</div>
      <div class="btns"></div></div>`);
    const btns = row.querySelector('.btns');
    if (incoming) btns.append(button('Accepter', 'small', () => respond(t.id, true)), button('Refuser', 'small alt', () => respond(t.id, false)));
    else btns.append(button('Annuler', 'small alt', async () => {
      try { await call('cancel_trade', { p_trade: t.id }); toast('Proposition annulée'); go('trades'); } catch (e) { fail(e); }
    }));
    (incoming ? inBox : outBox).appendChild(row);
  }
  if (!inBox.children.length) inBox.innerHTML = '<p class="empty">Aucune proposition reçue.</p>';
  if (!outBox.children.length) outBox.innerHTML = '<p class="empty">Aucune proposition envoyée.</p>';
}
async function respond(id, accept) {
  try { await call('respond_trade', { p_trade: id, p_accept: accept }); toast(accept ? 'Échange effectué !' : 'Proposition refusée'); go('trades'); }
  catch (e) { fail(e); }
}

// ---------- Classement et collection des autres ----------
async function loadRanking() {
  const list = await call('leaderboard');
  const box = $('#ranking'); box.innerHTML = '';
  list.forEach((p, i) => {
    const row = el(`<div class="row${p.id === uid() ? ' me' : ''}"><span class="rank">${i + 1}</span><div class="txt"><b>${esc(p.pseudo)}${p.id === uid() ? ' (toi)' : ''}</b>
      <small>${p.models} voiture${p.models > 1 ? 's' : ''} différente${p.models > 1 ? 's' : ''} · ${p.mac} MAC · ${p.scans} scan${p.scans > 1 ? 's' : ''}</small></div></div>`);
    if (p.id !== uid()) row.onclick = () => openPlayer(p);
    box.appendChild(row);
  });
  if (!list.length) box.innerHTML = '<p class="empty">Personne pour l’instant.</p>';
}
let playerGroups = [];
async function openPlayer(p) {
  showView('player');
  $('#playerTitle').textContent = `Collection de ${p.pseudo}`;
  $('#playerSearch').value = ''; $('#playerGrid').innerHTML = '';
  try { playerGroups = groupCards(await fetchAll(() => sb.from('cards').select('id,model_id,locked').eq('owner', p.id))); renderPlayer(); }
  catch (e) { fail(e); }
}
function renderPlayer() {
  const s = norm($('#playerSearch').value), grid = $('#playerGrid'); grid.innerHTML = '';
  const list = playerGroups.filter(g => matches(g.m, s));
  list.slice(0, 200).forEach(g => { const c = el(cardHTML(g.m, { count: g.ids.length })); c.onclick = () => openCard(g.m, null, g); grid.appendChild(c); });
  if (!list.length) grid.innerHTML = '<p class="empty">Aucune carte.</p>';
}
$('#playerSearch').oninput = renderPlayer;

// ---------- Garage (scans) ----------
async function loadGarage() {
  const scans = await fetchAll(() => sb.from('scans').select('*').eq('owner', uid()).order('created_at', { ascending: false }));
  const today = new Date().toISOString().slice(0, 10);
  const bonusToday = me?.scan_bonus_day === today ? me.scan_bonus_count : 0;
  $('#stats').innerHTML = `<div><b>${scans.length}</b><small>scans</small></div>
    <div><b>${new Set(scans.map(s => s.model_id)).size}</b><small>modèles</small></div>
    <div><b>${bonusToday}/10</b><small>bonus du jour</small></div>`;
  const grid = $('#grid'); grid.innerHTML = '';
  scans.forEach(s => {
    const m = M[s.model_id] || { brand: '?', model: '', rarity: 'commune' };
    const c = el(`<div class="card r-${s.custom ? 'custom' : m.rarity}"><img src="${esc(photoUrl(s.photo_path))}" alt="" loading="lazy">
      <div class="info"><b>${esc(m.brand)} ${esc(m.model)}</b><small>${esc(m.gen || '')} ${esc(years(m))}</small><br>
      <span class="badge r-${m.rarity}">${LABEL[m.rarity]}</span>${s.custom ? ' <span class="badge r-custom">Custom</span>' : ''}</div></div>`);
    c.onclick = () => {
      $('#dlgVisual').innerHTML = `<img src="${esc(photoUrl(s.photo_path))}" alt="">`;
      $('#dlgTitle').textContent = `${m.brand} ${m.model}`;
      $('#dlgMeta').textContent = [LABEL[m.rarity], s.custom ? 'Custom' : '', m.gen, years(m), 'Scannée le ' + fmtDate(s.created_at)].filter(Boolean).join(' · ');
      $('#dlgExtra').innerHTML = ''; $('#dlgActions').innerHTML = ''; $('#dlgActions').append(close());
      $('#carDialog').showModal();
    };
    grid.appendChild(c);
  });
  $('#empty').classList.toggle('hidden', scans.length > 0);
}

// ---------- Profil ----------
async function renderProfile() {
  await refreshMe();
  if (!me) return;
  $('#profileTitle').textContent = `Profil de ${me.pseudo}`;
  $('#favBrand').value = me.fav_brand || '';
  const next = me.fav_changed_at ? new Date(me.fav_changed_at).getTime() + QUARTER_MS : 0;
  $('#favInfo').textContent = me.fav_brand
    ? (Date.now() < next ? `Prochain changement possible le ${fmtDate(next)}.` : 'Tu peux changer de marque.')
    : 'Choisis ta marque : ses cartes se revendent ×2.';
  $('#milestones').innerHTML = MILESTONES.map(m => `<li class="${me.scans >= m.n ? 'done' : ''}">${me.scans >= m.n ? '✅' : '⬜'} ${m.n} scans : +${m.mac} MAC
    <small style="margin-left:auto;color:var(--muted)">${Math.min(me.scans, m.n)}/${m.n}</small></li>`).join('');
}
$('#btnFav').onclick = async () => {
  const v = $('#favBrand').value;
  if (!v || v === me?.fav_brand) return;
  try { await call('set_fav_brand', { p_brand: v }); toast(`Marque préférée : ${v}`); renderProfile(); } catch (e) { fail(e); }
};

// ---------- Scan (photo en direct + choix dans la base) ----------
const scanModels = () => MODELS.filter(m => m.brand === $('#scanBrand').value);
$('#scanBrand').onchange = () => {
  const names = [...new Set(scanModels().map(m => m.model))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('#scanModel').innerHTML = '<option value="">— Modèle —</option>' + names.map(n => `<option>${esc(n)}</option>`).join('');
  $('#scanModel').disabled = !names.length; $('#scanGen').innerHTML = ''; $('#scanGen').disabled = true; $('#scanRarity').textContent = '';
};
$('#scanModel').onchange = () => {
  const gens = scanModels().filter(m => m.model === $('#scanModel').value);
  $('#scanGen').innerHTML = gens.map(m => `<option value="${m.id}">${esc(m.gen || 'Génération unique')} (${esc(years(m))})</option>`).join('');
  $('#scanGen').disabled = !gens.length; $('#scanGen').onchange();
};
$('#scanGen').onchange = () => {
  const m = M[$('#scanGen').value];
  $('#scanRarity').innerHTML = m ? `Rareté : <span class="badge r-${m.rarity}">${LABEL[m.rarity]}</span>${m.small ? ' · série limitée' : ''}` : '';
};
let stream = null, shotBlob = null, fallback = false;
async function startCamera() {
  resetScan();
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
    $('#video').srcObject = stream; $('#camMsg').textContent = ''; fallback = false;
  } catch (e) {
    fallback = true; $('#camMsg').textContent = 'Appuie sur le bouton pour ouvrir l’appareil photo.';
  }
}
function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
function resetScan() {
  shotBlob = null; $('#preview').style.display = 'none';
  $('#btnShoot').classList.remove('hidden'); $('#btnRetake').classList.add('hidden');
  $('#carForm').classList.add('hidden'); $('#carForm').reset(); $('#scanBrand').onchange();
}
function toJpeg(source, w, h) {
  const c = $('#canvas'), scale = Math.min(1, 1280 / w);
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}
function showShot(b) {
  shotBlob = b;
  const p = $('#preview'); p.src = URL.createObjectURL(b); p.style.display = 'block';
  $('#camMsg').textContent = '';
  $('#btnShoot').classList.add('hidden'); $('#btnRetake').classList.remove('hidden'); $('#carForm').classList.remove('hidden');
}
$('#fileCam').onchange = e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (Date.now() - f.lastModified > 5 * 60 * 1000) return toast('Photo trop ancienne : prends-la en direct');
  const img = new Image();
  img.onload = async () => showShot(await toJpeg(img, img.naturalWidth, img.naturalHeight));
  img.onerror = () => toast('Image illisible');
  img.src = URL.createObjectURL(f);
};
$('#btnShoot').onclick = async () => {
  if (fallback) return $('#fileCam').click();
  const v = $('#video');
  if (!stream || !v.videoWidth) return toast('La caméra n’est pas prête');
  showShot(await toJpeg(v, v.videoWidth, v.videoHeight));
};
$('#btnRetake').onclick = resetScan;
$('#carForm').onsubmit = async e => {
  e.preventDefault();
  const modelId = parseInt($('#scanGen').value, 10);
  if (!shotBlob || !modelId) return toast('Choisis la marque, le modèle et la génération');
  const btn = $('#btnAdd'); btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const path = `${uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('photos').upload(path, shotBlob, { contentType: 'image/jpeg' });
    if (error) throw new Error('Envoi de la photo impossible : ' + error.message);
    const r = await call('add_scan', { p_model: modelId, p_custom: !!new FormData(e.target).get('custom'), p_photo: path });
    toast([r.bonus ? '+1 booster bonus 🎁' : 'Ajoutée au garage (bonus du jour atteint)', r.mac ? `palier : +${r.mac} MAC` : ''].filter(Boolean).join(' · '));
    go('garage');
  } catch (err) { fail(err); }
  finally { btn.disabled = false; btn.textContent = 'Ajouter au garage'; }
};

// ---------- Démarrage ----------
loadModels().then(() => {
  if (!configured) {
    showView('login');
    $('#view-login .login').innerHTML = '<h2>Configuration manquante</h2><p class="hint">Remplis l’adresse et la clé publique de ton projet Supabase dans <b>config.js</b>.</p>';
    return;
  }
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; setTimeout(showRecovery, 0); }
    const changed = s?.user?.id !== session?.user?.id;
    session = s;
    if (changed) setTimeout(boot, 0);   // hors du callback pour éviter un blocage de Supabase
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) { session = null; boot(); } });
}).catch(() => toast('Impossible de charger la base des voitures'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
