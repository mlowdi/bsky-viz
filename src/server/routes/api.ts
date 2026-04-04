import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { getActivityHeatmap, getActivityTimeline } from '../../analysis/activity.js';
import { getTopInteractions, getContentRatios } from '../../analysis/interactions.js';
import { getFollowTimeline, getBlockTimeline } from '../../analysis/social.js';
import { getRepos, getRepo, getRecordCount } from '../../db/queries.js';
import { resolveHandles } from '../../resolve.js';

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
    const repo = getRepo(db, did);
    if (!repo) return c.json({ error: 'Repo not found' }, 404);
    const counts = getRecordCount(db, did);
    return c.json({ ...repo, counts });
  });

  api.get('/repos/:did/activity/heatmap', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const collection = c.req.query('collection') || undefined;
    return c.json(getActivityHeatmap(db, did, collection));
  });

  api.get('/repos/:did/activity/timeline', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    return c.json(getActivityTimeline(db, did));
  });

  api.get('/repos/:did/ratios', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    return c.json(getContentRatios(db, did));
  });

  api.get('/repos/:did/interactions/top', async (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const limit = parseInt(c.req.query('limit') || '20');
    const interactions = getTopInteractions(db, did, limit);
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
    return c.json(getFollowTimeline(db, did));
  });

  api.get('/repos/:did/social/blocks', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    return c.json(getBlockTimeline(db, did));
  });

  return api;
}
