// Para Voice — Daily.co voice chat module for Parax
;(function () {
  "use strict";

  var ParaVoice = {
    _call: null,
    _container: null,
    _activeChannelId: null,
    _listeners: {},

    init: function () {
      var _this = this;
      this._setupListeners();
      this._setupUI();
    },

    _setupUI: function () {
      var voiceBar = document.getElementById("voice-bar");
      var leaveBtn = document.getElementById("voice-leave-btn");
      var muteBtn = document.getElementById("voice-mute-btn");

      if (leaveBtn) {
        leaveBtn.addEventListener("click", function () {
          _this.leave();
        });
      }

      if (muteBtn) {
        muteBtn.addEventListener("click", function () {
          _this.toggleMute();
        });
      }
    },

    _setupListeners: function () {
      var _this = this;
      this._listeners["visibilitychange"] = function () {
        if (document.hidden && _this._call) {
          _this._call.updateInputSettings({ audio: false });
        } else if (_this._call) {
          _this._call.updateInputSettings({ audio: true });
        }
      };
      document.addEventListener("visibilitychange", this._listeners["visibilitychange"]);
    },

    _destroyListeners: function () {
      for (var key in this._listeners) {
        document.removeEventListener(key, this._listeners[key]);
      }
      this._listeners = {};
    },

    join: function (channelId, channelName) {
      var _this = this;

      if (this._call) {
        this.leave();
      }

      this._activeChannelId = channelId;

      var voiceBar = document.getElementById("voice-bar");
      var voiceChannelName = document.getElementById("voice-channel-name");
      if (voiceChannelName) voiceChannelName.textContent = channelName;
      if (voiceBar) voiceBar.classList.remove("hidden");

      var user = firebase.auth().currentUser;
      if (!user) return;

      user.getIdToken().then(function (token) {
        return fetch("/api/voice/create-room", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
        });
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        if (data.error) {
          if (typeof Para !== "undefined") Para.capture(data.error, { context: "voice-join" });
          _this._showError("Voice chat unavailable: " + data.error);
          _this.leave();
          return;
        }

        if (typeof Daily === "undefined") {
          _this._showError("Daily.co SDK not loaded");
          return;
        }

        var container = document.getElementById("voice-container");
        if (!container) return;

        _this._container = container;
        _this._call = Daily.createFrame(container, {
          showLeaveButton: false,
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "8px",
          },
        });

        _this._call.on("left-meeting", function () {
          _this._cleanup();
        });

        _this._call.on("error", function (e) {
          if (typeof Para !== "undefined") Para.capture(e, { context: "daily-call" });
        });

        _this._call.join({ url: data.url });
      }).catch(function (err) {
        if (typeof Para !== "undefined") Para.capture(err, { context: "voice-join-fetch" });
        _this._showError("Failed to connect to voice chat");
        _this.leave();
      });
    },

    leave: function () {
      if (this._call) {
        try { this._call.leave(); } catch (e) {}
        try { this._call.destroy(); } catch (e) {}
        this._call = null;
      }
      this._cleanup();
    },

    toggleMute: function () {
      if (!this._call) return;
      var muteBtn = document.getElementById("voice-mute-btn");
      this._call.setLocalAudio(!this._call._localAudioState);
      this._call._localAudioState = !this._call._localAudioState;
      if (muteBtn) {
        muteBtn.classList.toggle("muted");
        muteBtn.innerHTML = this._call._localAudioState
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      }
    },

    isActive: function () {
      return this._call !== null;
    },

    getActiveChannelId: function () {
      return this._activeChannelId;
    },

    _cleanup: function () {
      this._call = null;
      this._activeChannelId = null;
      var voiceBar = document.getElementById("voice-bar");
      if (voiceBar) voiceBar.classList.add("hidden");
      var container = document.getElementById("voice-container");
      if (container) container.innerHTML = "";
    },

    _showError: function (msg) {
      var el = document.createElement("div");
      el.className = "voice-toast";
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 5000);
    },
  };

  window.ParaVoice = ParaVoice;
  ParaVoice.init();
})();
