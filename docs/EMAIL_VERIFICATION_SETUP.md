# Email Verification Setup (Firebase Console)

This app uses the Firebase JS SDK with Email/Password + Anonymous auth. Native iOS/Android apps must be registered in Firebase Console for in-app verification links (`handleCodeInApp: true`).

## Authentication providers

Firebase Console → **Authentication → Sign-in method**

- Enable **Email/Password** (required for account linking after onboarding)
- Keep **Anonymous** enabled (guest onboarding flow)

If Email/Password is disabled, `sendEmailVerification` will fail and no email is sent.

## Register native apps

Firebase Console → **Project settings → Your apps**

| Platform | Identifier |
| -------- | ---------- |
| iOS      | `com.goalgrower.app` |
| Android  | `com.goalgrower.app` |

No `GoogleService-Info.plist` or native Firebase SDK is required for the current JS SDK setup—Console registration is enough for App Links / Universal Links.

## Authorized domains

Authentication → **Settings → Authorized domains** — confirm these exist:

- `goalgrower-2a859.firebaseapp.com` (default — required)
- `localhost` (development)

The verification continue URL is:

`https://goalgrower-2a859.firebaseapp.com`

Do **not** use `/__/auth/action` as the continue URL — that is Firebase’s handler endpoint, not a user-facing redirect.

## Email template (locked — cannot edit body)

Firebase **intentionally locks** the **Email address verification** and **Email address change** template bodies on all plans (Spark and Blaze). The tooltip *"To help prevent spam, the message can't be edited on this email template"* is expected — **upgrading does not unlock it**.

| Template | Body editable? |
| -------- | -------------- |
| Password reset | Yes |
| Email address verification | **No** |
| Email address change | **No** |
| Email link sign-in | **No** |

### What you can still change in Console

- **Sender name** (e.g. "Goal Grower") on the verification template
- **Customize action URL** (optional hosted handler page — see Firebase custom email handler docs)

You **cannot** paste custom HTML or a green button into the verification template in Console.

### Why the link looks like plain text

Firebase’s locked template often embeds a **very long URL**. Some mail apps (especially on mobile) show it as copy/paste text instead of a tappable link. The app already uses **browser-first** settings (`handleCodeInApp: false`) to keep URLs as short as possible.

### How to get a custom button / HTML email

Send verification yourself via a backend:

1. **Cloud Function** (Blaze plan) + [Firebase Admin `generateEmailVerificationLink()`](https://firebase.google.com/docs/auth/admin/email-action-links)
2. Send HTML through **SendGrid**, **Resend**, **Mailgun**, or similar with your own template and `<a href="...">Verify email</a>`
3. App calls the function instead of `sendEmailVerification()` from the client SDK

Reference sample: [firebase/functions-samples email-confirmation](https://github.com/firebase/functions-samples/tree/master/email-confirmation)

Alternative: **Trigger Email** Firebase Extension (Firestore doc → custom HTML email), still requires Blaze + mail provider setup.

Until custom email is built, users verify by **copy/pasting the link into a browser**, then tap **I've verified** in the app.

## Post–Dynamic Links migration (mobile in-app links)

If you see the Firebase banner about Dynamic Links shutting down:

1. Ensure iOS + Android apps are registered with bundle/package `com.goalgrower.app`
2. The app uses `linkDomain: goalgrower-2a859.firebaseapp.com` and Android intent filter for `/__/auth/links`
3. Optionally configure Firebase Auth mobile links via Admin SDK (`mobileLinksConfig.domain`) — see [Firebase migration guide](https://firebase.google.com/docs/auth/android/email-link-migration)

If in-app links are not configured yet, the app **automatically falls back** to browser-based verification emails (`handleCodeInApp: false`).

## Troubleshooting: no email received

Check in this order:

1. **Verify Email screen error text** — the app now shows Firebase error codes (e.g. unauthorized continue URI).
2. **Spam / Promotions folder** — Firebase emails often land there.
3. **Email/Password enabled** — Authentication → Sign-in method.
4. **Authorized domains** — `goalgrower-2a859.firebaseapp.com` must be listed.
5. **Valid email address** — typos during account creation send to the wrong inbox.
6. **Rate limits** — wait a few minutes if you tapped Resend many times (`auth/too-many-requests`).
7. **Gmail / iCloud delay** — can take 1–5 minutes.
8. **Firebase project quota** — Spark plan includes auth emails; check Google Cloud Console for Identity Toolkit API enabled.

## Native builds

After changing `app.json` linking config, rebuild:

```bash
npx expo prebuild --clean
npx expo run:ios   # or run:android / EAS build
```

**Expo Go** cannot test Associated Domains. Use a dev or production native build for deep-link verification.

## Expo Go fallback

Users verify in the browser, return to the app, and tap **I've verified** on `VerifyEmailScreen`.

## Optional: Hosting fallback page

Deploy a redirect page at e.g. `https://goalgrower-2a859.firebaseapp.com/verified` that opens `goalgrower://verify-email?verified=1` if Universal Links fail on some devices. Not required for v1.
