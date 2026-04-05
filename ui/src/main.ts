import { renderHeatmap } from './charts/activity-heatmap.js';
import { renderTimeline } from './charts/timeline.js';
import { renderTypicalDay } from './charts/typical-day.js';
import { renderRatios } from './charts/ratios.js';
import { renderInteractions } from './charts/interaction-network.js';
import { renderSocial } from './charts/social-timeline.js';
import { renderSleepPattern } from './charts/sleep-pattern.js';
import { renderThemeRiver, setThemeRiverMode } from './charts/themeriver.js';
import { shiftHeatmapData, currentOffsetHours, setOffsetHours, getTimezoneLabel } from './timezone.js';

const didInput = document.getElementById('did-input') as HTMLInputElement;
const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
const repoSelect = document.getElementById('repo-select') as HTMLSelectElement;
const status = document.getElementById('status') as HTMLDivElement;
const dashboard = document.getElementById('dashboard') as HTMLDivElement;
const summaryCards = document.getElementById('summary-cards') as HTMLDivElement;
const dateRangeContainer = document.getElementById('date-range') as HTMLDivElement;
const timezoneSelect = document.getElementById('timezone-select') as HTMLSelectElement;
const timezoneLabel = document.getElementById('timezone-label') as HTMLSpanElement;
const timezoneContainer = document.getElementById('timezone-container') as HTMLDivElement;
const embeddingStatus = document.getElementById('embedding-status') as HTMLDivElement;
const outlierStatus = document.getElementById('outlier-status') as HTMLDivElement;

let currentRange: { start?: number; end?: number; label: string } = { label: 'All Time' };
let currentDid: string = '';
let currentHandle: string = '';
let periods: Array<{ year: string; month: string; count: number }> = [];
let currentHeatmapCollection: string = '';

async function api<T>(path: string): Promise<T> {
  let url = `/api${path}`;
  const params = new URLSearchParams();
  if (currentRange.start) params.set('start', String(currentRange.start));
  if (currentRange.end) params.set('end', String(currentRange.end));
  const qs = params.toString();
  if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function loadRepoList() {
  try {
    const repos = await api<Array<{ did: string; handle: string | null; fetched_at: number }>>('/repos');
    repoSelect.innerHTML = '<option value="">Previously analyzed...</option>';
    for (const r of repos) {
      const opt = document.createElement('option');
      opt.value = r.did;
      opt.textContent = r.handle || r.did;
      repoSelect.appendChild(opt);
    }
  } catch { /* no repos yet, that's fine */ }
}

function renderBreadcrumb() {
  const container = document.getElementById('date-breadcrumb')!;
  const crumbs: string[] = [];
  
  // "All Time" is always first
  crumbs.push(`<span class="crumb ${!currentRange.start ? 'active' : ''}" data-level="all">All Time</span>`);
  
  if (currentRange.start) {
    // We're at year or month level — show year
    const year = new Date(currentRange.start * 1000).getFullYear().toString();
    const isMonthLevel = currentRange.end && (currentRange.end - currentRange.start) < 35 * 86400;
    crumbs.push(`<span class="separator">›</span>`);
    crumbs.push(`<span class="crumb ${!isMonthLevel ? 'active' : ''}" data-level="year" data-year="${year}">${year}</span>`);
    
    if (isMonthLevel) {
      const month = new Date(currentRange.start * 1000).toLocaleString('default', { month: 'long' });
      crumbs.push(`<span class="separator">›</span>`);
      crumbs.push(`<span class="crumb active">${month}</span>`);
    }
  }
  
  container.innerHTML = crumbs.join('');
  
  // After "All Time", show available years as pills
  const years = [...new Set(periods.map(p => p.year))].sort();
  if (!currentRange.start) {
    // Show year pills
    const pills = years.map(y => `<span class="crumb" data-level="year" data-year="${y}">${y}</span>`).join(' ');
    container.innerHTML += `<span class="separator">|</span> ${pills}`;
  } else if (currentRange.start && currentRange.end && (currentRange.end - currentRange.start) > 35 * 86400) {
    // At year level — show month pills for this year
    const year = new Date(currentRange.start * 1000).getFullYear().toString();
    const months = periods.filter(p => p.year === year).map(p => {
      const monthName = new Date(Number(year), Number(p.month) - 1).toLocaleString('default', { month: 'short' });
      return `<span class="crumb" data-level="month" data-year="${year}" data-month="${p.month}">${monthName}</span>`;
    }).join(' ');
    container.innerHTML += `<span class="separator">|</span> ${months}`;
  }
  
  // Add click handlers
  container.querySelectorAll('.crumb:not(.active)').forEach(el => {
    el.addEventListener('click', () => {
      const level = (el as HTMLElement).dataset.level;
      const year = (el as HTMLElement).dataset.year;
      const month = (el as HTMLElement).dataset.month;
      
      if (level === 'all') {
        currentRange = { label: 'All Time' };
      } else if (level === 'year' && year) {
        const start = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
        const end = Math.floor(new Date(`${Number(year) + 1}-01-01T00:00:00Z`).getTime() / 1000) - 1;
        currentRange = { start, end, label: year };
      } else if (level === 'month' && year && month) {
        const start = Math.floor(new Date(`${year}-${month}-01T00:00:00Z`).getTime() / 1000);
        const nextMonth = Number(month) === 12 ? new Date(`${Number(year) + 1}-01-01T00:00:00Z`) : new Date(`${year}-${String(Number(month) + 1).padStart(2, '0')}-01T00:00:00Z`);
        const end = Math.floor(nextMonth.getTime() / 1000) - 1;
        currentRange = { start, end, label: `${new Date(start * 1000).toLocaleString('default', { month: 'long' })} ${year}` };
      }
      
      // Re-fetch all charts with new range
      refreshCharts();
    });
  });
}

function renderSummaryCards(counts: Record<string, number>) {
  const totalRecords = Object.values(counts).reduce((a: number, b: any) => a + (b as number), 0);
  summaryCards.innerHTML = [
    { label: 'Total Records', value: totalRecords },
    { label: 'Posts', value: counts['app.bsky.feed.post'] || 0 },
    { label: 'Likes', value: counts['app.bsky.feed.like'] || 0 },
    { label: 'Reposts', value: counts['app.bsky.feed.repost'] || 0 },
    { label: 'Follows', value: counts['app.bsky.graph.follow'] || 0 },
    { label: 'Blocks', value: counts['app.bsky.graph.block'] || 0 },
  ].map(c => `<div class="card"><div class="value">${c.value.toLocaleString()}</div><div class="label">${c.label}</div></div>`).join('');
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max) + '...' : text;
}

function showOutlierModal(posts: Array<{ text: string; createdAt: number }>): void {
  // Remove any existing modal
  document.getElementById('outlier-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'outlier-modal-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#111;border:1px solid #222;border-radius:8px;max-width:700px;width:90%;max-height:80vh;display:flex;flex-direction:column;color:#e0e0e0;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #222;flex-shrink:0;';
  const title = document.createElement('h3');
  title.style.cssText = 'margin:0;font-size:16px;color:#0085ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
  title.textContent = 'Anachronistic Records (dated before 2023)';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.style.cssText = 'background:none;border:none;color:#e0e0e0;font-size:24px;cursor:pointer;padding:0 0 0 12px;line-height:1;';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Post count
  const countBar = document.createElement('div');
  countBar.style.cssText = 'padding:8px 20px;font-size:13px;color:#888;border-bottom:1px solid #222;flex-shrink:0;';
  countBar.textContent = `${posts.length} record${posts.length !== 1 ? 's' : ''}`;

  // Content
  const content = document.createElement('div');
  content.style.cssText = 'overflow-y:auto;padding:12px 20px;flex:1;';

  const sorted = [...posts].sort((a, b) => a.createdAt - b.createdAt);
  for (const post of sorted) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:10px 0;border-bottom:1px solid #1a1a1a;';
    const time = document.createElement('div');
    time.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
    time.textContent = formatDate(post.createdAt);
    const text = document.createElement('div');
    text.style.cssText = 'font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;';
    text.textContent = truncate(post.text, 500);
    item.appendChild(time);
    item.appendChild(text);
    content.appendChild(item);
  }

  modal.appendChild(header);
  modal.appendChild(countBar);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

async function refreshCharts() {
  if (!currentDid) return;
  status.textContent = `Refreshing analysis for ${currentHandle || currentDid}...`;
  loadBtn.disabled = true;

  try {
    const heatmapPath = `/repos/${encodeURIComponent(currentDid)}/activity/heatmap${currentHeatmapCollection ? `?collection=${currentHeatmapCollection}` : ''}`;
    const [summary, heatmap, timeline, typicalDay, ratios, interactions, follows, blocks, clusters, outliers, sleep] = await Promise.all([
      api<any>(`/repos/${encodeURIComponent(currentDid)}/summary`),
      api<any[]>(heatmapPath),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/activity/timeline`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/activity/typical-day`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/ratios`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/interactions/top`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/social/follows`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/social/blocks`),
      api<any>(`/repos/${encodeURIComponent(currentDid)}/clusters?k=10&bin=month`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/outliers`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/activity/sleep`),
    ]);

    renderSummaryCards(summary.counts || {});

    // Outlier status
    if (outliers && outliers.length > 0) {
      outlierStatus.innerHTML = `
        <span>This repo contains ${outliers.length.toLocaleString()} records with anachronistic dates</span>
        <button class="tab-btn" id="view-outliers-btn">View anachronisms</button>
      `;
      outlierStatus.classList.remove('hidden');
      document.getElementById('view-outliers-btn')?.addEventListener('click', () => {
        showOutlierModal(outliers);
      });
    } else {
      outlierStatus.classList.add('hidden');
    }

    const themeRiverContainer = document.getElementById('themeriver-container');
    const embeddings = summary.embeddings as { totalPosts: number; embeddedPosts: number } | undefined;
    const displayName = currentHandle || currentDid;

    if (embeddings && embeddings.embeddedPosts === 0) {
      themeRiverContainer?.setAttribute('hidden', '');
      embeddingStatus.textContent = `No embeddings available for this account. Run: bun run cli.ts embed ${displayName} to enable topic clustering.`;
      embeddingStatus.classList.remove('hidden');
    } else if (embeddings && embeddings.embeddedPosts > 0 && embeddings.embeddedPosts < embeddings.totalPosts) {
      if (clusters && clusters.clusters && clusters.clusters.length > 0 && clusters.series && clusters.series.length > 0) {
        themeRiverContainer?.removeAttribute('hidden');
        renderThemeRiver('themeriver-chart', clusters);
      } else {
        themeRiverContainer?.setAttribute('hidden', '');
      }
      embeddingStatus.textContent = `Embeddings: ${embeddings.embeddedPosts.toLocaleString()} of ${embeddings.totalPosts.toLocaleString()} posts embedded. Run: bun run cli.ts embed ${displayName} to complete.`;
      embeddingStatus.classList.remove('hidden');
    } else {
      if (clusters && clusters.clusters && clusters.clusters.length > 0 && clusters.series && clusters.series.length > 0) {
        themeRiverContainer?.removeAttribute('hidden');
        renderThemeRiver('themeriver-chart', clusters);
      } else {
        themeRiverContainer?.setAttribute('hidden', '');
      }
      embeddingStatus.classList.add('hidden');
    }

    renderHeatmap('heatmap-chart', shiftHeatmapData(heatmap, currentOffsetHours));
    renderTimeline('timeline-chart', timeline);
    renderTypicalDay('typical-day-chart', typicalDay);
    renderRatios('ratios-chart', ratios);
    renderInteractions('interactions-chart', interactions);
    renderSocial('social-chart', follows, blocks);
    renderSleepPattern('sleep-chart', sleep);

    renderBreadcrumb();

    const labelStr = currentRange.label === 'All Time' ? '' : ` (${currentRange.label})`;
    status.textContent = `Showing analysis for ${currentHandle || currentDid}${labelStr}`;
  } catch (err: any) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    loadBtn.disabled = false;
  }
}

async function loadDashboard(did: string) {
  currentDid = did;
  currentRange = { label: 'All Time' }; // Reset date range when changing repo
  
  status.textContent = `Loading analysis for ${did}...`;
  dashboard.classList.add('hidden');
  dateRangeContainer.classList.add('hidden');
  loadBtn.disabled = true;

  try {
    const summary = await api<any>(`/repos/${encodeURIComponent(did)}/summary`);
    currentHandle = summary.handle || did;
    
    periods = (await api<{ periods: typeof periods }>(`/repos/${encodeURIComponent(did)}/periods`)).periods;

    // Render summary cards
    renderSummaryCards(summary.counts || {});

    // Unhide dashboard BEFORE rendering charts so ECharts can measure container dimensions
    dashboard.classList.remove('hidden');
    dateRangeContainer.classList.remove('hidden');
    timezoneContainer.classList.remove('hidden');

    await refreshCharts();
  } catch (err: any) {
    status.textContent = `Error: ${err.message}`;
    loadBtn.disabled = false;
  }
}

loadBtn.addEventListener('click', () => {
  const input = didInput.value.trim();
  if (input) loadDashboard(input);
});

didInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadBtn.click();
});

repoSelect.addEventListener('change', () => {
  if (repoSelect.value) {
    didInput.value = repoSelect.value;
    loadDashboard(repoSelect.value);
  }
});

timezoneSelect.addEventListener('change', () => {
  if (timezoneSelect.value === 'local') {
    setOffsetHours(Math.round(-new Date().getTimezoneOffset() / 60));
  } else {
    setOffsetHours(parseInt(timezoneSelect.value, 10));
  }
  timezoneLabel.textContent = getTimezoneLabel();
  refreshCharts();
});
timezoneLabel.textContent = getTimezoneLabel();

const themeriverSwitcher = document.getElementById('themeriver-switcher');
if (themeriverSwitcher) {
  themeriverSwitcher.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-btn')) {
      themeriverSwitcher.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      target.classList.add('active');
      const mode = target.getAttribute('data-mode') as 'normalized' | 'absolute';
      setThemeRiverMode(mode);
    }
  });
}

const heatmapSwitcher = document.getElementById('heatmap-switcher');
if (heatmapSwitcher) {
  heatmapSwitcher.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-btn')) {
      heatmapSwitcher.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      target.classList.add('active');
      currentHeatmapCollection = target.getAttribute('data-collection') || '';
      refreshCharts();
    }
  });
}

loadRepoList();
