# Dissio Product Direction, Reliability, and Experience Roadmap

> **Status:** Living product and engineering direction document  
> **Intended location:** Repository root  
> **Primary use:** Reference this file in future implementation prompts one phase at a time  
> **Product:** Dissio, an AI practice and feedback platform for Public Forum debate  
> **Last updated:** July 2026

---

## 1. Purpose of This Document

This document defines an ambitious but executable direction for Dissio across:

- Product reliability
- Analysis pipeline correctness
- Loading performance
- Homepage design and motion
- Application visual design
- Dashboard and report usability
- Tournament Preparation
- Judge Adaptation
- Full Round simulation
- Multiplayer practice
- AI speech and audio systems
- Accessibility
- Testing
- Observability
- Security
- Cost control
- Long-term product differentiation

It is deliberately broader than a single implementation pass.

Future development should reference one bounded phase or section at a time. The goal is to prevent disconnected redesigns, rushed feature additions, duplicated systems, and “vibe-coded” implementation that looks impressive in isolation but fails under real use.

The core standard is:

> Dissio should feel visually distinctive, debate-native, fast, reliable, and educational. Every feature should help a student understand what happened, what mattered, and what to practice next.

---

# 2. Product Vision

## 2.1 Core product promise

Dissio turns a practice speech or round into:

1. A transcript
2. A debate flow
3. A judge-style ballot
4. A diagnosis of the exact weakness
5. A targeted drill
6. A re-recording loop
7. Measurable improvement over time

The core loop is:

```text
Practice
→ Analyze
→ Understand
→ Drill
→ Re-record
→ Improve
```

Dissio should not primarily generate cases for students.

It should help students:

- Practice more effectively
- Understand why an argument succeeds or fails
- Adapt to different judges
- Use evidence correctly
- Improve through repeated, targeted reps
- Work with partners and coaches
- Prepare for tournaments with clearer structure

## 2.2 Long-term positioning

Dissio should become:

> The AI practice infrastructure for speech and debate teams.

It should serve as an assistant coach between practices, not a replacement for human coaches.

Its strongest defensible advantages should be:

- Debate-native speech analysis
- Flow-first feedback
- Exact warrant, extension, drop, and weighing diagnosis
- Judge-perspective simulation
- Evidence integrity and provenance
- Personalized drills derived from real mistakes
- Re-recording and improvement measurement
- Partner and team workflows
- Full-round simulation
- Tournament readiness intelligence

## 2.3 Target users

### Primary

- Novice and JV Public Forum debaters
- Middle school debaters
- Students without consistent coaching
- Students at small schools
- Students preparing independently
- New club members
- Students practicing before tournaments

### Secondary

- Debate partners
- Club captains
- Coaches
- School teams
- Camps
- Speech and debate nonprofits

### Later expansion

- Lincoln-Douglas
- Congressional Debate
- Extemporaneous Speaking
- Original Oratory
- Impromptu
- Other structured speaking events

Public Forum should remain the center of product quality until its core workflows are excellent.

---

# 3. Non-Negotiable Product Principles

## 3.1 Specific beats generic

Bad feedback:

> Your reasoning needs improvement.

Good feedback:

> Your summary extends the infrastructure impact but drops the warrant connecting investment to long-run growth. A flow judge may not evaluate the impact without that internal link.

## 3.2 Every diagnosis should lead to action

A weakness is incomplete until Dissio provides:

- What went wrong
- Why it matters
- How a judge may interpret it
- A drill
- Success criteria
- A chance to try again
- A comparison against the earlier attempt

## 3.3 Debate-native, novice-readable

Dissio should use real debate language:

- Claim
- Warrant
- Evidence
- Impact
- Link
- Internal link
- Extension
- Drop
- Frontline
- Weighing
- Collapse
- Voter
- Flow
- RFD

But novice mode should explain unfamiliar terms gently.

## 3.4 Evidence remains exact

Dissio must not silently rewrite, embellish, or fabricate source text.

The product must distinguish:

- Exact source text
- Student paraphrase
- AI interpretation
- AI coaching recommendation
- Unsupported claim
- Unverified source

## 3.5 Product truth before visual polish

A polished screen must never hide:

- A failed job
- Missing report artifacts
- Incomplete analysis
- Stale data
- Model timeout
- Unavailable backend
- Unverified evidence

## 3.6 Motion must explain

Animation should communicate:

- Sequence
- Causality
- Hierarchy
- Change
- Progress
- Comparison
- System state

Animation should not exist only to make the page feel expensive.

## 3.7 Reliability is part of design

Fast loading, truthful status, clear progress, retry behavior, and correct empty states are visual design responsibilities, not backend-only concerns.

## 3.8 One coherent design system

The homepage and application may use different light/dark balances, but they must clearly belong to the same product.

---

# 4. Current Product Problems

This section records the problems observed during manual product review.

## 4.1 Homepage hero scroll progression is unreliable

Observed behavior:

- A scroll gesture advances the purple progress bars.
- The visible hero remains on `01 / 04`.
- The user receives feedback that progress occurred even though the meaningful state did not change.
- The current scroll distance and stage thresholds are not aligned with human perception.
- The experience may be confusing to users who do not understand that the hero is a staged sequence.

Product impact:

- The first interaction appears broken.
- The homepage asks the user to learn a custom interaction before understanding the product.
- Visual polish creates less trust instead of more.

## 4.2 Homepage remains too visually restrained and generic

The current V3 is cleaner than earlier versions, but it lacks the distinctiveness, spatial depth, and captivating product storytelling expected from references such as:

- Linear
- Railway
- Sahara AI
- ZettaJoule

The problem is not simply “add more effects.”

The page needs:

- A stronger visual identity
- Larger product proof
- More intentional depth
- Better typography
- More expressive transitions
- Stronger interaction details
- A narrative rooted in Dissio’s product mechanics

## 4.3 Dashboard takes too long to become useful

Observed behavior:

- The application shell appears.
- The main dashboard remains a large skeleton for too long.
- The user cannot perform a useful action while the entire page waits.

Potential causes to audit:

- Sequential requests
- Backend cold start
- Repeated session resolution
- Slow Supabase queries
- Missing database indexes
- One large blocking endpoint
- Client-only fetching after hydration
- Duplicate requests
- One failed dependency holding the entire page in a loading state

## 4.4 Pasted-text analysis does not reliably complete

Observed behavior:

- Pasted text creates a visible practice rep.
- The transcript may exist.
- The expected analysis does not appear.
- No clear step-by-step model status is shown.
- The list may still label the session `Feedback ready`.

This suggests that paste may not share the same complete backend pipeline as recording and upload.

## 4.5 “Feedback ready” is not trustworthy

A session should not be marked ready merely because:

- A row exists
- A job ended
- A transcript exists
- One artifact was generated
- A stale status value says complete

Readiness must reflect validated artifact completeness.

## 4.6 Duplicate sidebar appears briefly

Observed behavior:

- A deep speech route briefly renders two full sidebars.
- Both include branding, search, navigation, and shell controls.
- The duplication disappears after loading.

Likely architectural causes:

- Nested app shells
- `loading.tsx` rendering a shell inside a persistent shell
- Client auth gating that temporarily nests layouts
- Duplicate route-group layouts
- A route fallback containing global navigation

## 4.7 Full Round setup lacks energy and immersion

The current setup page is a conventional form.

It does not yet communicate:

- Competition
- Team presence
- Live phases
- Prep strategy
- Opponent difficulty
- Voice selection
- Judge behavior
- Round flow
- Audio participation

## 4.8 Tournament Prep has a dead-end entry state

Observed behavior:

- The page contains mostly empty space.
- It instructs users to open Tournament Prep from Evidence Library.
- It does not provide a resolution selector, recent item, search, sample, or direct action.

The experience communicates that the feature is unfinished even if backend functionality exists elsewhere.

## 4.9 Judge Adaptation exposes internal implementation concepts

Observed behavior:

- Users must choose a source type.
- Users must enter a raw source ID.
- Judge selection uses prototype-like controls.
- The page does not show enough practical adaptation output.

Users should select real saved material, not know database identifiers.

## 4.10 Application pages feel visually disconnected from the homepage

The homepage is dark and cinematic.

The authenticated app is light, flat, and highly utilitarian.

A contrast between marketing and application is acceptable, but Dissio currently lacks enough shared visual grammar to make the transition feel intentional.

---

# 5. Research-Informed Experience Principles

The following principles synthesize current web platform guidance, the referenced products, and Dissio’s needs.

## 5.1 Borrow discipline, not surface imitation

Reference sites succeed because they have:

- A strong visual grammar
- Consistent spacing
- Controlled contrast
- Purposeful typography
- One idea per section
- Product-specific visuals
- Clear interaction hierarchy
- Motion that supports the narrative

Dissio should not copy:

- Linear’s exact gradients
- Railway’s exact cards
- Sahara AI’s exact animations
- ZettaJoule’s exact hero

Dissio should develop a visual language based on:

- Two sides
- The third view
- Argument structure
- Judge lenses
- Flow lines
- Evidence provenance
- Ballots
- Drills
- Improvement deltas

## 5.2 High visual contrast and dark aesthetics

Dark surfaces can create focus and cinematic depth, but pure black everywhere can become flat.

Use:

- Near-black background layers
- Subtle violet, amber, and cyan atmospheric light
- Soft elevation through luminance differences
- Restrained grid or flow textures
- Brighter focal regions
- Dim secondary navigation
- High text contrast

Avoid:

- Excessive glow
- Neon on every element
- Low-contrast gray text
- Decorative gradients with no functional meaning
- Multiple saturated colors competing in one viewport

## 5.3 Spatial depth and layered composition

Depth should come from:

- Overlapping surfaces
- Controlled perspective
- Soft parallax
- Foreground and background separation
- Glass layers used sparingly
- Occlusion
- Lighting
- Scale changes
- Focus and blur transitions

Depth should not come from:

- Random floating cards
- Constant 3D rotation
- Overly transparent text surfaces
- Heavy blur that reduces readability
- Many independent parallax layers moving at different speeds

## 5.4 Bespoke typography

Typography should communicate precision and debate seriousness.

Direction:

- Expressive display treatment for homepage headlines
- Highly readable UI type for application text
- Monospaced or technical accent style for labels, timestamps, stage names, and evidence metadata
- Tight but readable heading tracking
- Generous line height for feedback and evidence
- Strong numerical typography for scores and deltas

Typography must remain accessible and performant.

Do not introduce many font families.

## 5.5 Intentional motion

Use motion for:

- Hero chapter transitions
- Argument structure assembly
- Flow-line progression
- Judge lens changes
- Before/after comparison
- Button press feedback
- Card expansion
- Route continuity
- Processing progression
- State confirmation

Avoid:

- Animating every card on entry
- Long delays before content becomes readable
- Continuous motion behind long-form text
- Scroll hijacking across the whole page
- Layout-changing animation where transforms would work
- Large canvas effects that do not improve understanding

## 5.6 Micro-interactions and hover states

Buttons should have:

- Clear hover response
- Press depth
- Keyboard focus
- Loading state
- Disabled explanation where necessary
- Success confirmation

Cards should respond only when interactive.

Interactive diagrams should reveal useful context, not merely move.

## 5.7 Product proof over decoration

The most visually prominent sections should show:

- A real flow
- A real ballot
- A real diagnosis
- A real drill
- A real evidence card
- A real improvement comparison

Decorative illustrations should support these, not replace them.

## 5.8 Controlled bento layout

Bento grids can organize outputs such as:

- Flow
- Ballot
- Drill
- Judge views
- Evidence integrity

But they should not become a default layout for every section.

Use asymmetry intentionally.

One large product artifact should usually dominate each grid.

## 5.9 “Anti-vibe-coded” quality standard

Every screen should pass these questions:

- Is every element necessary?
- Does spacing follow a system?
- Are border radii consistent?
- Are colors semantic?
- Are loading states truthful?
- Are empty states useful?
- Are labels product language rather than developer language?
- Does every interaction work with keyboard?
- Does the screen still make sense without animation?
- Does the page look designed at every common viewport?
- Is sample data explicitly labeled?
- Is the feature real or merely represented?

## 5.10 Accessibility first

Accessibility should shape the design before implementation.

Required:

- Semantic landmarks
- Logical headings
- Visible focus
- Keyboard operation
- Reduced-motion mode
- Adequate contrast
- Touch targets
- Screen-reader status announcements
- Form instructions and error associations
- No information communicated by color alone
- No essential text inside canvas
- No trapped scrolling
- No forced timed interaction without accommodation

## 5.11 Performance is a visual feature

Performance goals:

- Fast shell
- Stable layout
- Immediate primary action
- Progressive content
- Minimal blocking JavaScript
- Lazy expensive visuals
- On-demand 3D rendering
- Transform/opacity-based animation
- No indefinite skeletons

Core Web Vitals should be monitored in production.

Target “good” ranges:

- LCP: at or below 2.5 seconds
- INP: at or below 200 milliseconds
- CLS: at or below 0.1

---

# 6. Dissio Visual System: “The Argument Instrument”

## 6.1 Design concept

Dissio should feel like an analytical instrument that reveals hidden argument structure.

It should combine:

- Editorial confidence
- Technical precision
- Competitive energy
- Educational clarity
- Evidence integrity

The interface should feel more like a high-quality analysis environment than a generic AI assistant.

## 6.2 Semantic color system

### Violet

Meaning:

- Student speech
- Practice
- Active action
- Primary brand
- Selected path

### Amber

Meaning:

- Opposition
- Challenge
- Risk
- Unresolved counterargument
- Coach emphasis

### Cyan

Meaning:

- Analysis
- Judge perspective
- The third view
- System insight
- Flow connection

### Green

Meaning:

- Verified evidence
- Completed artifact
- Improvement
- Successful drill
- Readiness

### Red

Meaning:

- Failed job
- Unsupported claim
- Missing required artifact
- Contradiction
- Critical warning

### Neutral surfaces

Use a carefully calibrated grayscale with:

- Distinct canvas
- Panel
- Raised panel
- Border
- Muted text
- Primary text

Do not use all semantic colors in every screen.

## 6.3 Core visual motifs

Reusable motifs:

- Three-node Dissio mark
- Two opposing lanes
- Central analytical lens
- Claim → warrant → evidence → impact chain
- Flow lines
- Evidence provenance markers
- Ballot stamps
- Skill deltas
- Timeline phases
- Prep allocation meters
- Judge lens selector
- Before/after overlays

## 6.4 Surface styles

### Marketing

- Dark
- High contrast
- Spatial
- Cinematic
- Larger typography
- Controlled motion

### Authenticated application

- Primarily light or adaptive
- Dense but calm
- Strong readability
- Dark analytical canvases where useful
- Softer separators
- Compact controls
- Stable layout

### Focus modes

Full Round, live analysis, and evidence inspection may use darker immersive surfaces.

## 6.5 Tokens to formalize

Create shared tokens for:

- Color
- Spacing
- Radius
- Border
- Shadow
- Blur
- Type scale
- Motion duration
- Motion easing
- Z-index
- Container width
- Focus rings
- Skeleton behavior

Avoid hardcoded one-off values.

---

# 7. Homepage V4 Direction

## 7.1 Homepage purpose

The homepage must answer within five seconds:

1. What is Dissio?
2. Who is it for?
3. What does it produce?
4. Why is it different?
5. What should the visitor do next?

## 7.2 Hero concept

Core message:

> Every argument has two sides. Dissio shows you the third.

The initial viewport should already be complete and comprehensible.

It should contain:

- Strong headline
- Concise product explanation
- Primary CTA
- Secondary product preview action
- One large argument visualization
- Minimal navigation
- Clear Public Forum positioning

## 7.3 Hero visual: Argument Prism

The main hero visual should show:

- PRO entering from one side
- CON entering from the other
- A central analytical layer
- Connections between claims, warrants, evidence, and impacts
- A judge lens that identifies what either side misses
- A final transition into a drill or next move

Implementation options:

- SVG and CSS first
- Motion for state transitions
- Optional R3F layer only if it provides meaningful depth
- Real DOM text at all times
- Static fallback when WebGL is unavailable

## 7.4 Hero chapter sequence

The hero should have four real narrative chapters.

### Chapter 1: Two sides

Visual:

- Large PRO and CON structures
- Clear opposition
- One resolution
- Strong visual balance

Message:

> Every argument has two sides.

### Chapter 2: Argument anatomy

Visual:

- Claim
- Warrant
- Evidence
- Impact
- Missing or weak internal link

Message:

> Dissio separates the argument into what a judge actually evaluates.

### Chapter 3: The third view

Visual:

- Judge lens
- Lay, flow, technical, or coach perspective
- A concrete issue surfaced

Message:

> The same speech can resolve differently depending on the judge.

### Chapter 4: Exact next move

Visual:

- Flow
- Ballot
- Targeted drill
- Before/after delta

Message:

> Dissio does not stop at feedback. It tells you what to practice next.

## 7.5 Scrolling architecture

### Product requirement

One intentional scroll gesture should advance one meaningful hero chapter.

This must not be interpreted as one raw browser `wheel` event.

Trackpads generate multiple wheel events with momentum. The implementation must respond to completed user intent, not individual event packets.

### Preferred structure

Use four actual document sections.

Within the hero sequence:

- `scroll-snap-type`
- `scroll-snap-align`
- `scroll-snap-stop: always`
- Correct `scroll-padding-top`
- Real section anchors
- Active state derived from selected snap target or intersection state
- Progress derived from chapter index, not raw page distance

### Gesture handling

Only if native snapping is insufficient:

- Accumulate wheel delta
- Detect direction
- Require a minimum intent threshold
- Advance one chapter
- Lock chapter changes briefly until settling
- Preserve normal browser scrolling
- Release control after the final hero chapter
- Never trap keyboard, touch, or assistive users

### Navigation methods to test

- Mac trackpad slow swipe
- Mac trackpad momentum swipe
- Mouse wheel
- Arrow keys
- Page Up and Page Down
- Space and Shift+Space
- Scrollbar dragging
- Touch scrolling
- Anchor navigation
- Browser back/forward
- Refresh while inside a chapter

### Progress indicator rule

The indicator may only advance when:

- A new chapter is selected, or
- A visible intra-chapter transformation clearly changes

It must never imply meaningful progress while the visible composition remains unchanged.

## 7.6 Post-hero page structure

Recommended order:

1. Hero chapters
2. Real product report preview
3. One speech, four outputs
4. Before/after improvement
5. Evidence integrity
6. Student and coach paths
7. Final CTA

Each section should communicate one primary idea.

## 7.7 Navbar direction

Create a slim floating navigation rail.

Include:

- Three-node Dissio mark
- Dissio wordmark
- How it works
- Improvement
- Evidence
- For coaches
- Sign in
- Start practicing

Behavior:

- Subtle translucent depth
- Muted inactive links
- Strong visible focus
- Active-section indicator
- Integrated progress trace
- Compact after scroll
- Mobile menu with clear hierarchy
- No oversized generic capsule

## 7.8 Motion stack

Use the smallest appropriate tool.

### CSS

Use for:

- Hover
- Focus
- Simple transitions
- Snap behavior
- Reduced-motion fallback
- Small ambient effects

### Motion

Use for:

- Shared layout transitions
- Button feedback
- Card expansion
- In-view reveals
- Scroll-linked transforms
- Crossfades

### GSAP

Use only for:

- A complex, deterministic timeline
- A transformation that is difficult to express with Motion
- Carefully scoped sequences

### React Three Fiber / Three.js

Use only when:

- The scene meaningfully explains the third-view concept
- It has a static fallback
- It uses on-demand rendering where possible
- It does not block LCP
- It remains readable without the canvas
- It performs acceptably on midrange hardware

### Do not add by default

- Another smooth-scroll framework
- Spline
- Babylon.js
- Multiple competing animation systems
- Large external models
- Heavy post-processing

## 7.9 Homepage release gates

The homepage is not ready until:

- All four hero chapters are visibly different.
- One intentional gesture reaches the next chapter.
- No progress moves without visible change.
- A user can skip the sequence.
- Keyboard navigation works.
- Reduced-motion mode remains complete.
- WebGL failure does not remove meaning.
- Mobile uses a simpler stacked story.
- No horizontal overflow occurs.
- LCP, INP, and CLS meet goals.
- The page has no invented testimonials or usage claims.
- Every CTA reaches a working destination.
- Every section uses real or clearly labeled sample product artifacts.

---

# 8. Application Shell and Navigation Redesign

## 8.1 Goal

The application shell should feel:

- Fast
- Quiet
- Predictable
- Focused
- Professional
- Debate-specific

## 8.2 Information architecture

Recommended sidebar organization:

### Practice

- Home
- New Practice
- Full Round

### Improve

- Drills
- Progress
- Training

### Research

- Evidence Studio
- Library
- Tournament Prep

### Team

- Team
- Coach Tools

### Resources

- Feedback
- Help
- Product status where appropriate

Judge Adaptation may live within Practice or Tournament Prep rather than permanently occupying a major top-level slot.

## 8.3 Shell behavior

- One persistent authenticated shell
- Content-only route loading states
- Stable sidebar width
- Stable header height
- No layout shift
- Clear active navigation
- Fast route transitions
- Search available but not visually dominant
- Keyboard command access
- Mobile bottom or drawer navigation

## 8.4 Duplicate-sidebar fix

Required route structure:

```text
AuthenticatedLayout
├── AppSidebar
├── AppHeader
└── RouteContent
    ├── page
    ├── loading
    └── error
```

Rules:

- `loading.tsx` must not render `AppShell`.
- Nested layouts must not repeat the global sidebar.
- Auth fallback must not wrap an already authenticated shell.
- Deep links must render one shell.
- Suspense fallbacks should represent route content only.

Automated assertions:

- Exactly one navigation landmark
- Exactly one primary sidebar
- Exactly one Dissio app logo
- Exactly one global search
- Exactly one mobile navigation
- No duplicate shell during navigation or refresh

---

# 9. Dashboard Performance and Experience

## 9.1 Performance objective

The dashboard must become useful quickly, even if secondary data is still loading.

## 9.2 Instrumentation before optimization

Measure:

- Session resolution duration
- Backend readiness duration
- Dashboard summary query
- Recent speech query
- Skill metrics query
- Team query
- Onboarding query
- Database execution time
- Network duration
- Hydration duration
- Time to first useful card
- Time to complete dashboard

Use correlation IDs across frontend, backend, and job logs.

## 9.3 Data-loading architecture

Choose one or a hybrid:

### Option A: Summary endpoint

One optimized endpoint returns first-viewport dashboard data.

Advantages:

- Fewer round trips
- Easier performance monitoring
- Stable first render

### Option B: Parallel server components

Independent components fetch in parallel and stream through Suspense.

Advantages:

- Partial success
- Independent caching
- Progressive display

### Recommended

Use a small first-viewport summary plus independently streamed secondary sections.

## 9.4 First viewport priority

Render first:

- Greeting or current context
- Primary “continue” action
- Next recommended practice
- Most recent speech
- One key progress signal

Load later:

- Full history
- Detailed charts
- Team aggregates
- Long-term analytics
- Secondary recommendations

## 9.5 Loading design

Do not show one full-page skeleton.

Use:

- Immediate shell
- Immediate page heading
- Small local skeletons
- Stable component dimensions
- Useful cached content while revalidating
- Explicit retry after timeout
- Partial failure states

## 9.6 Caching and prefetching

Potential strategies:

- Prefetch dashboard after sign-in
- Prefetch on CTA hover/focus
- Cache safe summary data
- Revalidate in background
- Avoid refetching unchanged profile/team data
- Deduplicate identical requests
- Use server-side session resolution where possible
- Preconnect to required origins where justified

## 9.7 Performance budgets

Suggested budgets:

- Shell visible: under 500 ms when warm
- First useful dashboard content: under 1 second when warm
- Full normal dashboard: under 2–2.5 seconds when warm
- No skeleton beyond a defined timeout
- No repeated auth request waterfall
- No duplicate dashboard request on hydration
- No large chart bundle in initial route unless visible

## 9.8 Dashboard visual redesign

Use the “Argument Instrument” system.

First screen:

- Clear next action
- Current training focus
- Recent analysis
- Visible progress
- Small system status only when relevant

Avoid:

- Too many equal cards
- Empty dashboard chrome
- Decorative metrics
- Charts without interpretation
- Dense text walls

---

# 10. Unified Speech Submission and Analysis Pipeline

## 10.1 Product requirement

Record, upload, and paste must enter the same canonical analysis pipeline.

The only difference should be input preparation.

## 10.2 Ingestion paths

### Record

```text
Browser recording
→ audio validation
→ storage
→ transcription
→ canonical analysis
```

### Upload

```text
File validation
→ storage
→ transcription
→ canonical analysis
```

### Paste

```text
Text validation
→ normalization
→ canonical analysis
```

## 10.3 Canonical analysis state machine

```text
accepted
→ preparing_input
→ transcribing
→ normalizing
→ segmenting
→ extracting_arguments
→ building_flow
→ evaluating_judges
→ generating_ballot
→ generating_drills
→ validating_artifacts
→ ready
```

`transcribing` is skipped for pasted text.

Required terminal states:

```text
ready
failed
cancelled
expired
```

Required retry states may include:

```text
retrying_stage
awaiting_provider
rate_limited
```

## 10.4 Data model direction

### `speech_submissions`

- id
- user_id
- input_mode
- speech_type
- event_type
- topic
- side
- judge_type
- audio_url
- pasted_text
- created_at

### `analysis_jobs`

- id
- speech_id
- status
- current_stage
- progress_version
- attempt_count
- error_code
- error_message_safe
- correlation_id
- started_at
- updated_at
- completed_at

### `analysis_stage_events`

- id
- job_id
- stage
- status
- started_at
- completed_at
- provider
- metadata_safe

### `analysis_artifacts`

- job_id
- transcript_ready
- argument_map_ready
- flow_ready
- feedback_ready
- ballot_ready
- drills_ready
- validation_ready
- artifact_version

## 10.5 Correct readiness semantics

Display `Feedback ready` only when all required artifacts exist and validate.

For a normal practice analysis:

- Transcript
- Argument map
- Flow
- Feedback
- Ballot/RFD
- Drills
- Validation success

A broad job status is not sufficient.

## 10.6 Processing experience

Immediately after submission, show a processing workspace.

Display:

- Current stage
- Completed stages
- Human-readable explanation
- Elapsed time
- Whether the user may leave safely
- Retry or failure state
- Background completion notification
- Correlation/reference code for support

Example stages:

### Preparing input

> Validating your speech and practice settings.

### Transcribing

> Converting audio into a timestamped transcript.

### Extracting arguments

> Identifying claims, warrants, evidence, impacts, and responses.

### Building flow

> Mapping how the argument develops across the speech.

### Comparing judges

> Evaluating how lay, flow, technical, and coaching judges may interpret the speech.

### Generating ballot

> Writing a reason for decision and prioritizing the issues that mattered most.

### Creating drills

> Turning your highest-impact weakness into targeted practice.

### Validating

> Checking that every report section is present and internally consistent.

Do not show fake precision percentages.

## 10.7 Polling and realtime

Use:

- Existing job polling with backoff, or
- Supabase Realtime for stage updates

Requirements:

- No duplicate polling loops
- Stop when terminal
- Resume after refresh
- Recover after temporary disconnect
- Respect rate limits
- Keep server state authoritative

## 10.8 Failure handling

Every stage should produce:

- Stable error code
- Safe user message
- Retry eligibility
- Logged provider detail
- Correlation ID
- Cleanup behavior

Examples:

- Audio invalid
- Transcription failed
- Model timeout
- Structured output invalid
- Evidence validation failed
- Partial artifact generation
- User deleted speech
- Storage unavailable
- Rate limit
- Backend unavailable

## 10.9 Test matrix

Test all three input modes for:

- Normal success
- Short input
- Empty input
- Very long input
- Unsupported format
- Transcription failure
- Model timeout
- Partial generation
- Structured-output failure
- Refresh during processing
- Leave and return
- Duplicate submit
- Retry
- Cancel
- Delete
- Backend cold start
- Auth expiration
- Network loss
- Multiple simultaneous jobs

---

# 11. Speech List, Report, and Processing Redesign

## 11.1 Speech list

Each item should show:

- Title
- Speech type
- Side
- Judge mode
- Topic
- Date
- Real current status
- Primary next action
- Menu

Status examples:

- Preparing
- Transcribing
- Analyzing arguments
- Generating ballot
- Creating drills
- Ready
- Needs retry
- Failed
- Cancelled

Do not use green readiness styling unless the report is complete.

## 11.2 Report architecture

Recommended sections:

1. Overview
2. Ballot
3. Skills
4. Transcript
5. Flow
6. Drills
7. Evidence/provenance where relevant

The report should answer:

- What happened?
- Why did the judge decide this way?
- What was the strongest offense?
- What was missing?
- What should the student practice?
- How does this compare with earlier attempts?

## 11.3 Visual hierarchy

- One primary diagnosis
- One recommended next move
- Supporting evidence
- Expandable detail
- Clear distinction between quoted speech and AI analysis
- Clear distinction between source evidence and AI coaching

## 11.4 Skeleton and fallback behavior

The report route should not render a duplicate shell.

It should show:

- Content skeleton only
- Current job stage if still processing
- Partial artifacts only if clearly labeled
- Retry when terminal failure occurs
- Never an empty report marked ready

---

# 12. Tournament Prep

## 12.1 Product goal

Tournament Prep should transform saved research and known weaknesses into a structured preparation plan for a specific resolution and upcoming event.

## 12.2 Entry experience

The page should never be a dead end.

Offer:

- Select a saved resolution
- Search Evidence Library
- Create a new resolution
- Continue recent preparation
- Open a sample workspace
- Import starter materials

## 12.3 Workspace modules

### Resolution overview

- Exact resolution
- Tournament/date
- Side readiness
- Partner assignment
- Research status

### Argument map

- PRO and CON positions
- Core contentions
- Common responses
- Likely clash points
- Unanswered arguments

### Evidence coverage

- Cards by issue
- Source quality
- Recency
- Provenance completeness
- Missing citations
- Weak support
- Contradictory evidence

### Frontline readiness

- Expected responses
- Available frontlines
- Missing blocks
- Cross-application opportunities
- Collapse strategy

### Speech preparation

- Constructive coverage
- Rebuttal blocks
- Summary extensions
- Final focus voters
- Crossfire questions

### Opponent simulation

- Common novice strategy
- Common varsity strategy
- Evidence-heavy strategy
- Framework-heavy strategy
- Lay adaptation
- Flow adaptation

### Workout plan

- Daily drills
- Partner drills
- Timed speeches
- Judge adaptation
- Evidence recall
- Frontline recall
- Weighing reps

### Readiness

Readiness should derive from concrete coverage:

- Argument coverage
- Evidence coverage
- Frontline coverage
- Speech practice
- Partner coordination
- Judge adaptation
- Full-round reps

Do not display a vague score without an explanation.

## 12.4 Functional testing

Verify:

- New resolution
- Existing resolution
- Empty library
- Large library
- Missing cards
- Deleted card
- Partner team
- Solo user
- Route refresh
- Export
- Assignment
- RLS ownership
- Coach access
- Readiness recalculation

---

# 13. Judge Adaptation

## 13.1 Product goal

Judge Adaptation should teach students how to present the same truthful argument differently for different audiences.

It must never alter what evidence says.

## 13.2 Replace raw source IDs

Users should select from a real material picker:

- Evidence card
- Saved argument
- Speech excerpt
- Frontline
- Summary extension
- Final focus voter

The picker should support:

- Search
- Recent materials
- Resolution filtering
- Side filtering
- Preview
- Provenance

## 13.3 Judge profiles

### Lay judge

Prioritizes:

- Clarity
- Story
- Real-world consequence
- Accessible explanation
- Persuasive framing

### Parent judge

Prioritizes:

- Common-sense reasoning
- Professional tone
- Clear comparison
- Low jargon
- Concrete examples

### Flow judge

Prioritizes:

- Extension
- Line-by-line clash
- Drops
- Weighing
- Speech-to-speech consistency

### Technical judge

Prioritizes:

- Precise argument resolution
- Concessions
- Standards
- Comparative warrants
- Minimal intervention

### Coach judge

Prioritizes:

- Skill development
- Strategic choices
- Improvement opportunities
- Repeated patterns
- Educational clarity

## 13.4 Adaptation workspace

Show:

- Original material
- Adapted delivery
- What changed
- What did not change
- Why the judge may respond differently
- Evidence integrity check
- Practice recording
- Adaptation score
- Feedback

## 13.5 Compare Judges view

Use one argument rendered for multiple judge types.

Compare:

- Opening sentence
- Warrant explanation
- Evidence presentation
- Impact framing
- Weighing
- Closing voter
- Recommended speed
- Technical vocabulary

## 13.6 Workouts

Generate judge-specific drills:

- Explain without jargon
- Add explicit line-by-line response
- Compare magnitude
- Explain probability
- Collapse to one voter
- Add a narrative example
- Preserve evidence while simplifying delivery

---

# 14. Full Round Simulation

## 14.1 Long-term ambition

Full Round should become a flagship Dissio experience.

It should simulate a complete Public Forum environment with:

- One or two human participants
- AI opposition
- Audio-first speeches
- Crossfire
- Shared prep
- Adjustable difficulty
- Adjustable AI voice
- Live flow
- Live judge
- End-of-round ballot
- Skill rating
- Partner coordination feedback

## 14.2 Implementation phases

### Phase A: Solo, turn-based

- One human
- AI opponent
- Prepared speech phases
- Saved flow
- AI text and audio
- End ballot
- No realtime crossfire

### Phase B: Solo with realtime crossfire

- Low-latency transcription
- AI voice response
- Interruption handling
- Crossfire timer
- Transcript and flow capture

### Phase C: Two authenticated partners

- Invite room
- Presence
- Shared prep
- Partner audio
- Ready state
- Turn ownership
- Reconnection

### Phase D: AI partner option

- User may practice with an AI teammate
- AI partner follows selected strategy
- User controls prep allocation and role

### Phase E: Human team versus human team

- Four human participants
- AI judge
- Optional coach observer
- Tournament-like room controls

## 14.3 Room architecture

### Supabase

Use for:

- Auth
- Room records
- Membership
- Invite codes
- Round state
- Evidence selection
- Prep allocation
- Persisted speeches
- Ballots
- RLS

### Supabase Presence

Use for:

- Who is connected
- Ready state
- Current role
- Reconnection state
- Observer presence

### Supabase Broadcast

Use for:

- Phase transition
- Ready signal
- Prep allocation
- Synchronized actions
- Lightweight room events

### WebRTC / LiveKit

Use for:

- Human audio
- AI audio participant
- Active speaker
- Reconnection
- Media tracks
- Optional recording

Do not use database row updates as the human audio transport.

## 14.4 Full Round data model direction

### `round_rooms`

- id
- resolution
- status
- format
- judge_type
- opponent_difficulty
- owner_id
- created_at
- started_at
- completed_at

### `round_participants`

- room_id
- user_id
- team
- role
- connection_state
- ready_state
- joined_at

### `round_phases`

- room_id
- phase_index
- phase_type
- speaker_role
- duration_seconds
- status
- started_at
- completed_at

### `round_turns`

- id
- room_id
- phase_id
- participant_type
- participant_id
- audio_url
- transcript
- structured_arguments
- created_at

### `round_prep_ledger`

- room_id
- team
- allocated_seconds
- used_seconds
- active_user_id
- event_log

### `round_flow_state`

- room_id
- version
- flow_json
- updated_at

### `round_ballots`

- room_id
- judge_profile
- winner_simulated
- human_score
- rfd
- skill_scores
- partner_feedback
- created_at

## 14.5 Lobby design

Replace a plain setup form with an immersive lobby.

Include:

- Resolution
- Side
- Speaker role
- Partner seats
- Invite link
- AI opponent identity
- Difficulty
- Voice
- Judge
- Evidence readiness
- Microphone test
- Audio output test
- Round format
- Accessibility settings
- Enter round

## 14.6 In-round interface

Layout:

- Central phase timeline
- PRO lane
- CON lane
- Current speaker spotlight
- Shared prep clocks
- Argument-flow minimap
- Partner presence
- AI voice visualization
- Judge note state
- Current phase
- Next phase
- Audio controls
- Reconnect indicator

The interface should be competitive, but not game-like at the cost of clarity.

## 14.7 Public Forum phase support

The engine should model the selected Public Forum structure accurately.

It should support configurable round formats rather than hardcoding one future-proof assumption.

The phase engine should define:

- Phase type
- Speaking side
- Speaker role
- Duration
- Prep availability
- Crossfire behavior
- Required inputs
- Transition rules

## 14.8 Prep time

Requirements:

- Shared team total
- Partner-visible ledger
- Start/stop controls
- Server-authoritative time
- Reconnection-safe
- Automatic end
- Warning states
- Phase lock after expiry
- Accessibility announcements
- No client-only timer authority

## 14.9 AI opponent generation

For every AI turn:

1. Retrieve resolution.
2. Retrieve approved evidence and constraints.
3. Retrieve prior speeches.
4. Retrieve current flow.
5. Identify live offense.
6. Identify dropped or answered arguments.
7. Select strategy based on difficulty.
8. Generate phase-appropriate speech.
9. Validate evidence use.
10. Validate time/length.
11. Generate audio.
12. Store transcript and structured flow update.

The AI must not pre-generate the entire round if it is expected to respond directly to humans.

## 14.10 Difficulty model

Difficulty should affect:

- Argument depth
- Response coverage
- Weighing
- Strategic collapse
- Judge adaptation
- Speaking rate
- Jargon
- Crossfire sharpness
- Realistic mistake rate
- Evidence recall
- Time management

Suggested levels:

### Novice

- Simple arguments
- Misses some responses
- Weak weighing
- Slower pace
- More explanation

### JV

- Standard clash
- Moderate depth
- Some strategic choices
- Consistent structure

### Varsity

- Strong line-by-line
- Strategic collapse
- Better weighing
- Faster adaptation

### Elite

- Deep comparative analysis
- Strong cross-application
- Judge-specific strategy
- Minimal obvious mistakes

The AI should remain bounded by evidence and round context.

## 14.11 Voice system

Provide:

- Multiple disclosed synthetic voices
- Rate control within safe limits
- Volume control
- Captions
- Replay where rules permit
- Visible AI-speaking state
- Audio fallback
- Text transcript after speech

For prepared speeches, favor a deterministic pipeline:

```text
Round reasoning
→ structured speech
→ validation
→ text-to-speech
```

For crossfire, use lower-latency realtime speech interaction.

## 14.12 Crossfire

Requirements:

- Low-latency transcription
- Voice activity detection
- Turn and interruption indicators
- Timer
- Captions
- Saved transcript
- Argument extraction after the exchange
- Graceful handling of overlap
- Microphone mute and recovery
- Network degradation behavior

## 14.13 AI judge

The judge should evaluate:

- Argument construction
- Responsiveness
- Evidence use
- Strategic choices
- Extensions
- Weighing
- Judge adaptation
- Partner coordination
- Prep efficiency
- Delivery

## 14.14 Scoring philosophy

Do not frame success only as “beat the AI.”

The AI is a training instrument.

Separate:

### Simulated ballot outcome

- PRO/CON decision
- RFD
- Voting issue

### Human performance score

Suggested 100-point system:

- 90–100: tournament-ready
- 80–89: strong winning-range performance
- 70–79: competitive
- 60–69: inconsistent
- Below 60: major unresolved weaknesses

The report should explain:

- What the human did well
- Which choices changed the round
- Which mistakes were decisive
- What to drill
- How the partner team coordinated
- How prep was used

---

# 15. Evidence Integrity and Evidence Studio

## 15.1 Core promise

The card stays exact.

The AI is labeled.

## 15.2 Required distinctions

Every evidence artifact should distinguish:

- Source text
- Highlighted quote
- Tagline
- AI coaching
- User notes
- Citation
- Provenance
- Confidence
- Verification status

## 15.3 Evidence UX

Improve:

- Search progress
- Source filtering
- Failure explanation
- Weak lead handling
- Exact quote display
- Citation details
- Saved-card readability
- Source trail
- Counterevidence
- Duplicate detection
- Export

## 15.4 Tournament integration

Evidence should flow into:

- Tournament Prep
- Full Round
- Judge Adaptation
- Frontline Trainer
- Blockfile
- Crossfire questions
- Speech analysis

## 15.5 Safety

Never:

- Invent a source
- Invent a quote
- Modify quoted text silently
- Present AI interpretation as quotation
- Hide source uncertainty
- Treat a search snippet as a verified card

---

# 16. Future Training Modes

## 16.1 Tournament Prep Workout Mode

Priority future feature.

Generate a training plan from:

- Upcoming tournament
- Resolution
- Side
- Weak skills
- Missing research
- Partner readiness
- Judge pool
- Time available

## 16.2 Blockfile / Frontline Trainer

Capabilities:

- Import arguments
- Build blocks
- Drill recall
- Practice responses
- Track missing answers
- Simulate opponent variants
- Evaluate strategic quality
- Link exact evidence

## 16.3 Judge Adaptation Simulator

Capabilities:

- Present one argument to different judge profiles
- Compare decisions
- Practice delivery
- Preserve evidence
- Track adaptation skill

## 16.4 Daily practice

- Short daily drill
- Calendar
- Streak
- Upcoming tournament plan
- Reminder
- Recommended next rep
- Coach assignment

## 16.5 Full-round progress

Track:

- Decision quality
- Flow coverage
- Drops
- Weighing
- Prep efficiency
- Partner coordination
- Judge adaptation
- Speech-to-speech consistency

## 16.6 Team intelligence

For coaches:

- Recurring weaknesses
- Student trends
- Team-wide argument gaps
- Drill completion
- Tournament readiness
- Evidence coverage
- Assignment
- Export
- Privacy controls

---

# 17. Accessibility Plan

## 17.1 Homepage

- Skip hero sequence
- Reduced-motion static version
- No required WebGL
- Real headings
- Real buttons
- Visible focus
- Keyboard chapters
- No scroll trap
- No color-only meaning

## 17.2 Application

- One navigation landmark
- Screen-reader route announcements
- Form field labels
- Inline errors
- Status live regions
- Accessible timers
- Table alternatives
- Captions
- Audio controls
- High contrast support
- Touch targets
- Logical tab order

## 17.3 Full Round

- Caption all AI audio
- Caption human audio when consented
- Announce phase changes
- Announce prep warnings
- Provide non-audio status
- Support keyboard round controls
- Avoid inaccessible reaction-time requirements
- Offer reduced motion
- Provide reconnect guidance

## 17.4 Testing

- Axe WCAG 2.x AA
- Keyboard-only manual pass
- VoiceOver on macOS/iOS
- Reduced motion
- Zoom to 200%
- High contrast where supported
- Mobile screen reader
- Color contrast audit

---

# 18. Performance Plan

## 18.1 Frontend budgets

- Minimize initial JavaScript
- Lazy-load expensive visual modules
- Dynamic import charts
- Dynamic import 3D
- Avoid duplicate UI libraries
- Avoid hidden mounted canvases
- Use stable image dimensions
- Optimize fonts
- Preload only critical assets
- Avoid long main-thread tasks
- Use requestAnimationFrame for scroll work
- Passive scroll listeners
- Prefer transforms and opacity

## 18.2 R3F rules

If 3D is retained:

- `frameloop="demand"` where possible
- Limit device pixel ratio
- Reduce geometry
- Reuse materials
- Avoid unnecessary lights
- Avoid heavy post-processing
- Pause when not visible
- Provide performance fallback
- Provide static fallback
- Test integrated GPU hardware

## 18.3 Backend performance

- Query timing
- Index audit
- Connection reuse
- Parallel safe calls
- Provider timeouts
- Retry policy
- Circuit breakers
- Warm readiness
- Caching
- Batch operations
- Bounded concurrency
- Job queue visibility

## 18.4 Cold starts

Measure and mitigate:

- Backend service wake-up
- Database connection
- Provider initialization
- Model client initialization
- First-request latency

Expose truthful readiness.

---

# 19. Observability and Analytics

## 19.1 Technical observability

Track:

- Request ID
- User-safe correlation ID
- Route
- Job
- Stage
- Provider
- Latency
- Retry
- Cost
- Failure code
- Artifact completeness
- Backend readiness
- Database query time

## 19.2 Product analytics

Track:

- Homepage CTA
- Hero chapter completion
- Signup
- Speech start
- Input mode
- Submission
- Analysis completion
- Analysis failure
- Drill start
- Drill completion
- Re-record
- Return session
- Tournament Prep entry
- Full Round creation
- Full Round completion
- Feedback helpfulness

## 19.3 Privacy

Do not log:

- Raw private speech text by default in general logs
- Sensitive audio
- Full evidence content
- Access tokens
- API keys
- Private room audio

Use structured, minimal, redacted logs.

---

# 20. AI Quality and Evaluation

## 20.1 Test set

Build labeled examples for:

- Constructive
- Rebuttal
- Summary
- Final Focus
- Strong warrant
- Missing warrant
- No weighing
- Dropped offense
- New argument
- Unsupported evidence
- Strong lay adaptation
- Strong technical adaptation
- Partner inconsistency
- Prep misuse

## 20.2 Evaluate

- Transcript accuracy
- Argument extraction
- Claim/warrant/evidence/impact separation
- Drop detection
- Extension detection
- Weighing detection
- Judge differences
- RFD quality
- Drill relevance
- Evidence fidelity
- Full Round responsiveness
- Difficulty consistency
- Scoring stability

## 20.3 Human review

Use:

- Experienced debaters
- Coaches
- Novices
- FSI students
- Multiple judge perspectives

## 20.4 Guardrails

- Structured outputs
- Schema validation
- Evidence offset validation
- Quote verification
- Time/length validation
- Artifact completeness validation
- Fallback behavior
- Prompt versioning
- Model version tracking

---

# 21. Security and Multiplayer Safety

## 21.1 Supabase

- Row Level Security
- Room ownership
- Membership policies
- Invite expiration
- Role validation
- Storage policies
- Team boundaries
- Coach/student permissions

## 21.2 Full Round

- Signed room tokens
- Server-authoritative phase changes
- Server-authoritative timers
- Participant permissions
- Reconnect validation
- Abuse prevention
- Room expiration
- Rate limiting
- Audit log
- Recording consent
- Audio retention controls

## 21.3 AI provider security

- No client-side secret keys
- Ephemeral session credentials where supported
- Bounded provider permissions
- Cost limits
- Request validation
- Prompt-injection resistance for uploaded content

---

# 22. Cost Control

Track cost by:

- User
- Team
- Feature
- Analysis stage
- Model
- Audio minute
- Full Round
- Evidence search

Controls:

- Usage limits
- Maximum speech duration
- Maximum parallel jobs
- Retry cap
- Model tier selection
- Caching
- Reuse of validated artifacts
- Full Round quotas
- Team budgets
- Pilot mode

Never hide cost failures behind endless loading.

---

# 23. Testing Strategy

## 23.1 Unit

- State transitions
- Readiness validation
- Artifact completeness
- Scroll chapter calculation
- Timer calculation
- Prep ledger
- Judge scoring
- Difficulty parameters
- Evidence validation

## 23.2 Integration

- Record pipeline
- Upload pipeline
- Paste pipeline
- Retry
- Partial failure
- Dashboard data
- Tournament Prep
- Judge Adaptation
- Room creation
- Membership
- Full Round phase changes

## 23.3 End-to-end

Homepage:

- Chapter progression
- Mouse wheel
- Trackpad-like input
- Keyboard
- Mobile
- Reduced motion
- CTA
- Navbar
- Accessibility
- No overflow

Application:

- Login
- Dashboard
- New practice
- Record
- Upload
- Paste
- Processing
- Report
- Drill
- Deep route refresh
- No duplicate sidebar
- Tournament Prep
- Judge Adaptation

Full Round:

- Lobby
- Invite
- Join
- Reconnect
- Ready
- Prep
- Turn
- AI audio
- Phase change
- Ballot
- Failure recovery

## 23.4 Performance

- Lighthouse
- Web Vitals
- Bundle analysis
- Cold/warm load
- Backend cold start
- Slow network
- Midrange laptop
- Mobile device
- GPU fallback

## 23.5 Visual regression

Capture:

- Homepage chapters
- Navbar
- Dashboard
- Processing
- Report
- Tournament Prep
- Judge Adaptation
- Full Round lobby
- Full Round active phase

---

# 24. Incremental Delivery Roadmap

Each phase should be implemented and verified before moving forward.

## Phase 0: Audit and baseline

Deliverables:

- Route map
- Current data-flow map
- Current job state map
- Performance trace
- Screenshot baseline
- Error inventory
- Test baseline
- Dependency inventory

No major redesign yet.

## Phase 1: Analysis reliability

Deliverables:

- Unified record/upload/paste pipeline
- Canonical state machine
- Correct readiness
- Processing UI
- Failure/retry behavior
- Artifact validation
- End-to-end tests

Release gate:

> All three input modes reliably create the same complete report.

## Phase 2: Shell correctness and dashboard speed

Deliverables:

- Duplicate shell removed
- One persistent layout
- Dashboard waterfalls removed
- Progressive loading
- Prefetch
- Timeout and retry
- Performance instrumentation

Release gate:

> Dashboard becomes useful promptly and never shows an indefinite full-page skeleton.

## Phase 3: Visual system foundation

Deliverables:

- Tokens
- Typography
- Colors
- Motion rules
- Surface rules
- App shell refresh
- Shared components
- Accessibility rules
- Visual regression setup

Release gate:

> New pages can be built from a coherent system rather than one-off styles.

## Phase 4: Homepage V4

Deliverables:

- Four structural chapters
- Reliable scroll snapping
- Argument Prism
- New navbar
- Product proof sections
- Mobile story
- Reduced motion
- Performance pass

Release gate:

> Each intentional gesture advances the narrative, and the page remains clear without motion.

## Phase 5: Dashboard and report redesign

Deliverables:

- Next-action dashboard
- Better speech list
- Processing visualization
- Report hierarchy
- Drill handoff
- Shared visual system

## Phase 6: Tournament Prep foundation

Deliverables:

- Functional entry
- Resolution workspace
- Evidence coverage
- Frontline readiness
- Workout plan
- Readiness model

## Phase 7: Judge Adaptation foundation

Deliverables:

- Material picker
- Judge profiles
- Adaptation comparison
- Evidence preservation
- Practice workout

## Phase 8: Full Round solo alpha

Deliverables:

- Turn-based phase engine
- AI opponent
- Audio speeches
- Flow updates
- Judge ballot
- Human performance score

## Phase 9: Full Round multiplayer

Deliverables:

- Rooms
- Invites
- Partner presence
- Shared prep
- WebRTC audio
- Reconnect
- Synchronized phase state

## Phase 10: Realtime crossfire

Deliverables:

- Low-latency transcription
- AI voice
- VAD
- Interruptions
- Captions
- Flow extraction

## Phase 11: Team and coach intelligence

Deliverables:

- Assignments
- Team trends
- Tournament readiness
- Coach review
- Export
- Privacy controls

## Phase 12: Production hardening

Deliverables:

- Load testing
- Cost controls
- Abuse prevention
- Incident runbook
- Pilot analytics
- Support tools
- Data retention
- Accessibility audit

---

# 25. Release Gates by System

## Homepage

- Chapters visible and ordered
- Progress truthful
- No scroll trap
- Mobile usable
- Reduced motion usable
- WebGL fallback
- Performance goals
- Accessibility pass

## Dashboard

- Fast first useful content
- No infinite skeleton
- Partial failure support
- Cached content
- No duplicate calls

## Analysis

- Input parity
- Stage visibility
- Correct readiness
- Retry
- Complete artifacts
- Refresh recovery

## Application shell

- One sidebar
- One header
- Stable routes
- Deep links
- Mobile navigation
- Accessibility

## Tournament Prep

- Usable entry
- Functional workspace
- Empty state
- Data ownership
- Readiness explanation

## Judge Adaptation

- No raw IDs
- Real material picker
- Judge comparison
- Evidence preserved
- Practice loop

## Full Round

- Server-authoritative phases
- Server-authoritative timers
- Reconnection
- Saved flow
- AI evidence bounds
- Audio disclosure
- Ballot and skill score separation
- Complete round recovery

---

# 26. Explicit Non-Goals

Do not:

- Add every debate event before PF quality is strong.
- Build case generation as the primary value.
- Use animation to hide unfinished workflows.
- Add a new visual library without a specific need.
- Rewrite exact evidence.
- Mark incomplete analysis as ready.
- Render two app shells.
- Depend on a canvas for essential text.
- Use client-only timers as authority.
- Pre-generate a supposedly responsive AI round.
- Treat AI victory as the only measure of student success.
- Expose database IDs in normal user workflows.
- Build all roadmap phases in one pass.

---

# 27. How to Reference This File in Future Implementation Prompts

Future prompts should identify:

1. The exact phase
2. The relevant sections
3. Allowed files
4. Forbidden files
5. Required tests
6. Completion criteria
7. Expected report

Example structure:

```text
Read DISSIO_PRODUCT_DIRECTION_AND_EXECUTION_PLAN.md.

Implement only Phase 1: Analysis reliability.

Use sections:
- 10. Unified Speech Submission and Analysis Pipeline
- 11. Speech List, Report, and Processing Redesign
- 23. Testing Strategy
- 25. Release Gates by System

Do not begin homepage, Tournament Prep, Judge Adaptation, or Full Round work.
```

The document should guide direction, but implementation must still inspect the real repository before changing code.

---

# 28. Decision Log Template

Add entries as major choices are made.

```text
Date:
Decision:
Problem:
Options considered:
Chosen approach:
Why:
Tradeoffs:
Affected systems:
Migration required:
Rollback:
Follow-up:
```

Important decisions to record:

- Homepage scroll architecture
- Homepage 3D retention/removal
- Dashboard summary endpoint vs server components
- Job event transport
- Full Round media provider
- Realtime AI provider
- Scoring model
- Evidence retention
- Multiplayer recording
- Pricing and usage limits

---

# 29. Definition of Done

A feature is not done because:

- It compiles
- It has screenshots
- A happy-path test passes
- It looks polished on one laptop
- The AI produced one good result

A feature is done when:

- The workflow is functional.
- State is truthful.
- Errors are recoverable.
- Loading is understandable.
- Accessibility is tested.
- Performance is measured.
- Mobile is usable.
- Data ownership is enforced.
- Tests cover important failure paths.
- Logs make production diagnosis possible.
- The feature fits Dissio’s visual system.
- The feature advances the practice loop.

---

# 30. Research References

These references informed the direction of this document. They should be rechecked when implementation begins because web platform and provider capabilities can change.

## Scrolling and motion

- [MDN: CSS Scroll Snap](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap)
- [MDN: Basic concepts of scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap/Basic_concepts)
- [MDN: scroll-snap-stop](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-snap-stop)
- [MDN: Using scroll snap events](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap/Using_scroll_snap_events)
- [Motion: useScroll](https://motion.dev/docs/react-use-scroll)
- [Motion: useInView](https://motion.dev/docs/react-use-in-view)
- [Motion: scroll animations](https://motion.dev/docs/scroll)
- [GSAP: ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [web.dev: Animation performance](https://web.dev/articles/animations-overview)
- [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide)

## Next.js loading and performance

- [Next.js: Prefetching](https://nextjs.org/docs/app/guides/prefetching)
- [Next.js: Fetching data and streaming](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Next.js: loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [Next.js: Lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)

## 3D performance

- [React Three Fiber: Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [React Three Fiber: Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)
- [React Three Fiber: Canvas](https://r3f.docs.pmnd.rs/api/canvas)

## Realtime and multiplayer

- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Supabase Presence](https://supabase.com/docs/guides/realtime/presence)
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [LiveKit: Rooms, participants, and tracks](https://docs.livekit.io/intro/basics/rooms-participants-tracks/)
- [LiveKit: Media overview](https://docs.livekit.io/transport/media/)

## AI voice and realtime speech

- [OpenAI: Realtime API](https://platform.openai.com/docs/guides/realtime/)
- [OpenAI: Realtime API with WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc)
- [OpenAI: Realtime transcription](https://platform.openai.com/docs/guides/realtime-transcription)
- [OpenAI: Text to speech](https://platform.openai.com/docs/guides/text-to-speech)

## Performance metrics

- [web.dev: Web Vitals](https://web.dev/articles/vitals)
- [web.dev: Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [web.dev: CSS and Web Vitals](https://web.dev/articles/css-web-vitals)

## Product and design references

- [Linear](https://linear.app/)
- [Linear: A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)
- [Linear: UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh)
- [Linear: How we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Railway](https://railway.com/)
- [Sahara AI](https://saharaai.com/)
- [ZettaJoule](https://zetta-joule.com/)

---

# 31. Final Direction

Dissio should not become a collection of isolated AI features.

It should become one coherent training system.

The homepage should demonstrate how Dissio sees arguments.

The dashboard should tell the user what to do next.

The analysis pipeline should be reliable across every input mode.

The report should make the ballot understandable.

The drills should convert diagnosis into practice.

Tournament Prep should turn research into readiness.

Judge Adaptation should teach audience-aware communication without changing evidence.

Full Round should become a credible, immersive practice environment for individuals and partners.

The product should feel ambitious because its systems are deep, not because every surface moves.

The guiding standard is:

> Clear enough for a novice. Precise enough for a serious debater. Useful enough for a coach. Reliable enough to trust before a tournament.
