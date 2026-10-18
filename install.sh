#!/bin/sh
# Findow 설치: node 확인 → 저장소 받기 → Raycast 에 한 번 등록. 재실행하면 업데이트.
set -e
REPO=https://github.com/south-nova/raycast-extension-findow.git
DIR="$HOME/raycast-extension-findow"
if ! command -v node >/dev/null; then
  command -v brew >/dev/null || { echo "node 가 없습니다. Homebrew(https://brew.sh) 를 먼저 설치하세요."; exit 1; }
  brew install node
fi
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR" && npm install --silent
open -a Raycast
# Raycast 에 등록되는 순간("built extension successfully")까지만 ray develop 를 돌리고 끝낸다.
npx ray develop 2>&1 | while read -r line; do
  echo "$line"
  case "$line" in *"built extension successfully"*) pkill -f "ray develop"; break;; esac
done || true
echo "완료. Raycast 에서 'Switch Window or Tab' 을 검색하고, 설정(⌘,) → Extensions → Findow 에서 단축키를 지정하세요."
