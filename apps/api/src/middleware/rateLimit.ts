import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  code?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests, please try again later.', code = 'RATE_LIMIT_EXCEEDED' } = options;
  const ipHits = new Map<string, number[]>();

  // Periodic cleanup every 60 seconds to prevent unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipHits.entries()) {
      const active = timestamps.filter((t) => t > now - windowMs);
      if (active.length === 0) {
        ipHits.delete(ip);
      } else {
        ipHits.set(ip, active);
      }
    }
  }, 60000);

  // Do not hold process open
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Never throttle health check endpoint
    if (req.path === '/health' || req.originalUrl === '/health') {
      return next();
    }

    const forwarded = req.headers['x-forwarded-for'];
    let clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      clientIp = forwarded.split(',')[0].trim();
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (ipHits.get(clientIp) || []).filter((t) => t > windowStart);

    if (timestamps.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: {
          code,
          message
        }
      });
    }

    timestamps.push(now);
    ipHits.set(clientIp, timestamps);
    return next();
  };
}
