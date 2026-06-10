import ActivityKit

// Widget-extension copy of the activity attributes. ActivityKit matches the
// attributes between app and extension by type *name*, so this must stay
// byte-for-byte in sync with modules/live-activity/ios/LiveActivityModule.swift.
struct PocketClawActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var status: String
    var progressText: String
    var todoDone: Int
    var todoTotal: Int
    var pendingRequestId: String?
    var pendingTool: String?
    var riskTier: String?
  }

  var sessionId: String
  var sessionTitle: String
  var workspaceAlias: String
}
