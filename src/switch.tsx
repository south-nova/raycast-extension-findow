import { Action, ActionPanel, closeMainWindow, getApplications, Icon, List, popToRoot } from "@raycast/api";
import { getFavicon, showFailureToast, useCachedPromise } from "@raycast/utils";
import { listTabs, activateTab, TabItem } from "./tabs";
import { listWindows, raiseWindow, WindowItem } from "./windows";
import { toHangul, toQwerty } from "./hangul";
import { useState } from "react";

type Item = WindowItem | TabItem;

async function load() {
  const [windows, tabs, apps] = await Promise.all([listWindows(), listTabs(), getApplications()]);
  // 캐시가 JSON 으로 저장되므로 Map 대신 평범한 객체
  const appPath: Record<string, string> = {};
  for (const a of apps) if (a.bundleId) appPath[a.bundleId] = a.path;
  return { windows, tabs, appPath };
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

// 검색어를 그대로, 한글로 조합해서, 영타로 풀어서 세 가지로 보고 제목·앱·URL 에 하나라도 들어 있으면 맞춘다.
function matcher(query: string) {
  const raw = query.trim();
  const q = raw.toLowerCase();
  // 한글 조합은 대소문자(쉬프트 자판 ㅃㅉㄸㄲㅆ)를 구분하므로 원문으로 하고, 비교는 소문자로 한다.
  const variants = [...new Set([q, toHangul(raw).toLowerCase(), toQwerty(q)].filter(Boolean))];
  return (...fields: string[]) => {
    if (!q) return true;
    const hay = fields.join(" ").toLowerCase();
    return variants.some((v) => hay.includes(v));
  };
}

export default function Command() {
  const { data, isLoading } = useCachedPromise(load, [], { keepPreviousData: true });
  const [query, setQuery] = useState("");
  const hit = matcher(query);
  const windows = data?.windows.filter((w) => hit(w.title, w.app)) ?? [];
  const tabs = data?.tabs.filter((t) => hit(t.title, t.app, t.url)) ?? [];
  const appIcon = (bundleId: string) => {
    const path = data?.appPath[bundleId];
    return path ? { fileIcon: path } : Icon.Window;
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="창 제목이나 탭 제목으로 검색 (한영 전환 안 해도 됨)" filtering={false} onSearchTextChange={setQuery}>
      <List.Section title="창" subtitle={String(windows.length)}>
        {windows.map((w) => (
          <List.Item
            key={`w-${w.pid}-${w.wid}`}
            title={w.title}
            subtitle={w.app}
            icon={appIcon(w.bundleId)}
            accessories={w.minimized ? [{ tag: "최소화" }] : []}
            actions={
              <ActionPanel>
                <Action title="창 올리기" icon={Icon.Window} onAction={() => focus(w)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="탭" subtitle={String(tabs.length)}>
        {tabs.map((t) => (
          <List.Item
            key={`t-${t.bundleId}-${t.windowId}-${t.tabId ?? t.tabIndex}`}
            title={t.title}
            subtitle={t.url.replace(/^https?:\/\//, "").split("/")[0]}
            icon={t.url ? getFavicon(t.url, { fallback: Icon.Globe }) : appIcon(t.bundleId)}
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
