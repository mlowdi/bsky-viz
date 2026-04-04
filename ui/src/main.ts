import { renderHeatmap } from './charts/activity-heatmap.js';
import { renderTimeline } from './charts/timeline.js';
import { renderRatios } from './charts/ratios.js';
import { renderInteractions } from './charts/interaction-network.js';
import { renderSocial } from './charts/social-timeline.js';

const didInput = document.getElementById('did-input') as HTMLInputElement;
const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
const repoSelect = document.getElementById('repo-select') as HTMLSelectElement;
const status = document.getElementById('status') as HTMLDivElement;
const dashboard = document.getElementById('dashboard') as HTMLDivElement;
const summaryCards = document.getElementById('summary-cards') as HTMLDivElement;
const dateRangeContainer = document.getElementById('date-range') as HTMLDivElement;

let currentRange: { start?: number; end?: number; label: string } = { label: 'All Time' };
let currentDid: string = '';
let currentHandle: string = '';
let periods: Array<{ year: string; month: string; count: number }> = [];

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

async function refreshCharts() {
  if (!currentDid) return;
  status.textContent = `Refreshing analysis for ${currentHandle || currentDid}...`;
  loadBtn.disabled = true;

  try {
    const [summary, heatmap, timeline, ratios, interactions, follows, blocks] = await Promise.all([
      api<any>(`/repos/${encodeURIComponent(currentDid)}/summary`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/activity/heatmap`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/activity/timeline`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/ratios`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/interactions/top`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/social/follows`),
      api<any[]>(`/repos/${encodeURIComponent(currentDid)}/social/blocks`),
    ]);

    renderSummaryCards(summary.counts || {});
    const profileChanges = timeline.filter((t: any) => t.collection === 'app.bsky.actor.profile').map((t: any) => t.date);

    renderHeatmap('heatmap-chart', heatmap);
    renderTimeline('timeline-chart', timeline, profileChanges);
    renderRatios('ratios-chart', ratios);
    renderInteractions('interactions-chart', interactions);
    renderSocial('social-chart', follows, blocks);

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

loadRepoList();
