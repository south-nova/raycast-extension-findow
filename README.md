# Findow

열려 있는 **모든 앱 창과 브라우저 탭**을 Raycast 검색창 하나에서 찾아 맨 앞으로 올리는 macOS 용 Raycast 확장입니다.

"김정민" 을 치면 카카오톡의 김정민 채팅방 창이, "네이버" 를 치면 Brave·Chrome 의 네이버 탭이 올라옵니다. 선택한 창 하나만 앞으로 오고 같은 앱의 다른 창은 뒤에 그대로 둡니다. 다른 데스크탑(Space)에 있는 창도 찾아서 그 데스크탑으로 넘어갑니다.

한영 전환을 안 한 채 쳐도 됩니다. "zkzkdhxhr" 은 "카카오톡" 으로, "ㅠㄱㅁㅍㄷ" 는 "brave" 로 읽습니다.

Search every open window and browser tab in one Raycast list and bring just that one to the front.

## 설치

Raycast 와 Homebrew 가 있는 맥에서 터미널에 한 줄:

```sh
curl -fsSL https://raw.githubusercontent.com/south-nova/raycast-extension-findow/main/install.sh | sh
```

node 가 없으면 Homebrew 로 설치하고, 저장소를 `~/raycast-extension-findow` 에 받아 Raycast 에 등록합니다. 한 번 등록되면 재부팅해도 남습니다. 업데이트는 같은 명령을 다시 실행하면 됩니다.

직접 하려면:

```sh
git clone https://github.com/south-nova/raycast-extension-findow.git
cd raycast-extension-findow
npm install && npm run dev   # "built extension successfully" 가 뜨면 Ctrl+C
```

## 설정

1. Raycast 설정(⌘,) → Extensions → Findow → **Switch Window or Tab** 의 Hotkey 칸에 단축키 지정 (예: ⌥Space).
2. 처음 실행할 때 뜨는 권한 요청을 허용합니다.
   - 손쉬운 사용: 창 목록을 읽고 창을 올리는 데 필요합니다. Raycast 에 이미 허용돼 있으면 안 뜹니다.
   - 화면 기록: 다른 데스크탑(Space)에 있는 창의 제목은 macOS 가 이 권한이 있어야 알려 줍니다. Raycast 에 허용하면 됩니다. 화면을 찍지는 않습니다.
   - 자동화(브라우저 제어): 브라우저마다 한 번씩 "Raycast 가 ○○ 를 제어하려 합니다" 가 뜹니다.

## 지원 범위

- 창: 모든 데스크탑(Space)의 모든 앱 창. 최소화된 창도 찾아서 복원합니다.
- 메모리: 창 행에는 그 앱(본체 + 자식 프로세스)의 메모리, 탭 행에는 브라우저 전체 메모리가 활성 상태 보기와 같은 기준으로 붙습니다. 탭별 메모리는 macOS 가 밖으로 알려 주지 않아 브라우저 작업 관리자(⇧Esc)에서만 볼 수 있습니다.
- 탭: Brave, Chrome, Edge, Vivaldi, Chromium, Opera, Safari. 설치 안 된 브라우저는 건너뜁니다.
- Firefox, Arc 는 탭 제어 AppleScript 가 없어 창 단위(현재 탭 제목)로만 잡힙니다.

## 동작 방식

- 창 목록과 창 올리기는 Swift 헬퍼(`helper/main.swift` → `assets/findow-helper`)가 맡습니다. Accessibility 는 현재 데스크탑의 창만 보여 주므로 윈도 서버(CGWindowList)로 모든 데스크탑의 창을 읽고, 선택하면 앱을 활성화해 그 데스크탑으로 넘어간 뒤 AXRaise 로 그 창만 올립니다. 헬퍼를 고치면 `helper/build.sh` 로 다시 빌드합니다(Xcode Command Line Tools 필요).
- 탭은 브라우저 AppleScript 로 제목·URL·탭 id 를 읽고, 여는 시점에 id 로 다시 찾아 그 사이 탭이 옮겨져도 맞는 탭을 엽니다.

## 라이선스

MIT
