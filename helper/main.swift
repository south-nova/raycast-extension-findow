// findow-helper: 모든 Space 의 창을 열거하고, 창 하나만 앞으로 올린다.
// Accessibility 의 창 목록은 현재 Space 만 보여 주므로 윈도 서버(CGWindowList)로 열거하고,
// 창 ID 로 AX 요소를 만드는 비공개 API 로 제목을 읽는다(화면 기록 권한 불필요).
// 포커스는 AltTab 이 쓰는 SkyLight 비공개 호출로 그 창만 올리며, 다른 Space 면 자동으로 넘어간다.
import AppKit
import ApplicationServices

@_silgen_name("_AXUIElementCreateWithRemoteToken")
func _AXUIElementCreateWithRemoteToken(_ data: CFData) -> Unmanaged<AXUIElement>?
@_silgen_name("_SLPSSetFrontProcessWithOptions")
func _SLPSSetFrontProcessWithOptions(_ psn: UnsafeMutablePointer<ProcessSerialNumber>, _ wid: UInt32, _ mode: UInt32) -> CGError
@_silgen_name("GetProcessForPID")  // Swift 에서 막힌 옛 Carbon API 를 직접 선언
func GetProcessForPID(_ pid: pid_t, _ psn: UnsafeMutablePointer<ProcessSerialNumber>) -> OSStatus
@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ el: AXUIElement, _ wid: UnsafeMutablePointer<UInt32>) -> AXError
@_silgen_name("SLPSPostEventRecordTo")
func SLPSPostEventRecordTo(_ psn: UnsafeMutablePointer<ProcessSerialNumber>, _ bytes: UnsafeMutablePointer<UInt8>) -> CGError

func axWindow(_ pid: pid_t, _ wid: UInt32) -> AXUIElement? {
  var d = Data(count: 20)
  var p = Int32(pid), w = wid, magic: Int32 = 0x636f636f
  d.replaceSubrange(0..<4, with: Data(bytes: &p, count: 4))
  d.replaceSubrange(8..<12, with: Data(bytes: &magic, count: 4))
  d.replaceSubrange(12..<16, with: Data(bytes: &w, count: 4))
  return _AXUIElementCreateWithRemoteToken(d as CFData)?.takeRetainedValue()
}

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}

func list() {
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
  // 독에 뜨는 일반 앱만 본다. 배경 프로세스·UI 서비스는 전환할 창이 없는데 AX 응답만 느리다.
  let pids = Array(Set(rows.map { $0.pid })).filter { NSRunningApplication(processIdentifier: $0)?.activationPolicy == .regular }
  // 앱마다 AX 로 현재 Space 의 창을 읽는다. 앱 하나에 20~30ms 씩 걸리므로 동시에 돈다.
  var axByPid: [pid_t: [UInt32: AXUIElement]] = [:]
  let lock = NSLock()
  DispatchQueue.concurrentPerform(iterations: pids.count) { n in
    let pid = pids[n]
    let appEl = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(appEl, 0.1)  // 응답 없는 앱 하나가 전체를 묶지 않게
    var byWid: [UInt32: AXUIElement] = [:]
    for w in (attr(appEl, kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
      var id: UInt32 = 0
      if _AXUIElementGetWindow(w, &id) == .success { byWid[id] = w }
    }
    lock.lock(); axByPid[pid] = byWid; lock.unlock()
  }
  var out: [[String: Any]] = []
  var needScreenRecording = false
  for r in rows {
    guard let byWid = axByPid[r.pid] else { continue }
    let ra = NSRunningApplication(processIdentifier: r.pid)
    var title: String, minimized = false
    if let el = byWid[r.wid] {  // 현재 Space 의 창: AX 로 제목·종류·최소화를 정확히 읽는다.
      let sub = attr(el, kAXSubroleAttribute) as? String ?? ""
      if sub != "AXStandardWindow" && sub != "AXDialog" { continue }
      title = attr(el, kAXTitleAttribute) as? String ?? ""
      minimized = (attr(el, kAXMinimizedAttribute) as? Bool) ?? false
    } else {  // 다른 Space 의 창: AX 로는 못 보므로 윈도 서버 제목을 쓴다. 화면 기록 권한이 없으면 비어 온다.
      title = r.cgName
      if title.isEmpty { needScreenRecording = true }
    }
    if title.isEmpty { continue }
    out.append(["pid": r.pid, "wid": r.wid, "app": ra?.localizedName ?? "", "bundleId": ra?.bundleIdentifier ?? "",
                "title": title, "minimized": minimized])
  }
  if needScreenRecording && !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }  // 한 번만 뜨는 시스템 권한 창
  FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: out))
}

func axFind(_ pid: pid_t, _ wid: UInt32) -> AXUIElement? {
  // kAXWindows 는 현재 Space 의 창만 준다. 다른 Space 창은 Space 가 바뀐 뒤에야 여기서 찾힌다.
  for w in (attr(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
    var id: UInt32 = 0
    if _AXUIElementGetWindow(w, &id) == .success && id == wid { return w }
  }
  return nil
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

func activate(_ app: NSRunningApplication?) {
  // activateAllWindows 없이 호출하므로 앞창 하나만 올라온다. 요청은 런루프가 돌아야 전달된다.
  app?.activate(options: [])
  RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.15))
}

func raiseFound(_ el: AXUIElement) {
  AXUIElementSetAttributeValue(el, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
  AXUIElementPerformAction(el, kAXRaiseAction as CFString)
}

func waitAx(_ pid: pid_t, _ wid: UInt32, _ tries: Int) -> AXUIElement? {
  for _ in 0..<tries { if let el = axFind(pid, wid) { return el }; usleep(50_000) }
  return nil
}

func raise(_ pid: pid_t, _ wid: UInt32) {
  let dbg = CommandLine.arguments.contains("--debug")
  func log(_ m: String) { if dbg { FileHandle.standardError.write((m + "\n").data(using: .utf8)!) } }
  let app = NSRunningApplication(processIdentifier: pid)
  // 1) 현재 Space 에 있는 창: AXRaise 로 앞창을 만든 뒤 활성화.
  if let el = axFind(pid, wid) { raiseFound(el); activate(app); log("same-space"); return }
  // 2) 다른 Space: 앱을 활성화하면 macOS 가 그 앱의 앞창이 있는 Space 로 넘어간다. 넘어간 뒤 창이 AX 에 보이면 올린다.
  activate(app)
  if let el = waitAx(pid, wid, 20) { raiseFound(el); log("other-space via activate"); return }
  // 3) 앱이 이미 앞에 있거나 앱의 앞창과 대상 창의 Space 가 다른 경우: 윈도 서버로 대상 창을 앞창으로 바꾸고,
  //    창 없는 헬퍼 자신을 잠깐 활성화했다가(Space 전환 없음) 대상 앱을 다시 활성화해 전환을 유도한다.
  slpsFront(pid, wid)
  NSApplication.shared.setActivationPolicy(.accessory)
  NSApplication.shared.activate(ignoringOtherApps: true)
  RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.15))
  activate(app)
  if let el = waitAx(pid, wid, 20) { raiseFound(el); log("other-space via slps+reactivate"); return }
  log("window not reachable; app activated only")
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "list": list()
case "raise" where args.count >= 4: raise(pid_t(args[2])!, UInt32(args[3])!)
default: FileHandle.standardError.write("usage: findow-helper list | raise <pid> <wid>\n".data(using: .utf8)!); exit(2)
}
