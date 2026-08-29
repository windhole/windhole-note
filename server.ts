import index from "./src/client/index.html";
import { createDb } from "./src/server/db";
import { createRoutes } from "./src/server/routes";

// 起動時にマイグレーションが走る(db.ts)
const db = createDb();

const server = Bun.serve({
  port: 3000,
  routes: {
    ...createRoutes(db),
    "/": index,
  },
});

console.log(`windhole-note: ${server.url}`);
