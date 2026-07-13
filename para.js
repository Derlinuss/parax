// Para — error handler for Parax
// Auto-initializes once Firebase compat SDK is available

;(function () {
  "use strict";

  const Para = {
    _db: null,
    _userId: null,
    _ready: false,
    _queue: [],
    _initialized: false,

    init: function () {
      if (this._initialized) return;
      this._initialized = true;

      if (typeof firebase === "undefined" || !firebase.firestore) {
        console.warn("[Para] Firebase not ready, will retry in 1s");
        setTimeout(function () { Para.init(); }, 1000);
        return;
      }

      try {
        this._db = firebase.firestore();
        this._ready = true;
      } catch (e) {
        console.warn("[Para] Could not get Firestore:", e);
        return;
      }

      this._flushQueue();

      var _this = this;
      if (firebase.auth) {
        firebase.auth().onAuthStateChanged(function (user) {
          _this._userId = user ? user.uid : null;
        });
      }

      this._hookGlobalErrors();
    },

    _hookGlobalErrors: function () {
      var _this = this;

      var origOnError = window.onerror;
      window.onerror = function (message, source, lineno, colno, error) {
        _this.capture(error || message, {
          type: "unhandled",
          source: source,
          line: lineno,
          col: colno,
        });
        if (typeof origOnError === "function") {
          return origOnError.apply(window, arguments);
        }
        return false;
      };

      window.addEventListener("unhandledrejection", function (e) {
        var err = e.reason;
        _this.capture(err || "Unhandled Promise rejection", {
          type: "promise",
        });
      });

      var origConsoleError = console.error;
      console.error = function () {
        var args = Array.prototype.slice.call(arguments);
        var first = args[0];
        if (typeof first === "string" && first.indexOf("[Para]") !== 0) {
          _this.capture(
            first instanceof Error ? first : args.join(" "),
            { type: "console" }
          );
        }
        return origConsoleError.apply(console, args);
      };
    },

    capture: function (err, metadata) {
      var data = this._buildErrorData(err, metadata || {});
      if (!this._ready) {
        this._queue.push(data);
        return;
      }
      this._write(data);
    },

    _buildErrorData: function (err, metadata) {
      var message = "";
      var stack = "";

      if (err instanceof Error) {
        message = err.message || String(err);
        stack = err.stack || "";
      } else if (typeof err === "object" && err !== null) {
        message = err.message || err.code || JSON.stringify(err);
        stack = err.stack || "";
      } else {
        message = String(err);
      }

      var fingerprint = this._hash(message + stack);

      return {
        message: message.slice(0, 2000),
        stack: stack.slice(0, 5000),
        type: metadata.type || "manual",
        url: window.location.href,
        userId: this._userId || null,
        userAgent: navigator.userAgent,
        fingerprint: fingerprint,
        metadata: metadata || {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
    },

    _write: function (data) {
      if (!this._db) return;
      try {
        this._db.collection("errors").add(data);
      } catch (e) {
        console.warn("[Para] Failed to store error:", e);
      }
    },

    _flushQueue: function () {
      if (!this._ready) return;
      var q = this._queue;
      this._queue = [];
      for (var i = 0; i < q.length; i++) {
        this._write(q[i]);
      }
    },

    _hash: function (str) {
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        var chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
      }
      return Math.abs(hash).toString(16);
    },
  };

  window.Para = Para;
  Para.init();
})();
