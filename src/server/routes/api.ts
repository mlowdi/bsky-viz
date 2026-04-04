import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { getActivityHeatmap, getActivityTimeline } from '../../analysis/activity.js';
import { getTopInteractions, getContentRatios } from '../../analysis/interactions.js';
import { getFollowTimeline, getBlockTimeline } from '../../analysis/social.js';
import { getRepos, getRepo, getRecordCount } from '../../db/queries.js';

export function apiRoutes(db: Database): Hono {
  const api = new Hono();

  api.get('/repos', (c) => c.json(getRepos(db)));

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

  api.get('/repos/:did/interactions/top', (c) => {
    const did = decodeURIComponent(c.req.param('did'));
    const limit = parseInt(c.req.query('limit') || '20');
    return c.json(getTopInteractions(db, did, limit));
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
