// PM2 process file for the backend API.
// Usage (from the server, after `pnpm build` at the repo root):
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup   (persist across reboots — run the command pm2 prints)
module.exports = {
  apps: [
    {
      name: "hrms-backend",
      cwd: "/var/www/hrms.zalgostore.com/apps/backend", // uploads/ and .env are resolved relative to this
      script: "dist/index.js",
      instances: 1, // Socket.IO needs sticky sessions to run >1 instance behind a load balancer
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "500M",
    },
  ],
};
