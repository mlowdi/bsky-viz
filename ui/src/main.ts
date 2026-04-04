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

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
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

async function loadDashboard(did: string) {
  status.textContent = `Loading analysis for ${did}...`;
  dashboard.classList.add('hidden');
  loadBtn.disabled = true;

  try {
    // Fetch all data in parallel
    const [summary, heatmap, timeline, ratios, interactions, follows, blocks] = await Promise.all([
      api<any>(`/repos/${encodeURIComponent(did)}/summary`),
      api<any[]>(`/repos/${encodeURIComponent(did)}/activity/heatmap`),
      api<any[]>(`/repos/${encodeURIComponent(did)}/activity/timeline`),
      api<any[]>(`/repos/${encodeURIComponent(did)}/ratios`),
      api<any[]>(`/repos/${encodeURIComponent(did)}/interactions/top`),
      api<any[]>(`/repos/${encodeURIComponent(did)}/social/follows`),
      api<any[]>(`/repos/${encodeURIComponent(did)}/social/blocks`),
    ]);

    // Render summary cards
    const counts = summary.counts || {};
    const totalRecords = Object.values(counts).reduce((a: number, b: any) => a + (b as number), 0);
    summaryCards.innerHTML = [
      { label: 'Total Records', value: totalRecords },
      { label: 'Posts', value: counts['app.bsky.feed.post'] || 0 },
      { label: 'Likes', value: counts['app.bsky.feed.like'] || 0 },
      { label: 'Reposts', value: counts['app.bsky.feed.repost'] || 0 },
      { label: 'Follows', value: counts['app.bsky.graph.follow'] || 0 },
      { label: 'Blocks', value: counts['app.bsky.graph.block'] || 0 },
    ].map(c => `<div class="card"><div class="value">${c.value.toLocaleString()}</div><div class="label">${c.label}</div></div>`).join('');

    // Render charts
    renderHeatmap('heatmap-chart', heatmap);
    renderTimeline('timeline-chart', timeline);
    renderRatios('ratios-chart', ratios);
    renderInteractions('interactions-chart', interactions);
    renderSocial('social-chart', follows, blocks);

    dashboard.classList.remove('hidden');
    status.textContent = `Showing analysis for ${summary.handle || did}`;
  } catch (err: any) {
    status.textContent = `Error: ${err.message}`;
  } finally {
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
