# 또박또박 네이티브 앱 빌드 가이드 (iOS / Android)

웹앱(`index.html`)을 **Capacitor**로 감싸 App Store / Play Store에 올리기 위한 가이드입니다.
핵심: iOS WebView는 Web Speech API가 안 되므로, **네이티브 음성인식**(`@capacitor-community/speech-recognition`)을
Web Speech와 같은 모양으로 감싼 어댑터가 `index.html`에 들어가 있습니다. (웹/PWA/TWA는 기존 Web Speech 그대로)

> ⚠️ **광고:** 네이티브 앱에는 **AdSense를 넣지 않습니다**(정책 위반). `npm run build:www`가 AdSense를
> 자동 제거합니다. 앱 내 광고가 필요하면 추후 **AdMob** 플러그인으로 별도 적용하세요.

---

## 0. 준비물 (Mac)
- macOS + **Xcode** (App Store에서 설치)
- **Node.js 18+**, **CocoaPods** (`sudo gem install cocoapods`)
- **Apple Developer 계정** ($99/년) — 실기기 테스트·제출용

## 1. 코드 받기
```bash
git clone https://github.com/Greencar-UXD/grandfather.git
cd grandfather
git checkout claude/ios-native-app
npm install
```

## 2. 웹 자산 빌드 + iOS 프로젝트 생성
```bash
npm run build:www          # www/ 생성 (AdSense 제거됨)
npx cap add ios            # ios/ 네이티브 프로젝트 생성
npx cap sync               # 웹 자산 + 플러그인 동기화
```
> 안드로이드도 Capacitor로 하려면: `npx cap add android` (단, 안드로이드는 PWABuilder의 TWA 방식이 더 쉬움 — 아래 참고)

## 3. iOS 권한 문구 추가 (필수 — 없으면 크래시/리젝)
`ios/App/App/Info.plist`에 추가:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>말씀하신 내용을 글자로 보여드리기 위해 마이크를 사용합니다.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>음성을 글자로 바꾸기 위해 음성 인식을 사용합니다.</string>
```

## 4. Xcode에서 빌드
```bash
npx cap open ios
```
- Xcode → **Signing & Capabilities** → 본인 **Team** 선택, Bundle ID 확인(`kr.ttobak.app`)
- 아이폰 실기기 연결 → **Run(▶)** → 마이크/음성인식 동작 확인
  - "눌러서 말하기" → 권한 허용 → 말하면 글자로 떠야 정상

## 5. App Store 제출
- Xcode → **Product → Archive** → **Distribute App** → App Store Connect 업로드
- [App Store Connect](https://appstoreconnect.apple.com)에서 앱 정보/스크린샷/심사 제출

---

## 안드로이드(권장: PWABuilder TWA)
네이티브로 다시 만들 필요 없이, 이미 만든 PWA를 그대로 패키징:
1. [pwabuilder.com](https://www.pwabuilder.com) → `https://ttobak.kr` 입력
2. **Package for stores → Android** → `.aab` 다운로드
3. 같이 나오는 `assetlinks.json` 을 저장소 담당(Claude)에게 전달 → `ttobak.kr/.well-known/`에 게시
4. `.aab`를 **Google Play Console**($25)에 업로드
> TWA는 실제 크롬 엔진이라 Web Speech가 그대로 동작 → 코드 수정 불필요.

---

## 알려진 한계 / 다음 작업
- 네이티브 음성인식 어댑터는 **v1**입니다. 단말에서 부분결과/세그먼트 끊김 동작을 보고 미세조정이 필요할 수 있어요(중복·끊김 등). 테스트 결과를 공유하면 함께 다듬습니다.
- iOS 음성인식은 한 번에 최대 약 1분 제한이 있어, 장시간 받아쓰기는 자동 재시작 로직 보강이 필요할 수 있습니다.
