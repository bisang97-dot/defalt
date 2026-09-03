import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { membersRouter } from "./routes/members";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(config.port, () => {
  console.log(`Claude Enterprise Token Manager listening on port ${config.port} (${config.nodeEnv})`);
});
