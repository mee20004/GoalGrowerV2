# GoalGrower Tutorial / Onboarding System

## Overview

This document defines the architecture, UX behavior, implementation roadmap, and QA expectations for the GoalGrower onboarding/tutorial system.

The onboarding flow introduces first-time users to:
1. The GoalGrower concept
2. Creating their first goal
3. Understanding plant growth progression
4. Staying consistent
5. Completing the tutorial and earning their first trophy

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

## Step 2 — Highlight Add Goal Button

Highlight:
- Floating action button ("+ Add Goal")

Behavior:
- Background darkens
- Add Goal button remains illuminated
- Tutorial card hovers near highlighted button
- Progress bar visible but subtle

Instruction:
Guide user to create their first goal.

User action required:
- Tap Add Goal button

---

## Step 3 — Goal Creation Guidance

Tutorial remains active during:
- Goal creation flow
- Plant selection
- Schedule selection


Focus areas should dynamically reposition.

---

## Step 4 — Plant Growth Explanation

Navigate to Journey/Garden screen.

Highlight:
- Plant growth area

Instruction:
Explain:
- Plants grow as goals progress
- Multiple growth stages exist

Tutorial card should point toward plant progression area.

---

## Step 5 — Consistency / Watering Explanation

Highlight:
- Plant health/watering area

Instruction:
Explain:
- Missing goals causes wilting
- Consistency keeps plants healthy

Use side-by-side healthy/wilted plant visuals.

---

## Step 6 — Completion / Reward

Centered completion card.

No highlighted element.

Show:
- Trophy reward
- Positive reinforcement
- "End Tutorial" button

Tutorial completion should:
- Persist in storage
- Never automatically show again

---

# Technical Requirements

## Architecture Requirements

DO NOT implement entire tutorial in one component.

Use modular architecture.


---

# Required Components

## Overlay System

### TutorialOverlay
Responsible for:
- Background dimming
- Highlight cutout
- Animated transitions

Requirements:
- Supports highlighted target rectangles
- Supports centered mode
- Supports responsive recalculation
- Handles orientation changes

---

## TutorialCard

Reusable floating instructional card.

Supports:
- Title
- Description
- Optional image
- Skip button
- Next button
- Arrow/pointer direction

Must:
- Auto-position relative to target
- Avoid off-screen rendering
- Adapt to smaller screens

---

## HighlightTarget

System for:
- Measuring target element position
- Tracking layout changes
- Recalculating overlay placement

Use:
- `measureInWindow`
OR
- `onLayout`

---

## Progress Indicator

Requirements:
- Minimal/subtle
- Non-dominant
- Animated progression
- Responsive width

Avoid:
- Large onboarding headers
- Oversized step indicators

---

# State Management Requirements

Tutorial state should support:
- Current step
- Completion state
- Skip state
- Dynamic positioning
- Target refs


Avoid:
- Excessive prop drilling

---

# Persistence Requirements

Persist:
- onboardingCompleted

Use:
- AsyncStorage

Behavior:
- Tutorial only shown first launch
- Can later be reset from settings (future-ready architecture)

---

## Authentication / Entry Flow Requirement

For now, onboarding scope is limited to first-time authenticated users only.

The onboarding tutorial must only begin after:

- a user has created an account
- the user has logged in
- authentication and initialization are fully resolved

The tutorial should start on the first screen shown immediately after successful login.

The tutorial must NOT appear:

- during authentication loading
- before app initialization completes
- before navigation state is ready
- for guest mode (out of scope for this pass)

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
- Remain fully visible
- Visually elevated
- Feel illuminated/focused

Recommended techniques:
- Transparent cutout
- Glow/shadow
- Slight scale emphasis

Avoid:
- Harsh neon glow
- Excessive blur

---

# Animation Requirements

Animations should feel:
- Smooth
- Calm
- Modern

Recommended:
- Reanimated
- Fade transitions
- Gentle spring motion

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
- Skip tutorial option

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
- Next buttons work correctly
- Skip works correctly
- Overlay blocks unintended interactions
- Highlighted element remains interactable when intended

---

## State QA
- Tutorial persists correctly
- Completion saves correctly
- App relaunch bypasses onboarding after completion
- Tutorial step order remains stable

---

## Performance QA
- No dropped frames
- No excessive rerenders
- No layout flickering
- Overlay transitions remain smooth

---

# Recommended Implementation Roadmap

IMPORTANT:
Implement incrementally.
DO NOT attempt full implementation in one pass.

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
- Highlight Add Goal button
- Attach overlay to UI targets
- Guide creation flow

Deliverables:
- Dynamic target tracking

QA focus:
- Correct positioning during navigation changes

---

# Phase 7 — Journey / Plant Education

Goals:
- Explain plant stages
- Explain consistency/watering

Deliverables:
- Educational overlays
- Contextual guidance

---

# Phase 8 — Completion Reward

Goals:
- Trophy reward experience
- Completion persistence
- Tutorial exit

Deliverables:
- Completion screen
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

IMPORTANT FOR CURSOR:

When modifying files:
- Only modify files relevant to the current phase
- Avoid broad refactors unless explicitly requested
- Preserve component modularity
- Avoid duplicate styling logic
- Prefer reusable abstractions

Before implementing:
1. Read this entire document
2. Review wireframes in `/wireframes`
3. Follow the current implementation phase only
4. Maintain responsive behavior throughout implementation

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
- Achievement onboarding
- Contextual tooltips
- Settings reset
- A/B onboarding experiments

Design implementation with extensibility in mind.

---

# Post-Completion Cleanup — Remove Dev Testing Tools

Before production release, remove all temporary dev-only tutorial testing helpers. These must not ship.

## Delete files

- `tutorial/devConfig.js`
- `components/tutorial/TutorialDevPanel.js`

## Remove references

### `contexts/TutorialContext.js`

- Remove `DEV_TUTORIAL_TOOLS_ENABLED` import from `tutorial/devConfig`
- Remove `TutorialDevPanel` import and render
- Remove `devPreviewRef` and `previewTutorial`
- Remove dev-only skip-persist logic inside `completeTutorial` and `skipTutorial`

### `screens/SettingsScreen.js`

- Remove `useTutorial` import (if unused elsewhere on that screen)
- Remove the entire `{__DEV__ ? ( ... ) : null}` **Developer** block with **Preview onboarding tutorial**

## Verify before release

- [ ] No **Developer** section in Settings
- [ ] No `devConfig` or `TutorialDevPanel` imports remain
- [ ] Tutorial only runs for real first-time authenticated users
- [ ] Completing or skipping tutorial persists correctly in AsyncStorage

