import { runAppleScript } from "@raycast/utils";

export type TabItem = {
  kind: "tab";
  app: string;
  bundleId: string;
  windowId: number;
  tabId: string | number | null; // 사파리는 탭 id 가 없다
  tabIndex: number;
  title: string;
  url: string;
};

// 크롬 계열은 전부 같은 AppleScript 사전(tab.title / activeTabIndex)을 쓴다. 사파리만 tab.name / currentTab.
// 파이어폭스·Arc 는 사전이 없거나 달라서 창 단위(현재 탭 제목)로만 잡힌다.
export const BROWSERS: [name: string, bundleId: string][] = [
  ["Google Chrome", "com.google.Chrome"],
  ["Brave Browser", "com.brave.Browser"],
  ["Microsoft Edge", "com.microsoft.edgemac"],
  ["Vivaldi", "com.vivaldi.Vivaldi"],
  ["Chromium", "org.chromium.Chromium"],
  ["Opera", "com.operasoftware.Opera"],
  ["Safari", "com.apple.Safari"],
];
export const BROWSER_BUNDLES = BROWSERS.map(([, id]) => id);
const SAFARI = "com.apple.Safari";

const LIST = `
function run(argv) {
  const out = [];
  for (const [app, bundleId] of JSON.parse(argv[0])) {
    // 브라우저 하나가 실패해도(응답 없음, 권한 거부) 나머지 브라우저의 탭은 돌려준다.
    try {
      const a = Application(bundleId);
      if (!a.running()) continue;
      const safari = bundleId === "${SAFARI}";
      for (const w of a.windows()) {
        let titles, urls, ids, windowId;
        try { windowId = w.id(); titles = w.tabs[safari ? "name" : "title"](); urls = w.tabs.url(); } catch (e) { continue; }
        ids = safari ? [] : w.tabs.id();  // 사파리는 탭 id 가 없다
        for (let i = 0; i < titles.length; i++)
          out.push({ kind: "tab", app, bundleId, windowId, tabId: ids[i] ?? null, tabIndex: i + 1, title: titles[i] || urls[i] || "", url: urls[i] || "" });
      }
    } catch (e) {}
  }
  return JSON.stringify(out);
}`;

const ACTIVATE = `
ObjC.import("AppKit");
function run(argv) {
  const a = Application(argv[0]);
  const w = a.windows.byId(Number(argv[1]));
  // 목록을 읽은 뒤 탭이 닫히거나 옮겨졌을 수 있으니 여는 시점에 id → url → 저장된 순번 순으로 다시 찾는다.
  let i = -1;
  if (argv[2] !== "") i = w.tabs.id().map(String).indexOf(argv[2]);
  if (i < 0 && argv[4] !== "") i = w.tabs.url().indexOf(argv[4]);
  if (i < 0) i = Number(argv[3]) - 1;
  if (argv[0] === "${SAFARI}") w.currentTab = w.tabs[i]; else w.activeTabIndex = i + 1;
  w.index = 1;
  // a.activate() 는 브라우저 창 전부를 올리므로 창 하나만 올리는 활성화를 쓴다.
  $.NSRunningApplication.runningApplicationsWithBundleIdentifier(argv[0]).firstObject.activateWithOptions(0);
}`;

export async function listTabs(): Promise<TabItem[]> {
  const json = await runAppleScript(LIST, [JSON.stringify(BROWSERS)], { language: "JavaScript" });
  return JSON.parse(json);
}

export async function activateTab(t: TabItem) {
  await runAppleScript(ACTIVATE, [t.bundleId, String(t.windowId), t.tabId == null ? "" : String(t.tabId), String(t.tabIndex), t.url], {
    language: "JavaScript",
  });
}
