import http from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { initSockets } from "./sockets.js";
import { startJobs } from "./jobs/subscription-expiry.js";

const server = http.createServer(app);
initSockets(server);
startJobs();
server.listen(env.PORT, () => {
  console.log(`🚀 HRMS Backend   → http://localhost:${env.PORT}`);
  console.log(`   API base       → http://localhost:${env.PORT}/api/v1`);
});
