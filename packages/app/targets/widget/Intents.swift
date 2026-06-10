import AppIntents
import Foundation

/// Shared decision poster for the widget's App Intents.
/// Reads host url + token from the App Group written by the app's
/// LiveActivity.setSharedConfig, then POSTs /api/decision.
enum PocketClawDecision {
  static let appGroupId = "group.com.rickray.pocketclaw"

  static func post(requestId: String, behavior: String) async {
    guard
      let defaults = UserDefaults(suiteName: appGroupId),
      let hostUrl = defaults.string(forKey: "hostUrl"),
      let token = defaults.string(forKey: "hostToken"),
      let url = URL(string: "\(hostUrl)/api/decision")
    else {
      NSLog("[PocketClawWidget] missing shared config, cannot post decision")
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 10
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: [
      "requestId": requestId,
      "behavior": behavior,
    ])

    // Fire-and-forget: log failures, never throw into the intent system.
    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      if let http = response as? HTTPURLResponse, http.statusCode >= 300 {
        NSLog("[PocketClawWidget] decision %@ failed: HTTP %d", behavior, http.statusCode)
      }
    } catch {
      NSLog("[PocketClawWidget] decision %@ failed: %@", behavior, error.localizedDescription)
    }
  }
}

struct ApproveIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Approve"
  static var description = IntentDescription("Approve a pending PocketClaw permission request.")

  @Parameter(title: "Request ID")
  var requestId: String

  init() {
    self.requestId = ""
  }

  init(requestId: String) {
    self.requestId = requestId
  }

  func perform() async throws -> some IntentResult {
    await PocketClawDecision.post(requestId: requestId, behavior: "allow")
    return .result()
  }
}

struct DenyIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Deny"
  static var description = IntentDescription("Deny a pending PocketClaw permission request.")

  @Parameter(title: "Request ID")
  var requestId: String

  init() {
    self.requestId = ""
  }

  init(requestId: String) {
    self.requestId = requestId
  }

  func perform() async throws -> some IntentResult {
    await PocketClawDecision.post(requestId: requestId, behavior: "deny")
    return .result()
  }
}
