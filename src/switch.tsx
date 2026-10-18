import { Action, ActionPanel, closeMainWindow, getApplications, Icon, List, popToRoot } from "@raycast/api";
import { getFavicon, showFailureToast, useCachedPromise } from "@raycast/utils";
import { listTabs, activateTab, TabItem } from "./tabs";
import { listWindows, raiseWindow, WindowItem } from "./windows";

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

export default function Command() {
  const { data, isLoading } = useCachedPromise(load, [], { keepPreviousData: true });
  const appIcon = (bundleId: string) => {
    const path = data?.appPath[bundleId];
    return path ? { fileIcon: path } : Icon.Window;
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="창 제목이나 탭 제목으로 검색">
      <List.Section title="창" subtitle={String(data?.windows.length ?? 0)}>
        {data?.windows.map((w) => (
          <List.Item
            key={`w-${w.pid}-${w.title}`}
            title={w.title}
            subtitle={w.app}
            icon={appIcon(w.bundleId)}
            keywords={[w.app]}
            actions={
              <ActionPanel>
                <Action title="창 올리기" icon={Icon.Window} onAction={() => focus(w)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="탭" subtitle={String(data?.tabs.length ?? 0)}>
        {data?.tabs.map((t) => (
          <List.Item
            key={`t-${t.bundleId}-${t.windowId}-${t.tabId ?? t.tabIndex}`}
            title={t.title}
            subtitle={t.url.replace(/^https?:\/\//, "").split("/")[0]}
            icon={t.url ? getFavicon(t.url, { fallback: Icon.Globe }) : appIcon(t.bundleId)}
            keywords={[t.app, t.url]}
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
