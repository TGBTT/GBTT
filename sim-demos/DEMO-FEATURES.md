# Sim demos — feature exhibition

Concise catalog of UI capabilities shown in each `/sim/` app. All demos are simulated (no live bookings, payments, or dispatch).

Roles: **Booking** · **Estimate** · **Ops**

---

## Venue · Harbour Hall

### Harbour Book — Book a facility
`/venue/harbourbook` · Booking  
Floor-plan room pick, day/time rails, occupancy strip, party size, extras, setup checklist, recurring toggle, live estimate.

### Hall Board — Rooms × hours
`/venue/hallboard` · Ops  
Multi-day nav + occupancy strip, search/filters, find-next booking, colour prefs, KPI header, rooms×hours grid, turnaround buffer, status cycle, staff assignee, place hold on free cells.

---

## Beekeeping · BeeMarshall-style

### Hive Run — Log a yard action
`/beekeeping/hiverun` · Ops  
Cluster map, field log UI, FAB log action, my-roster tab, assigned banner, micro meters, landowner card, hive-break chips, task filter, treatment checklist, yard flags.

### Apiary Board — Yards & week roster
`/beekeeping/apiary` · Ops  
KPI header, admin tabs, week calendar nav, yard filter chips, staff×day roster, role assign, visit sequence, staff load, cluster map, bulk assign, season rules.

---

## Home-care

### Care Visit — Log a visit
`/homecare/visit` · Ops  
Household map, field visit UI, today tab, assigned banner, client cards, meds due, grouped tasks, visit length, concern flag, close-out checklist, family hand-off note.

### Round Board — Day round sheet
`/homecare/rounds` · Ops  
Admin tabs, week calendar nav, uncovered filter, coverage hero, carers×hours grid, staff roles, visit status pipeline, carer load bars, client highlight, suggest carer, coverage auto-fill.

---

## Fitness studio

### Studio Flow — Member pack wallet
`/fitness/studioflow` · Booking  
Credit wallet, booking wizard, class caps, almost-full cue, waitlist, prepaid plans, sync chips, peak-day data toggle.

### Class Board — Wall timetable
`/fitness/classboard` · Ops  
Fill bars with urgency colours, substitute instructor, attendee roster, class caps, exercise catalog, equipment checklist, sync chips.

---

## Horse riding

### Shore Ride — Tide-gated beach ride
`/riding/shoreride` · Booking  
Tide/sun window strip, ride-type cards, horse picker, stay add-on, waiver gate, weight/experience chips, safety checklist, calendar conflict before confirm.

### Yard Board — Horse week grid
`/riding/yardboard` · Ops  
Coverage banner, horse×day planner, groom assignee, rest toggles, max-rides caps, stay nights, calendar blocks, sync chips.

---

## Yacht charter

### Coastal Charter — Skippered bay sail
`/yacht/coastal` · Booking  
Package wizard, route chips + map, calendar grid, weather cues, party size, safety briefing.

### Bay Adventure — Mission deck day
`/yacht/adventure` · Ops  
Route-first map, mission recap, day/time rails, wind/swell gate, crew roles + stepper.

---

## Taxi

### Mohua Ride — Phone hail
`/taxi/mohua` · Booking  
Saved places, pickup/drop-off, passenger chips, vehicle tiers, now/later, peak surcharge, road-snapped map, fare breakdown.

### Bay Hop — Place-to-place trip board
`/taxi/bayhop` · Booking  
Phase steps, dispatch queue, place grid, road-snapped map, live estimate, vehicle cards, passenger chips, time-slot rail, peak slots.

---

## Handyman

### Bay Fix — Repair ticket
`/handyman/bayfix` · Booking  
Wizard, trade quick-adds, multi-trade chips, live estimate, day/time rails, site access card, photo stub.

### Trade Board — Site job board
`/handyman/tradeboard` · Estimate  
Trade quick-adds, job chips, click-to-advance kanban, day/time rails, live estimate, site area.

---

## Pruning

### Canopy Care — Garden prune catalog
`/pruning/canopy` · Booking  
Tree catalog, qty steppers, hazard flags, add-ons, live estimate, day/time rails, access notes.

### Orchard Grid — Orchard count grid
`/pruning/orchard` · Estimate  
Zone picker (A1–D4), species tiles + counters, quick-add chips, add-ons, day/time rails, side estimate panel.

---

## Painting estimates

### Fresh Coat — Indoor rooms
`/painting/freshcoat` · Estimate  
Wizard, surface editor + kinds, paint system, undercoat chips, live estimate, prep checklist, ballpark export.

### Paint Board — Weatherboards, corrugate & roof
`/painting/paintboard` · Estimate  
Weather window, cladding profiles, roof pitch, paintable area, paint/undercoat chips, side estimate, ballpark export.

---

## Shared showcase chrome

Desktop tablet bezel (nav + back outside). Field apps (Hive Run, Care Visit, Mohua) flatten nested phone chrome inside the tablet; phone bezel remains on mobile/embed.
