// PM2 process file for the frontend (static Vite build).
//   npm run build            -> produces dist/
//   pm2 start ecosystem.config.cjs
//
// Uses PM2's built-in static server. SPA mode falls back to index.html so
// deep links / refreshes on client routes (e.g. /dashboard) don't 404.
// VITE_* variables are baked in at build time from .env - rebuild after
// changing them, restarting PM2 alone won't pick them up.
module.exports = {
  apps: [
    {
      name: "signal-frontend",
      script: "serve",
      cwd: __dirname,
      env: {
        PM2_SERVE_PATH: "./dist",
        PM2_SERVE_PORT: process.env.FRONTEND_PORT || 4173,
        PM2_SERVE_SPA: "true",
        PM2_SERVE_HOMEPAGE: "/index.html",
      },
    },
  ],
};
