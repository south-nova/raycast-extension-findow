import { runAppleScript } from "@raycast/utils";
import { BROWSER_BUNDLES } from "./tabs";

export type WindowItem = { kind: "window"; app: string; bundleId: string; pid: number; title: string };

// 탭을 읽는 브라우저의 창은 탭 목록에 전부 들어가므로 창 목록에서는 뺀다.
const LIST = `
function run() {
  const se = Application("System Events");
  const out = [];
  for (const p of se.processes.whose({ backgroundOnly: false })()) {
    let names;
    try { names = p.windows.name(); } catch (e) { continue; }
    if (!names.length) continue;
    const app = p.name(), bundleId = p.bundleIdentifier(), pid = p.unixId();
    for (const title of names) if (title) out.push({ kind: "window", app, bundleId, pid, title });
  }
  return JSON.stringify(out);
}`;

// frontmost = true 는 독 아이콘 클릭처럼 앱의 모든 창을 끌어올린다.
// AXRaise 로 대상 창을 main 으로 만든 뒤 activateWithOptions(0) 을 쓰면 그 창만 올라온다.
const RAISE = `
ObjC.import("AppKit");
function run(argv) {
  const se = Application("System Events");
  const p = se.processes.whose({ unixId: Number(argv[0]) })[0];
  const w = p.windows.whose({ name: argv[1] })[0];
  try { if (w.attributes.byName("AXMinimized").value()) w.attributes.byName("AXMinimized").value = false; } catch (e) {}
  w.actions.byName("AXRaise").perform();
  $.NSRunningApplication.runningApplicationWithProcessIdentifier(p.unixId()).activateWithOptions(0);
}`;

export async function listWindows(): Promise<WindowItem[]> {
  const json = await runAppleScript(LIST, { language: "JavaScript" });
  return (JSON.parse(json) as WindowItem[]).filter(
    (w) => !BROWSER_BUNDLES.includes(w.bundleId) && w.bundleId !== "com.raycast.macos",
  );
}

export async function raiseWindow(w: WindowItem) {
  await runAppleScript(RAISE, [String(w.pid), w.title], { language: "JavaScript" });
}
