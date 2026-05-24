// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG & STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let SETTINGS = {
  tmdbKey: '2e7426a1e6772950462cf2eda4f5a807',
  omdbKey: 'c49621a4',
  rawgKey: 'be6e6c9f5b734399b10f6c2bb59ae333',
  supabaseUrl: 'https://jqabfmdggybqgrgqhbkk.supabase.co',
  supabaseKey: ''
};

let currentSection = 'home';
let currentFilter = { movies: 'all', series: 'all', games: 'all', diary: 'all' };
let currentSort = { movies: 'recent', series: 'recent', games: 'recent', diary: 'recent' };
let activeModal = null;
let searchDebounce = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function storageGet(key) {
  try {
    if (window.storage && typeof window.storage.get === 'function') {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : null;
    }
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch { return null; }
}

async function storageSet(key, value) {
  try {
    if (window.storage && typeof window.storage.set === 'function') {
      await window.storage.set(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch (e) {
    showToast('Erro ao salvar dados', 'error');
    return false;
  }
}

async function storageDelete(key) {
  try {
    if (window.storage && typeof window.storage.delete === 'function') {
      await window.storage.delete(key);
    } else {
      localStorage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
}

async function loadAll(type) {
  return (await storageGet(`mv:${type}`)) || [];
}

async function saveItem(item) {
  const key = `mv:${item.type === 'movie' ? 'movies' : item.type === 'series' ? 'series' : 'games'}`;
  let items = await loadAll(item.type === 'movie' ? 'movies' : item.type === 'series' ? 'series' : 'games');
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = { ...items[idx], ...item };
  else {
    item.addedAt = item.addedAt || new Date().toISOString();
    items.push(item);
  }
  await storageSet(key, items);
  await updateDiary(item);
  return item;
}

async function removeItem(id, type) {
  const key = `mv:${type === 'movie' ? 'movies' : type === 'series' ? 'series' : 'games'}`;
  let items = await loadAll(type === 'movie' ? 'movies' : type === 'series' ? 'series' : 'games');
  items = items.filter(i => i.id !== id);
  await storageSet(key, items);
  let diary = (await storageGet('mv:diary')) || [];
  diary = diary.filter(d => d.mediaId !== id);
  await storageSet('mv:diary', diary);
}

async function updateDiary(item) {
  const shouldLog = ['watched','completed','abandoned','playing','watching'].includes(item.status) || item.personalRating > 0;
  if (!shouldLog) return;
  let diary = (await storageGet('mv:diary')) || [];
  const existing = diary.findIndex(d => d.mediaId === item.id);
  const entry = {
    id: `diary_${item.id}`,
    mediaId: item.id,
    type: item.type,
    title: item.title,
    posterPath: item.posterPath,
    status: item.status,
    personalRating: item.personalRating,
    personalReview: item.personalReview,
    tags: item.tags || [],
    viewDate: item.viewDate || new Date().toISOString().split('T')[0],
    loggedAt: new Date().toISOString()
  };
  if (existing >= 0) diary[existing] = entry;
  else diary.unshift(entry);
  diary.sort((a,b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  await storageSet('mv:diary', diary);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOAST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function showToast(msg, type = 'info', duration = 3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = {
    success: '✓', error: '✕', info: 'ℹ'
  };
  t.innerHTML = `<span style="font-size:16px">${icons[type]}</span><span style="font-size:13px;font-weight:500">${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, duration);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  document.getElementById(`sec-${section}`).classList.add('active');
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
  currentSection = section;
  if (section === 'home') renderHome();
  if (section === 'movies') renderGrid('movies');
  if (section === 'series') renderGrid('series');
  if (section === 'games') renderGrid('games');
  if (section === 'diary') {
    renderDiary();
    loadPlexHistoryRealtime().then(() => {
      if (currentSection === 'diary') renderDiary();
    });
  }
  if (section === 'settings') loadSettingsForm();
}

document.querySelectorAll('.sb-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.section));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TMDB API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function searchTMDB(query, type = 'movie') {
  try {
    const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
    const r = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${SETTINGS.tmdbKey}&query=${encodeURIComponent(query)}&language=pt-BR`);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

async function getTMDBDetails(id, type) {
  try {
    const endpoint = type === 'movie' ? `movie/${id}` : `tv/${id}`;
    const r = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${SETTINGS.tmdbKey}&language=pt-BR&append_to_response=credits`);
    return await r.json();
  } catch { return null; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OMDB API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function getOMDB(title, year) {
  try {
    const r = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year}&apikey=${SETTINGS.omdbKey}`);
    const d = await r.json();
    return d.Response === 'True' ? d : null;
  } catch { return null; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RAWG API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function searchRAWG(query) {
  try {
    const r = await fetch(`https://api.rawg.io/api/games?key=${SETTINGS.rawgKey}&search=${encodeURIComponent(query)}&page_size=8`);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

async function getRAWGDetails(id) {
  try {
    const r = await fetch(`https://api.rawg.io/api/games/${id}?key=${SETTINGS.rawgKey}`);
    return await r.json();
  } catch { return null; }
}

async function discoverTMDBMovies(genreId) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${SETTINGS.tmdbKey}&language=pt-BR&sort_by=popularity.desc&with_genres=${genreId}&page=1`);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

window.refreshImageCache = async function() {
  showToast('Atualizando cache de imagens... isso pode levar alguns minutos', 'info', 5000);
  const [movies, series, games] = await Promise.all([loadAll('movies'), loadAll('series'), loadAll('games')]);

  const updateMovie = async item => {
    if (item.type !== 'movie') return item;
    const results = await searchTMDB(item.title, 'movie');
    const match = results.find(r => (r.title || '').toLowerCase() === item.title.toLowerCase()) || results[0];
    if (match && match.poster_path) {
      item.posterPath = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
      item.backdropPath = match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : item.backdropPath;
    }
    return item;
  };

  const updateSeries = async item => {
    if (item.type !== 'series') return item;
    const results = await searchTMDB(item.title, 'tv');
    const match = results.find(r => (r.name || '').toLowerCase() === item.title.toLowerCase()) || results[0];
    if (match && match.poster_path) {
      item.posterPath = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
      item.backdropPath = match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : item.backdropPath;
    }
    return item;
  };

  const updateGame = async item => {
    if (item.type !== 'game') return item;
    const results = await searchRAWG(item.title);
    const match = results.find(r => (r.name || '').toLowerCase() === item.title.toLowerCase()) || results[0];
    if (match && match.background_image) {
      item.posterPath = match.background_image;
    }
    return item;
  };

  const updatedMovies = await Promise.all(movies.map(updateMovie));
  const updatedSeries = await Promise.all(series.map(updateSeries));
  const updatedGames = await Promise.all(games.map(updateGame));

  await storageSet('mv:movies', updatedMovies);
  await storageSet('mv:series', updatedSeries);
  await storageSet('mv:games', updatedGames);

  showToast('Cache de imagens atualizado', 'success', 5000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PSN SYNC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function syncPSN() {
  const btn = document.getElementById('psn-sync-btn');
  const btnText = document.getElementById('psn-btn-text');
  if (btn.disabled) return;
  btn.disabled = true;
  btnText.innerHTML = '<span class="spin">↻</span> Sincronizando...';
  const username = SETTINGS.psnUser || 'LuisAugustoBr1';
  
  showToast(`Conectando ao PSNProfiles de ${username}...`, 'info', 2500);
  
  try {
    // Fetch via CORS proxy to avoid browser restrictions
    const profileUrl = `https://psnprofiles.com/${username}?order=last-played`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(profileUrl)}`;
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
    const data = await resp.json();
    const html = data.contents;
    
    if (!html) throw new Error('Sem resposta');
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Parse trophy stats
    let trophyData = { platinum: 0, gold: 0, silver: 0, bronze: 0, total: 0, level: 0, levelProgress: 0 };
    
    // Level
    const levelText = doc.querySelector('.level .value, .level span, .user-bar .bar-link, .progress-bar .value');
    if (levelText) {
      const lm = levelText.textContent.match(/\d+/);
      if (lm) trophyData.level = parseInt(lm[0]);
    }

    // Trophy counts from summary
    const trophyEls = doc.querySelectorAll('.trophy-count .value, [class*="trophy"] .number, .trophy .title');
    doc.querySelectorAll('ul.trophy-count li, .stats li').forEach(li => {
      const txt = li.textContent.toLowerCase();
      const num = li.querySelector('b, span, .value')?.textContent?.replace(/[^\d]/g,'');
      if (!num) return;
      if (txt.includes('platinum') || li.querySelector('.platinum,.plat')) trophyData.platinum = parseInt(num)||0;
      else if (txt.includes('gold') || li.querySelector('.gold')) trophyData.gold = parseInt(num)||0;
      else if (txt.includes('silver') || li.querySelector('.silver')) trophyData.silver = parseInt(num)||0;
      else if (txt.includes('bronze') || li.querySelector('.bronze')) trophyData.bronze = parseInt(num)||0;
    });
    
    // Fallback: try to find any stats numbers
    if (trophyData.platinum === 0 && trophyData.gold === 0) {
      const allNums = doc.querySelectorAll('.trophy-count span, .count, [data-value]');
      let i = 0;
      allNums.forEach(el => {
        const n = parseInt(el.textContent.replace(/[^\d]/g,''));
        if (!isNaN(n) && n >= 0) {
          if (i === 0) trophyData.platinum = n;
          else if (i === 1) trophyData.gold = n;
          else if (i === 2) trophyData.silver = n;
          else if (i === 3) trophyData.bronze = n;
          i++;
        }
      });
    }

    trophyData.total = trophyData.platinum + trophyData.gold + trophyData.silver + trophyData.bronze;

    // Parse games list
    const gameItems = doc.querySelectorAll('#gamesTable tr[class], #gamesTable .game-row, tr.title, .games-list tr, table#gamesTable tbody tr');
    const psnGames = [];

    gameItems.forEach(row => {
      const titleEl = row.querySelector('.title a, a.title, .game-title a, td.game a');
      const coverEl = row.querySelector('img.game-image, img.game, td.game img, img[src*="psnprofiles"]');
      const progressEl = row.querySelector('.progress, .trophy-progress, .completion');
      const trophiesEl = row.querySelectorAll('.icon-trophy, .trophy, [class*="icon-"]');

      if (!titleEl) return;

      const title = titleEl.textContent.trim();
      const href = titleEl.getAttribute('href') || '';
      const coverSrc = coverEl?.getAttribute('src') || coverEl?.getAttribute('data-src') || '';
      const progressText = progressEl?.textContent?.trim() || '';
      const progressMatch = progressText.match(/(\d+)%/);
      const completionPct = progressMatch ? parseInt(progressMatch[1]) : 0;

      // Count trophies from row
      let rowTrophies = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
      trophiesEl.forEach(el => {
        const cls = el.className || '';
        const val = parseInt(el.textContent.replace(/[^\d]/g,'')) || 1;
        if (cls.includes('platinum')) rowTrophies.platinum = val;
        else if (cls.includes('gold')) rowTrophies.gold = val;
        else if (cls.includes('silver')) rowTrophies.silver = val;
        else if (cls.includes('bronze')) rowTrophies.bronze = val;
      });

      if (title && title.length > 1) {
        psnGames.push({
          title,
          coverUrl: coverSrc.startsWith('http') ? coverSrc : (coverSrc ? `https://psnprofiles.com${coverSrc}` : ''),
          completionPct,
          trophies: rowTrophies,
          psnHref: href.startsWith('http') ? href : `https://psnprofiles.com${href}`,
          platform: 'PS4/PS5'
        });
      }
    });

    // Fallback: try another selector pattern
    if (psnGames.length === 0) {
      doc.querySelectorAll('a[href*="/trophies/"]').forEach(a => {
        const title = a.textContent.trim();
        const img = a.closest('tr,li,div')?.querySelector('img');
        if (title && title.length > 2 && !title.includes('PSNProfiles') && !title.includes('Trophy')) {
          psnGames.push({
            title,
            coverUrl: img?.src || img?.dataset.src || '',
            completionPct: 0,
            trophies: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
            psnHref: a.href,
            platform: 'PlayStation'
          });
        }
      });
    }

    // Save PSN data
    const psnSaveData = {
      username,
      trophies: trophyData,
      gamesCount: psnGames.length,
      syncedAt: new Date().toISOString()
    };
    await storageSet('mv:psn', psnSaveData);

    // Merge/add PSN games into games library
    let existingGames = await loadAll('games');
    let newCount = 0;
    let updatedCount = 0;

    for (const pg of psnGames.slice(0, 50)) { // limit to 50
      const existing = existingGames.find(g => 
        g.title.toLowerCase() === pg.title.toLowerCase() ||
        g.title.toLowerCase().includes(pg.title.toLowerCase().substring(0,10))
      );

      if (existing) {
        // Update PSN data
        existing.psnSynced = true;
        existing.psnTrophies = pg.trophies;
        existing.completionPct = pg.completionPct;
        if (pg.coverUrl && !existing.posterPath.includes('rawg')) {
          existing.psnCover = pg.coverUrl;
        }
        updatedCount++;
      } else {
        // Try to get RAWG cover
        let rawgData = null;
        try {
          const rawgSearch = await fetch(`https://api.rawg.io/api/games?key=${SETTINGS.rawgKey}&search=${encodeURIComponent(pg.title)}&page_size=1`);
          const rawgJson = await rawgSearch.json();
          rawgData = rawgJson.results?.[0] || null;
        } catch {}

        const newGame = {
          id: `psn_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
          type: 'game',
          title: pg.title,
          year: rawgData?.released ? new Date(rawgData.released).getFullYear() : 0,
          posterPath: rawgData?.background_image || pg.coverUrl || '',
          status: pg.completionPct === 100 ? 'completed' : pg.completionPct > 0 ? 'playing' : 'backlog',
          personalRating: 0,
          personalReview: '',
          viewDate: '',
          tags: ['psn-sync'],
          isFavorite: false,
          platforms: ['PlayStation'],
          hoursPlayed: 0,
          completionStatus: pg.completionPct === 100 ? '100%' : 'Em progresso',
          externalRatings: {
            imdb: '',
            rt: '',
            metacritic: rawgData?.metacritic || 0
          },
          addedAt: new Date().toISOString(),
          psnSynced: true,
          psnTrophies: pg.trophies,
          completionPct: pg.completionPct,
          rawgId: rawgData?.id || null
        };
        existingGames.push(newGame);
        newCount++;
      }
    }

    await storageSet('mv:games', existingGames);

    // Update UI
    renderTrophyBar(psnSaveData);
    renderGrid('games');

    const gamesSummary = psnGames.length > 0 
      ? `${psnGames.length} jogos encontrados, ${newCount} novos, ${updatedCount} atualizados.`
      : 'Perfil sincronizado. Os jogos serão exibidos conforme você jogar.';
    
    showToast(`PSN sincronizado! ${gamesSummary}`, 'success', 5000);
    document.getElementById('psn-status').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:#4fe896"><circle cx="12" cy="12" r="10"/></svg> PSN Online`;

  } catch(e) {
    console.error('PSN sync error:', e);
    // Try to at least show cached data
    const cached = await storageGet('mv:psn');
    if (cached) {
      renderTrophyBar(cached);
      showToast('Usando dados PSN em cache. Verifique sua conexão.', 'info');
    } else {
      showToast('Não foi possível sincronizar o PSN. Verifique se o perfil é público.', 'error', 5000);
    }
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Sincronizar PSN';
  }
}

// Expose globally
window.syncPSN = syncPSN;

function renderTrophyBar(psnData) {
  const bar = document.getElementById('trophy-bar');
  bar.style.display = 'block';
  document.getElementById('psn-username-display').textContent = psnData.username;
  document.getElementById('psn-sync-time').textContent = `Sincronizado ${timeAgo(psnData.syncedAt)}`;
  
  const tc = document.getElementById('trophy-counts');
  const t = psnData.trophies;
  
  const platIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 4.5h4.8l-3.9 2.8 1.5 4.5L12 11l-3.9 2.8 1.5-4.5L5.7 6.5h4.8L12 2z"/><ellipse cx="12" cy="20" rx="6" ry="2" opacity="0.5"/></svg>`;
  const goldIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`;
  
  tc.innerHTML = `
    <div class="trophy-item t-plat">${platIcon}<strong>${t.platinum || 0}</strong><span style="color:var(--text-secondary);font-size:12px">Platina</span></div>
    <div class="trophy-item t-gold">${goldIcon}<strong>${t.gold || 0}</strong><span style="color:var(--text-secondary);font-size:12px">Ouro</span></div>
    <div class="trophy-item t-silver">${goldIcon}<strong>${t.silver || 0}</strong><span style="color:var(--text-secondary);font-size:12px">Prata</span></div>
    <div class="trophy-item t-bronze">${goldIcon}<strong>${t.bronze || 0}</strong><span style="color:var(--text-secondary);font-size:12px">Bronze</span></div>
    <div class="trophy-item" style="margin-left:auto;color:var(--text-secondary)">Total: <strong style="color:var(--text-primary)">${t.total || 0}</strong></div>
  `;

  if (t.level > 0) {
    document.getElementById('psn-level-display').textContent = `Nível ${t.level}`;
    document.getElementById('psn-level-bar').style.width = `${t.levelProgress || 50}%`;
  }
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs/24)} dia(s)`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRID RENDERING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function renderGrid(type) {
  const gridId = `${type}-grid`;
  const emptyId = `${type}-empty`;
  const grid = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);

  // Skeleton
  grid.innerHTML = Array(8).fill(0).map(() =>
    `<div class="skeleton" style="aspect-ratio:2/3;border-radius:var(--radius)"></div>`
  ).join('');

  const rawType = type === 'movies' ? 'movies' : type === 'series' ? 'series' : 'games';
  let items = await loadAll(rawType);
  const filterKey = type === 'movies' ? 'movies' : type === 'series' ? 'series' : 'games';
  const filter = currentFilter[filterKey];
  const sort = currentSort[filterKey];

  // Filter
  if (filter === 'watched') items = items.filter(i => i.status === 'watched');
  else if (filter === 'watchlist') items = items.filter(i => i.status === 'watchlist');
  else if (filter === 'favorites') items = items.filter(i => i.isFavorite);
  else if (filter === 'completed') items = items.filter(i => i.status === 'completed');
  else if (filter === 'playing') items = items.filter(i => i.status === 'playing');
  else if (filter === 'backlog') items = items.filter(i => i.status === 'backlog');
  else if (filter === 'psn') items = items.filter(i => i.psnSynced);

  // Sort
  if (sort === 'title') items.sort((a,b) => a.title.localeCompare(b.title));
  else if (sort === 'rating') items.sort((a,b) => (b.personalRating||0) - (a.personalRating||0));
  else if (sort === 'playtime') items.sort((a,b) => (b.hoursPlayed||0) - (a.hoursPlayed||0));
  else items.sort((a,b) => new Date(b.addedAt||0) - new Date(a.addedAt||0));

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = items.map(item => renderCard(item)).join('');

  // Add click events
  grid.querySelectorAll('.media-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id, card.dataset.type));
  });
}

function renderCard(item) {
  const statusMap = {
    watched: 'badge-watched', watchlist: 'badge-watchlist', watching: 'badge-watching',
    abandoned: 'badge-abandoned', completed: 'badge-completed', playing: 'badge-playing',
    backlog: 'badge-backlog'
  };
  const statusLabels = {
    watched: 'Assistido', watchlist: 'Quero Ver', watching: 'Assistindo',
    abandoned: 'Abandonado', completed: 'Zerado', playing: 'Jogando',
    backlog: 'Backlog'
  };

  const badgeClass = statusMap[item.status] || '';
  const badgeLabel = statusLabels[item.status] || '';
  const stars = item.personalRating ? '★'.repeat(Math.floor(item.personalRating)) : '';
  const posterUrl = item.posterPath || '';

  const placeholderSvg = item.type === 'game'
    ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 12h4M8 10v4" stroke="#4f9de8" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="10" r="1" fill="#4f9de8"/><circle cx="17" cy="12" r="1" fill="#4f9de8"/><path d="M3 9a4 4 0 014-4h10a4 4 0 014 4v2a8 8 0 01-8 8v0a8 8 0 01-8-8V9z" stroke="#4f9de8" stroke-width="2"/></svg>`
    : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="#e5a00d" stroke-width="2"/><circle cx="9" cy="12" r="3" stroke="#e5a00d" stroke-width="2"/><path d="M13 9l4 3-4 3V9z" fill="#e5a00d"/></svg>`;

  const trophyBadge = item.psnSynced && item.psnTrophies ? `
    <div style="position:absolute;bottom:8px;left:8px;background:rgba(0,48,135,0.85);border:1px solid rgba(79,157,232,0.3);border-radius:6px;padding:3px 6px;font-size:10px;display:flex;gap:4px;align-items:center;backdrop-filter:blur(4px)">
      <span style="color:#b0c4de">🏆</span>
      <span style="color:#ffd700">${item.psnTrophies.platinum||0}</span>
      <span style="color:#c0c0c0">${item.psnTrophies.silver||0}</span>
      <span style="color:#cd7f32">${item.psnTrophies.bronze||0}</span>
    </div>` : '';

  return `
    <div class="media-card" data-id="${item.id}" data-type="${item.type}" style="${item.psnSynced ? 'box-shadow:0 0 0 1px rgba(79,157,232,0.25)' : ''}">
      ${posterUrl ? `<img src="${posterUrl}" alt="${item.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div style="display:none;align-items:center;justify-content:center;width:100%;height:100%;background:var(--bg-elevated)">${placeholderSvg}</div>` 
      : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--bg-elevated)">${placeholderSvg}</div>`}
      ${badgeClass ? `<div class="card-status-badge ${badgeClass}">${badgeLabel}</div>` : ''}
      ${trophyBadge}
      ${item.isFavorite ? `<div style="position:absolute;top:8px;left:8px;color:var(--accent);font-size:14px;text-shadow:0 1px 4px rgba(0,0,0,0.8)">★</div>` : ''}
      <div class="card-overlay">
        <div class="card-overlay-title">${item.title}</div>
        <div class="card-overlay-meta">
          <span>${item.year || ''}</span>
          ${stars ? `<span style="color:var(--accent)">${stars}</span>` : ''}
          ${item.completionPct ? `<span style="color:var(--accent-blue)">${item.completionPct}%</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupSearch(inputId, dropdownId, type) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce[inputId]);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    searchDebounce[inputId] = setTimeout(async () => {
      dropdown.innerHTML = `<div style="padding:12px;color:var(--text-secondary);font-size:13px;display:flex;gap:8px;align-items:center"><span class="spin">↻</span>Buscando...</div>`;
      dropdown.style.display = 'block';
      
      let results = [];
      if (type === 'movie') results = await searchTMDB(q, 'movie');
      else if (type === 'series') results = await searchTMDB(q, 'tv');
      else if (type === 'game') results = await searchRAWG(q);

      if (!results.length) {
        dropdown.innerHTML = `<div style="padding:12px;color:var(--text-secondary);font-size:13px">Nenhum resultado encontrado</div>`;
        return;
      }

      dropdown.innerHTML = results.slice(0,8).map(r => {
        const title = r.title || r.name || r.original_title || '';
        const year = r.release_date?.substring(0,4) || r.first_air_date?.substring(0,4) || r.released?.substring(0,4) || '';
        const poster = type === 'game' 
          ? r.background_image || '' 
          : r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '';
        const platforms = r.platforms?.map(p => p.platform.name).slice(0,2).join(', ') || '';
        
        return `<div class="search-result-item" data-id="${r.id}" data-type="${type}">
          ${poster ? `<img class="search-result-img" src="${poster}" alt="" onerror="this.style.display='none'">` : `<div class="search-result-img" style="background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:20px">${type==='game'?'🎮':'🎬'}</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${year}${platforms ? ' · ' + platforms : ''}</div>
          </div>
          <div style="font-size:11px;color:var(--accent);font-weight:600;flex-shrink:0">+ Add</div>
        </div>`;
      }).join('');

      dropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const t = item.dataset.type;
          dropdown.style.display = 'none';
          input.value = '';
          openNewItemModal(id, t);
        });
      });

    }, 400);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let modalCurrentItem = null;

async function openNewItemModal(tmdbOrRawgId, type) {
  showModalSkeleton();
  let details = null, omdb = null, item = null;

  if (type === 'movie' || type === 'series') {
    details = await getTMDBDetails(tmdbOrRawgId, type);
    if (!details) { showToast('Erro ao buscar detalhes', 'error'); return; }
    const title = details.title || details.name;
    const year = (details.release_date || details.first_air_date || '').substring(0,4);
    omdb = await getOMDB(title, year);
    
    item = {
      id: `${type}_${tmdbOrRawgId}`,
      type,
      title,
      year: parseInt(year) || 0,
      posterPath: details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : '',
      backdropPath: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : '',
      status: 'watchlist',
      personalRating: 0,
      personalReview: '',
      viewDate: '',
      tags: [],
      isFavorite: false,
      externalRatings: {
        imdb: omdb?.imdbRating || '',
        imdbVotes: omdb?.imdbVotes || '',
        rt: omdb?.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || '',
        metacritic: 0
      },
      overview: details.overview,
      tagline: details.tagline,
      genres: (details.genres || []).map(g => g.name),
      addedAt: new Date().toISOString()
    };
  } else if (type === 'game') {
    const rawgDetails = await getRAWGDetails(tmdbOrRawgId);
    if (!rawgDetails) { showToast('Erro ao buscar detalhes do jogo', 'error'); return; }
    item = {
      id: `game_${tmdbOrRawgId}`,
      type: 'game',
      title: rawgDetails.name,
      year: parseInt((rawgDetails.released || '').substring(0,4)) || 0,
      posterPath: rawgDetails.background_image || '',
      status: 'backlog',
      personalRating: 0,
      personalReview: '',
      viewDate: '',
      tags: [],
      isFavorite: false,
      platforms: (rawgDetails.platforms || []).map(p => p.platform.name),
      hoursPlayed: 0,
      completionStatus: 'Em progresso',
      externalRatings: {
        metacritic: rawgDetails.metacritic || 0,
        rawgRating: rawgDetails.rating || 0,
        rawgCount: rawgDetails.ratings_count || 0
      },
      overview: rawgDetails.description_raw || rawgDetails.description || '',
      genres: (rawgDetails.genres || []).map(g => g.name),
      addedAt: new Date().toISOString(),
      rawgId: tmdbOrRawgId
    };
  }

  openModalWithItem(item);
}

async function openModal(itemId, type) {
  showModalSkeleton();
  const rawType = type === 'movie' ? 'movies' : type === 'series' ? 'series' : 'games';
  const items = await loadAll(rawType);
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  openModalWithItem(item);
}

function showModalSkeleton() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('open');
  document.getElementById('modal-left').innerHTML = `
    <div class="skeleton" style="width:100%;aspect-ratio:2/3;border-radius:var(--radius)"></div>
    <div class="skeleton" style="height:36px;border-radius:8px;margin-top:12px"></div>
    <div class="skeleton" style="height:36px;border-radius:8px;margin-top:8px"></div>
  `;
  document.getElementById('modal-right').innerHTML = `
    <div class="skeleton" style="height:28px;width:70%;border-radius:6px;margin-bottom:8px"></div>
    <div class="skeleton" style="height:16px;width:40%;border-radius:6px;margin-bottom:16px"></div>
    <div class="skeleton" style="height:80px;border-radius:8px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:80px;border-radius:8px"></div>
  `;
}

function openModalWithItem(item) {
  modalCurrentItem = { ...item };
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('open');

  // Backdrop
  const bdrop = document.getElementById('modal-backdrop');
  if (item.backdropPath) bdrop.style.backgroundImage = `url(${item.backdropPath})`;
  else if (item.posterPath) bdrop.style.backgroundImage = `url(${item.posterPath})`;
  else bdrop.style.backgroundImage = '';

  const statusOptions = item.type === 'game'
    ? ['backlog', 'playing', 'completed', 'abandoned']
    : ['watchlist', 'watching', 'watched', 'abandoned'];
  const statusLabels = {
    backlog: 'Backlog', playing: 'Jogando', completed: 'Zerado',
    watchlist: 'Quero Assistir', watching: 'Assistindo', watched: 'Assistido', abandoned: 'Abandonado'
  };

  // LEFT COLUMN
  const posterHtml = item.posterPath
    ? `<img class="modal-poster" src="${item.posterPath}" alt="${item.title}" onerror="this.src=''">`
    : `<div class="modal-poster" style="display:flex;align-items:center;justify-content:center;background:var(--bg-elevated)">${item.type==='game'?`<svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M6 12h4M8 10v4" stroke="#4f9de8" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="10" r="1" fill="#4f9de8"/><circle cx="17" cy="12" r="1" fill="#4f9de8"/><path d="M3 9a4 4 0 014-4h10a4 4 0 014 4v2a8 8 0 01-8 8v0a8 8 0 01-8-8V9z" stroke="#4f9de8" stroke-width="2"/></svg>`:''}</div>`;

  document.getElementById('modal-left').innerHTML = `
    ${posterHtml}
    <div>
      <label class="label-sm">Status</label>
      <select class="status-select" id="m-status">
        ${statusOptions.map(s => `<option value="${s}" ${item.status===s?'selected':''}>${statusLabels[s]}</option>`).join('')}
      </select>
    </div>
    <button class="fav-btn ${item.isFavorite?'active':''}" id="m-fav" onclick="toggleFav()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${item.isFavorite?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
      ${item.isFavorite ? 'Favorito' : 'Adicionar aos favoritos'}
    </button>
    ${item.type === 'game' ? `
    <div>
      <label class="label-sm">Horas Jogadas</label>
      <input type="number" class="num-input" id="m-hours" value="${item.hoursPlayed||0}" min="0" step="0.5" placeholder="0">
    </div>
    <div>
      <label class="label-sm">Plataformas</label>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${['PS5','PS4','PC','Xbox Series','Nintendo Switch','Mobile'].map(p => 
          `<label class="platform-check"><input type="checkbox" value="${p}" ${(item.platforms||[]).includes(p)?'checked':''}> ${p}</label>`
        ).join('')}
      </div>
    </div>
    ` : ''}
    <div>
      <label class="label-sm">Data ${item.type==='game'?'de início':'de visualização'}</label>
      <input type="date" class="date-input" id="m-date" value="${item.viewDate||''}">
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1;justify-content:center;font-size:13px" onclick="saveModal()">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2"/><polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" stroke-width="2"/></svg>
        Salvar
      </button>
      <button class="btn-ghost" style="color:var(--accent-red);border-color:rgba(232,79,79,0.2)" onclick="deleteItem()">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 6V4h6v2" stroke="currentColor" stroke-width="2"/></svg>
      </button>
    </div>
  `;

  // RIGHT COLUMN
  const rtScore = item.externalRatings?.rt || '';
  const rtNum = parseInt(rtScore) || 0;
  const rtClass = rtNum >= 60 ? 'rt-fresh' : 'rt-rotten';
  const rtLabel = rtNum >= 60 ? '🍅 Fresh' : '🤢 Rotten';

  const metacriticScore = item.externalRatings?.metacritic || 0;
  const metaColor = metacriticScore >= 75 ? '#66cc33' : metacriticScore >= 50 ? '#ffcc33' : metacriticScore > 0 ? '#ff6666' : '';
  const metaTextColor = metacriticScore >= 50 && metacriticScore < 75 ? '#000' : '#fff';

  const ratingsHtml = item.type !== 'game' ? `
    ${item.externalRatings?.imdb ? `
    <div class="rating-badge">
      <span class="rating-logo imdb-logo">IMDb</span>
      <div><div class="rating-val">${item.externalRatings.imdb}<span style="font-size:11px;color:var(--text-secondary)">/10</span></div>
      ${item.externalRatings.imdbVotes ? `<div class="rating-sub">${item.externalRatings.imdbVotes} votos</div>` : ''}</div>
    </div>` : ''}
    ${rtScore ? `
    <div class="rating-badge">
      <span class="rating-logo rt-logo">RT</span>
      <div><div class="rating-val ${rtClass}">${rtScore}</div><div class="rating-sub">${rtLabel}</div></div>
    </div>` : ''}
    <a class="rating-badge" href="https://letterboxd.com/search/${encodeURIComponent((item.title||'') + ' ' + (item.year||''))}" target="_blank" style="cursor:pointer">
      <span class="rating-logo lb-logo">LB</span>
      <div><div class="rating-val" style="font-size:13px">Letterboxd</div><div class="rating-sub">Ver críticas →</div></div>
    </a>
  ` : `
    ${metacriticScore ? `
    <div class="rating-badge">
      <div class="meta-logo" style="background:${metaColor};color:${metaTextColor};font-size:14px;font-weight:900;padding:4px 8px;border-radius:4px;min-width:36px;text-align:center">${metacriticScore}</div>
      <div><div class="rating-val">Metacritic</div><div class="rating-sub">${metacriticScore>=75?'Universal Acclaim':metacriticScore>=50?'Mixed Reviews':'Overwhelming Dislike'}</div></div>
    </div>` : ''}
    ${item.externalRatings?.rawgRating ? `
    <div class="rating-badge">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color:var(--accent-blue)"><path d="M6 12h4M8 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M3 9a4 4 0 014-4h10a4 4 0 014 4v2a8 8 0 01-8 8v0a8 8 0 01-8-8V9z" stroke="currentColor" stroke-width="2"/></svg>
      <div><div class="rating-val">${Number(item.externalRatings.rawgRating).toFixed(1)}<span style="font-size:11px;color:var(--text-secondary)">/5</span></div><div class="rating-sub">RAWG · ${item.externalRatings.rawgCount||0} avaliações</div></div>
    </div>` : ''}
    <a class="rating-badge" href="https://opencritic.com/search?criteria=${encodeURIComponent(item.title||'')}" target="_blank">
      <span class="rating-logo oc-logo">OC</span>
      <div><div class="rating-val" style="font-size:13px">OpenCritic</div><div class="rating-sub">Ver score →</div></div>
    </a>
  `;

  // PSN Trophy block for game
  const psnTrophyBlock = item.psnSynced && item.psnTrophies ? `
    <div style="background:rgba(0,48,135,0.2);border:1px solid rgba(79,157,232,0.2);border-radius:var(--radius);padding:12px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--accent-blue);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.786 5.184C18.104 2.617 14.395 1 10.322 1 4.984 1 .54 4.25.54 8.19c0 2.133 1.388 4.047 3.606 5.382l.75-.982C3.15 11.597 2.189 10.016 2.189 8.19c0-3.068 3.68-5.542 8.133-5.542 3.564 0 6.81 1.404 9.054 3.608L17.3 8.334h5.16V3.175L20.786 5.184z"/></svg>
        Troféus PSN
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <span class="t-plat" style="font-size:13px">🏆 ${item.psnTrophies.platinum||0} Platina</span>
        <span class="t-gold" style="font-size:13px">🥇 ${item.psnTrophies.gold||0} Ouro</span>
        <span class="t-silver" style="font-size:13px">🥈 ${item.psnTrophies.silver||0} Prata</span>
        <span class="t-bronze" style="font-size:13px">🥉 ${item.psnTrophies.bronze||0} Bronze</span>
      </div>
      ${item.completionPct > 0 ? `
      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px">
          <span>Conclusão</span><span>${item.completionPct}%</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${item.completionPct}%;background:var(--accent-blue)"></div></div>
      </div>` : ''}
    </div>
  ` : '';

  document.getElementById('modal-right').innerHTML = `
    <div style="margin-bottom:4px;display:flex;align-items:center;gap:8px">
      <h2 style="font-size:22px;font-weight:700;line-height:1.2;flex:1">${item.title}</h2>
    </div>
    ${item.tagline ? `<p class="tagline-text">"${item.tagline}"</p>` : ''}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      ${item.year ? `<span style="color:var(--text-secondary);font-size:14px">${item.year}</span>` : ''}
      ${(item.genres||[]).map(g=>`<span class="genre-chip">${g}</span>`).join('')}
    </div>
    ${item.overview ? `<p style="color:var(--text-secondary);font-size:14px;line-height:1.7;margin-bottom:16px">${item.overview}</p>` : ''}
    
    ${psnTrophyBlock}

    <div class="m-divider"></div>
    
    <div style="margin-bottom:16px">
      <label class="label-sm">Ratings Externos</label>
      <div class="ratings-block">${ratingsHtml}</div>
    </div>

    <div class="m-divider"></div>

    <div style="margin-bottom:16px">
      <label class="label-sm">Avaliação Pessoal</label>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="stars-row" id="m-stars-row">${renderStarsInteractive(item.personalRating)}</div>
        <span style="font-size:14px;font-weight:600;color:var(--accent)" id="m-rating-display">${item.personalRating ? item.personalRating.toFixed(1) + ' / 5.0' : '—'}</span>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <label class="label-sm" style="margin:0">Crítica Pessoal</label>
        <span style="font-size:11px;color:var(--text-secondary)" id="m-charcount">${(item.personalReview||'').length}/1000</span>
      </div>
      <textarea class="review-textarea" id="m-review" maxlength="1000" placeholder="Escreva sua crítica...">${item.personalReview||''}</textarea>
    </div>

    <div>
      <label class="label-sm">Tags Pessoais</label>
      <div class="tags-wrap" id="m-tags-wrap" onclick="document.getElementById('m-tag-input').focus()">
        ${(item.tags||[]).map(tag=>`<span class="tag-chip">#${tag}<span class="rm" onclick="removeTag('${tag}')">×</span></span>`).join('')}
        <input class="tag-input" id="m-tag-input" placeholder="${(item.tags||[]).length?'':'+ adicionar tag'}" maxlength="30">
      </div>
    </div>
  `;

  // Wire up stars
  setupStarInteraction();

  // Char counter
  document.getElementById('m-review')?.addEventListener('input', function() {
    document.getElementById('m-charcount').textContent = `${this.value.length}/1000`;
  });

  // Tag input
  const tagInput = document.getElementById('m-tag-input');
  if (tagInput) {
    tagInput.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && tagInput.value.trim()) {
        e.preventDefault();
        addTag(tagInput.value.trim().replace(/^#+/,''));
        tagInput.value = '';
      } else if (e.key === 'Backspace' && !tagInput.value && modalCurrentItem.tags?.length) {
        const t = modalCurrentItem.tags[modalCurrentItem.tags.length-1];
        removeTag(t);
      }
    });
  }
}

function renderStarsInteractive(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i ? 'filled' : rating >= i - 0.5 ? 'half' : '';
    html += `<svg class="star ${filled}" data-val="${i}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`;
  }
  return html;
}

function setupStarInteraction() {
  const row = document.getElementById('m-stars-row');
  if (!row) return;
  row.querySelectorAll('.star').forEach(star => {
    star.addEventListener('mousemove', e => {
      const rect = star.getBoundingClientRect();
      const half = e.clientX < rect.left + rect.width / 2;
      const val = parseInt(star.dataset.val) - (half ? 0.5 : 0);
      highlightStars(val);
    });
    star.addEventListener('mouseleave', () => highlightStars(modalCurrentItem.personalRating || 0));
    star.addEventListener('click', e => {
      const rect = star.getBoundingClientRect();
      const half = e.clientX < rect.left + star.offsetWidth / 2;
      const val = parseInt(star.dataset.val) - (half ? 0.5 : 0);
      modalCurrentItem.personalRating = val;
      highlightStars(val);
      document.getElementById('m-rating-display').textContent = val.toFixed(1) + ' / 5.0';
      star.style.transform = 'scale(1.3)';
      setTimeout(() => star.style.transform = '', 200);
    });
  });
}

function highlightStars(val) {
  document.querySelectorAll('#m-stars-row .star').forEach((s, idx) => {
    const n = idx + 1;
    s.classList.remove('filled', 'half');
    if (val >= n) s.classList.add('filled');
    else if (val >= n - 0.5) s.classList.add('half');
  });
}

window.toggleFav = function() {
  if (!modalCurrentItem) return;
  modalCurrentItem.isFavorite = !modalCurrentItem.isFavorite;
  const btn = document.getElementById('m-fav');
  btn.classList.toggle('active', modalCurrentItem.isFavorite);
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${modalCurrentItem.isFavorite?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
  ${modalCurrentItem.isFavorite ? 'Favorito' : 'Adicionar aos favoritos'}`;
};

window.addTag = function(tag) {
  if (!tag || !modalCurrentItem) return;
  if (!modalCurrentItem.tags) modalCurrentItem.tags = [];
  if (modalCurrentItem.tags.includes(tag)) return;
  modalCurrentItem.tags.push(tag);
  const wrap = document.getElementById('m-tags-wrap');
  const input = document.getElementById('m-tag-input');
  const chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = `#${tag}<span class="rm" onclick="removeTag('${tag}')">×</span>`;
  wrap.insertBefore(chip, input);
};

window.removeTag = function(tag) {
  if (!modalCurrentItem) return;
  modalCurrentItem.tags = (modalCurrentItem.tags||[]).filter(t => t !== tag);
  const wrap = document.getElementById('m-tags-wrap');
  wrap.querySelectorAll('.tag-chip').forEach(c => {
    if (c.textContent.includes(tag)) c.remove();
  });
};

window.saveModal = async function() {
  if (!modalCurrentItem) return;
  // Collect form data
  const status = document.getElementById('m-status')?.value;
  const review = document.getElementById('m-review')?.value || '';
  const date = document.getElementById('m-date')?.value || '';

  if (status) modalCurrentItem.status = status;
  modalCurrentItem.personalReview = review;
  modalCurrentItem.viewDate = date;

  // Game-specific
  if (modalCurrentItem.type === 'game') {
    const hours = document.getElementById('m-hours');
    if (hours) modalCurrentItem.hoursPlayed = parseFloat(hours.value) || 0;
    const checks = document.querySelectorAll('#modal-left .platform-check input:checked');
    modalCurrentItem.platforms = Array.from(checks).map(c => c.value);
  }

  await saveItem(modalCurrentItem);
  showToast('✓ Salvo no MediaVault', 'success');
  closeModal();
  const sec = modalCurrentItem.type === 'movie' ? 'movies' : modalCurrentItem.type === 'series' ? 'series' : 'games';
  renderGrid(sec);
};

window.deleteItem = async function() {
  if (!modalCurrentItem) return;
  if (!confirm(`Remover "${modalCurrentItem.title}" da sua biblioteca?`)) return;
  const type = modalCurrentItem.type === 'movie' ? 'movie' : modalCurrentItem.type === 'series' ? 'series' : 'game';
  await removeItem(modalCurrentItem.id, type);
  showToast(`"${modalCurrentItem.title}" removido`, 'info');
  closeModal();
  const sec = modalCurrentItem.type === 'movie' ? 'movies' : modalCurrentItem.type === 'series' ? 'series' : 'games';
  renderGrid(sec);
};

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalCurrentItem = null;
}

window.exportBackup = async function() {
  showToast('Preparando backup e garantindo capas...', 'info', 3000);
  const movies = await loadAll('movies');
  const series = await loadAll('series');
  const games = await loadAll('games');
  const diary = await loadAll('diary');

  // Ensure posterPath present for export: try to fetch missing posters
  const ensurePoster = async item => {
    if (item.posterPath && item.posterPath.length) return item;
    try {
      if (item.type === 'movie') {
        const results = await searchTMDB(item.title, 'movie');
        const match = results.find(r => (r.title||'').toLowerCase() === (item.title||'').toLowerCase()) || results[0];
        if (match && match.poster_path) item.posterPath = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
      } else if (item.type === 'series') {
        const results = await searchTMDB(item.title, 'tv');
        const match = results.find(r => (r.name||'').toLowerCase() === (item.title||'').toLowerCase()) || results[0];
        if (match && match.poster_path) item.posterPath = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
      } else if (item.type === 'game') {
        const results = await searchRAWG(item.title);
        const match = results.find(r => (r.name||'').toLowerCase() === (item.title||'').toLowerCase()) || results[0];
        if (match && match.background_image) item.posterPath = match.background_image;
      }
    } catch (e) { /* ignore */ }
    return item;
  };

  const updatedMovies = await Promise.all(movies.map(ensurePoster));
  const updatedSeries = await Promise.all(series.map(ensurePoster));
  const updatedGames = await Promise.all(games.map(ensurePoster));

  const payload = {
    movies: updatedMovies,
    series: updatedSeries,
    games: updatedGames,
    diary: diary,
    psn: await storageGet('mv:psn') || {},
    settings: SETTINGS
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  link.href = URL.createObjectURL(blob);
  link.download = `mediavault_backup_${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Backup preparado para download', 'success');
};

window.importBackup = async function(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Arquivo inválido');

    const tryParse = v => {
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return v; }
      }
      return v;
    };

    const movies = Array.isArray(tryParse(data.movies)) ? tryParse(data.movies) : [];
    const series = Array.isArray(tryParse(data.series)) ? tryParse(data.series) : [];
    const games = Array.isArray(tryParse(data.games)) ? tryParse(data.games) : [];
    const diaryRaw = Array.isArray(tryParse(data.diary)) ? tryParse(data.diary) : [];
    const incomingSettings = tryParse(data.settings) || {};

    const statusMap = {
      'assistido': 'watched', 'assistida': 'watched', 'Assistido': 'watched', 'Assistida': 'watched',
      'quero ver': 'watchlist', 'Quero Ver': 'watchlist', 'watchlist': 'watchlist',
      'assistindo': 'watching', 'Assistindo': 'watching',
      'zerado': 'completed', 'Zerado': 'completed', 'playing': 'playing', 'Jogando': 'playing',
      'backlog': 'backlog'
    };

    const mappedDiary = diaryRaw.map(d => {
      const mediaId = d.itemId || d.mediaId || d.id || `import_${Math.random().toString(36).slice(2,9)}`;
      const type = (d.type === 'movie' || (d.type||'').toLowerCase().includes('movie')) ? 'movie' : (d.type === 'series' ? 'series' : 'game');
      const rawStatus = d.status || d.state || '';
      const status = statusMap[rawStatus] || statusMap[(rawStatus||'').toLowerCase()] || 'watched';
      const personalRating = d.rating ?? d.personalRating ?? 0;
      const personalReview = d.review ?? d.personalReview ?? '';
      const posterPath = d.posterPath || d.posterUrl || d.image || '';
      const viewDate = d.date ? (d.date.split('T')[0]) : (d.viewDate || '');
      const loggedAt = d.date || new Date().toISOString();

      return {
        id: `diary_${mediaId}`,
        mediaId: mediaId,
        type,
        title: d.title || d.name || '',
        posterPath,
        status,
        personalRating: Number(personalRating) || 0,
        personalReview: personalReview || '',
        tags: d.tags || [],
        viewDate,
        loggedAt
      };
    });

    await storageSet('mv:movies', movies);
    await storageSet('mv:series', series);
    await storageSet('mv:games', games);
    await storageSet('mv:diary', mappedDiary);
    if (data.psn) await storageSet('mv:psn', data.psn);

    const s = {};
    s.tmdbKey = incomingSettings.tmdbKey || incomingSettings.tmdb || incomingSettings.TMDB || SETTINGS.tmdbKey;
    s.omdbKey = incomingSettings.omdbKey || incomingSettings.omdb || incomingSettings.OMDB || SETTINGS.omdbKey;
    s.rawgKey = incomingSettings.rawgKey || incomingSettings.rawg || incomingSettings.RAWG || SETTINGS.rawgKey;
    SETTINGS = { ...SETTINGS, ...s };
    await storageSet('mv:settings', SETTINGS);

    showToast('Backup importado. Recarregando capas ausentes...', 'info', 3000);
    try { await window.refreshImageCache(); } catch (e) { /* ignore */ }
    event.target.value = '';
    showToast('Backup importado com sucesso', 'success');
    setTimeout(() => location.reload(), 800);
  } catch (error) {
    console.error(error);
    showToast('Falha ao importar backup', 'error');
    event.target.value = '';
  }
};

window.closeModalOverlay = function(e) {
  if (e.target.id === 'modal-overlay') closeModal();
};

window.closeModal = closeModal;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupFilters(filterId, type) {
  const container = document.getElementById(filterId);
  if (!container) return;
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter[type] = chip.dataset.filter;
      renderGrid(type);
    });
  });

  const sortSel = document.getElementById(`${type === 'movies' ? 'movie' : type === 'series' ? 'series' : 'game'}-sort`);
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      currentSort[type] = sortSel.value;
      renderGrid(type);
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DIARY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function renderDiary() {
  let entries = (await storageGet('mv:diary')) || [];
  const filter = currentFilter.diary;
  const now = new Date();

  // Sort according to diary sort setting
  if (currentSort.diary === 'rating') {
    entries.sort((a,b) => (b.personalRating||0) - (a.personalRating||0));
  } else {
    entries.sort((a,b) => new Date(b.loggedAt || b.viewDate || 0) - new Date(a.loggedAt || a.viewDate || 0));
  }

  if (filter === 'movie') entries = entries.filter(e => e.type === 'movie');
  else if (filter === 'series') entries = entries.filter(e => e.type === 'series');
  else if (filter === 'game') entries = entries.filter(e => e.type === 'game');
  else if (filter === 'reviewed') entries = entries.filter(e => e.personalReview?.length > 0);
  else if (filter === 'month') entries = entries.filter(e => {
    const d = new Date(e.loggedAt || e.viewDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const timeline = document.getElementById('diary-timeline');
  const empty = document.getElementById('diary-empty');

  if (!entries.length) {
    timeline.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';

  const typeColors = { movie: 'var(--accent)', series: '#4fe896', game: 'var(--accent-blue)' };
  const typeLabels = { movie: 'Filme', series: 'Série', game: 'Jogo' };
  const typeBg = { movie: 'rgba(229,160,13,0.12)', series: 'rgba(79,232,150,0.12)', game: 'rgba(79,157,232,0.12)' };

  timeline.innerHTML = entries.map(entry => {
    const color = typeColors[entry.type] || 'var(--accent)';
    const bg = typeBg[entry.type] || 'rgba(229,160,13,0.12)';
    const label = typeLabels[entry.type] || entry.type;
    const titleText = entry.type === 'series' && entry.episodeInfo ? `${entry.title} · ${entry.episodeInfo}` : entry.title;
    const preview = entry.personalReview
      ? (entry.personalReview.length > 120 ? entry.personalReview.substring(0,120) + '...' : entry.personalReview)
      : '';
    const dateStr = entry.viewDate ? new Date(entry.viewDate).toLocaleDateString('pt-BR', {day:'numeric',month:'short',year:'numeric'}) : '';
    const ratingLabel = entry.personalRating ? `${entry.personalRating}` : '';

    return `
      <div class="timeline-entry">
        <div class="timeline-line">
          <div class="timeline-dot" style="color:${color};background:${color}"></div>
          <div class="timeline-vert" style="color:${color}"></div>
        </div>
        ${entry.posterPath ? `<img class="timeline-thumb" src="${entry.posterPath}" alt="" onerror="this.style.opacity='0'">` : `<div class="timeline-thumb" style="background:var(--bg-elevated)"></div>`}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 0">
              <span class="type-chip" style="background:${bg};color:${color};border:1px solid ${color}33">${label}</span>
              <span style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titleText}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
              <button class="diary-rate-btn" onclick="rateDiaryEntry('${entry.id}')" title="Avaliar este item">
                <i class="fa-solid fa-star"></i>${ratingLabel ? `<span>${ratingLabel}</span>` : ''}
              </button>
              ${dateStr ? `<div style="font-size:13px;color:var(--text-secondary)">${dateStr}</div>` : ''}
            </div>
          </div>
          ${preview ? `<p style="font-family:'Open Sans',serif;font-style:italic;font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">"${preview}"</p>` : ''}
          ${(entry.tags||[]).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${entry.tags.map(t=>`<span class="tag-chip" style="font-size:11px;padding:1px 8px">#${t}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

window.rateDiaryEntry = async function(entryId) {
  const diary = (await storageGet('mv:diary')) || [];
  const index = diary.findIndex(entry => entry.id === entryId);
  if (index === -1) return;

  const currentRating = diary[index].personalRating || '';
  const input = prompt('Informe sua avaliação de 1 a 5 estrelas (deixe em branco para remover):', currentRating);
  if (input === null) return;

  const rating = input.trim() === '' ? 0 : Math.min(5, Math.max(1, parseInt(input, 10) || 0));
  diary[index].personalRating = rating;
  await storageSet('mv:diary', diary);
  if (currentSection === 'diary') renderDiary();
  showToast(rating > 0 ? `Avaliação atualizada: ${rating} estrela${rating > 1 ? 's' : ''}` : 'Avaliação removida', 'success', 3000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOME DASHBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function renderHome() {
  const [movies, series, games] = await Promise.all([loadAll('movies'), loadAll('series'), loadAll('games')]);
  const all = [...movies, ...series, ...games];

  if (!all.length) {
    document.getElementById('home-empty').style.display = 'flex';
    ['hero-section','home-continue','home-recent','home-stats','home-highlights','home-genres'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  document.getElementById('home-empty').style.display = 'none';

  // Hero — most recently rated item
  const rated = all.filter(i => i.personalRating > 0).sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt));
  const heroItem = rated[0] || all[0];
  if (heroItem) {
    document.getElementById('hero-section').style.display = 'block';
    const bgImg = heroItem.backdropPath || heroItem.posterPath;
    if (bgImg) document.getElementById('hero-bg').style.backgroundImage = `url(${bgImg})`;
    
    const typeLabels = { movie: 'Filme', series: 'Série', game: 'Jogo' };
    const typeColors = { movie: 'var(--accent)', series: '#4fe896', game: 'var(--accent-blue)' };
    const hTC = document.getElementById('hero-type-chip');
    hTC.textContent = typeLabels[heroItem.type];
    hTC.style.background = `${typeColors[heroItem.type]}22`;
    hTC.style.color = typeColors[heroItem.type];
    hTC.style.border = `1px solid ${typeColors[heroItem.type]}44`;
    hTC.style.padding = '4px 10px';
    hTC.style.borderRadius = '20px';
    hTC.style.fontSize = '12px';
    hTC.style.fontWeight = '600';
    
    document.getElementById('hero-title').textContent = heroItem.title;
    document.getElementById('hero-year').textContent = heroItem.year || '';
    document.getElementById('hero-stars').innerHTML = heroItem.personalRating 
      ? `${'★'.repeat(Math.floor(heroItem.personalRating))}<span style="color:var(--text-secondary);margin-left:4px;font-size:14px">${heroItem.personalRating.toFixed(1)} / 5.0</span>` 
      : '';
    const t = heroItem.type === 'movie' ? 'movie' : heroItem.type === 'series' ? 'series' : 'game';
    document.getElementById('hero-btn').onclick = () => openModal(heroItem.id, t);
  }

  // Continue watching
  const inProgress = all.filter(i => i.status === 'watching' || i.status === 'playing').slice(0,10);
  const contWrap = document.getElementById('home-continue');
  if (inProgress.length) {
    contWrap.style.display = 'block';
    document.getElementById('continue-carousel').innerHTML = inProgress.map(item => carouselCardHtml(item)).join('');
    setupCarouselClicks('continue-carousel');
  } else {
    contWrap.style.display = 'none';
  }

  // Recent
  const recent = [...all].sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0,8);
  const recentWrap = document.getElementById('home-recent');
  if (recent.length) {
    recentWrap.style.display = 'block';
    document.getElementById('recent-carousel').innerHTML = recent.map(item => carouselCardHtml(item)).join('');
    setupCarouselClicks('recent-carousel');
  } else {
    recentWrap.style.display = 'none';
  }

  // Stats
  document.getElementById('home-stats').style.display = 'block';
  const avgRating = all.filter(i=>i.personalRating>0).reduce((s,i,_,a) => s + i.personalRating/a.length, 0);
  const totalHours = games.reduce((s,g) => s + (g.hoursPlayed||0), 0) + movies.filter(m=>m.status==='watched').length * 2 + series.filter(s=>s.status==='watched').length * 10;
  
  document.getElementById('stats-grid').innerHTML = [
    { n: movies.length, l: 'Filmes' },
    { n: series.length, l: 'Séries' },
    { n: games.length, l: 'Jogos' },
    { n: all.filter(i=>i.isFavorite).length, l: 'Favoritos' },
    { n: avgRating ? avgRating.toFixed(1) : '—', l: 'Nota Média' },
    { n: `${Math.round(totalHours)}h`, l: 'Horas Est.' },
  ].map(s => `<div class="stat-card"><div class="stat-number">${s.n}</div><div class="stat-label">${s.l}</div></div>`).join('');

  // Highlights
  document.getElementById('home-highlights').style.display = 'block';
  const topMovie = movies.filter(i=>i.personalRating>0).sort((a,b) => b.personalRating - a.personalRating)[0];
  const topSeries = series.filter(i=>i.personalRating>0).sort((a,b) => b.personalRating - a.personalRating)[0];
  const topGame = games.filter(i=>i.personalRating>0).sort((a,b) => b.personalRating - a.personalRating)[0];
  
  const highlights = [topMovie, topSeries, topGame].filter(Boolean);
  if (highlights.length) {
    document.getElementById('highlights-grid').innerHTML = highlights.map(item => `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;cursor:pointer;transition:transform 0.2s" onclick="openModal('${item.id}','${item.type}')" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform=''">
        <div style="aspect-ratio:16/9;overflow:hidden;position:relative">
          <img src="${item.backdropPath || item.posterPath}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" alt="">
          <div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,0.8) 0%,transparent 60%)"></div>
          <div style="position:absolute;bottom:10px;left:10px;right:10px">
            <div style="font-size:12px;font-weight:700;color:var(--accent)">${'★'.repeat(Math.floor(item.personalRating))} ${item.personalRating.toFixed(1)}</div>
            <div style="font-size:14px;font-weight:600">${item.title}</div>
          </div>
        </div>
      </div>`).join('');
  }

  document.getElementById('home-genres').style.display = 'block';
  await renderGenreRows();
}

async function renderGenreRows() {
  const rows = [
    { id: 28, title: 'Ação em alta' },
    { id: 35, title: 'Comédia em alta' },
    { id: 12, title: 'Aventura em alta' },
    { id: 878, title: 'Sci-Fi em alta' }
  ];
  const container = document.getElementById('genre-rows');
  if (!container) return;

  const results = await Promise.all(rows.map(async row => {
    const items = await discoverTMDBMovies(row.id);
    return { title: row.title, items: items.slice(0, 10) };
  }));

  container.innerHTML = results.map(row => `
    <div class="genre-row">
      <div class="genre-row-title">
        <h3>${row.title}</h3>
      </div>
      <div class="genre-row-cards">
        ${row.items.map(item => `
          <div class="genre-card" data-id="${item.id}" data-type="movie">
            ${item.poster_path ? `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title}">` : `<div style="width:100%;height:190px;background:var(--bg-elevated)"></div>`}
            <div class="genre-card-label">${item.title}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.genre-card').forEach(card => {
    card.addEventListener('click', () => openNewItemModal(card.dataset.id, card.dataset.type));
  });
}

function carouselCardHtml(item) {
  return `<div class="carousel-card" data-id="${item.id}" data-type="${item.type}">
    ${item.posterPath ? `<img src="${item.posterPath}" alt="${item.title}" onerror="this.style.opacity='0'">` : `<div style="width:110px;height:165px;background:var(--bg-elevated);border-radius:var(--radius)"></div>`}
    <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title}</div>
  </div>`;
}

function setupCarouselClicks(wrapperId) {
  document.getElementById(wrapperId)?.querySelectorAll('.carousel-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id, card.dataset.type));
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function loadSettingsForm() {
  document.getElementById('set-tmdb').value = SETTINGS.tmdbKey || '';
  document.getElementById('set-omdb').value = SETTINGS.omdbKey || '';
  document.getElementById('set-rawg').value = SETTINGS.rawgKey || '';
  document.getElementById('set-supabase-key').value = SETTINGS.supabaseKey || '';
}

window.saveSettings = async function() {
  SETTINGS.tmdbKey = document.getElementById('set-tmdb').value.trim() || SETTINGS.tmdbKey;
  SETTINGS.omdbKey = document.getElementById('set-omdb').value.trim() || SETTINGS.omdbKey;
  SETTINGS.rawgKey = document.getElementById('set-rawg').value.trim() || SETTINGS.rawgKey;
  SETTINGS.supabaseKey = document.getElementById('set-supabase-key').value.trim() || SETTINGS.supabaseKey;
  await storageSet('mv:settings', SETTINGS);
  showToast('Configurações salvas', 'success');
};

window.clearAllData = async function() {
  if (!confirm('Tem certeza? Todos os dados serão apagados.')) return;
  try {
    await storageDelete('mv:movies');
    await storageDelete('mv:series');
    await storageDelete('mv:games');
    await storageDelete('mv:diary');
    await storageDelete('mv:psn');
    await storageDelete('mv:settings');
    showToast('Dados apagados', 'info');
    renderHome();
  } catch {
    showToast('Erro ao apagar dados', 'error');
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBAL SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const globalSearch = document.getElementById('global-search');
const globalDrop = document.getElementById('global-dropdown');

globalSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce.global);
  const q = globalSearch.value.trim();
  if (q.length < 2) { globalDrop.style.display = 'none'; return; }
  searchDebounce.global = setTimeout(async () => {
    const [mv, sr, gm, remoteMovies, remoteSeries, remoteGames] = await Promise.all([
      loadAll('movies'),
      loadAll('series'),
      loadAll('games'),
      searchTMDB(q, 'movie'),
      searchTMDB(q, 'tv'),
      searchRAWG(q)
    ]);

    const localMatches = [...mv, ...sr, ...gm]
      .filter(i => i.title?.toLowerCase().includes(q.toLowerCase()))
      .map(item => ({
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.year || '',
        posterPath: item.posterPath,
        source: 'Biblioteca'
      }));

    const remoteMatches = [
      ...(remoteMovies || []).slice(0, 3).map(r => ({
        id: r.id,
        type: 'movie',
        title: r.title || r.name || '',
        subtitle: r.release_date?.slice(0,4) || '',
        posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '',
        source: 'TMDB'
      })),
      ...(remoteSeries || []).slice(0, 3).map(r => ({
        id: r.id,
        type: 'series',
        title: r.name || r.title || '',
        subtitle: r.first_air_date?.slice(0,4) || '',
        posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '',
        source: 'TMDB'
      })),
      ...(remoteGames || []).slice(0, 3).map(r => ({
        id: r.id,
        type: 'game',
        title: r.name || r.slug || '',
        subtitle: r.released ? new Date(r.released).getFullYear() : '',
        posterPath: r.background_image || '',
        source: 'RAWG'
      }))
    ];

    const all = [...localMatches, ...remoteMatches].slice(0, 8);
    if (!all.length) { globalDrop.style.display = 'none'; return; }

    globalDrop.style.display = 'block';
    globalDrop.innerHTML = all.map(item => `
      <div class="search-result-item" data-id="${item.id}" data-type="${item.type}" data-source="${item.source}">
        ${item.posterPath ? `<img class="search-result-img" src="${item.posterPath}" alt="" onerror="this.style.opacity='0'">` : `<div class="search-result-img" style="background:var(--bg-elevated)"></div>`}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${item.subtitle} ${item.source !== 'Biblioteca' ? `· ${item.source}` : ''}</div>
        </div>
      </div>`).join('');

    globalDrop.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        globalDrop.style.display = 'none';
        globalSearch.value = '';
        if (el.dataset.source === 'Biblioteca') {
          openModal(el.dataset.id, el.dataset.type);
        } else {
          openNewItemModal(el.dataset.id, el.dataset.type);
        }
      });
    });
  }, 200);
});

globalSearch.addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const query = globalSearch.value.trim();
  if (!query) return;
  e.preventDefault();
  globalDrop.style.display = 'none';
  await performAdvancedSearch(query);
});

async function performAdvancedSearch(query) {
  navigate('search');
  document.getElementById('search-summary').textContent = `Resultados para: ${query}`;
  try {
    const [localMovies, localSeries, localGames, remoteMovies, remoteSeries, remoteGames] = await Promise.all([
      loadAll('movies'),
      loadAll('series'),
      loadAll('games'),
      searchTMDB(query, 'movie'),
      searchTMDB(query, 'tv'),
      searchRAWG(query)
    ]);

  const localMatches = [...localMovies, ...localSeries, ...localGames]
    .filter(item => item.title.toLowerCase().includes(query.toLowerCase()))
    .map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      year: item.year || item.release_date || item.first_air_date || '',
      posterPath: item.posterPath,
      source: 'Biblioteca'
    }));

  const movieCards = (remoteMovies || []).slice(0, 6).map(r => ({
    id: r.id,
    type: 'movie',
    title: r.title || r.name || '',
    year: r.release_date?.slice(0,4) || '',
    posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : '',
    source: 'TMDB'
  }));
  const seriesCards = (remoteSeries || []).slice(0, 6).map(r => ({
    id: r.id,
    type: 'series',
    title: r.name || r.title || '',
    year: r.first_air_date?.slice(0,4) || '',
    posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : '',
    source: 'TMDB'
  }));
  const gameCards = (remoteGames || []).slice(0, 6).map(r => ({
    id: r.id,
    type: 'game',
    title: r.name || r.slug || '',
    year: r.released ? new Date(r.released).getFullYear() : '',
    posterPath: r.background_image || '',
    source: 'RAWG'
  }));

  const results = [...localMatches, ...movieCards, ...seriesCards, ...gameCards];
  const grid = document.getElementById('search-grid');
  const empty = document.getElementById('search-empty');
  const searchIds = new Set();

  if (!results.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = results.filter(item => {
    const uid = `${item.type}-${item.id}`;
    if (searchIds.has(uid)) return false;
    searchIds.add(uid);
    return true;
  }).map(item => renderSearchCard(item)).join('');

  grid.querySelectorAll('.media-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.source === 'Biblioteca') {
        openModal(card.dataset.id, card.dataset.type);
      } else {
        openNewItemModal(card.dataset.id, card.dataset.type);
      }
    });
  });
  if (!results.length) {
    document.getElementById('search-summary').textContent = `Nenhum resultado para: ${query}`;
  }
} catch (error) {
  console.error('Busca avançada falhou', error);
  showToast('Falha ao buscar resultados. Tente novamente.', 'error', 4000);
  const grid = document.getElementById('search-grid');
  const empty = document.getElementById('search-empty');
  grid.innerHTML = '';
  empty.style.display = 'flex';
}
}

function renderSearchCard(item) {
  const label = item.source === 'Biblioteca' ? 'Ver' : 'Adicionar';
  return `
    <div class="media-card" data-id="${item.id}" data-type="${item.type}" data-source="${item.source}">
      ${item.posterPath ? `<img src="${item.posterPath}" alt="${item.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--bg-elevated)"><i class="fa-solid fa-image"></i></div>`}
      <div class="card-overlay" style="opacity:1;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,0.9) 100%);justify-content:flex-end;padding:14px;">
        <div class="card-overlay-title">${item.title}</div>
        <div class="card-overlay-meta"><span>${item.year || ''}</span><span style="color:var(--accent);">${item.source}</span></div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);font-weight:600">${label}</div>
      </div>
    </div>`;
}

document.addEventListener('click', e => {
  if (!globalSearch.contains(e.target) && !globalDrop.contains(e.target)) {
    globalDrop.style.display = 'none';
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WELCOME MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.saveWelcome = async function() {
  SETTINGS.tmdbKey = document.getElementById('wm-tmdb').value.trim() || SETTINGS.tmdbKey;
  SETTINGS.omdbKey = document.getElementById('wm-omdb').value.trim() || SETTINGS.omdbKey;
  SETTINGS.rawgKey = document.getElementById('wm-rawg').value.trim() || SETTINGS.rawgKey;
  await storageSet('mv:settings', SETTINGS);
  document.getElementById('welcome-modal').style.display = 'none';
  showToast('Bem-vindo ao MediaVault!', 'success');
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DIARY FILTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById('diary-filters')?.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('diary-filters').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter.diary = chip.dataset.filter;
    renderDiary();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLEX CSV IMPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.importPlexHistory = async function(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  
  showToast('Importando histórico do Plex...', 'info', 3000);
  
  try {
    const text = await file.text();
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      showToast('Arquivo CSV inválido', 'error');
      return;
    }

    // Parse CSV header
    const headers = parseCSVLine(lines[0]);
    const titleIdx = headers.indexOf('title');
    const typeIdx = headers.indexOf('type');
    const watchedAtIdx = headers.indexOf('watched_at');
    const thumbnailIdx = headers.indexOf('thumbnail');

    if (titleIdx === -1 || typeIdx === -1) {
      showToast('Arquivo CSV não possui colunas esperadas', 'error');
      return;
    }

    // Parse entries
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = parseCSVLine(lines[i]);
          const title = values[titleIdx]?.trim() || '';
      const type = values[typeIdx]?.toLowerCase() || 'episode';
      const watchedAt = values[watchedAtIdx]?.trim() || '';
      const thumbnail = values[thumbnailIdx]?.trim() || '';
      const plexUrl = values[headers.indexOf('plex_url')]?.trim() || values[headers.indexOf('plexUrl')]?.trim() || '';

      if (!title) continue;

      // Parse date
      const viewDate = parsePlexDate(watchedAt);

      // Determine media type
      let mediaType = type === 'movie' ? 'movie' : 'series';
      const episodeInfo = mediaType === 'series' ? getEpisodeInfoFromPath(plexUrl || thumbnail || title) : '';

      entries.push({
        id: `plex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        mediaId: `plex_${title.toLowerCase().replace(/\s+/g, '_')}_${viewDate}`,
        type: mediaType,
        title: title,
        posterPath: thumbnail,
        status: 'watched',
        personalRating: 0,
        personalReview: '',
        tags: ['plex-import'],
        viewDate: viewDate,
        loggedAt: new Date().toISOString(),
        episodeInfo
      });
    }

    if (entries.length === 0) {
      showToast('Nenhuma entrada válida encontrada no arquivo', 'error');
      return;
    }

    // Save to diary
    let diary = (await storageGet('mv:diary')) || [];
    
    // Remove duplicates based on title and viewDate
    const existingKeys = new Set(diary.map(d => `${d.title}_${d.viewDate}`));
    const newEntries = entries.filter(e => !existingKeys.has(`${e.title}_${e.viewDate}`));

    // Add new entries
    diary = [...newEntries, ...diary];
    diary.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));

    await storageSet('mv:diary', diary);

    showToast(`✓ ${newEntries.length} entradas importadas do Plex`, 'success', 4000);
    
    // Refresh diary view if on that section
    if (currentSection === 'diary') {
      renderDiary();
    }

    event.target.value = '';
  } catch (error) {
    console.error('Erro ao importar Plex:', error);
    showToast('Erro ao importar arquivo: ' + error.message, 'error', 5000);
    event.target.value = '';
  }
};

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function parsePlexDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  // Handle "há X dias" format
  const relativeMatch = dateStr.match(/há\s+(\d+)\s+(dia|dias|mes|mês|hora|horas|semana|semanas)/i);
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const date = new Date();

    if (unit.includes('dia')) date.setDate(date.getDate() - num);
    else if (unit.includes('hora')) date.setHours(date.getHours() - num);
    else if (unit.includes('semana')) date.setDate(date.getDate() - num * 7);
    else if (unit.includes('mês') || unit.includes('mes')) date.setMonth(date.getMonth() - num);

    return date.toISOString().split('T')[0];
  }

  // Handle "DD de MMM. de YYYY" format (e.g., "23 de abr. de 2026")
  const ptMatch = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\.\s+de\s+(\d{4})/i);
  if (ptMatch) {
    const months = {
      'jan': 0, 'jan.': 0,
      'fev': 1, 'fev.': 1,
      'mar': 2, 'mar.': 2,
      'abr': 3, 'abr.': 3,
      'mai': 4, 'mai.': 4,
      'jun': 5, 'jun.': 5,
      'jul': 6, 'jul.': 6,
      'ago': 7, 'ago.': 7,
      'set': 8, 'set.': 8,
      'out': 9, 'out.': 9,
      'nov': 10, 'nov.': 10,
      'dez': 11, 'dez.': 11
    };
    
    const day = ptMatch[1].padStart(2, '0');
    const monthStr = ptMatch[2].toLowerCase();
    const month = (months[monthStr] || 0).toString().padStart(2, '0');
    const year = ptMatch[3];

    return `${year}-${month}-${day}`;
  }

  // Handle timestamp in seconds
  if (/^\d{9,}$/.test(dateStr)) {
    const ts = parseInt(dateStr, 10);
    if (!Number.isNaN(ts)) {
      return new Date(ts * 1000).toISOString().split('T')[0];
    }
  }

  // Handle ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }

  // Default to today
  return new Date().toISOString().split('T')[0];
}

async function tryFetchSupabaseHistory(url) {
  const headers = { 'Content-Type': 'application/json' };
  if (SETTINGS.supabaseKey) {
    headers.apikey = SETTINGS.supabaseKey;
    headers.Authorization = `Bearer ${SETTINGS.supabaseKey}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const message = await response.text().catch(() => 'Erro desconhecido');
    throw new Error(`HTTP ${response.status} - ${message}`);
  }

  return await response.json();
}

function getEpisodeInfoFromPath(path) {
  const raw = (path || '').toString();
  const patterns = [
    /season\/(\d+)\/episode\/(\d+)/i,
    /episode\/(\d+)\/season\/(\d+)/i,
    /season-(\d+).*episode-(\d+)/i,
    /S(\d{1,2})E(\d{1,2})/i,
    /seasonNumber=(\d+).*episodeNumber=(\d+)/i,
    /season=(\d+).*episode=(\d+)/i,
    /season[=_-]?(\d+).*episode[=_-]?(\d+)/i,
    /ep=(\d+).*season=(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      const season = match[1];
      const episode = match[2];
      return `Temp. ${season} · Ep. ${episode}`;
    }
  }

  return '';
}

function normalizeSupabasePlexRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => {
    const remoteId = row.id || row.ID || row.uuid || row.media_id || `${row.title || 'unknown'}_${row.watched_at || row.watchedAt || row.date || index}`;
    const title = row.title || row.name || row.show || '';
    const typeRaw = (row.type || '').toString().toLowerCase();
    const isMovie = typeRaw === 'movie' || typeRaw === 'filme';
    const isEpisode = typeRaw === 'episode' || typeRaw === 'episódio' || typeRaw === 'show' || typeRaw === 'serie' || typeRaw === 'série';
    const mediaType = isMovie ? 'movie' : 'series';
    const thumbnail = row.thumbnail || row.thumb || row.image || row.poster || '';
    const watchedAt = row.watched_at || row.watchedAt || row.date || row.created_at || row.ts || '';
    const viewDate = parsePlexDate(watchedAt);
    const episodeInfo = isEpisode ? getEpisodeInfoFromPath(row.id || row.plex_url || row.plexUrl || '') : '';

    return {
      id: `plex_${remoteId}`,
      mediaId: `plex_${remoteId}`,
      type: mediaType,
      title: title || 'Sem título',
      posterPath: thumbnail,
      status: 'watched',
      personalRating: 0,
      personalReview: '',
      tags: ['plex-supabase'],
      viewDate,
      loggedAt: watchedAt ? new Date(viewDate).toISOString() : new Date().toISOString(),
      episodeInfo
    };
  }).filter(entry => entry.title);
}

async function loadPlexHistoryRealtime(showError = true) {
  const url = SETTINGS.supabaseUrl || 'https://jqabfmdggybqgrgqhbkk.supabase.co';
  const directUrl = `${url.replace(/\/$/, '')}/plex_history`;
  const restUrl = `${url.replace(/\/$/, '')}/rest/v1/plex_history?select=*`;
  
  try {
    let data = null;

    try {
      data = await tryFetchSupabaseHistory(directUrl);
    } catch (directError) {
      data = await tryFetchSupabaseHistory(restUrl);
    }

    if (data && data.data) {
      data = data.data;
    }

    const entries = normalizeSupabasePlexRows(data);
    if (!entries.length) return false;

    const diary = (await storageGet('mv:diary')) || [];
    const existingMap = new Map(diary.map(item => [item.mediaId || item.id, item]));

    for (const entry of entries) {
      const existing = existingMap.get(entry.mediaId);
      if (existing) {
        existingMap.set(entry.mediaId, { ...existing, ...entry, posterPath: entry.posterPath || existing.posterPath });
      } else {
        existingMap.set(entry.mediaId, entry);
      }
    }

    const mergedDiary = Array.from(existingMap.values()).sort((a,b) => new Date(b.loggedAt || b.viewDate || 0) - new Date(a.loggedAt || a.viewDate || 0));
    await storageSet('mv:diary', mergedDiary);
    return true;
  } catch (error) {
    console.warn('Supabase history load failed:', error);
    if (showError) showToast('Falha ao buscar histórico em tempo real do Supabase.', 'error', 4000);
    return false;
  }
}

window.syncSupabaseHistory = async function() {
  showToast('Sincronizando histórico do Plex no Supabase...', 'info', 4000);
  const success = await loadPlexHistoryRealtime(true);
  if (success) {
    if (currentSection === 'diary') renderDiary();
    showToast('Histórico do Plex sincronizado com sucesso.', 'success', 4000);
  } else {
    showToast('Não foi possível sincronizar o histórico do Plex.', 'error', 4000);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function init() {
  // Load settings
  const savedSettings = await storageGet('mv:settings');
  if (savedSettings) {
    SETTINGS = { ...SETTINGS, ...savedSettings };
  }

  // Check if first time
  if (!savedSettings) {
    document.getElementById('welcome-modal').style.display = 'flex';
  }

  // Setup searches
  setupSearch('movie-search', 'movie-dropdown', 'movie');
  setupSearch('series-search', 'series-dropdown', 'series');
  setupSearch('game-search', 'game-dropdown', 'game');

  // Setup filters
  setupFilters('movie-filters', 'movies');
  setupFilters('series-filters', 'series');
  setupFilters('game-filters', 'games');

  // Diary sort control
  const diarySort = document.getElementById('diary-sort');
  if (diarySort) {
    diarySort.value = currentSort.diary || 'recent';
    diarySort.addEventListener('change', () => {
      currentSort.diary = diarySort.value;
      renderDiary();
    });
  }

  // Load live Plex history from Supabase before rendering
  await loadPlexHistoryRealtime(false);

  // Render home
  await renderHome();

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      globalSearch.focus();
    }
  });
}

// Expose navigate globally for inline onclick
window.navigate = navigate;
window.openModal = openModal;

init();