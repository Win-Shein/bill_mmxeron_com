'use strict';

const express = require('express');
const { listRenewals } = require('../lib/renewals');

const router = express.Router();

/**
 * GET /api/renewals?within=30&category=VPS
 * Active subscription expiries for the org, soonest first. `within` (days)
 * optionally limits the result to services expiring in that window; expired
 * services (negative days_left) are always included.
 */
router.get('/', (req, res) => {
  const within = Number(req.query.within);
  const category = (req.query.category || '').trim();
  let rows = listRenewals(req.orgId);
  if (category) rows = rows.filter((r) => (r.category || '') === category);
  if (Number.isFinite(within) && within > 0) rows = rows.filter((r) => r.days_left <= within);
  res.json(rows);
});

module.exports = router;
