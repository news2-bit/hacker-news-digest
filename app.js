const HN_API    = 'https://hacker-news.firebaseio.com/v0';
const PAGE_SIZE = 30;
const HN_URL    = 'https://news.ycombinator.com';

let currentFeed = 'topstories';
let allIds      = [];
let page        = 0;
let loading     = false;

// ── DOM ──────────────────────────────────────────────────────────
const loader      = document.getElementById('loader');
const loaderText  = document.getElementById('loaderText');
const errorDiv    = document.getElementById('error');
const storiesDiv  = document.getElementById('stories');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreBtn  = document.getElementById('loadMoreBtn');
const lastUpdated  = document.getElementById('lastUpdated');

// ── Helpers ──────────────────────────────────────────────────────
function setLoading(on, text = 'Loading stories…') {
  loader.hidden = !on;
  loaderText.textContent = text;
  loadMoreBtn.disabled = on;
  loading = on;
}
function showError(msg) { errorDiv.textContent = msg; errorDiv.hidden = false; }
function clearError()   { errorDiv.hidden = true; }

function timeAgo(unix) {
  const diff = Math.floor(Date.now() / 1000 - unix);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatScore(n) {
  if (!n) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function getDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}

function getTypeBadge(item) {
  if (item.type === 'job')  return '<span class="story-type-badge badge-job">Job</span>';
  if (item.title?.startsWith('Ask HN'))  return '<span class="story-type-badge badge-ask">Ask</span>';
  if (item.title?.startsWith('Show HN')) return '<span class="story-type-badge badge-show">Show</span>';
  return '';
}

// ── Skeleton placeholders ─────────────────────────────────────────
function renderSkeletons(count = PAGE_SIZE) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'skeleton-story';
    el.innerHTML = `
      <div class="skel skel-rank"></div>
      <div class="skel skel-score"></div>
      <div class="skel-content">
        <div class="skel skel-title"></div>
        <div class="skel skel-title-2"></div>
        <div class="skel skel-meta"></div>
      </div>
    `;
    storiesDiv.appendChild(el);
  }
}

function clearSkeletons() {
  storiesDiv.querySelectorAll('.skeleton-story').forEach(el => el.remove());
}

// ── Render single story ───────────────────────────────────────────
function renderStory(item, rank) {
  if (!item || item.deleted || item.dead) return null;

  const el   = document.createElement('div');
  el.className = 'story';

  const link  = item.url || `${HN_URL}/item?id=${item.id}`;
  const domain = getDomain(item.url);
  const badge  = getTypeBadge(item);
  const comments = item.descendants ?? null;

  el.innerHTML = `
    <div class="story-rank">${rank}</div>
    <div class="story-score-wrap">
      <span class="story-score">${formatScore(item.score)}</span>
      <span class="story-score-label">pts</span>
    </div>
    <div class="story-content">
      <div class="story-title-row">
        <a class="story-title" href="${link}" target="_blank" rel="noopener noreferrer">
          ${item.title || '(no title)'}
        </a>
        ${domain ? `<span class="story-domain">${domain}</span>` : ''}
      </div>
      <div class="story-meta">
        <span class="story-author">by <span>${item.by || 'unknown'}</span></span>
        <span class="story-time">${item.time ? timeAgo(item.time) : ''}</span>
        ${badge}
        ${comments !== null
          ? `<a class="story-comments" href="${HN_URL}/item?id=${item.id}" target="_blank" rel="noopener noreferrer">
               💬 ${comments > 0 ? comments : 'discuss'}
             </a>`
          : ''}
      </div>
    </div>
  `;

  return el;
}

// ── Fetch a page of items ─────────────────────────────────────────
async function fetchItems(ids) {
  return Promise.all(
    ids.map(id =>
      fetch(`${HN_API}/item/${id}.json`)
        .then(r => r.json())
        .catch(() => null)
    )
  );
}

// ── Load page ────────────────────────────────────────────────────
async function loadPage(append = false) {
  if (loading) return;
  clearError();

  const start = page * PAGE_SIZE;
  const slice = allIds.slice(start, start + PAGE_SIZE);
  if (!slice.length) { loadMoreWrap.hidden = true; return; }

  if (!append) {
    storiesDiv.innerHTML = '';
    renderSkeletons(Math.min(PAGE_SIZE, slice.length));
  }

  setLoading(true, append ? 'Loading more…' : 'Loading stories…');

  try {
    const items = await fetchItems(slice);
    clearSkeletons();

    let rendered = 0;
    items.forEach((item, i) => {
      const el = renderStory(item, start + i + 1);
      if (el) { storiesDiv.appendChild(el); rendered++; }
    });

    page++;
    const hasMore = page * PAGE_SIZE < allIds.length;
    loadMoreWrap.hidden = !hasMore;

  } catch (err) {
    clearSkeletons();
    showError('Failed to load stories. Please try again.');
  } finally {
    setLoading(false);
  }
}

// ── Load feed ────────────────────────────────────────────────────
async function loadFeed(feed) {
  clearError();
  storiesDiv.innerHTML = '';
  loadMoreWrap.hidden = true;
  page = 0;
  allIds = [];

  renderSkeletons(10);
  setLoading(true);

  try {
    const res = await fetch(`${HN_API}/${feed}.json`);
    if (!res.ok) throw new Error(`Failed to load feed (${res.status})`);
    allIds = await res.json();

    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    clearSkeletons();
    loading = false;
    await loadPage(false);
  } catch (err) {
    clearSkeletons();
    showError(err.message || 'Failed to load feed.');
    setLoading(false);
  }
}

// ── Feed tabs ────────────────────────────────────────────────────
document.querySelectorAll('.feed-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.feed === currentFeed) return;
    document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFeed = tab.dataset.feed;
    loadFeed(currentFeed);
  });
});

loadMoreBtn.addEventListener('click', () => loadPage(true));

// ── Init ─────────────────────────────────────────────────────────
loadFeed(currentFeed);
