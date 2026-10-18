import { environment } from "@raycast/api";
import { execFile } from "node:child_process";
import { chmodSync } from "node:fs";
import { promisify } from "node:util";
import { BROWSER_BUNDLES } from "./tabs";

export type WindowItem = { kind: "window"; app: string; bundleId: string; pid: number; wid: number; title: string; minimized: boolean };

// Accessibility 의 창 목록은 현재 Space 만 보여 주므로, 모든 Space 의 창을 윈도 서버에서 읽고
// 창 하나만 앞으로 올리는 일은 Swift 헬퍼(helper/main.swift → assets/findow-helper)가 맡는다.
const HELPER = `${environment.assetsPath}/findow-helper`;

async function helper(...args: string[]): Promise<string> {
  try { chmodSync(HELPER, 0o755); } catch { /* Raycast 가 복사하며 실행 비트를 잃었을 때만 의미 있다 */ }
  const { stdout } = await promisify(execFile)(HELPER, args, { timeout: 5000 });
  return stdout;
}

export async function listWindows(): Promise<{ windows: WindowItem[]; screenRecording: boolean }> {
  const { windows, screenRecording } = JSON.parse(await helper("list")) as { windows: Omit<WindowItem, "kind">[]; screenRecording: boolean };
  // 탭을 읽는 브라우저의 창은 탭 목록에 전부 들어가므로 창 목록에서는 뺀다. Raycast 자신도 뺀다.
  return {
    windows: windows
      .filter((w) => !BROWSER_BUNDLES.includes(w.bundleId) && w.bundleId !== "com.raycast.macos")
      .map((w) => ({ kind: "window", ...w })),
    screenRecording,
  };
}

export async function raiseWindow(w: WindowItem) {
  await helper("raise", String(w.pid), String(w.wid));
}
