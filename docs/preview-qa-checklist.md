# Preview Deployment — Manual QA Checklist

Run against the deployed preview after migrations + env are set. Check each box;
note the build/commit under test. Test once on **desktop** and once on **mobile
(390px)**, and toggle **dark mode** at least once per section.

## Homepage `/`
- [ ] Hero, proof strip, and each act render; sections reveal *different* capabilities (no repeated sample)
- [ ] No "roadmap / coming soon"; "Supported today" links all resolve
- [ ] Mobile nav sheet opens; primary CTA present; section anchors scroll
- [ ] Footer links resolve (no dead links)

## Login / auth refresh `/login`
- [ ] Sign in succeeds; redirect to dashboard
- [ ] Leave a tab open past the access-token lifetime, then act → request silently refreshes and succeeds (no spurious 401)
- [ ] Signing out clears session; protected routes redirect to `/login`

## Practice / setup `/session`
- [ ] Speech-type cards, Pro/Con, judge-lens cards + preview work; keyboard operable
- [ ] Input-method cards explain capabilities; CTA matches choice
- [ ] Recipe deep-links pre-fill setup; recorder shows the **real** input meter (not a fake waveform)

## Processing → report `/speech/[id]`
- [ ] Processing shows context + debate-anatomy (no fake %); reduced-motion safe
- [ ] Report: Overview / Flow / Ballot / Skills / Transcript / Drills all reachable + URL-addressable
- [ ] Flow: desktop matrix (focus/dim/filter); mobile = argument cards (no squished table)
- [ ] Transcript search + clean/annotated modes; audio plays (if present)
- [ ] No layout overflow at 390px; sticky nav doesn't hide content

## Drills / progress
- [ ] Drill room: instructions, criteria, recorder, attempts
- [ ] `/progress`: focus, skill levels, coverage, milestones, weekly plan; empty + sparse states are honest (no zero charts)

## Team — assignment / review (coach + student)
- [ ] Coach: create assignment (`/team/assign`) → appears with recipients
- [ ] Student: assigned work shows; "Start assignment" hands context into `/session`; status → In progress
- [ ] After analysis completes, status → Ready for review (not before)
- [ ] Coach review queue (`/team/review`): only ready items; mark reviewed / request revision; next/prev
- [ ] Report rail appears for coach on a student's report; student sees coach feedback read-only
- [ ] Permissions: a student cannot reach another student's profile or the review queue (403)

## Evidence Studio `/evidence`
- [ ] Research plan (claim decomposition) shows branches; "Search this angle" runs
- [ ] Research summary shows real stage counts + rejected sources (no fake %)
- [ ] Candidate cards + provenance trail (source / you / AI distinct); exact source text verbatim
- [ ] No-results state offers concrete query improvements; never implies "no evidence exists"
- [ ] Saved library: search/filter, preview, edit, copy, delete

## Cross-cutting
- [ ] Dark mode legible across all of the above
- [ ] 200% zoom: no clipped content / horizontal scroll on key pages
- [ ] Keyboard: visible focus rings; dialogs trap + restore focus; 44px touch targets on mobile
- [ ] No duplicate jobs/submissions on double-click; browser back behaves sensibly
