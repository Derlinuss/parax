// Para Voice — WebRTC Voice & Video module using Custom Render/Fly WebSocket Signaling Server
;(function () {
  "use strict";

  var ParaVoice = {
    _ws: null,
    _localStream: null,
    _peers: {}, // peerId -> RTCPeerConnection
    _activeChannelId: null,
    _isMuted: false,
    _isVideoOff: false,
    _listeners: {},

    init: function () {
      var _this = this;
      this._setupUI();
    },

    _setupUI: function () {
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

    join: async function (channelId, channelName) {
      var _this = this;

      if (this._ws) {
        this.leave();
      }

      this._activeChannelId = channelId;

      var voiceBar = document.getElementById("voice-bar");
      var voiceChannelName = document.getElementById("voice-channel-name");
      if (voiceChannelName) voiceChannelName.textContent = channelName;
      if (voiceBar) voiceBar.classList.remove("hidden");

      var user = firebase.auth().currentUser;
      if (!user) return;

      try {
        // 1. Get local audio/video stream
        this._localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 640, height: 480 }
        });

        // Show local video preview if container exists
        var container = document.getElementById("voice-container");
        if (container) {
          container.innerHTML = "";
          var localVideo = document.createElement("video");
          localVideo.id = "local-video";
          localVideo.srcObject = this._localStream;
          localVideo.autoplay = true;
          localVideo.muted = true;
          localVideo.playsInline = true;
          container.appendChild(localVideo);
        }

        // 2. Connect to WebSocket signaling server
        var wsUrl = window.FLY_SERVICES && window.FLY_SERVICES.MEDIA_SERVER 
          ? window.FLY_SERVICES.MEDIA_SERVER 
          : (window.location.hostname === "localhost" ? "ws://localhost:8080" : "wss://parax-media-server.onrender.com");

        // Ensure proper ws/wss protocol
        if (wsUrl.startsWith("https://")) wsUrl = wsUrl.replace("https://", "wss://");
        if (wsUrl.startsWith("http://")) wsUrl = wsUrl.replace("http://", "ws://");

        var ws = new WebSocket(wsUrl);
        this._ws = ws;

        var peerId = "user_" + user.uid + "_" + Math.random().toString(36).substring(2, 7);
        var userName = user.displayName || user.email || "User";

        ws.onopen = function () {
          ws.send(JSON.stringify({
            type: "join-room",
            roomCode: "channel_" + channelId,
            peerId: peerId,
            userId: user.uid,
            userName: userName,
            streamType: "camera"
          }));
        };

        ws.onmessage = async function (event) {
          try {
            var data = JSON.parse(event.data);
            switch (data.type) {
              case "joined-room": {
                console.log("[Voice] Joined room. Existing peers:", data.existingPeers);
                for (var p of data.existingPeers) {
                  _this._createPeerConnection(p.peerId, true, ws, peerId);
                }
                break;
              }
              case "peer-joined": {
                console.log("[Voice] Peer joined:", data.peerId);
                // We don't initiate offer here; the new peer will receive existing peers or vice-versa
                break;
              }
              case "signal": {
                await _this._handleSignaling(data.fromPeerId, data.signalData, ws, peerId);
                break;
              }
              case "peer-left": {
                _this._removePeer(data.peerId);
                break;
              }
            }
          } catch (err) {
            console.error("[Voice WS Error]:", err);
          }
        };

        ws.onerror = function (err) {
          console.error("[Voice WS Connection Error]:", err);
          _this._showError("Voice connection error");
        };

      } catch (err) {
        console.error("[Voice Media Error]:", err);
        if (typeof Para !== "undefined") Para.capture(err, { context: "voice-getUserMedia" });
        _this._showError("Could not access microphone/camera");
        _this.leave();
      }
    },

    _createPeerConnection: async function (remotePeerId, makeOffer, ws, myPeerId) {
      var _this = this;
      if (this._peers[remotePeerId]) return this._peers[remotePeerId];

      var pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });

      this._peers[remotePeerId] = pc;

      // Add local tracks to peer connection
      if (this._localStream) {
        this._localStream.getTracks().forEach(function (track) {
          pc.addTrack(track, _this._localStream);
        });
      }

      pc.onicecandidate = function (event) {
        if (event.candidate) {
          ws.send(JSON.stringify({
            type: "signal",
            targetPeerId: remotePeerId,
            signalData: { candidate: event.candidate }
          }));
        }
      };

      pc.ontrack = function (event) {
        console.log("[Voice] Received remote track from", remotePeerId);
        var container = document.getElementById("voice-container");
        if (container) {
          var remoteVideoId = "remote-video-" + remotePeerId;
          var existingVideo = document.getElementById(remoteVideoId);
          if (!existingVideo) {
            var videoEl = document.createElement("video");
            videoEl.id = remoteVideoId;
            videoEl.srcObject = event.streams[0];
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            container.appendChild(videoEl);
          }
        }
      };

      if (makeOffer) {
        try {
          var offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({
            type: "signal",
            targetPeerId: remotePeerId,
            signalData: { sdp: pc.localDescription }
          }));
        } catch (err) {
          console.error("[Voice Offer Error]:", err);
        }
      }

      return pc;
    },

    _handleSignaling: async function (fromPeerId, signalData, ws, myPeerId) {
      var pc = this._peers[fromPeerId];
      if (!pc) {
        pc = await this._createPeerConnection(fromPeerId, false, ws, myPeerId);
      }

      try {
        if (signalData.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          if (signalData.sdp.type === "offer") {
            var answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({
              type: "signal",
              targetPeerId: fromPeerId,
              signalData: { sdp: pc.localDescription }
            }));
          }
        } else if (signalData.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
      } catch (err) {
        console.error("[Voice Signaling Error]:", err);
      }
    },

    _removePeer: function (peerId) {
      if (this._peers[peerId]) {
        this._peers[peerId].close();
        delete this._peers[peerId];
      }
      var videoEl = document.getElementById("remote-video-" + peerId);
      if (videoEl) videoEl.remove();
    },

    leave: function () {
      if (this._ws) {
        try {
          this._ws.send(JSON.stringify({ type: "leave-room" }));
          this._ws.close();
        } catch (e) {}
        this._ws = null;
      }

      if (this._localStream) {
        this._localStream.getTracks().forEach(function (track) {
          track.stop();
        });
        this._localStream = null;
      }

      for (var peerId in this._peers) {
        try { this._peers[peerId].close(); } catch (e) {}
      }
      this._peers = {};

      this._cleanup();
    },

    toggleMute: function () {
      if (!this._localStream) return;
      var audioTrack = this._localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      this._isMuted = !this._isMuted;
      audioTrack.enabled = !this._isMuted;

      var muteBtn = document.getElementById("voice-mute-btn");
      if (muteBtn) {
        muteBtn.classList.toggle("muted", this._isMuted);
        muteBtn.innerHTML = !this._isMuted
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      }
    },

    isActive: function () {
      return this._ws !== null;
    },

    getActiveChannelId: function () {
      return this._activeChannelId;
    },

    _cleanup: function () {
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
