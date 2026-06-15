import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import app from "./app";

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  console.log(`OpsFlow backend listening on port ${port}`);
});
