<p align="center"><img src=".github/icon.png" width="128" height="128" alt="앱 아이콘"></p>

<h1 align="center">다모앙 UI 확장</h1>

<p align="center">
  <img alt="Chrome · Edge: Manifest V3" src="https://img.shields.io/badge/Chrome%20·%20Edge-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Firefox 140+ · Android 142+" src="https://img.shields.io/badge/Firefox-140%2B%20·%20Android%20142%2B-FF7139?logo=firefoxbrowser&logoColor=white">
  <img alt="Safari: macOS 14.2+ · iOS 17.2+" src="https://img.shields.io/badge/Safari-macOS%2014.2%2B%20·%20iOS%2017.2%2B-0A84FF?logo=safari&logoColor=white">
  <img alt="JavaScript: no build" src="https://img.shields.io/badge/JavaScript-no%20build-F7DF1E?logo=javascript&logoColor=black">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-yellow"></a>
</p>

<p align="center"><a href="https://damoang-ui-extension.hobbyworker.me/">웹사이트</a> · <a href="https://damoang-ui-extension.hobbyworker.me/versions/">버전 정보</a> · <a href="https://damoang-ui-extension.hobbyworker.me/privacy/">개인정보처리방침</a></p>

다모앙(damoang.net)을 조금 더 편하게 쓰는 브라우저 확장입니다.
사이트 설정을 툴바 팝업에서 바로 다루고, 게시판 목록에서 원하는 글과 글쓴이 정보가 한눈에 보이게 합니다.
Chrome, Microsoft Edge, Firefox, Safari(macOS·iOS)에서 동작하고, Android 용 Edge·Firefox 에도 설치할 수 있습니다.

다모앙 운영사와 관련이 없는 비공식 애플리케이션입니다.

## 설치

| 스토어 | 링크 |
|---|---|
| Chrome 웹 스토어 | https://chromewebstore.google.com/detail/amlnkdgoebgibpcnlalgmllophgkgbgc |
| Microsoft Edge 추가 기능 (Android 포함) | https://microsoftedge.microsoft.com/addons/detail/cgoaiibgggnpgibehddbpbloipcdbjka |
| Firefox 부가 기능 (Android 포함) | https://addons.mozilla.org/ko/firefox/addon/damoang-ui-extension/ |
| App Store (macOS·iOS) | https://apps.apple.com/app/id6807649371 |

App Store 판은 앱을 설치한 뒤 Safari 설정(iOS 는 설정 앱)의 확장 프로그램에서 켜고 damoang.net 접근을 허용합니다.
다모앙에 로그인된 탭이 열려 있어야 동작합니다.

## 기능

### 팝업에서 다모앙 설정

- 빠른 설정: 메모 배지 가리기, 목록 메모 배지 가리기, 메모 내용 흐리게, 목록 메모 배지 넓게 표시, 내 프로필 가리기, 글로벌 단축키 사용. 바꾸면 잠시 뒤 자동 저장
- 스크린샷 모드: 메모 배지를 한 번에 가리고 되돌리기. 내 프로필과 제목·사용자 강조도 함께 가릴지 선택
- 제목 필터링(뮤트) 키워드 관리. 다모앙 설정과 같은 목록
- 즐겨찾기 게시판, 마이페이지 바로가기(포인트, 경험치, 스크랩, 팔로잉, 차단목록, 회원메모, 신고내역, 계정설정, UI 설정)
- 빠른 프로필 보기: 자주 보는 회원을 등록해 두고 팝업에서 프로필로 바로 이동
- 공지사항: 확장의 변경 사항을 팝업에서 알림. 공지는 확장 안에 담겨 있어 네트워크 요청이 없음
- 팝업 1열·2열, 화면 모드(시스템·주간·다크)

### 게시판 목록

- 제목 강조: 등록한 키워드가 들어간 글을 형광펜과 선·배경색·마크로 표시. 그룹 최대 8개, 그룹마다 주간·다크 색
- 사용자 강조: 팔로우한 회원이나 등록한 닉네임의 글을 선·배경색·마크로 표시. 그룹마다 다른 스타일, 댓글에도 적용 가능
- 목록 이미지 미리보기: 이미지 아이콘에 마우스를 올리거나 누르면 그 글의 썸네일. 비밀글은 띄우지 않고, 성인·스포 표시 글은 설정에서 켬
- 목록 메모 바로 표시: 메모 배지를 누르면 그 회원의 메모를 보고 고치거나 지우는 창. 메모는 다모앙 회원메모에 저장
- 모던 목록 레이아웃: 배치 유형 1·2(닉네임을 오른쪽 끝으로), 공감 표시, 닉네임 아이콘, 닉네임 전체 표시
- 클래식 목록 레이아웃: 잘려 보이는 긴 닉네임을 온전히 표시

목록 이미지 미리보기와 목록 메모 바로 표시는 휴대폰처럼 좁은 화면(폭 600px 또는 높이 480px 미만)에서는 기본으로 꺼져 있습니다.

### 글쓴이 정보

- 작성자 배지: 가입 N일 이내, 닉네임 변경 N일 이내, 글·댓글 삭제율 N% 이상, 글·댓글 없음, 이용제한 중, 탈퇴에 해당하면 배지로 표시. 기준값과 색, 위치(글·댓글·프로필·미니 프로필)별 켜고 끄기
- 글 작성자 정보 바로 표시: 글 아래에 가입일, 최종 접속, 포인트, 팔로워, 게시글·댓글 수, 닉네임 변경 이력, 이용제한 내역
- 미니 프로필: 닉네임을 눌러 여는 회원 메뉴에 정보 요약과 배지를 함께 표시(통합 표시)하거나 메뉴 항목으로 펼쳐 봄(추가 표시). 공감한 사람들 목록에서도
- 게시판 내 댓글 검색: 회원 메뉴에 그 회원이 지금 게시판에 단 댓글을 찾는 항목 추가

### 프로필과 이동

- 프로필 메뉴: 헤더·사이드바의 프로필을 누르면 마이페이지 항목으로 바로 가는 메뉴
- 빠른 프로필 등록 버튼: 회원 프로필의 눈 모양 버튼으로 빠른 프로필 보기에 등록·제거
- 프로필 검색 바로가기: 회원 프로필 아래에 그 회원을 찾는 검색 버튼(자유게시판 제목은 닉네임·아이디, 작성자·댓글 작성자·신고 누적 게시글·소명게시판은 아이디)
- 프로필 보던 탭 기억: 프로필에서 글을 보고 돌아오면 보던 탭과 스크롤 위치로 복원
- 이용제한 기록 프로필 보기: 이용제한 기록의 회원 아이디를 누르면 프로필로 이동
- 공감 목록 쉬운 메모: 공감한 사람들 목록에서 메모를 작성·삭제해도 스크롤 유지 (Chrome·Edge·Firefox)

### 설정 관리

- 추가 기능 설정의 기기 간 동기화: Chrome·Firefox 는 브라우저 계정, Safari 는 iCloud. Edge 는 백업 파일로 옮김
- 백업·복원 페이지: 백업 파일 내려받기·복원, 설정 내용을 직접 보고 편집
- 설정 리셋
- 레거시 기능: 지금은 동작하지 않을 수 있어 원래 메뉴에서 뺀 탈퇴 회원 관련 기능. 설정에서 켤 수 있고 기본은 꺼짐

## 동작 방식

- 모든 요청은 사용자가 로그인한 다모앙 탭 안에서 사용자 자신의 세션으로 실행됩니다. 별도 서버가 없고 데이터를 수집하지 않습니다.
- 설정 저장은 다모앙 설정을 통째로 받아 대상 필드만 바꾼 뒤 다시 저장합니다. 다른 설정은 건드리지 않습니다.
- 즐겨찾기는 읽기만 합니다.
- 작성자 배지·글 작성자 정보·미니 프로필은 다모앙 프로필에 공개된 정보와 글·목록의 작성자 아이디를 페이지 데이터에서 읽어 브라우저 안에서만 씁니다. 같은 회원을 다시 조회하지 않도록 탭의 세션 저장소에 30분 동안 둡니다.
- 목록 메모 바로 표시는 창을 열 때 그 회원의 메모를 읽고, 저장·삭제를 누를 때만 다모앙의 회원 메모 API 로 저장하거나 지웁니다. 레거시 기능인 탈퇴 회원 메모도 같습니다.
- 목록 이미지 미리보기는 마우스를 올리거나 누른 글의 페이지 데이터에서 다모앙이 만든 썸네일을 읽어 보여줍니다. 썸네일이 없는 글은 글 속 첫 이미지를 불러옵니다. 조회수는 올라가지 않습니다.
- 추가 기능 설정은 브라우저의 확장 저장소에 둡니다. Safari 는 같은 Apple 계정의 기기끼리 맞추기 위해 사용자 iCloud 의 비공개 데이터베이스(CloudKit)를 씁니다.

| 권한 | 용도 |
|---|---|
| `https://damoang.net/*` | 다모앙 탭에서만 동작 |
| `scripting` | 설정 읽기·저장 요청을 다모앙 탭에서 실행 |
| `tabs` | 다모앙 탭 찾기, 게시판 이동, 새로고침, 설정 변경을 열린 탭에 알림 |
| `storage` | 추가 기능 설정 저장 (브라우저 계정으로 기기 간 동기화) |
| `nativeMessaging` | Safari 판만. iCloud 동기화를 위해 앱과 통신 |

## 개발

빌드 단계가 없습니다. `extension/` 안의 파일이 배포물 그대로입니다.

```
extension/
  manifest.json
  popup.html, popup.js        툴바 팝업
  content.js                  다모앙 페이지 안에서 동작하는 기능
  common.js                   저장 계층. 추가 기능 설정을 storage.sync 에 조각으로 저장
  icons.js                    팝업과 페이지에서 쓰는 SVG 아이콘
  notices.js                  팝업 공지. 확장 안에 담겨 배포되며 네트워크 요청이 없다
  backup.html, backup.js      백업·복원·설정 편집 페이지
  icons/
  _locales/ko/messages.json   이름과 설명. manifest 가 __MSG_ 키로 참조
safari/Damoang UI Extension/  Safari 앱 (macOS·iOS). 확장 소스는 extension/ 을 그대로 참조
  DamoangUICore/              iCloud(CloudKit) 동기화를 맡는 Swift 패키지
```

직접 로드하려면:

1. 이 저장소를 내려받습니다.
2. `chrome://extensions` (Edge 는 `edge://extensions`)에서 개발자 모드를 켭니다.
3. "압축해제된 확장 프로그램을 로드합니다"로 `extension/` 폴더를 선택합니다. 코드를 고친 뒤에는 확장을 새로고침합니다.

Firefox 는 `about:debugging#/runtime/this-firefox`의 "임시 부가 기능 로드"에서 `extension/manifest.json`을 선택합니다. Firefox 는 사이트 접근 권한을 따로 묻기 때문에 팝업의 "다모앙 접근 허용" 버튼으로 한 번 허용해야 합니다.

Safari 는 `safari/Damoang UI Extension/Damoang UI Extension.xcodeproj`를 Xcode 로 열어 macOS 또는 iOS 스킴을 실행합니다. 서명은 `Signing.xcconfig.example`을 `Signing.xcconfig`로 복사해 팀 ID 를 넣으면 됩니다(git 에 올라가지 않음). 동기화 계층 테스트는 `safari/Damoang UI Extension/DamoangUICore` 에서 `swift test` 입니다.

디버그 모드: 팝업 설정에서 디버그를 켜면 DEV 배지가 나타나고 콘솔에 로그가 출력됩니다.
DEV 배지를 누르면 비로그인, 로딩 실패, 타임아웃 상태를 시뮬레이션할 수 있습니다.

## 라이선스

MIT
