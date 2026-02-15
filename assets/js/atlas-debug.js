/* ============================================================
   TDW Atlas Engine — Debug Helpers
   ------------------------------------------------------------
   Purpose:
   - Diagnostics for development
   - This file is only enqueued when debug mode is enabled (PHP-controlled)

   Notes:
   - Exposes helpers under window.TDWAtlasDebug
   - No Shadow DOM helpers (Leaflet-based engine)
   ============================================================ */

(function (window, document) {
  "use strict";

  /* ============================================================
     MODULE INIT
     ============================================================ */

  const PREFIX = "[TDW ATLAS DEBUG]";

  // Forwarding Debug-Logs
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

  /* ============================================================
     FUNCTIONS 
     ============================================================ */

  // Helper: validate required design tokens from Plugin tdw-core (Style Plugin)

  const checkDesignTokens = (tokens = []) => {
    const required = tokens.length
      ? tokens
      : [
          "--tdw-bg",
          "--tdw-text",
          "--tdw-water",
          "--tdw-border",
          "--tdw-card",
        ];

    const styles = getComputedStyle(document.documentElement);

    const missing = [];
    for (const token of required) {
      const value = styles.getPropertyValue(token).trim();
      if (!value) missing.push(token);
    }

    if (missing.length) {
      warn(
        "Missing design tokens:",
        missing,
        "→ atlas.css will use fallbacks (check tdw-site-core or token definitions)."
      );
    } else {
      log("All required design tokens are present.");
    }

    return { missing, required };
  };

  // Helper: verify Atlas namespace presence (Core/API/Adapters)
  // Usage examples:
  // - checkAtlasNamespace(); // default checks
  // - checkAtlasNamespace(["TDW.Atlas.Core.create", "TDW.Atlas.API.getAdapter"]);
  const checkAtlasNamespace = (paths = []) => {
    const defaults = [
      "TDW.Atlas",
      "TDW.Atlas.Core",
      "TDW.Atlas.Core.create",
      "TDW.Atlas.API",
      "TDW.Atlas.API.getAdapter",
      "TDW.Atlas.Adapters",
    ];

    const wanted = (paths && paths.length ? paths : defaults).map(String);

    const get = (root, key) => (root && Object.prototype.hasOwnProperty.call(root, key) ? root[key] : undefined);

    const resolvePath = (path) => {
      const parts = path.split(".").filter(Boolean);
      let cur = window;
      for (const p of parts) {
        cur = get(cur, p);
        if (cur === undefined) return undefined;
      }
      return cur;
    };

    const report = wanted.map((p) => {
      const val = resolvePath(p);
      const type = val === undefined ? "missing" : typeof val;
      return { path: p, type };
    });

    const missing = report.filter((r) => r.type === "missing").map((r) => r.path);
    const present = report.filter((r) => r.type !== "missing");

    if (missing.length) {
      warn("Namespace check: missing", missing);
    }
    if (present.length) {
      log(
        "Namespace check: present",
        present.map((r) => `${r.path} (${r.type})`)
      );
    }

    // Extra: show top-level TDW.Atlas keys if present (helps spot naming mismatches)
    const tdw = window.TDW;
    const atlas = tdw && tdw.Atlas;
    if (atlas && typeof atlas === "object") {
      try {
        log("TDW.Atlas keys:", Object.keys(atlas));
      } catch (_) {}
    }

    return { report, missing, present };
  };

  /* ============================================================
     PUBLIC API (window.TDWAtlasDebug)
     ============================================================ */

  window.TDWAtlasDebug = {
    checkDesignTokens,
    checkAtlasNamespace,
  };

  /* ============================================================
     AUTORUN (only when this file is enqueued)
     ------------------------------------------------------------
     Since PHP includes atlas-debug.js only in debug mode, we can
     safely run basic diagnostics automatically.
     ============================================================ */

  const runAutoChecks = () => {
    try {
      checkDesignTokens();
    } catch (e) {
      warn("Auto token check failed:", e);
    }

  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAutoChecks, { once: true });
  } else {
    runAutoChecks();
  }

})(window, document);