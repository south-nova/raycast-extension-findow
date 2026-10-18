import { Action, ActionPanel, closeMainWindow, getApplications, Icon, List, open, popToRoot } from "@raycast/api";
import { getFavicon, showFailureToast, useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { toHangul, toQwerty } from "./hangul";
import { listTabs, activateTab, TabItem } from "./tabs";
import { formatMem, listWindows, raiseWindow, WindowItem } from "./windows";

type Item = WindowItem | TabItem;

// 탭 아이콘용 브라우저 앱 경로. 창은 헬퍼가 경로를 같이 주므로 필요 없다. 캐시가 JSON 이라 Map 대신 객체.
async function loadAppPaths() {
  const paths: Record<string, string> = {};
  for (const a of await getApplications()) if (a.bundleId) paths[a.bundleId] = a.path;
  return paths;
}

async function focus(item: Item) {
  try {
    await closeMainWindow({ clearRootSearch: true });
    await (item.kind === "tab" ? activateTab(item) : raiseWindow(item));
    await popToRoot();
  } catch (e) {
    showFailureToast(e, { title: `${item.app} 창을 올리지 못했습니다` });
  }
}

// 검색어를 그대로, 한글로 조합해서, 영타로 풀어서 세 가지로 보고 하나라도 들어 있으면 맞춘다.
function matcher(query: string) {
  const raw = query.trim();
  const q = raw.toLowerCase();
  // 한글 조합은 대소문자(쉬프트 자판 ㅃㅉㄸㄲㅆ)를 구분하므로 원문으로 하고, 비교는 소문자로 한다.
  const variants = [...new Set([q, toHangul(raw).toLowerCase(), toQwerty(q)].filter(Boolean))];
  return (hay: string) => !q || variants.some((v) => hay.includes(v));
}

export default function Command() {
  // 창·탭·앱 경로를 따로 불러 먼저 온 것부터 보여 준다. 하나로 묶으면 가장 느린 소스가 전체를 막는다.
  const win = useCachedPromise(listWindows, [], { keepPreviousData: true });
  const tab = useCachedPromise(listTabs, [], { keepPreviousData: true });
  const apps = useCachedPromise(loadAppPaths, [], { keepPreviousData: true });
  const [query, setQuery] = useState("");

  // 검색 문자열은 데이터가 바뀔 때만 만든다. 키 입력마다 항목 전체를 다시 join 하지 않게.
  const windowIndex = useMemo(() => (win.data?.windows ?? []).map((w) => ({ w, hay: `${w.title} ${w.app}`.toLowerCase() })), [win.data]);
  const tabIndex = useMemo(
    () =>
      (tab.data ?? []).map((t) => ({
        t,
        hay: `${t.title} ${t.app} ${t.url}`.toLowerCase(),
        host: t.url.replace(/^https?:\/\//, "").split("/")[0],
        icon: /^https?:/.test(t.url) ? getFavicon(t.url, { fallback: Icon.Globe }) : Icon.Globe,
      })),
    [tab.data],
  );
  const hit = matcher(query);
  const windows = windowIndex.filter(({ hay }) => hit(hay));
  const tabs = tabIndex.filter(({ hay }) => hit(hay));
  const browserIcon = (bundleId: string) => {
    const path = apps.data?.[bundleId];
    return path ? { fileIcon: path } : Icon.Globe;
  };

  return (
    <List
      isLoading={win.isLoading || tab.isLoading}
      searchBarPlaceholder="창 제목이나 탭 제목으로 검색 (한영 전환 안 해도 됨)"
      filtering={false}
      onSearchTextChange={setQuery}
    >
      {win.data && !win.data.screenRecording && (
        <List.Item
          id="screen-recording-hint"
          title="다른 데스크탑에 있는 창의 제목이 안 보입니다"
          subtitle="시스템 설정 → 개인정보 보호 → 화면 기록에서 Raycast 를 허용하세요"
          icon={Icon.Warning}
          actions={
            <ActionPanel>
              <Action
                title="화면 기록 설정 열기"
                icon={Icon.Gear}
                onAction={() => open("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")}
              />
            </ActionPanel>
          }
        />
      )}
      <List.Section title="창" subtitle={String(windows.length)}>
        {windows.map(({ w }) => (
          <List.Item
            key={`w-${w.pid}-${w.wid}`}
            id={`w-${w.pid}-${w.wid}`}
            title={w.title}
            subtitle={w.app}
            icon={w.appPath ? { fileIcon: w.appPath } : Icon.Window}
            accessories={[
              ...(w.minimized ? [{ tag: "최소화" }] : []),
              ...(w.mem ? [{ text: formatMem(w.mem), tooltip: `${w.app} 앱 전체 메모리 (활성 상태 보기 기준)` }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action title="창 올리기" icon={Icon.Window} onAction={() => focus(w)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="탭" subtitle={String(tabs.length)}>
        {tabs.map(({ t, host, icon }) => (
          <List.Item
            key={`t-${t.bundleId}-${t.windowId}-${t.tabId ?? t.tabIndex}`}
            id={`t-${t.bundleId}-${t.windowId}-${t.tabId ?? t.tabIndex}`}
            title={t.title}
            subtitle={host}
            icon={t.url ? icon : browserIcon(t.bundleId)}
            accessories={win.data?.mem[t.bundleId] ? [{ text: formatMem(win.data.mem[t.bundleId]), tooltip: `${t.app} 브라우저 전체 메모리. 탭별 수치는 브라우저 작업 관리자(⇧Esc)에서만 볼 수 있습니다` }] : []}
            actions={
              <ActionPanel>
                <Action title="탭 열기" icon={Icon.Globe} onAction={() => focus(t)} />
                <Action.CopyToClipboard title="URL 복사" content={t.url} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
