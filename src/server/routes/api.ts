import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { getActivityHeatmap, getActivityTimeline, getAvailablePeriods } from '../../analysis/activity.js';
import { getTopInteractions, getContentRatios } from '../../analysis/interactions.js';
import { getFollowTimeline, getBlockTimeline } from '../../analysis/social.js';
import { getClusterAnalysis } from '../../analysis/clusters.js';
import { getRepos, getRepo, getRecordCount } from '../../db/queries.js';
import { resolveHandles } from '../../resolve.js';

function getTimeParams(c: any) {
  const startStr = c.req.query('start');
  const endStr = c.req.query('end');
  const start = startStr ? Number(startStr) : undefined;
  const end = endStr ? Number(endStr) : undefined;
  return { start, end };
}

export function apiRoutes(db: Database): Hono {
  const api = new Hono();

  api.get('/repos', (c) => c.json(getRepos(db)));

  api.get('/resolve-handles', async (c) => {
    const didsParam = c.req.query('dids');
    if (!didsParam) return c.json({});
    const dids = didsParam.split(',').filter(Boolean);
    const handles = await resolveHandles(db, dids);
    return c.json(handles);
  });

  api.get('/repos/:did/summary', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const { start, end } = getTimeParams(c);
    const repo = getRepo(db, did);
    if (!repo) return c.json({ error: 'Repo not found' }, 404);
    const counts = getRecordCount(db, did, start, end);
    return c.json({ ...repo, counts });
  });

  api.get('/repos/:did/periods', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const periods = getAvailablePeriods(db, did);
    return c.json({ periods });
  });

  api.get('/repos/:did/activity/heatmap', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const collection = c.req.query('collection') || undefined;
    const { start, end } = getTimeParams(c);
    return c.json(getActivityHeatmap(db, did, collection, start, end));
  });

  api.get('/repos/:did/activity/timeline', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const { start, end } = getTimeParams(c);
    return c.json(getActivityTimeline(db, did, start, end));
  });

  api.get('/repos/:did/ratios', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const { start, end } = getTimeParams(c);
    return c.json(getContentRatios(db, did, start, end));
  });

  api.get('/repos/:did/interactions/top', async (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const limit = parseInt(c.req.query('limit') || '20');
    const { start, end } = getTimeParams(c);
    const interactions = getTopInteractions(db, did, limit, start, end);
    const dids = interactions.map(i => i.did).filter(Boolean);
    const handles = await resolveHandles(db, dids);
    const enriched = interactions.map(i => ({
      ...i,
      handle: handles[i.did] || null,
    }));
    return c.json(enriched);
  });

  api.get('/repos/:did/social/follows', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const { start, end } = getTimeParams(c);
    return c.json(getFollowTimeline(db, did, start, end));
  });

  api.get('/repos/:did/social/blocks', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const { start, end } = getTimeParams(c);
    return c.json(getBlockTimeline(db, did, start, end));
  });

  api.get('/repos/:did/clusters', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const k = parseInt(c.req.query('k') || '10');
    const bin = c.req.query('bin') || 'month';
    const { start, end } = getTimeParams(c);
    return c.json(getClusterAnalysis(db, did, k, bin, start, end));
  });

  return api;
}
