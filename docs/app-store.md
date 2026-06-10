# Shipping PocketClaw to the App Store

Step-by-step guide for building, submitting, and getting `pocketclaw-app` through
App Review. Assumes the Expo app in `packages/app` builds locally.

## 0. Prerequisites

- **Apple Developer Program** membership ($99/year) — enroll at
  <https://developer.apple.com/programs/enroll/>. Live Activities and TestFlight
  both require a paid account.
- An [Expo](https://expo.dev) account and the EAS CLI: `npm i -g eas-cli && eas login`.

## 1. Identifiers (Apple Developer portal)

Create in **Certificates, Identifiers & Profiles → Identifiers**:

| Identifier | Type | Purpose |
|---|---|---|
| `com.rickray.pocketclaw` | App ID | the main app |
| `com.rickray.pocketclaw.widget` | App ID | the Live Activity widget extension |
| `group.com.rickray.pocketclaw` | App Group | shared container: app + widget |

The **App Group is mandatory**: the Live Activity App Intent (Approve button) runs
in the widget extension and needs the host URL + bearer token, which the main app
writes into the shared group container. Enable the App Groups capability on **both**
App IDs and assign `group.com.rickray.pocketclaw` to each.

Verify `packages/app/app.json` matches:

- `ios.bundleIdentifier`: `com.rickray.pocketclaw`
- `ios.entitlements["com.apple.security.application-groups"]`: `["group.com.rickray.pocketclaw"]`
- `NSSupportsLiveActivities: true` in the Info.plist config

EAS can auto-create these identifiers on first build, but creating them manually
avoids surprises with the widget extension's group entitlement.

## 2. App Store Connect

Create the app record at <https://appstoreconnect.apple.com>:

- **Name**: PocketClaw (have fallbacks ready, e.g. "PocketClaw — Agent Remote")
- **Bundle ID**: `com.rickray.pocketclaw`
- **SKU**: `pocketclaw-ios`
- **Category**: Developer Tools

## 3. Build & submit with EAS

```bash
cd packages/app

# one-time: link the project to your Expo account
eas init

# production build (EAS manages signing; say yes to letting it create
# distribution cert + provisioning profiles for app AND widget)
eas build --profile production -p ios

# upload the finished build to App Store Connect
eas submit -p ios
```

Suggested `eas.json` profiles: `development` (dev client, internal distribution,
for day-to-day testing on device) and `production` (store distribution,
auto-increment build number).

## 4. TestFlight

1. After `eas submit`, the build appears in App Store Connect → TestFlight
   (processing takes ~5–30 min).
2. Answer the export-compliance prompt (see §7) so the build becomes testable.
3. Add yourself to an **internal testing** group — no review needed, instant.
4. External testers require a lightweight Beta App Review; the reviewer notes in
   §5 apply there too.
5. **Test the full Live Activity flow on a physical device with the Dynamic Island**
   (iPhone 14 Pro or later): spawn a session, trigger a medium-risk permission,
   approve from the Island without unlocking, and verify a high-risk request shows
   only "Open app".

## 5. App Review notes (important)

PocketClaw is a client for **self-hosted software**. Reviewers cannot use it
without a running host daemon, so the notes must explain this clearly, and you
should give them a working demo server.

**Demo-server tip:** for the review window, run a host on a small cloud VM
(or a Mac with Tailscale Funnel / an HTTPS reverse proxy) with a **throwaway
token and a sandbox workspace containing dummy files** — never your real machine
or real token. Pre-fill the review build's pairing screen via the "manual entry"
option, and put the URL + token in the review notes. Tear the server down after
approval and rotate everything.

Suggested reviewer notes text (paste into "Notes for Review"):

> PocketClaw is a remote-control client for a self-hosted, open-source companion
> daemon ("PocketClaw Host") that the user runs on their own computer. The app
> does not function standalone by design — it connects only to a server the user
> personally operates on their own private network, authenticated with a token
> the user generates locally. No accounts are created and no data is sent to us
> or to any third party.
>
> For review, we have set up a temporary demo host:
>   Host URL: https://demo.example.com:8787
>   Token: <demo-token>
> In the app, choose "Enter manually" on the pairing screen and input the above.
> You can then: view running agent sessions, send a prompt, and approve/deny a
> tool-permission request (including the one-tap approve on the Live Activity /
> Dynamic Island for medium-risk actions; high-risk actions intentionally
> require opening the app).
>
> The companion daemon is open source: https://github.com/rick-ray-wldd/pocketclaw

Guideline pitfalls to pre-empt:

- **4.2 Minimum functionality** — the demo server proves the app is fully functional.
- **2.1 App completeness** — make sure pairing-failure states show friendly errors,
  not spinners.
- **5.1.1 Data collection** — covered by the privacy answers below.

## 6. Privacy nutrition labels

In App Store Connect → App Privacy, answer **"Data is not collected"**:

- The app has no analytics, no ads, no accounts, no first-party servers.
- All traffic flows exclusively between the user's phone and the user's own
  self-hosted daemon ("all traffic user-hosted"). The developer never receives
  any user data.
- The bearer token and host URL are stored on-device (and in the app group
  container for the widget); they are credentials, not collected data.
- Privacy policy URL is still required — a short page stating the above (you can
  host it in the GitHub repo, e.g. a `PRIVACY.md` rendered via GitHub Pages).

If you ever add crash reporting or analytics, these answers must be redone.

## 7. Export compliance (encryption)

PocketClaw uses only standard transport encryption (HTTPS/WSS, and the OS's
networking stack); it implements no proprietary cryptography. This qualifies for
the **standard encryption exemption** under App Store export rules
(France-eligible exemption, no annual self-classification filing needed for
exempt apps in most cases — verify current rules).

Avoid the upload-time questionnaire entirely by declaring it in the app config —
in `app.json`:

```json
{
  "ios": {
    "infoPlist": {
      "ITSAppUsesNonExemptEncryption": false
    }
  }
}
```

## 8. Release

1. Attach the approved build to a version in App Store Connect.
2. Phased release recommended for the first version.
3. Tag the repo (`v0.1.0`) so the shipped app matches a host release —
   the app refuses protocol-major mismatches via `GET /api/health`.

## Checklist

- [ ] Apple Developer Program active
- [ ] App IDs + App Group created, capabilities assigned to app **and** widget
- [ ] `eas init` linked, `production` profile builds clean
- [ ] Live Activity approve/deny verified on a physical Dynamic Island device
- [ ] Demo host running with throwaway token; reviewer notes filled in
- [ ] Privacy labels: "Data not collected"; privacy policy URL live
- [ ] `ITSAppUsesNonExemptEncryption: false` set
- [ ] `eas submit` done; TestFlight pass complete
