import index from "./src/client/index.html";
import { createDb } from "./src/server/db";
import { createRoutes } from "./src/server/routes";

// 起動時にマイグレーションが走る(db.ts)
const db = createDb();

const server = Bun.serve({
  // 認証が無いので、同じネットワークの他端末から届かないようループバックに閉じる。
  // 省略すると 0.0.0.0 で待ち受けてしまう(起動ログは localhost と出るので気づきにくい)
  hostname: "127.0.0.1",
  port: 3000,
  routes: {
    ...createRoutes(db),
    "/": index,
  },
});

console.log(`windhole-note: ${server.url}`);
