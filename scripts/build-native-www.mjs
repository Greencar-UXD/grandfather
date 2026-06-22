// 네이티브 앱(Capacitor) 빌드용 웹 자산 복사 스크립트.
// - 루트의 정적 웹앱을 www/ 로 복사한다 (Capacitor webDir).
// - ⚠️ 정책상 네이티브 앱 안에서는 AdSense(웹 광고)가 금지이므로 index.html에서 제거한다.
//   (네이티브 앱 광고는 추후 AdMob 플러그인으로 별도 적용)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "www");

const ASSETS = [
  "manifest.webmanifest",
  "sw.js",
  "og.png",
  "og.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// index.html: AdSense 관련 코드 전부 제거 (네이티브 앱 정책 위반 방지)
let html = readFileSync(resolve(ROOT, "index.html"), "utf8");
html = html
  .replace(/[ \t]*<!-- Google AdSense[\s\S]*?<\/script>\n/, "")            // head 로더 스니펫
  .replace(/[ \t]*<!-- 하단 광고 자리[\s\S]*?<\/aside>\n/, "")              // 광고 자리 마크업
  .replace(/[ \t]*\/\/ ── 하단 광고\(AdSense\)[\s\S]*?\}\)\(\);\n/, "");    // 광고 주입 스크립트
writeFileSync(resolve(OUT, "index.html"), html);

for (const f of ASSETS) {
  const src = resolve(ROOT, f);
  if (existsSync(src)) copyFileSync(src, resolve(OUT, f));
}

console.log("✅ www/ 빌드 완료 (AdSense 제거됨). 다음: npx cap sync");
