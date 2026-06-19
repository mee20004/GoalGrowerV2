#!/usr/bin/env bash
set -euo pipefail

if [ -n "${GOOGLE_SERVICES_PLIST:-}" ] && [ -f "$GOOGLE_SERVICES_PLIST" ]; then
  mkdir -p ios/GoalGrower
  cp "$GOOGLE_SERVICES_PLIST" ios/GoalGrower/GoogleService-Info.plist
  echo "Copied GoogleService-Info.plist into ios/GoalGrower/"
else
  echo "GOOGLE_SERVICES_PLIST not set or file missing; skipping iOS Firebase plist copy."
fi

if [ -n "${GOOGLE_SERVICES_JSON:-}" ] && [ -f "$GOOGLE_SERVICES_JSON" ]; then
  mkdir -p android/app
  cp "$GOOGLE_SERVICES_JSON" android/app/google-services.json
  echo "Copied google-services.json into android/app/"
fi
