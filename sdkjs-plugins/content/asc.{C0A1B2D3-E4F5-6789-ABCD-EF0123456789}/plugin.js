/* eslint-disable */
/**
 * Lovable Logic plugin — smoke #1 stub.
 *
 * Goal of this build: prove the plugin host actually loads our code on the
 * Cloud-hosted OnlyOffice instance, and prove the plugin iframe can talk
 * back to the parent window via postMessage. NOTHING ELSE.
 *
 * No selection capture, no bookmark insertion. Those come after the
 * operator-verified Gate 1.
 *
 * Logging discipline: every decision point logs under the [LvblPlugin] tag
 * AND forwards the same line to the parent over postMessage (event "log"),
 * so the parent console shows both sides under a single filter even if the
 * plugin iframe's own console is sandboxed away.
 */
// ── TOP-LEVEL LIVENESS PROBE ──────────────────────────────────────────
// This MUST be the very first executable statement in the file. If this
// log does not appear in the OnlyOffice iframe console, the file was
// never fetched/parsed/executed by the plugin host. Decisive test.
console.log("[LvblPlugin][inside] script loaded", {
  href: typeof window !== "undefined" ? window.location.href : "(no window)",
  ts: Date.now(),
});

(function () {
  "use strict";

  var TAG = "[LvblPlugin]";
  var PROTOCOL = "lvbl-plugin/1";

  // Best-effort parent reference. window.parent is always defined inside
  // the plugin iframe; postMessage is a no-op on cross-origin failures.
  var parentWin = window.parent && window.parent !== window ? window.parent : null;

  function postToParent(message) {
    if (!parentWin) return;
    try {
      // targetOrigin "*" is acceptable here because the messages we send are
      // diagnostic + RPC envelopes the parent already validates by shape.
      parentWin.postMessage(message, "*");
    } catch (err) {
      // Swallow — logging this would recurse.
    }
  }

  function lvblLog(level, message, data) {
    var line = TAG + " " + message;
    try {
      if (typeof console !== "undefined" && console[level]) {
        if (data !== undefined) console[level](line, data);
        else console[level](line);
      }
    } catch (e) {}
    postToParent({
      protocol: PROTOCOL,
      kind: "event",
      event: "log",
      level: level,
      tag: TAG,
      message: message,
      data: data === undefined ? null : safeForPost(data),
    });
  }

  function safeForPost(value) {
    // postMessage clones via structured clone. Most plain objects work; bail
    // to a string for anything that throws.
    try {
      // round-trip to detect cloneability without actually shipping it
      JSON.stringify(value);
      return value;
    } catch (e) {
      try {
        return String(value);
      } catch (e2) {
        return "<unserialisable>";
      }
    }
  }

  // ── Boot trace ────────────────────────────────────────────────────────
  lvblLog("info", "plugin script loaded", {
    href: window.location.href,
    hasParent: !!parentWin,
    hasAscGlobal: typeof window.Asc !== "undefined",
    ascPluginType: typeof (window.Asc && window.Asc.plugin),
    userAgent: navigator.userAgent,
  });

  // ── Asc.plugin lifecycle hooks ───────────────────────────────────────
  // Asc.plugin is provided by OnlyOffice's plugins.js (loaded in
  // index.html). It exposes init/button/onTranslate hooks the host calls.
  if (typeof window.Asc === "undefined" || !window.Asc.plugin) {
    lvblLog("error", "Asc.plugin not available — plugins.js failed to load or sandboxed", {
      hasAscGlobal: typeof window.Asc !== "undefined",
    });
    // We still send a pluginReady so the parent's gate doesn't hang forever
    // — it just reports state="error" so the operator knows what happened.
    postToParent({
      protocol: PROTOCOL,
      kind: "event",
      event: "pluginReady",
      state: "error",
      reason: "asc-plugin-missing",
    });
    return;
  }

  window.Asc.plugin.init = function () {
    lvblLog("info", "Asc.plugin.init fired", {
      hasCallCommand: typeof window.Asc.plugin.callCommand === "function",
      hasExecuteMethod: typeof window.Asc.plugin.executeMethod === "function",
      info: window.Asc.plugin.info || null,
    });
    postToParent({
      protocol: PROTOCOL,
      kind: "event",
      event: "pluginReady",
      state: "ok",
      capabilities: {
        callCommand: typeof window.Asc.plugin.callCommand === "function",
        executeMethod: typeof window.Asc.plugin.executeMethod === "function",
      },
    });
  };

  window.Asc.plugin.button = function (id) {
    lvblLog("debug", "Asc.plugin.button fired", { id: id });
    // Every button (including -1 = close) is a no-op for the stub.
  };

  window.Asc.plugin.onTranslate = function () {
    lvblLog("debug", "Asc.plugin.onTranslate fired");
  };

  // ── Heartbeat / liveness ─────────────────────────────────────────────
  // Once init has fired the parent will start sending pings. For smoke #1
  // we just respond to anything addressed to our protocol with a
  // pong-shaped envelope so the operator can confirm round-trip works.
  window.addEventListener("message", function (ev) {
    var msg = ev && ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.protocol !== PROTOCOL) return;
    if (msg.kind === "request" && msg.method === "ping") {
      lvblLog("debug", "ping received", { id: msg.id });
      postToParent({
        protocol: PROTOCOL,
        kind: "response",
        id: msg.id,
        ok: true,
        result: { pongAt: Date.now() },
      });
    }
  });
})();
