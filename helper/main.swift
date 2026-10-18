// findow-helper: 모든 Space 의 창을 열거하고, 창 하나만 앞으로 올린다.
// Accessibility 의 창 목록은 현재 Space 만 보여 주므로 윈도 서버(CGWindowList)로 열거하고,
// 현재 Space 창은 AX 로 제목·종류를 정확히, 다른 Space 창은 윈도 서버 제목(화면 기록 권한)으로 읽는다.
// 창 올리기는 AXRaise + 창 하나만 올리는 앱 활성화. 다른 Space 면 활성화가 그 Space 로 넘긴다.
import AppKit
import ApplicationServices

@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ el: AXUIElement, _ wid: UnsafeMutablePointer<UInt32>) -> AXError
@_silgen_name("_SLPSSetFrontProcessWithOptions")
func _SLPSSetFrontProcessWithOptions(_ psn: UnsafeMutablePointer<ProcessSerialNumber>, _ wid: UInt32, _ mode: UInt32) -> CGError
@_silgen_name("GetProcessForPID")  // Swift 에서 막힌 옛 Carbon API 를 직접 선언
func GetProcessForPID(_ pid: pid_t, _ psn: UnsafeMutablePointer<ProcessSerialNumber>) -> OSStatus
@_silgen_name("SLPSPostEventRecordTo")
func SLPSPostEventRecordTo(_ psn: UnsafeMutablePointer<ProcessSerialNumber>, _ bytes: UnsafeMutablePointer<UInt8>) -> CGError

let args = CommandLine.arguments
let dbg = args.contains("--debug")
func log(_ m: String) { if dbg { FileHandle.standardError.write((m + "\n").data(using: .utf8)!) } }

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}

func axWindows(_ pid: pid_t) -> [AXUIElement] {
  (attr(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement]) ?? []
}

// MARK: list

func list() {
  // 타임아웃은 요소마다 따로 먹으므로 시스템 전체 요소에 걸어 프로세스 기본값으로 만든다. 응답 없는 앱 하나가 전체를 묶지 않게.
  AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.25)
  var skip: Set<String> = []
  if let i = args.firstIndex(of: "--skip"), i + 1 < args.count { skip = Set(args[i + 1].split(separator: ",").map(String.init)) }

  let infos = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
  struct Row { let pid: pid_t; let wid: UInt32; let cgName: String }
  var rows: [Row] = []
  for i in infos {  // 앞에서 뒤 순서(z-order)
    guard (i["kCGWindowLayer"] as? Int) == 0,
          let pid = (i["kCGWindowOwnerPID"] as? NSNumber)?.int32Value,
          let wid = (i["kCGWindowNumber"] as? NSNumber)?.uint32Value,
          let b = i["kCGWindowBounds"] as? [String: CGFloat], b["Height"]! >= 50, b["Width"]! >= 50
    else { continue }
    rows.append(Row(pid: pid, wid: wid, cgName: i["kCGWindowName"] as? String ?? ""))
  }
  // 독에 뜨는 일반 앱만, 그리고 호출 쪽이 어차피 버릴 앱(탭으로 읽는 브라우저, Raycast)은 AX 조회 자체를 안 한다.
  var apps: [pid_t: NSRunningApplication] = [:]
  for pid in Set(rows.map { $0.pid }) {
    if let a = NSRunningApplication(processIdentifier: pid), a.activationPolicy == .regular, !skip.contains(a.bundleIdentifier ?? "") { apps[pid] = a }
  }
  // 앱마다 AX 로 현재 Space 창의 제목·종류·최소화를 읽는다. 앱 하나에 20~30ms 씩 걸리므로 앱 단위로 동시에 돈다.
  struct AxInfo { let standard: Bool; let title: String; let minimized: Bool }
  let pids = Array(apps.keys)
  var axByPid: [pid_t: [UInt32: AxInfo]] = [:]
  let lock = NSLock()
  DispatchQueue.concurrentPerform(iterations: pids.count) { n in
    var byWid: [UInt32: AxInfo] = [:]
    for w in axWindows(pids[n]) {
      var id: UInt32 = 0
      guard _AXUIElementGetWindow(w, &id) == .success else { continue }
      let sub = attr(w, kAXSubroleAttribute) as? String ?? ""
      byWid[id] = AxInfo(standard: sub == "AXStandardWindow" || sub == "AXDialog",
                         title: attr(w, kAXTitleAttribute) as? String ?? "",
                         minimized: (attr(w, kAXMinimizedAttribute) as? Bool) ?? false)
    }
    lock.lock(); axByPid[pids[n]] = byWid; lock.unlock()
  }
  var out: [[String: Any]] = []
  var needScreenRecording = false
  for r in rows {
    guard let app = apps[r.pid] else { continue }
    var title: String, minimized = false
    if let info = axByPid[r.pid]?[r.wid] {  // 현재 Space 의 창
      if !info.standard { continue }
      title = info.title; minimized = info.minimized
    } else {  // 다른 Space 의 창: 윈도 서버 제목. 화면 기록 권한이 없으면 비어 오므로 앱 이름으로라도 찾히게 한다.
      title = r.cgName
      if title.isEmpty { needScreenRecording = true; title = app.localizedName ?? "" }
    }
    if title.isEmpty { continue }
    out.append(["pid": r.pid, "wid": r.wid, "app": app.localizedName ?? "", "bundleId": app.bundleIdentifier ?? "",
                "appPath": app.bundleURL?.path ?? "", "title": title, "minimized": minimized])
  }
  let screenRecording = CGPreflightScreenCaptureAccess()
  if needScreenRecording && !screenRecording { CGRequestScreenCaptureAccess() }  // 시스템 권한 창은 한 번만 뜬다
  FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: ["windows": out, "screenRecording": screenRecording]))
}

// MARK: raise

func axFind(_ pid: pid_t, _ wid: UInt32) -> AXUIElement? {
  // kAXWindows 는 현재 Space 의 창만 준다. 다른 Space 창은 Space 가 바뀐 뒤에야 여기서 찾힌다.
  for w in axWindows(pid) {
    var id: UInt32 = 0
    if _AXUIElementGetWindow(w, &id) == .success && id == wid { return w }
  }
  return nil
}

func waitAx(_ pid: pid_t, _ wid: UInt32, _ seconds: Double) -> AXUIElement? {
  let deadline = Date(timeIntervalSinceNow: seconds)
  while true {
    if let el = axFind(pid, wid) { return el }
    if Date() >= deadline { return nil }
    usleep(30_000)
  }
}

func slpsFront(_ pid: pid_t, _ wid: UInt32) {
  // 윈도 서버에 "이 창을 이 앱의 앞창으로" 알린다(AltTab 방식). Space 는 바꾸지 않는다.
  var psn = ProcessSerialNumber()
  _ = GetProcessForPID(pid, &psn)
  _ = _SLPSSetFrontProcessWithOptions(&psn, wid, 0x200)
  var w = wid
  for kind: UInt8 in [1, 2] {
    var bytes = [UInt8](repeating: 0, count: 0xf8)
    bytes[0x04] = 0xF8; bytes[0x08] = kind; bytes[0x3a] = 0x10
    memcpy(&bytes[0x3c], &w, 4)
    memset(&bytes[0x20], 0xFF, 0x10)
    _ = SLPSPostEventRecordTo(&psn, &bytes)
  }
}

func activate(_ app: NSRunningApplication) {
  // activateAllWindows 없이 호출하므로 앞창 하나만 올라온다. 요청은 런루프가 돌아야 전달되니 활성화될 때까지만 돌린다.
  app.activate(options: [])
  let deadline = Date(timeIntervalSinceNow: 0.3)
  while !app.isActive && Date() < deadline { RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.01)) }
}

func raiseFound(_ el: AXUIElement) {
  AXUIElementSetAttributeValue(el, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
  AXUIElementPerformAction(el, kAXRaiseAction as CFString)
}

func raise(_ pid: pid_t, _ wid: UInt32) {
  AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 1.0)
  guard let app = NSRunningApplication(processIdentifier: pid) else { return }
  // 1) 현재 Space 에 있는 창: AXRaise 로 앞창을 만든 뒤 활성화.
  if let el = axFind(pid, wid) { raiseFound(el); activate(app); log("same-space"); return }
  // 2) 다른 Space: 앱을 활성화하면 macOS 가 그 앱의 앞창이 있는 Space 로 넘어간다. 이미 활성인 앱은 이 경로가 아무것도 안 하므로 건너뛴다.
  if !app.isActive {
    activate(app)
    if let el = waitAx(pid, wid, 1.0) { raiseFound(el); log("other-space via activate"); return }
  }
  // 3) 앱이 이미 앞에 있거나 앱의 앞창과 대상 창의 Space 가 다른 경우: 윈도 서버로 대상 창을 앞창으로 바꾸고,
  //    창 없는 헬퍼 자신을 잠깐 활성화했다가(Space 전환 없음) 대상 앱을 다시 활성화해 전환을 유도한다.
  slpsFront(pid, wid)
  NSApplication.shared.setActivationPolicy(.accessory)
  NSApplication.shared.activate(ignoringOtherApps: true)
  RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
  activate(app)
  if let el = waitAx(pid, wid, 1.0) { raiseFound(el); log("other-space via slps+reactivate"); return }
  log("window not reachable; app activated only")
}

switch args.count > 1 ? args[1] : "" {
case "list": list()
case "raise" where args.count >= 4: raise(pid_t(args[2])!, UInt32(args[3])!)
default: FileHandle.standardError.write("usage: findow-helper list [--skip a,b] | raise <pid> <wid>\n".data(using: .utf8)!); exit(2)
}
