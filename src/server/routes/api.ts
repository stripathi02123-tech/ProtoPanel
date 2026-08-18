import express from "express";
import { readJSON } from "../services/db.js";
import { execFile } from "child_process";
import crypto from "crypto";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", panel: "Proto Panel", version: "3.2.0" });
});

import authRoutes from "./auth.js";
import serverRoutes from "./servers.js";
import systemRoutes from "./system.js";
import apiKeyRoutes from "./api-keys.js";
import nodeRoutes from "./nodes.js";

// GitHub Auto-Update Webhook endpoint
router.post("/webhook/github-update", async (req, res) => {
  const configuredSecret = process.env.GITHUB_WEBHOOK_SECRET;

  // Previously: `if (configuredSecret && secretHeader !== configuredSecret)`.
  // If the operator never set GITHUB_WEBHOOK_SECRET, configuredSecret was
  // falsy and the whole check short-circuited to "skip" — meaning this
  // unauthenticated, public endpoint would run update.sh for anyone who
  // requested it. Fail closed instead: no secret configured means the
  // webhook is disabled, not open.
  if (!configuredSecret) {
    return res.status(503).json({ error: "Webhook not configured (GITHUB_WEBHOOK_SECRET is not set)" });
  }

  const secretHeader = String(req.headers["x-hub-signature-256"] || req.headers["x-webhook-secret"] || req.query.secret || "");
  const expected = Buffer.from(configuredSecret);
  const received = Buffer.from(secretHeader);
  const isValid = expected.length === received.length && crypto.timingSafeEqual(expected, received);

  if (!isValid) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  console.log("[Proto Panel] GitHub push webhook triggered! Initiating automatic panel update...");
  res.json({ success: true, message: "Automatic update triggered from GitHub push." });

  setTimeout(() => {
    execFile("bash", ["update.sh"], (error, stdout, stderr) => {
      if (error) {
        console.error(`[Proto Panel Auto-Update Error]:`, error);
      }
      console.log(`[Proto Panel Auto-Update Output]:\n${stdout}`);
    });
  }, 1000);
});

router.use("/auth", authRoutes);
router.use("/servers", serverRoutes);
router.use("/system", systemRoutes);
router.use("/admin/api-keys", apiKeyRoutes);
router.use("/nodes", nodeRoutes);

router.get("/settings", async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  res.json({ 
    panelName: settings.panelName || "Proto Panel",
    panelLogo: settings.panelLogo || "",
    panelBackgroundImage: settings.panelBackgroundImage || "",
    panelBackgroundBlur: settings.panelBackgroundBlur !== undefined ? settings.panelBackgroundBlur : 10,
    enablePlayit: settings.enablePlayit !== undefined ? settings.enablePlayit : false,
    enableTutorial: settings.enableTutorial !== undefined ? settings.enableTutorial : true,
    enableLoginAnimation: settings.enableLoginAnimation !== undefined ? settings.enableLoginAnimation : true,
    enableRegistration: settings.enableRegistration !== undefined ? settings.enableRegistration : true,
    theme: settings.theme || "red",
    enableGoogleLogin: settings.enableGoogleLogin !== undefined ? settings.enableGoogleLogin : false,
    firebaseApiKey: settings.firebaseApiKey || "",
    firebaseAuthDomain: settings.firebaseAuthDomain || "",
    firebaseProjectId: settings.firebaseProjectId || "",
    firebaseStorageBucket: settings.firebaseStorageBucket || "",
    firebaseMessagingSenderId: settings.firebaseMessagingSenderId || "",
    firebaseAppId: settings.firebaseAppId || "",
    defaultRuntime: settings.defaultRuntime || process.env.DEFAULT_RUNTIME || "docker",
    runtimeLocked: settings.runtimeLocked !== undefined ? settings.runtimeLocked : (process.env.PANEL_RUNTIME_LOCKED === "true" || process.env.PANEL_RUNTIME_LOCKED === "1"),
    isDev: process.env.NODE_ENV === "development" || process.env.PORT === "30000" || process.env.PANEL_DEV_MODE === "true" || process.env.DEV_MODE === "true"
  });
});

export default router;
