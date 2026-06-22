#!/usr/bin/env node
/*
 * lg-test.js — LG 스마트TV(webOS) 제어 점검 스크립트
 *
 * TV와 같은 와이파이의 PC에서 실행해, 페어링·명령이 실제로 먹는지 확인하는 용도.
 * (앱 빌드 전에 "내 TV가 반응하나"를 빠르게 검증)
 *
 * 필요: Node 22+ (내장 WebSocket). 구버전이면 `npm i ws` 후 실행.
 *
 * 사용법:
 *   node tools/lg-test.js <TV_IP>            ← 페어링 + 대화형 메뉴
 *   node tools/lg-test.js <TV_IP> volup      ← 명령 한 번
 *
 * 명령: volup voldown mute unmute chup chdown  ch <번호>
 *       off  app <유튜브|넷플릭스|이름>  toast <메시지>  apps  quit
 *
 * TV IP 찾기: LG TV 리모컨 → 설정 → 네트워크 → (와이파이/유선) 연결 상태 → IP 주소
 * 최초 1회: 명령을 보내면 TV 화면에 "접속 허용" 팝업이 떠요 → '허용' 선택.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// WebSocket 확보 (Node22+ 내장, 없으면 ws 패키지)
let WS = globalThis.WebSocket;
if (!WS) {
  try { WS = require("ws"); }
  catch (e) {
    console.error("WebSocket을 찾을 수 없어요. Node 22+ 를 쓰거나, 이 폴더에서 `npm i ws` 후 다시 실행하세요.");
    process.exit(1);
  }
}

const ip = process.argv[2];
const oneShot = process.argv[3];
if (!ip) {
  console.error("사용법: node tools/lg-test.js <TV_IP> [명령]\n예: node tools/lg-test.js 192.168.0.12");
  process.exit(1);
}

const KEY_FILE = path.join(__dirname, ".lgtv-key-" + ip + ".json");
function loadKey() { try { return JSON.parse(fs.readFileSync(KEY_FILE, "utf8")).key; } catch (e) { return null; } }
function saveKey(k) { try { fs.writeFileSync(KEY_FILE, JSON.stringify({ key: k })); } catch (e) {} }

// webOS 표준 등록 핸드셰이크 (lg-webos.js와 동일 구조)
const HANDSHAKE = {
  forcePairing: false, pairingType: "PROMPT",
  manifest: {
    manifestVersion: 1, appVersion: "1.1",
    signed: {
      created: "20140509", appId: "com.lge.test", vendorId: "com.lge",
      localizedAppNames: { "": "또박또박 리모컨", "ko-KR": "또박또박 리모컨" },
      localizedVendorNames: { "": "LG Electronics" },
      permissions: ["TEST_SECURE", "CONTROL_INPUT_TEXT", "CONTROL_MOUSE_AND_KEYBOARD",
        "READ_INSTALLED_APPS", "READ_LGE_SDX", "READ_NOTIFICATIONS", "SEARCH", "WRITE_SETTINGS",
        "WRITE_NOTIFICATION_ALERT", "CONTROL_POWER", "READ_CURRENT_CHANNEL", "READ_RUNNING_APPS",
        "READ_UPDATE_INFO", "UPDATE_FROM_REMOTE_APP", "READ_LGE_TV_INPUT_EVENTS", "READ_TV_CURRENT_TIME"],
      serial: "2f930e2d2cfe083771f68e4fe7bb07"
    },
    permissions: ["LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CLOSE", "TEST_OPEN", "TEST_PROTECTED",
      "CONTROL_AUDIO", "CONTROL_DISPLAY", "CONTROL_INPUT_JOYSTICK", "CONTROL_INPUT_MEDIA_RECORDING",
      "CONTROL_INPUT_MEDIA_PLAYBACK", "CONTROL_INPUT_TV", "CONTROL_POWER", "READ_APP_STATUS",
      "READ_CURRENT_CHANNEL", "READ_INPUT_DEVICE_LIST", "READ_NETWORK_STATE", "READ_RUNNING_APPS",
      "READ_TV_CHANNEL_LIST", "WRITE_NOTIFICATION_TOAST", "READ_POWER_STATE", "READ_COUNTRY_INFO"],
    signatures: [{ signatureVersion: 1, signature: "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQ==" }]
  }
};

const APP_IDS = {
  유튜브: "youtube.leanback.v4", youtube: "youtube.leanback.v4",
  넷플릭스: "netflix", netflix: "netflix",
  디즈니: "com.disney.disneyplus-prod", 브라우저: "com.webos.app.browser", tv: "com.webos.app.livetv"
};

let ws, n = 0, ready = false;
const url = "ws://" + ip + ":3000";
console.log("TV에 연결 중… " + url);
ws = new WS(url);

ws.addEventListener("open", () => {
  const payload = Object.assign({}, HANDSHAKE);
  const key = loadKey();
  if (key) payload["client-key"] = key;
  send({ type: "register", id: "register_0", payload });
});

ws.addEventListener("message", (ev) => {
  let data = ev.data; if (typeof data !== "string") { try { data = data.toString(); } catch (e) {} }
  let msg; try { msg = JSON.parse(data); } catch (e) { return; }

  if (msg.type === "registered" && msg.payload && msg.payload["client-key"]) {
    saveKey(msg.payload["client-key"]);
    ready = true;
    console.log("✅ 페어링 완료! (키 저장됨 — 다음엔 팝업 없이 바로 연결)");
    afterReady();
  } else if (msg.type === "response" && msg.payload && msg.payload.pairingType === "PROMPT") {
    console.log("📺 TV 화면에 뜬 '허용'을 눌러 주세요…");
  } else if (msg.type === "error") {
    console.log("⚠️ 오류:", msg.error || JSON.stringify(msg));
  } else if (msg.payload && msg.id && /^cmd_/.test(msg.id)) {
    // 응답(예: 앱 목록)
    if (msg.payload.launchPoints) {
      console.log("설치된 앱:");
      msg.payload.launchPoints.forEach((p) => console.log("  - " + p.title + "  (id: " + p.id + ")"));
    } else {
      console.log("응답:", JSON.stringify(msg.payload));
    }
  }
});

ws.addEventListener("error", () => {
  console.error("❌ 연결 오류. 같은 와이파이인지, IP가 맞는지, TV가 켜져 있는지 확인하세요.");
  process.exit(1);
});
ws.addEventListener("close", () => { if (!ready) console.error("연결이 닫혔어요."); });

function send(obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
function request(uri, payload) {
  const obj = { type: "request", id: "cmd_" + (++n), uri };
  if (payload) obj.payload = payload;
  send(obj);
}

// 명령 실행
function run(line) {
  const parts = String(line).trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const arg = parts.slice(1).join(" ");
  switch (cmd) {
    case "volup": request("ssap://audio/volumeUp"); break;
    case "voldown": request("ssap://audio/volumeDown"); break;
    case "mute": request("ssap://audio/setMute", { mute: true }); break;
    case "unmute": request("ssap://audio/setMute", { mute: false }); break;
    case "chup": request("ssap://tv/channelUp"); break;
    case "chdown": request("ssap://tv/channelDown"); break;
    case "ch": request("ssap://tv/openChannel", { channelNumber: String(arg) }); break;
    case "off": request("ssap://system/turnOff"); break;
    case "app": request("ssap://system.launcher/launch", { id: APP_IDS[arg] || arg }); break;
    case "toast": request("ssap://system.notifications/createToast", { message: arg || "또박또박" }); break;
    case "apps": request("ssap://com.webos.applicationManager/listLaunchPoints"); break;
    case "quit": case "exit": process.exit(0); break;
    case "": break;
    default: console.log("모르는 명령: " + cmd);
  }
}

function afterReady() {
  if (oneShot) { run(process.argv.slice(3).join(" ")); setTimeout(() => process.exit(0), 600); return; }
  console.log("\n명령을 입력하세요 (volup voldown mute chup chdown | ch 7 | app 유튜브 | off | apps | quit)");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "리모컨> " });
  rl.prompt();
  rl.on("line", (l) => { run(l); rl.prompt(); });
  rl.on("close", () => process.exit(0));
}
