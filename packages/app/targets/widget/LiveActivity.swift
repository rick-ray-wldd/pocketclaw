import ActivityKit
import SwiftUI
import WidgetKit

private let clawOrange = Color(red: 1.0, green: 0.42, blue: 0.21) // #ff6b35

private func statusColor(_ status: String) -> Color {
  switch status {
  case "running": return .green
  case "starting": return .blue
  case "waiting_input": return .yellow
  case "waiting_permission": return clawOrange
  case "error": return .red
  default: return .gray
  }
}

private func statusEmoji(_ status: String) -> String {
  switch status {
  case "waiting_permission": return "✋"
  case "waiting_input": return "💬"
  case "error": return "❌"
  case "done": return "✅"
  default: return "🦀"
  }
}

struct PocketClawLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PocketClawActivityAttributes.self) { context in
      // Lock screen / banner
      LockScreenView(context: context)
        .activityBackgroundTint(Color(red: 0.05, green: 0.07, blue: 0.09))
        .activitySystemActionForegroundColor(clawOrange)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 4) {
            Text(statusEmoji(context.state.status))
            Circle()
              .fill(statusColor(context.state.status))
              .frame(width: 8, height: 8)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.todoTotal > 0 {
            Text("\(context.state.todoDone)/\(context.state.todoTotal)")
              .font(.caption.bold())
              .foregroundStyle(clawOrange)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.attributes.sessionTitle)
            .font(.caption.bold())
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.progressText)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(2)
            PermissionActions(context: context)
          }
        }
      } compactLeading: {
        Text(statusEmoji(context.state.status))
      } compactTrailing: {
        if context.state.todoTotal > 0 {
          Text("\(context.state.todoDone)/\(context.state.todoTotal)")
            .font(.caption2.bold())
            .foregroundStyle(clawOrange)
        } else {
          Circle()
            .fill(statusColor(context.state.status))
            .frame(width: 8, height: 8)
        }
      } minimal: {
        Text("🦀")
      }
      .widgetURL(URL(string: "pocketclaw://session/\(context.attributes.sessionId)"))
      .keylineTint(clawOrange)
    }
  }
}

private struct LockScreenView: View {
  let context: ActivityViewContext<PocketClawActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("🦀 \(context.attributes.sessionTitle)")
          .font(.headline)
          .foregroundStyle(.white)
          .lineLimit(1)
        Spacer()
        Text(context.attributes.workspaceAlias)
          .font(.caption.bold())
          .foregroundStyle(clawOrange)
      }

      if context.state.todoTotal > 0 {
        ProgressView(
          value: Double(min(context.state.todoDone, context.state.todoTotal)),
          total: Double(max(context.state.todoTotal, 1))
        )
        .tint(clawOrange)
      }

      HStack(spacing: 6) {
        Circle()
          .fill(statusColor(context.state.status))
          .frame(width: 8, height: 8)
        Text(context.state.progressText)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      PermissionActions(context: context)
    }
    .padding(14)
  }
}

/// Approve/Deny for medium-risk requests; high-risk only deep-links into the
/// app (the host computes the tier — high must never be approvable here).
private struct PermissionActions: View {
  let context: ActivityViewContext<PocketClawActivityAttributes>

  var body: some View {
    if let requestId = context.state.pendingRequestId {
      if context.state.riskTier == "medium" {
        HStack(spacing: 10) {
          Button(intent: DenyIntent(requestId: requestId)) {
            Text("Deny")
              .font(.caption.bold())
              .frame(maxWidth: .infinity)
          }
          .tint(.red)
          .buttonStyle(.bordered)

          Button(intent: ApproveIntent(requestId: requestId)) {
            Text("Approve \(context.state.pendingTool ?? "")")
              .font(.caption.bold())
              .lineLimit(1)
              .frame(maxWidth: .infinity)
          }
          .tint(.green)
          .buttonStyle(.borderedProminent)
        }
      } else if context.state.riskTier == "high" {
        Link(destination: URL(string: "pocketclaw://session/\(context.attributes.sessionId)")!) {
          Text("⚠️ High risk: \(context.state.pendingTool ?? "tool") — Open PocketClaw")
            .font(.caption.bold())
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(.red.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
        }
      }
    }
  }
}
