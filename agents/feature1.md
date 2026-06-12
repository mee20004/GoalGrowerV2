# GoalGrower Tutorial / Onboarding System

## Overview

This document defines the architecture, UX behavior, implementation roadmap, and QA expectations for the GoalGrower onboarding/tutorial system.

The onboarding flow introduces first-time users to:
1. The GoalGrower concept
2. Creating a goal (optional during the tutorial)
3. Understanding plant growth progression
4. Staying consistent with watering
5. Completing the tutorial

A one-time `tutorialAwardGranted` flag is persisted in AsyncStorage when the user first completes the tutorial (for downstream reward logic). The completion screen shows congratulations only — no trophy image on the card.

IMPORTANT:
- Use the wireframe images in the `/wireframes` folder as the primary visual guide.
- Match positioning, spacing, interaction flow, and emotional tone closely.
- Prioritize maintainable architecture and high QA standards over rapid implementation.
- When adding comments, add short section labels only - no phase references.
- If you need clarification with implementing a step or see a gap or weakness in my instructions, ask me for clarification before moving on. 

---

# Core UX Requirements

## Tutorial Style

The tutorial uses:
- Dimmed background overlay
- Highlighted UI element focus
- Floating instructional card/modal
- Step progression
- Responsive positioning
- Smooth animations

The tutorial should feel:
- Encouraging
- Lightweight
- Rewarding
- Non-intrusive

NOT:
- Overly gamified
- Cluttered
- Heavy-handed
- Technically overwhelming

---

# Required Tutorial Flow

## Step 1 — Welcome Screen
Centered tutorial card.

Purpose:
- Introduce GoalGrower metaphor
- Explain that goals become plants
- Encourage onboarding completion

No highlighted element.

Tutorial card should be centered.

Includes:
- Title
- Short explanation
- Plant illustration
- "Get Started" button

---

## Step 2 — Highlight Add Goal (`highlight-add-goal`)

**New users (no visible goals):**
- Highlights empty-state **+ Add Goal** button
- Title: "Create Your First Goal"

**Returning users (has visible goals):**
- Highlights the **FAB** (+) in the bottom right
- Title: "Create a Goal"
- Copy references the bottom-right + button

Behavior:
- Background darkens with rounded SVG highlight cutout (no border ring)
- Tutorial card anchors above the highlighted target
- Progress bar visible but subtle
- **Skip** (left) exits the entire tutorial
- **Skip for now** (right, primary green) skips goal creation and jumps to Step 4
- Optional hint on this card only: "Creating a goal is optional during the tutorial."

User action required to advance:
- Tap the highlighted Add Goal control (passthrough overlay or real button)

Navigates to Goals tab on step entry.

---

## Step 3 — Goal Creation (`goal-creation`, silent)

Silent step — **no tutorial overlay** during the Add Goal form so bottom controls are not blocked.

Tutorial remains active in state while user:
- Fills out the multi-step Add Goal flow
- Selects a plant and schedule

Advance triggers:
- Successfully saving a goal (`GOAL_CREATION` user action)

Back navigation:
- In-form back button or Android hardware back from step 0 returns user to Step 2 decision card (`returnToGoalCreationChoice`)

---

## Step 4 — Plant Growth (`plant-growth`)

Navigate to Journey tab.

Highlight:
- **Journey tab** in the bottom tab bar

Instruction (in card):
- Plants grow as goals are completed
- Growth stage illustrations shown in card (`TutorialGrowthStages`)

Primary **Next** button advances (no user tap on highlight required).

---

## Step 5 — Consistency / Watering (`consistency`)

Navigate to Garden tab.

Highlight:
- **Water drop** control on the garden screen

Instruction:
- Warning banner about missing watering schedule
- Side-by-side healthy vs. wilting plant comparison (`TutorialComparisonImages`)

Primary **Next** button advances.

---

## Step 6 — Completion (`completion`)

Centered completion card.

No highlighted element. No trophy image.

Show:
- "Congratulations!" title
- Short positive reinforcement copy
- **Done** button

Tutorial completion:
- Persists `onboardingCompleted` in AsyncStorage (per user)
- Sets `tutorialAwardGranted` once (first completion only)
- Does not auto-show again unless user taps **Replay Tutorial** in Settings

---

# Technical Requirements

## Architecture Requirements

DO NOT implement entire tutorial in one component.

Use modular architecture.


---

# Required Components (Implemented)

| Component | Path | Role |
|-----------|------|------|
| `TutorialProvider` | `contexts/TutorialContext.js` | State, persistence, navigation sync, target registry |
| `TutorialHost` | `components/tutorial/TutorialHost.js` | Renders overlay + step-specific cards |
| `TutorialOverlay` | `components/tutorial/TutorialOverlay.js` | Dimming, SVG rounded cutout, centered mode |
| `TutorialWelcomeCard` | `components/tutorial/TutorialWelcomeCard.js` | Welcome step centered card |
| `TutorialCard` | `components/tutorial/TutorialCard.js` | Highlight/flow instructional card |
| `TutorialCompletionCard` | `components/tutorial/TutorialCompletionCard.js` | Completion step |
| `TutorialHighlightPassthrough` | `components/tutorial/TutorialHighlightPassthrough.js` | Tap-through on highlighted targets |
| `HighlightTarget` | `components/tutorial/HighlightTarget.js` | Wraps UI elements for measurement |
| `TutorialProgress` | `components/tutorial/TutorialProgress.js` | Subtle step progress bar |
| `TutorialPlantInPot` | `components/tutorial/TutorialPlantInPot.js` | Plant-in-pot illustrations |
| `TutorialGrowthStages` | `components/tutorial/TutorialGrowthStages.js` | Stage progression row |
| `TutorialComparisonImages` | `components/tutorial/TutorialComparisonImages.js` | Healthy vs. wilted comparison |
| `useRemeasureTutorialOnFocus` | `components/tutorial/useRemeasureTutorialOnFocus.js` | Re-measure targets on screen focus |

Step config and engine live under `tutorial/` (`steps.js`, `stepEngine.js`, `layout.js`, `storage.js`, `navigation.js`, `cardLayout.js`, `constants.js`).

## Overlay System (`TutorialOverlay`)

Responsible for:
- Background dimming (`rgba(0, 0, 0, 0.52)`)
- Rounded highlight cutout via SVG `evenodd` path (`buildHighlightCutoutPath`)
- Cutout radius derived from target size (`min(width/2, height/2)`)
- Animated fade-in transitions
- Centered, highlight, and flow modes

No green border ring on highlights. Invisible rectangular touch panels block dimmed areas; highlight hole remains tappable.

## TutorialCard

Reusable floating instructional card with auto-positioning (`computeTutorialCardLayout`), arrow anchor, rich description parts, optional growth stages and comparison images, Skip / Skip for now / Next actions.

## HighlightTarget

Registers refs with `TutorialContext`, measures via `measureInWindow`, re-measures on layout and focus.

## Progress Indicator (`TutorialProgress`)

Minimal bar; hidden on welcome and completion steps.

---

# State Management (`TutorialContext`)

Tutorial state supports:
- `currentStepIndex` / resolved `currentStep` (via `resolveTutorialStep` for existing-goal users)
- `completed`, `skipped`, `hydrated`
- `hasExistingGoals` (from Firestore `goals.length` + `GoalsScreen` visible count)
- `tutorialAwardGranted`
- Target layout map and ref registry
- `replayTutorial()`, `skipGoalCreation()`, `returnToGoalCreationChoice()`
- Guards against double-advance and double-finish (`advancingFromActionRef`, `finishingTutorialRef`)

`TutorialHost` is rendered inside the provider and overlays the app via absolute positioning (`zIndex: 10000`).

Avoid excessive prop drilling — screens use `useTutorial()` and `HighlightTarget` only where needed (`GoalsScreen`, `AddGoalScreen`, `GardenScreen`, `CenteredTabBar`).

---

# Persistence Requirements

Persist per authenticated `userId` (AsyncStorage keys suffixed with `:${userId}`):

| Key | Purpose |
|-----|---------|
| `goalGrower:onboardingCompleted:v1` | Tutorial finished normally |
| `goalGrower:onboardingSkipped:v1` | User tapped Skip (also sets completed) |
| `goalGrower:tutorialAwardGranted:v1` | One-time award flag; **not** cleared on replay |

Behavior:
- Tutorial auto-starts only when `enabled`, user is authenticated, hydrated, and neither completed nor skipped
- **Replay Tutorial** (Settings → Help) calls `resetOnboardingState()` (clears completed/skipped only) and restarts from welcome
- Mid-flow step index is **not** persisted — app restart during tutorial returns to welcome
- All storage functions no-op when `userId` is null

---

## Authentication / Entry Flow Requirement

For now, onboarding scope is limited to first-time authenticated users only.

The onboarding tutorial must only begin after:

- a user has created an account
- the user has logged in
- authentication and initialization are fully resolved

The tutorial should start after successful login and username setup, once the user reaches the main app (not during the daily Enter screen).

`TutorialProvider` is enabled when `user && hasUsername && !showEnterScreen` (`App.js`).

The tutorial must NOT appear:

- during authentication loading
- before app initialization completes
- before navigation state is ready
- while the daily **Enter** screen is showing
- for guest mode / users without a username (out of scope)

---

## Requirements

- Only initialize onboarding for authenticated users on their first login experience
- Trigger onboarding on the first post-login screen the user sees
- Persist completion so it does not auto-run again after finishing

---

## Supported Session Types (Current Scope)

- authenticated user session only

Guest onboarding support will be handled in a later phase.

---

## App Startup Note

This app does not use a separate splash screen.

Any prior "splash" references should be interpreted as:

- auth/loading states before the first post-login screen is rendered

---

## Implementation Notes

- Keep changes minimal and in-scope
- Do not touch unrelated navigation/UI behavior
- Focus only on showing onboarding for first-time authenticated login users

# Responsiveness Requirements

CRITICAL REQUIREMENT.

Tutorial must adapt to:
- Small phones
- Large phones
- Tablets (future-safe)

Requirements:
- No clipped cards
- No hidden buttons
- Dynamic positioning
- Safe area support
- Orientation-safe layout

Floating card positioning should:
- Automatically reposition above/below target
- Prevent screen overflow
- Center when no target exists

---

# Overlay / Highlight Requirements

## Background

Background should:
- Darken slightly
- Preserve context visibility

Do NOT:
- Fully black out screen

Recommended:
- Semi-transparent overlay

---

## Highlighted Element

Highlighted element should:
- Remain fully visible through a transparent rounded cutout
- Feel focused via dimmed surroundings (no colored border ring)

Implemented:
- SVG `evenodd` path cutout with radius matching target shape (circular for FAB)
- `TutorialHighlightPassthrough` for required-action steps

Avoid:
- Harsh neon glow or green border rings
- Sharp rectangular cutout corners

---

# Animation Requirements

Animations should feel:
- Smooth
- Calm
- Modern

Implemented with React Native `Animated`:
- Fade transitions on overlay and cards
- Gentle spring on completion card
- Reanimated may be adopted later for additional polish

Avoid:
- Bouncy cartoon animations
- Excessive movement

---

# Accessibility Requirements

Must support:
- Screen readers
- Accessible button labels
- Sufficient contrast
- Large tap targets

Tutorial should not:
- Trap users permanently
- Block accessibility navigation

Include:
- **Skip** — exits entire tutorial (persists skipped state)
- **Skip for now** — on goal-creation choice step only; continues tutorial without creating a goal
- **Replay Tutorial** — Settings → Help

---

# QA Requirements

HIGH QA PRIORITY.

Before marking complete, verify:

## Layout QA
- No clipped overlays
- No overlap issues
- No off-screen cards
- Proper safe area handling
- Correct positioning on multiple screen sizes

---

## Interaction QA
- **Get Started** advances welcome → goal highlight
- **Next** advances non-action steps (Journey, consistency)
- **Skip** exits tutorial; **Skip for now** skips goal creation only
- Highlight passthrough and real button both advance Step 2
- Add Goal form is unobstructed (silent step 3)
- Back from Add Goal (UI + Android hardware) returns to Step 2 card
- Overlay blocks unintended interactions outside highlight hole
- Highlighted element remains interactable when required

---

## State QA
- Tutorial persists correctly (completed / skipped / awardGranted)
- Completion saves correctly; skip persists skipped + completed
- App relaunch bypasses onboarding after completion
- **Replay Tutorial** resets completed/skipped but not awardGranted
- Tutorial step order remains stable
- Enter screen dismisses before tutorial can start

---

## Performance QA
- No dropped frames
- No excessive rerenders
- No layout flickering
- Overlay transitions remain smooth

---

# Implementation Status

**All phases below are implemented.** The roadmap is kept for historical context and onboarding new contributors.

Step IDs (in order): `welcome` → `highlight-add-goal` → `goal-creation` → `plant-growth` → `consistency` → `completion`

| Index | ID | Mode | Highlight target | Registered in |
|-------|-----|------|------------------|---------------|
| 0 | `welcome` | centered | — | — |
| 1 | `highlight-add-goal` | highlight | `addGoalButton` or `addGoalFab` | `GoalsScreen` |
| 2 | `goal-creation` | flow (silent) | — | — |
| 3 | `plant-growth` | highlight | `journeyTab` | `CenteredTabBar` |
| 4 | `consistency` | highlight | `waterDrop` | `GardenScreen` |
| 5 | `completion` | centered | — | — |

Goal save advances step 2 via `notifyUserAction("goalCreationFlow")` in `AddGoalScreen`.

---

# Recommended Implementation Roadmap (Complete)

---

# Phase 1 — Foundation

Goals:
- Navigation setup
- Tutorial state architecture
- AsyncStorage persistence
- Basic onboarding provider

Deliverables:
- Tutorial context/store
- Step definitions
- Completion persistence

---

# Phase 2 — Overlay System

Goals:
- Background dimming
- Highlight cutout
- Target measurement
- Responsive positioning

Deliverables:
- TutorialOverlay
- HighlightTarget system

QA focus:
- Accurate positioning
- Multiple screen sizes

---

# Phase 3 — Tutorial Card

Goals:
- Reusable instructional card
- Arrow positioning
- Dynamic placement

Deliverables:
- TutorialCard component

QA focus:
- No overflow
- Responsive behavior

---

# Phase 4 — Step System

Goals:
- Define onboarding step configuration
- Navigation between steps
- Progress tracking

Deliverables:
- Step engine
- Progress indicator

---

# Phase 5 — Welcome Flow

Goals:
- Build initial centered welcome modal
- Add animations
- Add CTA behavior

Deliverables:
- Welcome tutorial experience

---

# Phase 6 — Goal Creation Guidance

Goals:
- Highlight Add Goal button or FAB (based on existing goals)
- Optional goal creation with Skip for now
- Silent Add Goal step (no overlay during form)

Deliverables:
- Dynamic target tracking
- `returnToGoalCreationChoice` on back navigation

QA focus:
- Correct positioning during navigation changes
- Form controls not covered by tutorial UI

---

# Phase 7 — Journey / Plant Education

Goals:
- Explain plant stages
- Explain consistency/watering

Deliverables:
- Educational overlays
- Contextual guidance

---

# Phase 8 — Completion

Goals:
- Completion congratulations card (no trophy image on card)
- One-time `tutorialAwardGranted` persistence
- Tutorial exit via **Done**

Deliverables:
- `TutorialCompletionCard`
- AsyncStorage save

---

# Phase 9 — Polish & QA

Goals:
- Animation polish
- Edge case handling
- Device testing
- Accessibility improvements

Deliverables:
- Production-ready onboarding flow

---

# Cursor Implementation Guidance

When modifying tutorial code:
- Stay scoped to `tutorial/`, `components/tutorial/`, `contexts/TutorialContext.js`, and screen integrations (`GoalsScreen`, `AddGoalScreen`, `GardenScreen`, `CenteredTabBar`, `SettingsScreen`, `App.js`)
- Avoid broad refactors unless explicitly requested
- Preserve component modularity and shared styles in `tutorialStyles.js`
- Update this document when behavior changes

Before changing tutorial behavior:
1. Read this document and `tutorial/steps.js`
2. Review wireframes in `/wireframes` for visual intent
3. Maintain responsive behavior and safe-area handling
4. Run through the QA checklist at the bottom

---

# Design Direction

Visual tone:
- Calm
- Encouraging
- Clean
- Soft shadows
- Rounded corners
- Gentle greens
- Nature-inspired

Avoid:
- Heavy gradients
- Loud animations
- Excessive UI density

---

# Future Expansion Considerations

Architecture should support:
- Additional tutorial flows
- Feature walkthroughs
- Achievement onboarding (award flag exists; UI hook-up TBD)
- Contextual tooltips
- A/B onboarding experiments

Already implemented:
- Settings replay (`replayTutorial` in Help section)

Design implementation with extensibility in mind.

---

# Post-Completion Cleanup — Tutorial Dev Tools Removed

Dev-only tutorial testing helpers have been removed. Users can replay the tutorial from Settings.

## Removed

- `tutorial/devConfig.js`
- `components/tutorial/TutorialDevPanel.js`
- `previewTutorial`, `devPreviewRef`, and dev-only skip-persist logic in `TutorialContext`
- **Developer** section in Settings with **Preview onboarding tutorial**

## User-facing replay

### `contexts/TutorialContext.js`

- `replayTutorial()` clears completed/skipped onboarding flags (not `tutorialAwardGranted`) and restarts from the welcome step

### `screens/SettingsScreen.js`

- **Help** section with **Replay Tutorial** — resets onboarding and returns to the app with the welcome card

## Verify before release

- [ ] No **Developer** section in Settings
- [ ] No `devConfig` or `TutorialDevPanel` imports remain
- [ ] Tutorial waits until Enter screen is dismissed
- [ ] Tutorial auto-starts only for first-time authenticated users who have not completed/skipped
- [ ] Users with existing goals see FAB highlight (not empty-state button)
- [ ] Optional goal hint appears only on Step 2 card, not during Add Goal form
- [ ] **Skip for now** jumps to plant-growth; **Skip** exits tutorial entirely
- [ ] Back from Add Goal (UI + hardware) returns to Step 2 decision card
- [ ] **Replay Tutorial** in Settings restarts from welcome
- [ ] Completing or skipping tutorial persists correctly in AsyncStorage
- [ ] Replay does not re-grant `tutorialAwardGranted`
- [ ] Completion card shows congratulations only (no trophy image)

## Known limitations

- Tutorial progress is not persisted mid-flow — app restart during tutorial returns to welcome
- `goals.length > 0` is a coarse signal for existing goals; storage-page-only goals rely on `GoalsScreen` visible count for final accuracy
- Highlight touch panels use rectangular hit areas while the visual SVG cutout is rounded (minor corner tap differences)
- Steps with `requiresUserAction: false` can be advanced via **Next** without interacting with the highlighted element (e.g. Journey tab, water drop)