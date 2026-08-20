# 다모앙 UI 확장

다모앙(damoang.net)의 메모 설정과 즐겨찾기를 툴바 팝업에서 바로 다루는 브라우저 확장입니다.
Chrome과 Microsoft Edge에서 동작합니다.

다모앙 운영사와 관련이 없는 비공식 애플리케이션입니다.

- 웹사이트: https://damoang-ui-extension.hobbyworker.me/
- 개인정보처리방침: https://damoang-ui-extension.hobbyworker.me/privacy/
- 버전 정보: https://damoang-ui-extension.hobbyworker.me/versions/

## 기능

- 메모 배지 가리기 바로 설정
- 목록 메모 배지 가리기 바로 설정
- 메모 내용 흐리게 바로 설정
- 목록 메모 배지 넓게 표시 바로 설정
- 전체 메모 가리기 / 전체 메모 표시 (저장과 새로고침까지 한 번에)
- 즐겨찾기 게시판 바로 이동
- 화면모드 설정 (시스템 따르기 / 주간 모드 / 다크 모드)

다모앙에 로그인된 탭이 열려 있어야 동작합니다.

## 설치

- Microsoft Edge Add-ons: https://microsoftedge.microsoft.com/addons/detail/cgoaiibgggnpgibehddbpbloipcdbjka
- Chrome Web Store: 심사 중

직접 로드하려면:

1. 이 저장소를 내려받습니다.
2. `chrome://extensions` (Edge는 `edge://extensions`)에서 개발자 모드를 켭니다.
3. "압축해제된 확장 프로그램을 로드합니다"로 `extension/` 폴더를 선택합니다.

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

## 개발

빌드 단계가 없습니다. `extension/` 안의 파일이 배포물 그대로입니다.

```
extension/
  manifest.json
  popup.html
  popup.js
  icons/
```

코드를 고친 뒤에는 `chrome://extensions`에서 확장을 새로고침합니다.

디버그 모드: 팝업 하단의 톱니 버튼에서 디버그를 켜면 DEV 배지가 나타나고 콘솔에 로그가 출력됩니다.
DEV 배지를 누르면 비로그인, 로딩 실패, 타임아웃 상태를 시뮬레이션할 수 있습니다.

## 라이선스

MIT
