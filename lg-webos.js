/*
 * lg-webos.js — LG 스마트TV(webOS) 제어 모듈 (SSAP over WebSocket)
 *
 * ⚠️ 동작 환경: 같은 와이파이의 LG webOS TV. 브라우저(https 사이트)에서는
 *    보안 정책(혼합 콘텐츠/Private Network Access)으로 ws://TV:3000 연결이 차단된다.
 *    실제 제어는 네이티브 앱(Capacitor, cleartext 허용) 등에서 동작한다.
 *
 * 사용:
 *   var tv = new LGTV();
 *   tv.connect("192.168.0.12", {
 *     onPrompt: fn,   // TV에 "허용" 팝업이 떴을 때
 *     onReady:  fn,   // 페어링 완료(이제 명령 가능)
 *     onError:  fn,   // 오류
 *     onClose:  fn
 *   });
 *   tv.volumeUp(); tv.channelUp(); tv.openChannel("7"); tv.launchApp("youtube"); tv.powerOff();
 */
(function (global) {
  "use strict";

  // webOS 표준 등록 핸드셰이크(공개 라이브러리 lgtv2/pylgtv와 동일 구조)
  var HANDSHAKE = {
    forcePairing: false,
    pairingType: "PROMPT",
    manifest: {
      manifestVersion: 1,
      appVersion: "1.1",
      signed: {
        created: "20140509",
        appId: "com.lge.test",
        vendorId: "com.lge",
        localizedAppNames: { "": "또박또박 리모컨", "ko-KR": "또박또박 리모컨" },
        localizedVendorNames: { "": "LG Electronics" },
        permissions: [
          "TEST_SECURE", "CONTROL_INPUT_TEXT", "CONTROL_MOUSE_AND_KEYBOARD",
          "READ_INSTALLED_APPS", "READ_LGE_SDX", "READ_NOTIFICATIONS",
          "SEARCH", "WRITE_SETTINGS", "WRITE_NOTIFICATION_ALERT",
          "CONTROL_POWER", "READ_CURRENT_CHANNEL", "READ_RUNNING_APPS",
          "READ_UPDATE_INFO", "UPDATE_FROM_REMOTE_APP",
          "READ_LGE_TV_INPUT_EVENTS", "READ_TV_CURRENT_TIME"
        ],
        serial: "2f930e2d2cfe083771f68e4fe7bb07"
      },
      permissions: [
        "LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CLOSE",
        "TEST_OPEN", "TEST_PROTECTED", "CONTROL_AUDIO",
        "CONTROL_DISPLAY", "CONTROL_INPUT_JOYSTICK", "CONTROL_INPUT_MEDIA_RECORDING",
        "CONTROL_INPUT_MEDIA_PLAYBACK", "CONTROL_INPUT_TV", "CONTROL_POWER",
        "READ_APP_STATUS", "READ_CURRENT_CHANNEL", "READ_INPUT_DEVICE_LIST",
        "READ_NETWORK_STATE", "READ_RUNNING_APPS", "READ_TV_CHANNEL_LIST",
        "WRITE_NOTIFICATION_TOAST", "READ_POWER_STATE", "READ_COUNTRY_INFO"
      ],
      signatures: [{
        signatureVersion: 1,
        signature: "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQ=="
      }]
    }
  };

  // webOS 앱 ID (런처 launch)
  var APP_IDS = {
    youtube: "youtube.leanback.v4",
    netflix: "netflix",
    disney: "com.disney.disneyplus-prod",
    appletv: "com.apple.appletv",
    web: "com.webos.app.browser",
    tv: "com.webos.app.livetv"
  };

  function LGTV() {
    this.ws = null;
    this.ip = null;
    this.ready = false;
    this._cb = {};
    this._n = 0;            // request id 카운터
    this._pending = {};     // id → callback (응답 매칭)
  }

  LGTV.prototype._key = function () { return "lgtv_clientkey_" + this.ip; };
  LGTV.prototype._loadKey = function () {
    try { return global.localStorage ? localStorage.getItem(this._key()) : null; } catch (e) { return null; }
  };
  LGTV.prototype._saveKey = function (k) {
    try { if (global.localStorage) localStorage.setItem(this._key(), k); } catch (e) {}
  };

  LGTV.prototype.connect = function (ip, cb) {
    this.ip = ip;
    this._cb = cb || {};
    this.ready = false;
    var self = this;
    var url = "ws://" + ip + ":3000";
    var ws;
    try { ws = new global.WebSocket(url); }
    catch (e) { this._emit("onError", "TV에 연결할 수 없어요. (앱에서 사용하세요)"); return; }
    this.ws = ws;

    ws.onopen = function () { self._register(); };
    ws.onmessage = function (ev) { self._onMessage(ev.data); };
    ws.onerror = function () { self._emit("onError", "TV 연결 오류. 같은 와이파이인지, 앱에서 여는지 확인하세요."); };
    ws.onclose = function () { self.ready = false; self._emit("onClose"); };
  };

  LGTV.prototype._register = function () {
    var payload = {};
    for (var k in HANDSHAKE) payload[k] = HANDSHAKE[k];
    var key = this._loadKey();
    if (key) payload["client-key"] = key;
    this._send({ type: "register", id: "register_0", payload: payload });
  };

  LGTV.prototype._onMessage = function (data) {
    var msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.type === "registered" && msg.payload && msg.payload["client-key"]) {
      this._saveKey(msg.payload["client-key"]);
      this.ready = true;
      this._emit("onReady");
      return;
    }
    // 최초 페어링: TV 화면에 허용 팝업
    if (msg.type === "response" && msg.payload && msg.payload.pairingType === "PROMPT") {
      this._emit("onPrompt");
      return;
    }
    if (msg.type === "error") { this._emit("onError", msg.error || "명령 오류"); }
    if (msg.id && this._pending[msg.id]) { try { this._pending[msg.id](msg); } catch (e) {} delete this._pending[msg.id]; }
  };

  LGTV.prototype._send = function (obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  };

  // SSAP 요청
  LGTV.prototype.request = function (uri, payload, cb) {
    var id = "cmd_" + (++this._n);
    if (cb) this._pending[id] = cb;
    var obj = { type: "request", id: id, uri: uri };
    if (payload) obj.payload = payload;
    return this._send(obj);
  };

  // ── 명령 ──
  LGTV.prototype.volumeUp   = function () { return this.request("ssap://audio/volumeUp"); };
  LGTV.prototype.volumeDown = function () { return this.request("ssap://audio/volumeDown"); };
  LGTV.prototype.setMute    = function (on) { return this.request("ssap://audio/setMute", { mute: !!on }); };
  LGTV.prototype.channelUp  = function () { return this.request("ssap://tv/channelUp"); };
  LGTV.prototype.channelDown= function () { return this.request("ssap://tv/channelDown"); };
  LGTV.prototype.openChannel= function (n) { return this.request("ssap://tv/openChannel", { channelNumber: String(n) }); };
  LGTV.prototype.powerOff   = function () { return this.request("ssap://system/turnOff"); };
  LGTV.prototype.launchApp  = function (name) {
    var id = APP_IDS[name] || name;
    return this.request("ssap://system.launcher/launch", { id: id });
  };
  LGTV.prototype.toast      = function (text) { return this.request("ssap://system.notifications/createToast", { message: String(text) }); };
  LGTV.prototype.disconnect = function () { try { if (this.ws) this.ws.close(); } catch (e) {} };

  LGTV.prototype._emit = function (name, arg) { if (typeof this._cb[name] === "function") this._cb[name](arg); };

  LGTV.APP_IDS = APP_IDS;
  global.LGTV = LGTV;
})(typeof window !== "undefined" ? window : this);
