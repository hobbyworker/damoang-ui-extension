# 다모앙 UI 확장

다모앙(damoang.net)의 메모 설정과 즐겨찾기를 툴바 팝업에서 바로 다루는 브라우저 확장입니다.
Chrome, Microsoft Edge, Firefox에서 동작합니다.

다모앙 운영사와 관련이 없는 비공식 애플리케이션입니다.

- 웹사이트: https://damoang-ui-extension.hobbyworker.me/
- 개인정보처리방침: https://damoang-ui-extension.hobbyworker.me/privacy/
- 버전 정보: https://damoang-ui-extension.hobbyworker.me/versions/

## 기능

- 메모 배지 가리기 바로 설정
- 목록 메모 배지 가리기 바로 설정
- 메모 내용 흐리게 바로 설정
- 목록 메모 배지 넓게 표시 바로 설정
- 내 프로필 가리기 바로 설정
- 스크린샷 모드 켜기 / 끄기: 메모 배지 가리기와 목록 메모 배지 가리기를 함께 전환하고 새로고침까지 한 번에. 내 프로필 가리기 포함 여부는 옵션
- 즐겨찾기 게시판 바로 이동
- 마이페이지 바로가기 (포인트, 경험치, 스크랩, 팔로잉, 차단목록, 회원메모, 신고내역, 계정설정, UI 설정). 항목별 표시 선택 가능
- 제목 필터링(뮤트) 키워드 관리. 다모앙 설정과 같은 목록
- 제목 강조: 등록한 키워드가 들어간 글을 형광펜과 선·배경색·마크로 표시. 그룹(최대 8개)마다 주간/다크 색상 지정
- 사용자 강조: 등록한 닉네임의 글을 목록에서 선, 배경색, 마크로 표시. 그룹(최대 8개)마다 다른 스타일, 팔로우한 회원 전체에는 별도 스타일. 주간/다크 색상 지정
- 설정 변경은 입력이 멈춘 뒤 자동 저장 (간격 조정 가능)
- 화면모드 설정 (시스템 따르기 / 주간 모드 / 다크 모드)
- 프로필 메뉴: 헤더·사이드바의 프로필을 누르면 마이페이지로 이동하는 대신 포인트·스크랩·설정 항목으로 바로 가는 메뉴 표시 (선택)
- 추가 기능 설정(제목 강조·사용자 강조)은 브라우저 계정으로 기기 간 동기화
- 설정 내보내기/가져오기 (JSON 파일)

다모앙에 로그인된 탭이 열려 있어야 동작합니다.

## 설치

- Chrome Web Store: https://chromewebstore.google.com/detail/amlnkdgoebgibpcnlalgmllophgkgbgc
- Microsoft Edge Add-ons: https://microsoftedge.microsoft.com/addons/detail/cgoaiibgggnpgibehddbpbloipcdbjka
- Firefox Add-ons: https://addons.mozilla.org/ko/firefox/addon/damoang-ui-extension/

직접 로드하려면:

1. 이 저장소를 내려받습니다.
2. `chrome://extensions` (Edge는 `edge://extensions`)에서 개발자 모드를 켭니다.
3. "압축해제된 확장 프로그램을 로드합니다"로 `extension/` 폴더를 선택합니다.

Firefox는 `about:debugging#/runtime/this-firefox`의 "임시 부가 기능 로드"에서 `extension/manifest.json`을 선택합니다. Firefox는 사이트 접근 권한을 따로 묻기 때문에, 팝업의 "다모앙 접근 허용" 버튼으로 한 번 허용해야 합니다.

## 동작 방식

- 모든 요청은 사용자가 로그인한 다모앙 탭 안에서 사용자 자신의 세션으로 실행됩니다.
  별도 서버가 없고 데이터를 수집하지 않습니다.
- 설정 저장은 다모앙 설정을 통째로 받아 대상 필드만 바꾼 뒤 다시 저장합니다.
  다른 설정은 건드리지 않습니다.
- 즐겨찾기는 읽기만 합니다.

| 권한 | 용도 |
|---|---|
| `https://damoang.net/*` | 다모앙 탭에서만 동작 |
| `scripting` | 설정 읽기/저장 요청을 다모앙 탭에서 실행 |
| `tabs` | 다모앙 탭 찾기, 게시판 이동, 새로고침 |
| `storage` | 제목 강조, 사용자 강조 설정 저장 (브라우저 계정으로 기기 간 동기화) |

## 개발

빌드 단계가 없습니다. `extension/` 안의 파일이 배포물 그대로입니다.

```
extension/
  manifest.json
  popup.html
  popup.js
  common.js                   저장 계층. 추가 기능 설정을 storage.sync 에 저장 (구버전 local 폴백)
  content.js                  다모앙 페이지에서 제목 강조(CSS Custom Highlight API)와 사용자 강조
  icons/
  _locales/ko/messages.json   이름과 설명. manifest 가 __MSG_ 키로 참조
```

코드를 고친 뒤에는 `chrome://extensions`에서 확장을 새로고침합니다.

디버그 모드: 팝업 하단의 톱니 버튼에서 디버그를 켜면 DEV 배지가 나타나고 콘솔에 로그가 출력됩니다.
DEV 배지를 누르면 비로그인, 로딩 실패, 타임아웃 상태를 시뮬레이션할 수 있습니다.

## 라이선스

MIT
