'use strict';

/**
 * Tiny in-memory fixed-window rate limiter (no external dependencies).
 * Fine for a single-process deployment. If you run multiple instances
 * behind a load balancer, use a shared store (e.g. Redis) instead.
 *
 * Successful responses clear the counter (skipSuccessfulRequests) so a
 * legitimate user is never locked out by one good login.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, message, skipSuccessfulRequests = true } = {}) {
  const hits = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of hits) {
      if (now - rec.start >= windowMs) hits.delete(key);
    }
  }, windowMs);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || now - rec.start >= windowMs) {
      rec = { start: now, count: 0 };
      hits.set(ip, rec);
    }
    rec.count += 1;

    if (rec.count > max) {
      const retry = Math.max(1, Math.ceil((rec.start + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({
        error: message || `Too many attempts. Please try again in ${Math.ceil(retry / 60)} minute(s).`,
      });
    }

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) hits.delete(ip);
      });
    }
    next();
  };
}

module.exports = { rateLimit };
