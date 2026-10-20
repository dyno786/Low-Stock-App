# CC team workspace — minute-rotating QR sign-in and skills-based jobs

Implementation prepared against dyno786/Low-Stock-App main commit
262afdf105fdacc804400833505b2e1ab7669e49.

## Release state

The changes are implemented and checked. Repository write access was enabled on
20 October 2026. The initial release is live; this update removes the kiosk password and adds location checks.

## Pages

- asim.html — branch computer QR display, rotating every minute; scanning opens the phone clock-in/out form.
- signin.html — compatible alternate entry for the same flow.
- myday.html — arrival confirmation, daily training review and assigned work.
- asim-manager.html — manager attendance, task timing, activity history, training matrix and branch settings.
- team.html — compatible alternate manager entry.
- Existing Chapeltown, City Centre, Roundhay and Warehouse pages — shared clean styling,
  team navigation and authenticated saves. Existing stock tools remain linked.

## Setup after deployment

1. Open asim-manager.html and sign in with the existing warehouse manager password.
2. Select each branch. Under Staff & branch setup, add each person's name, PIN,
   shift start time and experience (New / beginner, Experienced or Senior).
3. Choose branch work categories and permitted quiet-period till duties.
   Shopify is the default quiet-period till duty in each shop, and can be changed.
   Warehouse has picking/replenishment jobs and does not require a till person.
4. On EACH branch computer open asim.html and choose its branch. The QR and
   current-day staff roster appear immediately without a password. The selected
   branch is kept in the page URL; bookmark that URL. In manager Staff & branch
   setup, save the correct branch coordinates and allowed radius. Use device
   location only while physically at that branch. Enable Require an accurate
   location near the branch to block unverified clock-ins and clock-outs.
5. Bookmark asim.html. Alternatively save computer-shortcut/asim.html onto the
   computer and double-click it; this small launcher opens the hosted page.
   Do not save the main app HTML as an offline page: it needs its hosted scripts
   and same-origin API. Internet access is required.
6. Staff scan the screen with their phone camera, select their name and enter
   their PIN. Successful arrival is saved using the server clock in UK time.
7. Staff review each job as Trained, Learning or Not trained each day. Previous
   choices are prefilled; they should update changes. Their jobs then appear.
8. Review the training matrix and confirm/correct levels. Manager confirmation
   takes priority over a later self-report. Use task assignments with a trained,
   signed-in buddy to arrange supervised training.

## Allocation rules

- Jobs are allocated only after a signed-in employee completes today's training review.
- Exactly ONE till task exists per shop/day. A currently signed-in person trained
  for the till is reserved for it. Seniority then arrival time breaks ties.
- If no qualified cover is available, the dashboard flags the coverage gap.
  It never labels an untrained person as trained or pretends cover exists.
- The till person receives only the branch's permitted duties, and only if trained.
  The task says that customer service takes priority.
- Other automatic jobs go to trained, available staff with the lightest estimated
  workload; experience breaks ties. These are category-level estimates, not a
  measured staffing/productivity model.
- Work is not silently marked complete. Staff explicitly start/complete tasks.
- Started/completed work is retained. Manual assignments are retained while the
  employee is available and suitable. Pending automatic jobs may be reallocated
  when people finish a shift or training levels change.
- New/untrained staff need a trained, signed-in buddy for a skill-specific manual
  training task. The till person cannot supervise a job outside permitted till duties.
- When there is no suitable person, the job stays unassigned with a visible gap.
- Supervisory coverage gaps are shown if a training buddy leaves.
- Managers can change till cover, reassign jobs, add instructions/priorities/due times,
  or remove non-till tasks from today's view (records are retained).

## QR behaviour

- A random server-side code is issued per branch and server-clock minute.
- The kiosk displays a live countdown. At the minute boundary it hides the old QR
  and requests the new one; background checks run every 15 seconds as well.
- A QR from a previous minute cannot initiate a new sign-in/out. Manual manager
  rotation also invalidates the current minute's code immediately.
- After a valid scan, the phone receives a single-use 90-second form ticket to
  finish entering its PIN. This avoids a minute rollover interrupting someone
  already entering their details. The photographed QR itself is still expired.
- The phone form supports Clock in and Clock out using name + PIN. Clock-out
  stops an active task timer. Returning staff retain each separate attendance span.
- The same QR URL works with Android and iPhone cameras; no separate QR is needed.
- The kiosk QR and current-day names/status/arrival/departure roster are public.
  PINs, training, tasks, location coordinates and historical records require authentication.
- A code can still be photographed/shared during its valid minute. Because QR
  retrieval is now public, the QR itself cannot prove someone is at the branch.
  Configure branch location checks and enable enforcement for proximity checks.
- Each clock-in/out requests a fresh phone location with permission. The server
  validates coordinate ranges, freshness (60 seconds), accuracy and distance.
  Near branch requires the accuracy circle to fit inside the configured radius.
  Accuracy over 100 metres (or over the radius) is uncertain, never verified.
- With enforcement enabled, missing, denied, stale, uncertain and outside fixes
  are rejected. Otherwise they are recorded with explicit manager warnings.
  Unconfigured branches cannot be labelled near. The manager sees map links,
  distance, accuracy and each entry/exit tag. No continuous tracking is performed.
  Browser locations can be spoofed: this is supporting evidence, not fraud-proof identity.
- A saved local computer-shortcut/asim.html launcher opens the hosted page;
  the hosted app still requires internet access and deployment.

## Data and access

- Uses the project's existing Upstash Redis REST environment variables.
  No new service or production secret is required for compatibility.
- New attendance data is stored under private attendance:v2:branch:* keys.
- Existing cc_team0/1/2 staff and arrival history are copied once into the private
  store. Originals remain untouched. Historical device timestamps are labelled.
- Old PIN hashes are upgraded to salted PBKDF2 on successful sign-in. New/reset
  PINs are salted PBKDF2 from the start.
- Manager credentials are verified on the server; browser sessionStorage flags no
  longer unlock the warehouse/pick-history manager interfaces.
- Optional hardening: set ATTENDANCE_MANAGER_PASSWORD in Vercel to a new strong
  password; otherwise the existing manager password remains accepted server-side.
- Manager and staff sessions are random opaque Redis records sent in Secure,
  HttpOnly, SameSite=Strict cookies. Manager sessions last 8 hours. Staff sessions
  last up to 24 hours, but access to the day expires at UK date rollover or checkout.
- Attendance changes use compare-and-set transactions. Concurrent arrivals cannot
  overwrite one another. Save failures return errors; the app does not claim success.
- Generic ticks can no longer expose old cc_team* staff/PIN data. GET deletion was
  removed. Staff picking history requires a real session and tick writes require
  staff or manager authentication. Anonymous users can view public stock data,
  but must sign in before saving changes.
- Existing unrelated Shopify/import APIs were not comprehensively redesigned by
  this attendance change. This is not a claim of a complete store-wide security audit.
- Attendance and training use the UK timezone; raw records are retained and managers
  can select historical dates and export attendance CSV.

## Checks completed

Run `npm test` and `npm run check`.

Eleven automated suites cover:
- UK calendar midnight and daylight-saving changes.
- Manager → kiosk pairing → QR → PIN sign-in → training review → allocation → task progress.
- Invalid PINs, duplicate arrival timestamps, unauthorized dashboard/till changes,
  supervised training and existing-shift access after QR rotation.
- Old QR rejection after manual rotation, minute expiry and date rollover.
- Concurrent arrivals, legacy data migration and unavailable storage errors.
- Training confirmation priority and explicit lack of trained till cover.
- Public QR/roster fields, private location configuration, geofence enforcement,
  missing/denied/stale/low-accuracy locations, and persisted entry/exit tags.

Additional isolated DOM checks passed for manager tabs and forms, safe text rendering,
local QR generation, phone sign-in, daily training and all four stock workspaces.
All inline scripts in the four workspaces and picklog.html parse successfully.
DOM checks use fixtures; these are not a substitute for a real deployed browser
and live storage check. No real staff records were created during testing.

## On-site verification

The initial production deployment and Redis health have been checked. The update
uses the same GitHub → Vercel project. Test a real camera scan and phone location
permission at each branch after saving that branch’s coordinates. Confirm 09:00 or each
person's actual start times before staff begin using attendance.

## Attendance and workload history

Managers can filter by branch and date. Attendance records include server-recorded
arrivals/departures, separate return visits and total recorded time in the branch.
Missing historical clock-outs are flagged; their open time is not silently counted
through subsequent days. Each task records assignment history, starts, completions,
active work intervals and the employee responsible for each interval. Starting a new
task pauses the previous timer, preventing double-counting. Clock-out pauses work.
The Time & workload tab shows staff totals and a timestamped activity log. Attendance
and workload CSV exports are available. Task timers measure staff start/stop actions,
not verified productivity or physical movement. Live camera/device and deployed Redis
checks follow publication.

## Shared navigation

The four branch workspaces, ASIM staff/manager pages, Orders, PICCO and pick log
load workspace-nav.js and workspace-nav.css. The shared menu includes Back,
Branch home, My day & jobs, Staff QR, Manager and All tools & pages. Branch context
is retained in links and a local display preference; this never grants access.
Manager tabs support a tab query parameter. On stock work areas, Back first
returns to the branch home; direct entries fall back to the branch home safely.
The menu stays visible while scrolling and wraps for phones.
