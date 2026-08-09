import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { config } from "./config";
import { forbidden } from "./lib/errors";
import { logger } from "./lib/logger";
import { rateLimit } from "./lib/rateLimit";
import { asyncHandler } from "./middleware/asyncHandler";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { imagesRouter } from "./routes/images";
import { ownerRouter } from "./routes/owner";
import { publicRouter } from "./routes/public";
import { studentRouter } from "./routes/student";
import { isMaintenanceMode } from "./services/settings";

export function createApp() {
  const app = express();

  // Render and other platforms terminate TLS upstream; without this req.ip is
  // the proxy address and every rate limit would share one bucket.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );

  app.use(
    cors({
      // An exact allow-list. No wildcards, no origin reflection.
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // Refusing without CORS headers is the actual protection. Throwing
        // here would surface as an opaque 500, which is a miserable thing to
        // debug when a deployment domain has simply changed.
        callback(null, false);
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: "256kb" }));
  app.use(
    pinoHttp({
      logger,
      // Request bodies are never logged.
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(rateLimit({ name: "global", limit: 300, windowSeconds: 900 }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "costume-competition-api" });
  });

  /**
   * Maintenance mode locks students out of the API entirely, not just the UI.
   * Staff can still sign in and work, which is the point of the switch.
   */
  const maintenanceGate = asyncHandler(async (_req, _res, next) => {
    if (await isMaintenanceMode()) {
      next(
        forbidden("The site is temporarily unavailable while we make updates."),
      );
      return;
    }
    next();
  });

  /**
   * Registration is closed to students during maintenance. Sign in and
   * password reset stay open: those routes reject student accounts themselves
   * once the credentials check out, so staff and the Owner can still get in
   * and turn maintenance back off.
   */
  const studentAuthGate = asyncHandler(async (req, _res, next) => {
    if (req.path.startsWith("/student/") && (await isMaintenanceMode())) {
      next(forbidden("Student access is unavailable during maintenance."));
      return;
    }
    next();
  });

  app.use("/api/public", publicRouter);
  app.use("/api/auth", studentAuthGate, authRouter);
  app.use("/api/images", imagesRouter);

  app.get("/api/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.use("/api/me", maintenanceGate, studentRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/owner", ownerRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
