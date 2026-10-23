# Formwright

A form builder for phone and desktop, running on Firebase.

- **Form designer** with 26 field types: text, long text, email, phone, website, location, whole number, decimal, currency, percent, rating, slider, calculation, date, time, date and time, yes/no, dropdown, single choice, multiple choice, file upload, photo, signature, color, link to record, and section heading.
  - Each form's row in the designer has **+ Add**, for adding a record to any form, including hidden ones that have no place in the sidebar. Saving returns to the designer.
- **Sidebar control**: choose which forms appear in the sidebar. Hidden forms stay reachable from their parent records.
- **Related forms**: parent/child forms ("Add project" from a client), with optional copying of matching fields, plus "Link to record" lookups.
- **Calculations**: formulas such as `ROUND({Budget} * 1.13, 2)`, `IF(...)`, `DAYS({Due}, TODAY())`, and `CHILDSUM("Projects", "Budget")`.
- **Security groups**: per-form *view* and *edit* levels of **none**, **own** (records the person created) or **all**. Firestore and Storage security rules enforce them.
- **Roles**: jobs people do (Accounts, Site lead). Workflow stages, tasks, @mentions and scheduled emails can go to a role, meaning everyone who holds it.
- **Automations and schedules**: "when this happens, do that", including on a schedule (every month on the last business day, every 2 weeks on Wednesday…), with an approve-first option; dashboards can be emailed on a schedule. **Settings → Schedules** lists everything that goes out on its own.

Plain JavaScript modules, built with Vite. The only runtime dependency is the Firebase JS SDK.

- **Cadence tasks**: each record lists the Cadence tasks linked to it that you own or are assigned. Add, edit, tick off and delete them in a Formwright pop-up (assign, type, priority, map node, checklist); they're the same tasks Cadence shows.

Formwright runs on **Cadence's Firebase project (`tasks-2ae9d`)**, with the same accounts, and deploys to its own Hosting site. The security rules, indexes and Cloud Functions for both apps live in the Cadence folder and deploy from there. This repo deploys only its web pages.

---

## How permissions work

| Access level | What they can do |
|---|---|
| **Administrator** | Everything: design forms, manage groups and users, see and edit every record. |
| **Member** | Only what their security groups allow. A member with no groups sees nothing. |

Each **security group** has a default level for every form, plus optional per-form exceptions. Each level has two parts:

| | none | own | all |
|---|---|---|---|
| **Can see** | hidden | records they created | every record |
| **Can edit** (create, change, delete) | read only | records they created | every record |

The designer offers presets: *View and edit all*, *View and edit mine only*, *View all, edit mine*, *View all, read only*, and *No access*.

When a person belongs to several groups, the most generous level wins, form by form. Editing implies seeing.

**Access level** (Administrator or Member, on the Users screen) is different from **roles** (Settings → Roles), which describe the work someone does and never grant access by themselves. See Roles below.

### How it is enforced

1. When an admin saves a group or changes someone's groups, the admin's browser computes that person's **effective access**. It writes the result to `users/{uid}.access`, for example `{ "*": {view:"own", edit:"own"}, "f_clients": {view:"all", edit:"none"} }`.
2. The Firestore rules (in the Cadence folder) read that map on every request.
   - A member may read a record only if they have `all`, or `own` and they are the `ownerId`.
   - They may write under the same test against their edit level.
   - `ownerId`, `createdBy` and `formId` can never change after creation.
   - `updatedBy` must be the caller.
3. The Storage rules (also in the Cadence folder) apply the same map to uploads at `uploads/{formId}/{uploaderUid}/…`, using cross-service rules.
4. Only admins can write `forms`, `groups`, or anyone's `role`, `groups` or `access`. New accounts must start as members with no access.

The UI hides what a person can't do (New buttons, Save, the designer). The rules are the real boundary.

---

## Project layout

```
index.html                 App shell
src/
  main.js                  Waits for sign-in, creates the account, starts the app
  firebase.js              Firebase init from .env.local; emulator switch
  store.js                 Firestore subscriptions and writes, Storage uploads, group/access writes
  access.js                Permission model (pure; mirrored by the rules)
  formulas.js              Formula parser and evaluator (no eval)
  formtext.js              Fields as text, change summaries, version files (pure, unit-tested)
  richtext.js              Formatted long text: clean, convert, plain text (pure, unit-tested)
  richui.js                The formatted long text editor and its toolbar
  dzlogic.js               Designer canvas: type colours, sections, folding, moves (pure, unit-tested)
  formtextcolor.js         Text view colours, line problems and sections (pure, unit-tested)
  fieldnames.js            Captions and system names: lookups, shared captions (pure, unit-tested)
  formver.js               Fields → Text view, History tab, drafts, Make active
  homelogic.js             Dashboard shortcut tiles and which dashboard Home shows (pure, unit-tested)
  workflow.js              Workflow stages: what each shows, who works on it, checks (pure, unit-tested)
  wfdesign.js              Form designer → Workflow tab
  route.js                 Web addresses for records, form lists and reports (pure)
  sharelink.js             Dashboard links that carry the period, live filter picks and a chart click (pure, unit-tested)
  qr.js                    QR codes for record labels (pure, unit-tested)
  qrlabel.js               A record's QR code dialog: print, download, copy link
  problemlogic.js          Problems: what's reported, grouping, the backup line (pure, unit-tested)
  problems.js              Reports what goes wrong in the browser to problems/{id}
  problemsview.js          Settings → Problems and backups
  recentdel.js             Recently deleted under a form's list (admins): Restore
  offline.js               Working with no signal: the Offline / Syncing bar, back-online sync, late-error messages
  offlinequeue.js          Photos and files picked offline wait here (IndexedDB) until they upload (helpers unit-tested)
  templatelogic.js         Record templates: what a template keeps, and a new record from one (unit-tested)
  rolluplogic.js           Rollup fields: sources, conditions, count/sum/latest/list, the record index (unit-tested)
  lookuplogic.js           Lookup fields: paths, the record reached, values, the designer's choices (unit-tested)
  fixedlogic.js            Default values, Read only fields and Instructions: what's fixed, today/now, stored or not (unit-tested)
  filelist.js              Attachments fields: the list of files, tiles, "3 files", what was added or removed (unit-tested)
  layoutlogic.js           Board and Timeline: columns, moves, spans, the axis (pure, unit-tested)
  listlayouts.js           A form's list as a Board or a Timeline, with dragging
  dash.js, dash.css        Reports and dashboards screens (charts reuse reports.css)
  dashlogic.js             Report types, filters, periods, sharing, moving old reports (pure, unit-tested)
  reportlogic.js           Field joins, totals, time buckets and the gap-free grid (pure, unit-tested)
  tasks.js                 Cadence tasks: display helpers, and the documents the pop-up writes (pure, unit-tested)
  taskmodal.js             The Cadence task pop-up on records
  comments.js              Comments with @mentions on records, and My work → Mentions
  commentlogic.js          Threads, the @ list, who's mentioned and told (pure, unit-tested)
  notices.js               Live pop-ups for new mentions and records that become yours
  docxtpl.js, docxxml.js   Word templates: reading placeholders and filling a .docx (pure, unit-tested)
  docxgen.js               "Placeholders for <form>" Word file, and what a form's templates may use (pure, unit-tested)
  wordui.js                Export ▾, the Word templates pop-up, and a record's values for a template
  allwork.js, allworklogic.js  My work → All mentions and All tasks (admins), and Reassign (logic unit-tested)
  noticelogic.js           What counts as new for those pop-ups (pure, unit-tested)
  lists.js, lists.css      Records list: saved views, columns, filters, select several
  grids.css                Sub-form grids on the record page
  listlogic.js             List columns, views, sorting, filters and CSV (pure, unit-tested)
  navlogic.js              Which forms the sidebar search finds (pure, unit-tested)
  sectionlogic.js          The order of sub-forms, Tasks and child forms under a record's fields (pure, unit-tested)
  foldlogic.js             Which sections are folded on a record page (pure, unit-tested)
  attach.js, attach.css    Attach existing records to a parent, Attach to…, and Detach
  attachlogic.js           Which records can be attached, and what attaching or detaching changes (pure, unit-tested)
  imports.js, imports.css  Import screens: templates menu, choose file, match columns, check rows, history and undo
  importlogic.js           Templates, column matching, checking rows, undo plans (pure, unit-tested)
  xlsx.js                  Reads and writes .xlsx and .csv with no extra packages (unit-tested)
  audit.js, auditlogic.js  Audit trail screen; filters, wording, CSV (auditlogic pure, unit-tested)
  emaillogic.js            Email PDF: templates, addresses to suggest, checking typed ones (pure, unit-tested)
  autonum.js               Auto number: how numbers look, next number, records still to number (pure, unit-tested)
  sublogic.js, subui.js    Sections under a record: columns, sort, Show menu, task cells (sublogic pure, unit-tested)
  pdfdoc.js                Export PDF: field layout, text wrapping, table columns, file names (pure, unit-tested)
  pdfdraw.js               Export PDF: draws the document with pdf-lib (unit-tested)
  pdfexport.js             Export PDF: fetches photos, loads pdf-lib on first use, downloads the file
  exportset.js             Settings → PDF exports: company name and logo
  icons.js, iconset.js     Form badges with an icon: drawing and search (unit-tested); the Lucide set, loaded by the picker only
  lflogic.js               Live filters on dashboards: what they reach, fields filtered together, values and counts (pure, unit-tested)
  callogic.js, calendar.js Workspace → Calendar: what's on each day (pure, unit-tested), and the screen
  cal.js                   The company calendar: time zone, week start, fiscal year; days, weeks, quarters, names (pure, unit-tested)
  calset.js, calpreview.js Settings → Dates and time, and its preview
  duplogic.js              Duplicate: which values a copy keeps (pure, unit-tested)
  rules.js                 Show/hide rules: conditions, what's hidden, required or cleared, clashes, effect on saved records (pure, unit-tested)
  rulesui.js               Form designer → Rules tab: building rules with clicks (its condition builder is reused by automations)
  autologic.js             Automations: wording and checks (pure, unit-tested)
  autos.js                 Settings → Automations: list, editor, Test run, Preview, run history, Waiting for your OK
  autosched.js             Schedules for automations: the frequency builder's sums, next runs, wording (pure, unit-tested; also in the server kit)
  schedules.js             Settings → Schedules: dashboard emails and scheduled automations in one list
  dashmail.js              Dashboard emails: when one is due, who it goes to, the email itself (pure, unit-tested; also in the server kit)
  dashmailui.js            A dashboard's Email schedule window
  dashfmt.js               How report numbers and labels are written (shared by dashboards and their emails)
  dashanim.js              Dashboard chart entrances and hover (donut slices, line guide)
  avatar.js                People's avatars: Google photo over initials
  peoplepick.js, pickerlogic.js  The searchable person picker (people and roles) for tasks and Reassign
  server/recordkit.js      What the server needs to read records like the app: field text, calculations, rules, the PDF model (pure, unit-tested)
  server/entry.js          Bundled with pdfdraw.js, rules.js and emaillogic.js into the Cadence functions as fwkit.cjs
  photo.js                 Smaller photos: turns photos upright and scales them down before upload
  app.js                   Navigation, record screens, form designer
  admin.js                 Security groups and users screens (admins only)
  auth.js                  Sign-in screen: Google, email and password, password reset
  ui.js, util.js           Shared helpers
  styles.css               All styles (light and dark)
  examples.json            Example forms an admin can load from the designer
public/vendor/pdf-lib.min.js  pdf-lib 1.17.1 (MIT), served unchanged (the build skips public/); loaded only when someone exports a PDF
firebase.json, .firebaserc Firebase CLI config: Hosting only, project tasks-2ae9d
.env.example               Web app settings to copy into .env.local
tests/unit/                Formula and permission tests (node --test)
scripts/make-admin.mjs     Promote a user to administrator
scripts/build-fwkit.mjs    Rebuild the Cadence functions' copy of the record kit: node scripts/build-fwkit.mjs ../cadence/functions/fwkit.cjs
.github/workflows/deploy.yml  Test on every PR; deploy Hosting on push to main

Security rules, Storage rules, indexes and their tests live in the Cadence folder.
```

### Data model (Firestore)

| Collection | Document | Written by |
|---|---|---|
| `forms/{formId}` | `name, itemName, description, color, badge ('letter'|'icon'), icon { set, name, shapes: [{ t, …attrs }] }, showInSidebar, order, titleField, fields[] (a date field's `calendar: true` puts it on the Calendar), children[]` | admins |
| `records/{id}` | `formId, values{fieldId: value}, parentId, parentFormId, ownerId, createdBy, createdAt, updatedAt, updatedBy`; `nums{fieldId: number}` and `autoLog[]` from the server; `stage, assignee, assigneeGroup, stageAt` with a workflow | per access; at a workflow stage only its assignee or admins (`nums`, `autoLog`: server only) |
| `records/{id}/comments/{id}` | `by, byName, at, text, mentions[{uid, name}], parent, task, editedAt`; `notified{uid: sent, no-access, gone}` from the server | anyone who can see the record, as themselves; edit your own, delete your own (admins any) |
| `mentions/{id}` | `to, by, byName, recordId, formId, recordTitle, formName, commentId, snippet, at, read` | server only; the person mentioned reads it and marks it read |
| `docTemplates/{id}` | `formId, name, path, url, size, by, byName, at, updatedAt, tags, problems`: a Word template; the .docx is in Storage at `docTemplates/{formId}/{uid}/…` | anyone who can see the form adds one; the person who added it, or an admin, changes or deletes it |
| `records/{id}/stages/{id}` | `at, by, from, fromName, to, toName, label, comment, assignee, assigneeGroup`: stage history | whoever moves it, as themselves; never changed |
| `forms/{id}/versions/{id}` | `n, at, by, kind (saved, draft, loaded, activated, baseline), note, from, fromN, summary[], form{…}`: version history; `forms/{id}.activeVersion` names the live one | admins (never changed or deleted) |
| `settings/home` | `dashboardId, updatedAt, updatedBy`: the dashboard Home shows for anyone without their own | admins (everyone let in reads it) |
| `groups/{id}` | `name, description, access{formId or "*": {view, edit}}` | admins |
| `users/{uid}` | `email, displayName, role, groups[], access{…}, createdAt` | self on first sign-in; admins after |
| `profiles/{uid}` | `displayName`, `email`, `photoURL` (their Google account photo, https only), `homeDashboard` (readable by everyone let in, for names, pickers and avatars) | self |
| `roles/{id}` | `name, description`; people hold roles in `users/{uid}.roles[]` | admins |
| `dashMails/{dashboardId}` | `on, freq, day, hour, to{people, roles, addresses}`, and from the server `lastSlot, lastAt, lastStatus, lastTo`: a dashboard's email schedule | admins (the server sends) |
| `automations/{id}` | `name, formId, on, trigger, join, conds, acts, createdBy…` (see Automations); `…/runs/` run history, `…/sched/` the server's once-per-run marks | admins (runs and marks: server only) |
| `pendingSends/{automationId_recordId}` | `automationId, automationName, recordId, title, steps[], taskId, at`: a scheduled automation waiting for an administrator's OK | server only (admins read) |
| `stageOverdue/{recordId}` | which overdue reminder and escalation were sent for a record's current stage | server only |
| `listViews/{id}` | `formId, name, ownerId, shared, cols[], sort{key, dir}, filters{fieldId: [options]}, density, createdAt, updatedAt` | owner (private); admins (shared, and `dflt-<formId>`) |
| `imports/{id}` | `formId, formName, fileName, ownerId, createdAt, stamp, status, added[], updated[], counts{}, finishedAt, undoneAt, undoneBy, undo{}` | admins |
| `settings/calendar` | `timeZone, weekStart (0 Sunday, 1 Monday), fyStart (1-12), updatedAt, updatedBy`: Settings → Dates and time | admins (everyone let in reads it) |
| `settings/exports` | `companyName, logo` (PNG or JPEG data URL, under 600 KB)`, updatedAt, updatedBy`: the top of exported PDFs | admins (everyone let in reads it) |
| `counters/{formId}__{fieldId}` | `next`, `years{YYYY: next}`: the next auto number | server only (admins read) |
| `audit/{id}` | `at, by, byName, area, kind, formId, formName, recordId, title, targetId, targetName, changes[{key, label, type, from, to}], note, snapshot, restoredAt, restoredBy` | server only (admins read) |
| `imports/{id}/before/{recordId}` | `values, parentId, parentFormId, updatedAt, updatedBy`: a record as it was before the import changed it | admins |

Files go to Cloud Storage. The record stores `{name, size, type, path, url}`. Signatures are stored inline as small PNG data URLs.

---

## Reports and dashboards

**Dashboards** and **Reports** are under *Workspace* in the sidebar.

**A report** is one chart, table or number, saved by itself so it can go on any number of dashboards. Change it once and every dashboard that shows it updates.

- **Types:** Table, Grouped table (with subtotals), Pivot (rows × columns, like Client × Stage), Bar, Line, Area, Donut, and KPI (one number). A KPI can **Compare with the period before**: "▲ +12% vs last month (CA$1,200)". On a dashboard that's the period before the one picked (the month before for Last month, the 90 days before a 90-day custom range); in the report editor, this month against last month.
- **Data from** picks the form. A report can also use fields of the forms above it: a Line items report can group by the project's stage or the client's name. That's how sub-form rows are reported "through" their parent.
- **Value:** a count of records, or the total or average of a number field.
- **Only records where:** any number of conditions (*Stage is not Done*), joined by **and** or **or**.
- **Date for periods:** which date a dashboard's period (This month, This year…) looks at.
- **Charts over time** (Line, Area) step by **Auto**, **Days**, **Weeks**, **Months**, **Quarters** or **Years**. **Auto** picks for the dates shown: days up to about six weeks, weeks up to about six months, then months, then quarters, then years, and says which ("By day (auto)"). **Dates shown:** from the first record to the last, the last 30 days / 26 weeks / 12 months / 8 quarters / 5 years, or dates you choose; on a dashboard with a period picked, that period. A chart never has more than 120 points: past that it steps up (weeks to months, say) and says so under the title ("Shown by month: weeks would be too many to show"). Axis labels are spaced so they never touch, however narrow the chart (a phone fits about four), always including the latest. The step still running (this week, this month) is drawn dashed and marked **so far**, and its tooltip says "(so far)", so a half-finished week doesn't read as a drop. Bar charts, pivots and grouped tables can split a date by day too.
- **Add to dashboard** puts it on an existing dashboard or a new one. The top of the editor lists the dashboards it's on.

**The Reports and Dashboards lists** are tables. **Name** is always the first column; **Columns** adds, removes and reorders the rest (reports: Type, Data from, On dashboards, Last updated, Value, Grouped by, Split by, Over time, Conditions, Owner, Sharing, Created; dashboards: Reports, Home, Sharing, Last updated, Reports on it, Starting period, Owner, Created). The choice is kept for you on each device. One search box looks through the name and every column shown, words in any order. Click a heading to sort (again to reverse); click a row to open it. On phones each row is a card.

**A dashboard** lays out saved reports and text blocks on a grid with no gaps.

- A dashboard uses the full width beside the sidebar. Its grid is 24 squares across, and rows are as tall as a square is wide, so items keep their shape on any screen (bigger screen, bigger items). Dashboards made on the earlier 12-column grid double onto the new one when opened.
- **Edit dashboard** shows the grid as dots, one per corner:
  - **Move:** drag an item by its handle (top-left). A dashed outline shows where it will land; items in the way slide down.
  - **Resize:** drag an item's bottom-right corner. A badge shows its size in squares (columns × rows). A report is at least 3 × 3, a text block 3 × 2.
  - **Keyboard:** focus a handle; arrow keys move the item, Shift + arrow keys resize it.
  - Gaps are allowed. **Float items up** slides everything up to close vertical gaps (saved with the dashboard).
  - Add saved reports (or make a new one from there) and text blocks; new items go in the first free spot. ✕ removes an item. Press **Save dashboard** when done.
  - On phones, items stack full width in reading order (top to bottom, left to right).
  - **Donut and KPI tiles scale with the tile, as on Cadence's dashboards.** A donut's ring fills its tile and sits centred (the total inside grows with it); a wide tile puts the legend beside the ring with counts and percentages, a tall one underneath with percentages, and a small one shows just the ring. A KPI number fills its tile's height (with no upper limit, so a big tile gets a big number), centred; in a short tile the line under it goes so the number can be bigger, and a long number shrinks only to fit across.
  - On phones, each report is a small card: the number for a KPI, the ring for a donut (no legend), the top 5 bars with short labels, the line or area chart, and the top 3 rows of a table, grouped table (its groups) or pivot (row totals). "See all" opens the rest.
  - Tap a bar, slice or point to see its records (or, with **Clicking a chart: Filters the dashboard**, to filter the dashboard by it); tap anywhere else on a card to see all of its records. Press and hold (any touch screen) for a bubble with the name, the number of records, the total and its share. A tip says so the first three times a dashboard is opened.
  - Dashboards saved before the canvas keep their arrangement as the starting layout.
- **Period:** across the top; everyone can change it while viewing, and the one picked while editing is saved as the starting period.
- **Live filters:** while editing, **+ Live filter** adds a tile that filters the dashboard's reports by any field: choices, text, links, people (Created by, and Person responsible on forms with a workflow), yes/no, numbers and dates. **Settings** on the tile: **Filter by** (fields of the forms the dashboard's reports use, and the forms above them), a **Name**, **Also filter** (the same thing on other forms, filtered together: a link to the same records, like Invoices › Client for Clients › Company name, and a field with the same name and type start ticked; a field of the same kind with another name is offered unticked), **Show as** List (tick boxes, a search when there are more than seven, a count beside each value) or Dropdown, and **Pick** One or Several. A filter on a form reaches the forms below it through their links automatically (Customer › Name filters Invoices and Line items too); the settings say which. Picking a value redraws every report it reaches at once; each shows a tag ("Client: Acme"), the counts in other live filters follow, values with nothing left are faded, and picked values stay at the top. **Clear** shows everything again. **Add a field** (under Also filter) pairs any field on another form with it by hand, such as "Customer" on one form and "Client name" on another; values match by what they say. **A date field** makes a date filter: people pick a period (Today … Last year) or From and To, counted with Settings → Dates and time, alongside the dashboard's own Period, so a dashboard can show "invoiced this month, due next week"; date fields with the same name on other forms are ticked, other dates are offered. **People fields offer "Me"** at the top: it stands for whoever is looking, so one shared dashboard shows each person their own records (stored as `@me`). Picks are each viewer's own and kept on that device (`fw.lf.<dashboard>`); everyone sees only the records they're allowed to. The records behind a number say which live filters are on. Stored on the tile as `filter: { ref, also[], label?, show, pick }` (a date filter's pick is `{ period }` or `{ period: 'custom', from, to }`) (`src/lflogic.js`, unit-tested). Dashboards that had the old "+ Filter by…" dropdowns get them as dropdown live filters along the top, keeping what was picked, the first time someone who can edit the dashboard opens it.
- **Clicking a chart filters the dashboard:** **Clicking a chart** in the bar across the top chooses what a click on a bar, slice, point or pivot cell does: **Shows records** (the records behind it, as before) or **Filters the dashboard**. The choice is remembered on each device. The records window also has **Filter the dashboard**, whichever is chosen. A click filters every other report on the dashboard to the records it stands for, the way a live filter does: down through links (clicking a client also filters its projects and their site visits), and fields of the same name on other forms. The chart that was clicked stays whole, with its pick standing out and the rest faded, so another click switches; clicking the same thing again clears it. A point on a line filters to its day, week or month. A strip under the period says what's showing ("Showing only Company name is Acme · from “Budget by client”"), with **Clear**; each report it reaches is tagged, and a report it can't reach says so in its caption. It's for whoever is looking, until they clear it or leave: nothing is saved, and nobody else's view changes. A KPI still opens its records (there's nothing to narrow it by). Worked out with the same rules as the records window (`drillHit` in `src/dashlogic.js`); drawn in `src/dash.js`.
- **Copy link:** copies a link to the dashboard as you see it: the period, live filter picks and any chart click. Opening it shows the same dashboard with the same filters, for that visit (the address then tidies back to the plain dashboard link). It gives no access: whoever opens it needs to be able to open the dashboard, and sees only the records they're allowed to. With nothing set, it's the plain link. The filters ride in the address (`#/dashboard/<id>?f=…`, URL-safe base64 JSON); whatever a link holds is checked before it's used, and a damaged one opens the dashboard as usual (`src/sharelink.js`, unit-tested).
- **Period:** a list grouped by **Days** (Today, Yesterday, Last 7 days, Last 30 days), **Weeks** (This week, Last week), **Months** (This month, Last month), **Quarters** (This quarter, Last quarter) and **Years** (This year, Last year), then **All time** and **Custom range…** (From and To; both days count; leave one blank to run from the first record or up to now). The dates it covers show beside it ("Sep 1 – 30, 2026"). Weeks, quarters and years follow **Settings → Dates and time**. A custom range saved with the dashboard is stored as `filters: { period: 'custom', from, to }`; scheduled emails use it too.
- **Home:** **Set as home** on any dashboard makes it open when you start Formwright. Everyone picks their own.
- **Movement:** charts make an entrance when you open a dashboard, come back to it, or change its period or filters. Numbers count up, bars grow from the left, a donut sweeps round, lines draw themselves; tiles further down play as you scroll to them. Live changes while you're looking (someone saving a record) just update the numbers. If the app is opened straight onto a dashboard, the entrance waits for the records to load, and a redraw mid-way carries each chart on from where it was (`src/dashanim.js`, styles in `dash.css`).
- **Pointing at charts (computers):** tiles lift slightly; the bar you point at stands out while the others fade; the donut slice or legend entry under the mouse lights up and the centre shows it ("4 · Scoping · 21%"); on line and area charts a guide line snaps to the nearest point and shows its value. Clicking still opens the records behind it. Phones and tablets keep tap-to-open, nothing moves while you arrange a dashboard (Edit dashboard), and anyone whose device asks for **reduced motion** gets the charts without animation.
- **Email schedule (administrators):** **✉ Email schedule** in a dashboard's header emails it every weekday, every week (pick the day), every month (pick the date) or every day, at a chosen hour (Eastern time), to chosen people, everyone in chosen roles, and other addresses. The email has each report as of that moment with the dashboard's saved period; charts arrive as small tables any email program can show. **Send a test to me** sends one now. Everyone it goes to sees the numbers, even for forms they can't open. Sent by the Cadence function `dashMailer` (hourly) from `dashMails/{dashboardId}`; the email is built by `src/dashmail.js` (pure, unit-tested).

**Sharing:** your reports and dashboards are private. Admins can share them with everyone or with chosen security groups. Sharing only decides who sees them in their lists; everyone sees numbers worked out from the records *they* are allowed to see, so sharing never reveals records.

**Old reports:** the first time you open the app after this update, each report canvas you made becomes a dashboard of the same name, and each of its widgets becomes a saved report. A shared report made by someone else is converted the next time its owner opens Formwright.

Stored in `reportDefs/{id}` (`name, ownerId, shared, groups, def`) and `dashboards/{id}` (`name, ownerId, shared, groups, tiles, filters`). Home is `homeDashboard` on `profiles/{uid}`. The rules are in the Cadence folder.


### Home and shortcuts

- **Home** (top of the sidebar) shows your home dashboard: the one you chose with **Set as my home**, or else the one an admin made **Everyone’s default home** (`settings/home`, admins only; the dashboard must be shared). With neither, Home says how to choose one. Formwright opens on Home.
- **Shortcut tiles** (Edit dashboard → **+ Shortcut**) open part of Formwright: a form's list (optionally with a saved view, chosen on the tile while editing; a deleted view falls back to the plain list), a new record, Home, My work, Dashboards, Reports, Settings or one of its screens. Each shows the form's badge or the sidebar's symbol, its name and a live count. They start a quarter wide and two cells tall, and resize by the corner like any tile; four cells or taller adds a line saying where it goes. Stored on the tile as `link: { to: 'list'|'new'|'page', form, view, page }` (`src/homelogic.js`, unit-tested).
- **Starter Home:** anyone with no home dashboard of their own and no default sees a starter Home built from what they can open: their sidebar forms, My work (with a workflow), Dashboards and Reports, and for admins Form designer and Users. **Make this my dashboard** saves it as their own dashboard, set as their home, to rearrange and add to.
- **Who sees them:** shortcuts to administration are left out for non-admins, and shortcuts to forms someone can't see (or can't add to) are left out for them; the remaining tiles close up. Admin shortcuts are marked "Admins only" while editing.
- **KPI tiles** keep the title and count at the top; the number and what it measures sit centred in the space below and grow with the tile. "Number of …" uses the plural ("Number of invoices").

## Calendar

**Calendar** (Workspace, under My work; `#/calendar`) shows what's on each day, each kind in its own colour:

- **Tasks** (blue): your Cadence tasks, and tasks given to a role you hold, on their due date and time. Done ones are crossed out; overdue ones are outlined.
- **Workflow due** (orange): records waiting on you (or a group or role you're in) at a stage with a due date; late ones say so.
- **Scheduled reports** (purple, administrators): every dashboard email still to come, at its send time.
- **Automations** (green, administrators): scheduled runs still to come, the heads-up the day before, and "N days before/after a date" automations for each record (7:00 a.m.; they still check their "Only if" when they run).
- **Waiting for your OK** (red, administrators): approve-first sends waiting now, on today.
- **Form dates** (gold): any date or date-and-time field with **Show on the calendar** switched on in the Form designer (off unless you turn it on), one entry per record, for everyone who can see that record.

**Month**, **Week** or **List** (a phone starts on List; your choice is remembered on this device), with ‹ **Today** › to move. The legend hides or shows a kind (remembered too). Clicking a day lists what's on it with a button for each: **Open** (a task opens in the task window; a task not linked to a record opens Cadence), **Done**, **Open record**, **Open dashboard**, **Open automation** or **Review**. Clicking an entry in a day opens it straight away. On a phone, the month shows coloured dots; tap a day to see the list. Weeks start on the day set in Settings → Dates and time. Worked out in `src/callogic.js` (unit-tested), drawn by `src/calendar.js`.

## Sub-forms (grids)

A child form can show **inside** its parent record as an editable grid, like line items on an invoice, instead of as separate records.

- **Set it up:** Form designer › the parent form › **Relationships**.
  - **+ New sub-form** creates a form with Description, Qty, Unit price and Amount (`{Qty} * {Unit price}`), hidden from the sidebar. Rename it and change its fields in its own editor.
  - For any child form, **Show in the … as: Grid in the record / Separate records** switches between the two. Existing children (Site visits under Projects) can be switched either way at any time; nothing about their records changes.
  - **Grid columns** picks which fields show. Long text, files, photos, signatures, locations and multiple choice open in a pop-up from their cell.
  - **Rows follow this form's access:** people who can see a parent can see its rows, and editing works the same way. On for new sub-forms. The form then shows "Follows …" in Security groups instead of its own settings. Changing this recalculates everyone's access when you save the form.
  - Sub-forms go one level deep: a form shown as a grid can't hold grids itself.
- **On the record:** type straight into the cells. Click a heading to sort (again to reverse). **+ Add** puts a new row at the bottom, where it stays until you save. ✕ removes a row (it's deleted when you save; Discard brings it back). ↗ opens a row on its own screen.
- **Saving:** one Save writes the record and every new, changed or removed row together. Rows are checked first (required fields and so on) and problems are listed under the grid.
- **Calculations:** row calculations work as you type (`{Qty} * {Unit price}`), and so do the parent's `CHILDSUM("Line items", "Amount")`, `CHILDCOUNT(…)` and friends. A row's `PARENT("Field")` sees the parent's unsaved values too. Number columns get a total row.
- **Data:** each row is an ordinary record of the sub-form, with `parentId` pointing at the parent. So rows can be listed, filtered and reported on by themselves, and reports on them can use the parent's fields.
- Deleting a parent keeps its rows, as with any child records.

### Attaching existing records

Records made on their own (imported line items, say) can be put under a parent later, for any child form, grid or separate records.

- **Attach existing** (under a grid, or in a child section's header) opens a window of the child form's records. Tick, **Attach**. Records already under another parent (of any form) show where they are under **Currently on**; attaching those moves them, and the window says from where.
- **Suggested match:** when the parent and child have a field with the same name (Invoice # on both), the window opens filtered to the child records whose value matches this parent's, for example **Invoice # is 1**. The parent's title field is tried first, then other text and number fields, then dates, then choices. ✕ removes it and a link puts it back.
- **+ Filter** narrows by any field (not long text, files or photos), picking from the values that exist, with counts; dates go by month. Filters stack. **Search** looks through every field, long text included, and the parent's name, with words in any order.
- With no filter or search, the window shows only records that aren't on any parent; **Include … attached elsewhere** shows the rest. A suggested match, a filter or a search always looks at all of them.
- In a **grid**, attached rows are saved with the parent, so they also work on a new parent before its first save; Discard undoes them. For **separate records**, attaching saves straight away.
- **Detach** (the broken-link button on a row or card) takes a record off its parent without deleting it, so it shows up as unattached again. In a grid it happens when you save.
- From a child form's **list**: tick records, **Attach to…**, pick the parent. When a same-named field matches, the parent that matches the most ticked records is suggested at the top, and picked for you when it matches all of them.
- With **Copy matching fields** on, attaching fills matching fields that are empty on the child; it never overwrites. "Link to record" fields that point at the parent's form follow the move, and are cleared on detach. Calculations that use `PARENT(…)` are worked out again.
- You need edit rights on the parent and on the records being attached. Access is per form, so attaching or detaching doesn't change who can see a record.

## Records lists

**The sidebar** has Workspace (Home, My work, Calendar, Dashboards, Reports), **Forms** (only the forms whose **Sidebar** switch is on in the Form designer, parent or child, with their record counts; up to six, recently opened first, plus **All forms**; with every switch off the section shows just **All forms**) and, for administrators, **Settings** (the ⚙ at the bottom, just above your name; members don't see it). **Search forms** at the top, or **Ctrl K** (⌘K on a Mac) anywhere, opens one box to jump to a form, a record, a new record or a page. With nothing typed it shows, under headings, your **Starred** records, the records you **Recently opened** (on this device, newest first), pages, your forms, administrators' Settings pages, and the records changed most recently; typed, your starred and recently opened records come first among equally good matches. On a computer the rows are compact so the sidebar fits without scrolling; if it ever needs to scroll, a thin scrollbar shows only while the pointer is over it.

- **Fold the sidebar:** **«** at its top (or **Alt+B**) folds it to a strip of icons, giving the page the width; **»** opens it again. Remembered on each device.
- **At the bottom:** your Google photo (or initials), your name and access level, then **Appearance** and **Sign out**.

Under a record's fields come its sub-form grids, Tasks and child forms. Their order is set per form in the designer: **Fields** tab › **Under the fields**, by dragging a card by its handle or with ↑ ↓ (saved as `sectionOrder` on the form; fields always come first for now). New sub-forms and child forms join next to their kind.

In the designer, fields and section cards move by dragging their handle (⠿), with a mouse or a finger; only the handle starts a drag, so scrolling never moves anything. With a handle focused, the up and down arrow keys move it one place. Field types are added by tapping them, or by dragging them onto the form with a mouse.

In the Form designer, **Search forms by name** above the list narrows it as you type (names only, any case, child and sub-forms included); the reorder arrows hide while it's in use, and Esc clears it. On a phone each form's card is compact: **Edit** sits beside its name, its tags below, then one row with the **Sidebar** switch, the arrows, **+ Add** and **Records** (the Hidden tag is left out there, since the switch shows it).

In the form editor, **Search field types** at the top of the field types filters as you type (other words work too: "money" finds Currency, "lookup" finds Link to record); **Enter** adds the first match.

On a record, a bar at the top stays in view as you scroll: **Back**, **Export ▾**, **More** (History, Duplicate, Email PDF, Delete: those you can use) and **Edit**. Saved records open in **Read view**; **Edit** (or **Alt+E**) switches to Edit view with **Save** and **Done**. Who created and last edited the record is under its title.

On a record, **Section Heading** fields, sub-form grids, child sections and **Tasks** fold and open from their headings (a folded one shows a short summary, such as a grid's totals); **Collapse all / Expand all** is at the top. Everything starts open. What you fold is remembered for each form (folding Notes on one invoice folds it on every invoice), for your account on that device. A section with a problem to fix opens by itself when you save.

A sub-form grid, child section or Tasks section with more than 5 entries gets a search box. Tasks are found by title, notes, people, due date (or “done”), repeat and subtasks. A grid searches across its columns; a child section searches every field of its records. Words can be in any order. New grid rows, and rows with a problem to fix, always show; the grid's totals still cover every row.

**Back button:** every screen you open is a step in the browser's history, so the phone's back button or gesture and the browser's Back go one screen back, the same as the in-app Back button (Forward works too). Back closes an open pop-up or the phone menu first, and with unsaved changes it asks first ("Tap again to leave without saving"). On the first screen, Back shows **Press back again to exit**; a second Back within a few seconds leaves.

**Appearance** (under your name at the bottom of the sidebar): **Mode** (Auto follows the device's light or dark setting, Light, Dark), **Colour** (Indigo, Spruce, Sand) and **Density** (Comfortable, Compact). Kept on each device, so a computer and a phone can differ. It's applied before the page draws, so there's no flash of the wrong colours, and the phone's browser bar follows it.

**Profile photos:** when someone signs in with Google, their Google account photo is saved to their profile (refreshed at each sign-in) and shown instead of their initials everywhere people appear: the sidebar, Users, comments, My work, people pickers and task "Assigned to", and in Cadence. Their initials sit underneath, so anyone without a photo (email and password sign-in) or whose photo can't load shows initials (`src/avatar.js`).

**Currency:** a Currency field, or a calculation shown as Currency, with no currency code set counts as **CAD**, matching what the form designer shows.

Every screen uses the width it has, up to 1,600 pixels (dashboards use all of it); phones are unchanged.

Sorting goes by the real value everywhere (lists, grids, report tables, drill-downs): dates and times by calendar, numbers by size, text in natural order (Item 2 before Item 10), blanks last. That includes a record's title column when the title field is a date or a number, the parent column, and "Link to record" columns.

Each form's list can be set up from the list itself.

- **Columns:** **Columns** opens a picker. Tick fields to show them and use the arrows to reorder. Besides the form's own fields, you can add the parent record (**Belongs to**), fields of the parent (Clients › Status), counts of child records (how many Site visits), and **Last updated**, **Created**, **Created by** and **Owner**. The record's title is always the first column.
- **Sort:** click a column heading; click again to reverse. Empty values always go last.
- **Filter:** **Filter** lists the form's choice fields (dropdown, single choice, multiple choice, yes/no). Tick options to show records with any of them; every field you filter must match.
- **Row height:** Comfortable or Compact. On phones, Compact turns each record into a tight two-line card: the title with the first number column on the right (its name beside plain numbers, e.g. "8 Hours"), and two more values underneath, so about twice as many fit on screen. Long values end in "…".
- **Formatted long text** (bullets, numbers, line breaks) shows with its bullets in the computer table and in Comfortable cards, up to 6 lines then "+ 2 more…"; that column gets a readable width and the row grows to fit. Plain text stays on one line.
- **Buttons:** on a computer, **+ New …** starts the row of saved views (left of **All …**), and administrators' **Edit form** and **Import and templates** sit at the top right. A form with no records yet shows **+ New …** at the top right and in the middle of the page.
- **Saved views:** tabs above the list. When you change anything, **Reset**, **Save view** and **Save as new view** appear.
  - The first tab, **All …**, is the form's default list. Until an admin saves it, it shows the fields with **Column in the starting list** turned on in the form designer. An admin's **Save view for everyone** changes it for everyone; **View options › Go back to the form's list columns** undoes that.
  - Your own views are private (**Just me**). Admins can also save a view for everyone, or share or unshare one under **View options**.
  - The app remembers the last view you used for each form on each device.
- **Select several:** tick rows (or **select all**, which picks only the rows shown). A bar appears with:
  - **Set field:** pick a field, then its value, for all of them: text, numbers, currency, dates (**Today** too), times, website, email, phone, rating, colour, **Link to record** (pick the record), and dropdowns, single choice and yes/no in one click. Values are checked like on the record (numbers within the field's min and max, emails, phones). **Clear** empties it (not for required fields). A **multiple choice** gets **Add** or **Remove** for each option, which keeps the other choices each record already has. Read-only fields, lookups, calculations, auto numbers and files aren't offered. Only that field is written on each record, so someone else's edit to another field (or one made offline) is never overwritten. Every change is in the audit trail, where an administrator can **Put back** a record's old value. The form's rules are checked first: if they'd empty other fields, it says which and asks, and that change is listed in **Import history** with **Undo** for 7 days.
  - **Workflow forms:** **Move to stage…** shows how many of the selected records can move to each stage; it asks once (with an optional comment, needed when the move needs one) and each record goes to whoever that stage says, with the move in its stage history. Administrators can move them to any stage; others only along the form's moves, for records they're responsible for, and with the fields that stage needs filled in. The rest are skipped, and it says why. **Person responsible…** (administrators) gives the records at a stage to someone, noted in their stage history.
  - **Set owner** (admins): give the selected records to someone. Who created them stays as history.
  - **Export CSV:** the selected records with the columns you're showing.
  - **Delete:** asks first, then gives you about 6 seconds to **Undo** before anything is deleted. Child records stay (without a parent), and linked Cadence tasks show the record as removed. Closing the app during those seconds cancels the delete.
  - Records you aren't allowed to edit are skipped, and the bar and dialog say how many.
- **Phones:** the list shows cards with tick boxes. The toolbar is compact: **+ New**, a view picker, **⋯**, then search and a **sort chip** (↓ Date ▾: tap the arrow to reverse, ▾ to sort by another field, including Last updated and Created). **⋯** opens a sheet with Filter, Columns, Sort, Row height, the view's actions (rename, share, delete, save changes) and, for administrators, Edit form and Import and templates. When a view has unsaved changes, one line says "Changed from …" with **Reset** and **Save…** (Save… opens the sheet's save choices).

A view only decides how the list looks. It never shows anyone records they couldn't already see.

## Starred records

**☆ Star** in a record's top bar keeps it handy: a **Starred** list in the sidebar (between Workspace and Forms, up to 8, newest star first) and the top of Ctrl K. Click again to unstar. Stars are each person's own and private (`stars/{uid}`, which only that person can read or change), so they follow you to your phone. A star on a record that's been deleted, or that you can no longer see, just doesn't show. Logic in `src/palettelogic.js` (unit-tested).

## Board and Timeline (a form's list)

**Table | Board | Timeline** at the top of any form's list shows the same records (with the view's filters and search) another way. Save view keeps which one, and how it's set, so a team can have a "Pipeline board" next to its usual list.

- **Board:** a column per stage (forms with a workflow) or per option of a dropdown, single-choice or yes/no field (**Columns**), each with its count and, with **Total**, the sum of a number field ("Review · 4 · CA$212,000"). Cards show the title, the view's first few columns, and on a workflow form who has it and when it's due.
  - **Moving a card:** drag it to another column (mouse or pen), or **⋯ → Move to** (phones, keyboard). A field is set the way **Set field** does it on several records, including the question when the form's rules would clear something. A stage moves the way the record's own buttons do: only that stage's moves (the menu names them, "Build · Win it"), only for whoever has the record or an administrator, a reason asked for when the move needs one, and "Fill in … first" (with **Open it**) when the stage needs fields filled. Administrators can move a record to any stage; it asks why, as on the record. Columns a card can't go to fade while it's dragged.
  - People who can't change a record can't move its card.
- **Timeline:** a bar per record from one date to another (**From**, **To**; "One day" for a single date, or **Created on**), coloured by stage or a choice field, in start-date order. **Weeks**, **Months** or **Quarters** across the top; **Today** is marked and the chart opens near it. Names stay on the left while it scrolls, and a record that's out of view says so at the edge ("‹ Ended Jul 1", "Starts Mar 2 ›"). A bar with a start but no end is striped. Records with no start date are counted underneath.
  - **Changing dates:** drag a bar to move it (both dates move together), or drag either end to change one date (mouse or pen); or click it, or press Enter on it, for **Change dates** (phones too). A date and time keeps its time. Bars that start on **Created on** can't move.
- The chart and board stay where you'd scrolled them after a change.
- Logic in `src/layoutlogic.js` (unit-tested); drawn in `src/listlayouts.js`. A saved view keeps it as `listViews/{id}.layout` (`kind, by, sum, start, end, color, zoom`; Table views save as before), which needs the Cadence rules from this update.

## Automations (administrators)

**Settings → Automations**: "when this happens, do that", for one form each. They run on the server (Cadence `functions/automate.js`), so they work whatever changed a record (the app on any device, an import, Set field, another automation) and on dates when nobody is signed in. Stored in `automations/{id}`; admins only (security rules).

- **When:** a record is **created**; **changes** (any field, a chosen field, or a field *becoming* a value: "Status becomes Approved", which fires only when it wasn't before); **reaches a date** (on a date field, or N days before or after it, checked at 7:00 a.m. Toronto time, once per record per day); is **emailed** with Email PDF; **moves to a workflow stage**; or **is due on a schedule** (below).
- **On a schedule:** a frequency builder: **Every** [n] [days / weeks / months / quarters / years], then:
  - days: optionally **weekdays only**;
  - weeks: tap the days (Mon … Sun, one or several);
  - months, quarters, years: **on day** 1st–31st or last day, or **on the** first / second / third / fourth / last Monday … Sunday or business day (Mon–Fri); quarters pick the quarter's first or last month (calendar quarters), years pick the month;
  - **Starting** (a date, shown when every is more than 1, so "every 2 weeks" knows which weeks), and **At** an hour (Toronto time).
  It's said back in English with the next three dates ("Every 2 weeks on Wednesday at 9:00 a.m., starting October 21, 2026 · Next: Wed Oct 21 · Wed Nov 4 · Wed Nov 18"). A day a month doesn't have (the 31st) means its last day. Holidays aren't skipped. Each time, it runs once for **each record where the "Only if" holds** (an "Only if" is required, so it never runs on every record by accident).
  - **Email me the day before** (not for daily): the automation's owner gets a list of what's going out tomorrow, and anything that can't be sent (no email address).
  - **Approve first:** instead of doing it, each record gets a **Review and send** Cadence task for the owner, a banner on the record and a line at the top of Automations ("Waiting for your OK") with **Send now** and **Don't send**. Send now checks the "Only if" still holds first. Start with this on for anything that emails customers.
  - **When an email can't go** (no address, or Gmail refuses it) on a scheduled run, the steps after it are skipped, so nothing is marked as sent when it wasn't, and the owner gets a task saying why.
  - **Preview** (in the editor's side panel) shows which records it would run on now and what it would do, using what's on screen even before saving. Nothing is changed or sent.
  - Older month-end automations open as "Every month on the last (business) day". The schedule logic is `src/autosched.js` (pure, unit-tested, also used by the server); the server runs it hourly (Cadence `automationMonthly`), once per run day.
- **Example: invoices at month end.** Customer has **Billing email** and **Auto-send** (No / End of month), copied to new invoices (same field on Invoice, Copy matching fields on). Automation on Invoice: every month on the last business day at 5:00 p.m., approve first; only if Auto-send is End of month, Status is Draft and Invoice Total is more than 0; then send an email to Customer › Billing email with the PDF, then set Status to Sent and Sent date to today.
- **Only if:** conditions built with the same click builder as show/hide rules, including the parent record's fields. None means always.
- **Then** (up to 10 actions, in order):
  - **Set fields** on the record or its parent: a value, today, a copy of another field, or empty. Fields already as wanted aren't written (so nothing loops).
  - **Create a Cadence task** linked to the record: title and notes with `{Field}` placeholders, for the record's owner, whoever made the change, or a chosen person, due in N days. The admin who made the automation owns it; the assignee needs Cadence switched on to see it.
  - **Send an email** from the company Gmail (the Email PDF setup): to email fields on the record or its parent, the owner, chosen people, everyone in chosen roles and typed addresses; subject and message with placeholders; optionally **with the record's PDF**, made on the server with each section's standard columns. Listed under the record's Sent emails and in the audit trail.
  - **Create a child record** under the record, copying matching fields if wanted, plus chosen values.
- **Placeholders:** `{Field name}`, a parent's field as `{Client › Name}`, and `{Title}`, `{Item}`, `{Company}`, `{Date}`.
- **Safety:** an automation never reacts to its own change; changes made by automations can set off others up to 3 in a row, then it stops and the run log says so. Each automation has an On/Off switch, a **Test run** on a chosen record (what it would do, nothing changed or sent), and a **Run history** (each run, what it did, errors). Everything it changes is in the audit trail as "Automation: name"; records show "edited by an automation".
- **Imports and Set field** count as changes; the import check step says how many automations may run.
- **Not covered by automations:** show/hide rules aren't applied to values an automation sets (the record follows its rules next time it's saved), and calculations are worked out when the record is shown.
- **Server code from Formwright:** the functions use `fwkit.cjs`, a bundle of `src/server/`, `formulas.js`, `rules.js`, `pdfdoc.js`/`pdfdraw.js` and `emaillogic.js`, plus `functions/vendor/pdf-lib.min.js`. After changing those, run `node scripts/build-fwkit.mjs ../cadence/functions/fwkit.cjs` and deploy the functions.

**Email PDF** also has an **Attach the PDF** switch (on by default); off sends just the message.

## Form badges: letter or icon (Form designer → Settings)

Each form has a small square badge in its colour, shown in the sidebar, form lists, Ctrl K, the Calendar, dashboard shortcuts and record pages. **Badge** in a form's **Settings** chooses **Letter** (its first letter, the default) or **Icon**. Icon opens a picker of about 70 suggestions for business forms; its search covers all 1,541 Lucide icons and knows everyday words ("invoice" finds receipts and documents, "safety" shields and hard hats). The chosen icon's shapes are saved with the form (`form.badge: 'icon'`, `form.icon: { set, name, shapes }`), so only the picker ever loads the icon set (`src/iconset.js`, a separate download); switching back to Letter keeps the icon for later. Shapes are saved as a list of objects (`{ t: 'path', d: … }`), because Firestore can't store a list inside a list. Icons are drawn from plain shapes only (`src/icons.js`, unit-tested), so a saved form can't carry anything else. Cadence shows the icon too, beside tasks linked to that form's records, in place of the coloured square. Icons: Lucide (lucide.dev), ISC licence.

## Settings (administrators)

**Settings**, at the bottom of the sidebar, is where administrators set Formwright up. It opens a page of cards in four groups, each with a line saying what it's for and a count:

- **Forms and data:** Form designer, Import history, PDF exports, Dates and time
- **People and access:** Users, Security groups, Roles
- **Automation:** Automations, Schedules
- **Records:** Audit trail

On each of those screens the same list runs down the left (on a phone, a row of buttons you swipe along), so you can move between them; **‹ Settings** goes back to the cards. The form editor and the import wizard keep the full width. Settings stays lit in the sidebar on all of them, and each page can also be found with **Ctrl K** or added to a dashboard as a shortcut. Members don't see Settings, and the pages turn them away if they follow a link.

## Dates and time (administrators)

**Settings → Dates and time** sets how every report, dashboard and dashboard email counts dates, the same for everyone (`settings/calendar`; `src/cal.js` does the counting, unit-tested in several time zones):

- **Time zone** (Toronto unless changed). Each day starts at midnight there, whatever zone someone's phone or computer is set to, so a bill entered at 11 p.m. lands on that day for everyone, in charts by day and in Today / Yesterday. Dates typed into forms are read on the company's clocks.
- **Weeks start on** Monday (unless changed) or Sunday: This week, Last week, and charts by week ("Week of Oct 19, 2026").
- **Fiscal year starts in** January unless changed. This quarter, Last quarter, This year, Last year and charts by quarter or year follow it. Starting in any month but January, they're named by the year they end in: with April, FY2027 runs April 2026 to March 2027, and October 2026 is Q3 FY2027.

A box underneath shows today, this week, this quarter and this year with the settings as they are on screen; nothing changes for anyone until **Save**. Dashboard email send times still follow Eastern time.

## Schedules (administrators)

**Settings → Schedules** lists everything that goes out on its own, soonest first (`src/schedules.js`). Its card and the Settings list show how many are switched on.

- **Dashboard emails:** each scheduled dashboard (its name opens it): when it goes and the next send, who it goes to (people, roles, addresses), and how the last one went ("✓ Last sent Mon, Oct 12, 8:02 a.m. to 2 people", or "⚠ … not sent" with the reason, such as Gmail refusing the app password). **Pause / Resume** (keeps the setup), **Edit** (the same Email schedule window as on the dashboard), **Send me a test** and **Delete** (asks twice; the dashboard is kept).
- **Scheduled automations:** each automation on a schedule: its schedule in words and the next run, whether **Approve first** and the day-before heads-up are on, and how many records are waiting for your OK. **Pause / Resume** and **Edit**.
- Times are Eastern. On phones the buttons sit under each row.

## Roles (administrators)

**Settings → Roles** lists the jobs people do (Accounts, Site lead). A role has a name and description; tick people in it on the role's page, or tick roles on each person's card under **Users**. Roles grant no access by themselves (that's security groups); they say who does what:

- **Workflow stages** can go to a role: anyone holding it is the person responsible and can work on the record.
- **Tasks** can be given to a role (task pop-up → Assigned to → Roles): every holder sees it in Cadence and on the record's Tasks, any of them can do it, and it records who did ("Done by Accounts (Farren)").
- **@mentions** can name a role (`@Accounts`): everyone in it is told, and gets a task if "Also give a task" is ticked.
- **Automation emails, dashboard emails and overdue escalations** can go to everyone in a role at the time.
- Renaming a role updates tasks given to it (Cadence `roleRenamed`).

## Formatted long text

Long text fields have a formatting toolbar that floats above the field while you're in it (gone while reading): Normal text / Heading / Subheading, bold, italic, underline, strikethrough, text colour and highlight, bulleted and numbered lists, quote, link (Ctrl+K) and clear formatting. Typing shortcuts: `# ` heading, `## ` subheading, `- ` or `* ` bullets, `1. ` numbers, `> ` quote, `**bold**`, `*italic*` or `_italic_`. Pasted text keeps only what the toolbar can do.
- **Stored as two parts:** `values[fieldId]` stays plain text (bullets as •, numbers as 1.), so lists, search, exports, imports, calculations and email placeholders are unchanged; the formatting is cleaned HTML in `values._rich[fieldId]`, only when there is some. The formatting only shows while its words match the plain text, so anything that changes the text without the editor (an import, an automation, a rule) makes it fall away instead of showing stale words.
- `src/richtext.js` reads, cleans and converts it (pure, unit-tested; also in the server kit). `src/richui.js` is the editor. `src/pdfdoc.js` `layoutRich` lays it out for PDFs (headings, bold/italic, colours, highlights, lists, quotes, links underlined).
- **Allow formatting** (field settings) or `plain` in Text view turns it off for a field: an ordinary text box.
- The audit trail notes "Notes (formatting): changed" when only the formatting changed.

## Captions and system names

A field has a **caption** (what people see on the form, in lists and in the PDF) and a **system name** (what calculations, `{placeholders}`, automations, imports and Text view call it). The system name is the caption unless you set one (field settings → **System name**), so several fields can share a caption such as "Name" while each stays unique: `{Client name}`, `{Contact name}`. `src/fieldnames.js` holds the rules (pure, unit-tested):
- Lookups go by system name, then field ID, then a caption only one field has (older calculations keep working).
- **Save form** gives a field whose name is already taken its own system name ("Name 2") and says so; renaming one, or renaming in Text view, updates calculations that use it.
- Where fields sit side by side (rule and report pickers, list columns, the designer outline), a shared caption shows which is which: "Name (Contact name)", or its section when it has no system name.
- Import templates head each column with the system name; a file headed with the caption still matches.

## Text view and version history (form designer)

**Visual (the canvas).** Sections sit at the left edge on a tinted band with their field count; the fields under a section are indented beside a thin rail (fields before the first section aren't). Each field type's icon is a shade of its category's colour (Text slate, Contact teal, Numbers amber, Date & time violet, Choices green, Media pink, Links blue), the same in the field types palette and the outline. Sections fold (the chevron; **Collapse all** / **Expand all**): a folded section shows its fields' icons, is remembered per form on this device, and moves as a whole when dragged or moved with the arrow keys (it always lands between sections). Clicking a field in the outline, or adding one to a folded section, opens it. `src/dzlogic.js` (pure, unit-tested) holds the colours, rows, folding and moves.

**Fields → Visual | Text.** Text shows every field and section as one line, for big changes: add many fields at once, rename, reorder by moving lines, delete lines, or paste a list. `src/formtext.js` reads and writes the format (pure, unit-tested); `src/formver.js` is the screen. The designer always opens in Visual; the switch is hidden on phone-width screens.

```
# Project details
Project name: text, required, in list  @p_title
Stage: dropdown [Scoping, In progress, Done], half  @p_stage
Budget with tax: calculated, as currency = ROUND({Budget} * 1.13, 2)  @p_tax
Client: link to Clients
# Contact
Name: text, system name "Contact name"
```

- The `@tag` is the field's ID: words before it can change and it's the same field with the same saved values. A line without a tag is a new field. Settings the text can't express are kept. `system name "…"` sets a field's system name (see Captions and system names).
- **Colours as you type** (`src/formtextcolor.js`, pure, unit-tested; painted under a transparent textarea): section headings on a tinted band, captions bold, types teal, settings amber, "quoted words" green, choices purple, numbers pink, calculation `{fields}` highlighted and functions bold, `@tags` faded, `//` notes grey. Line numbers down the side; a line it doesn't understand gets a red number (hover for why) and a wavy underline, but not while you're still typing on it. **Jump to** chips, one per section, take you to its heading.
- **Saving from the Text view is one click.** As you type, the line under the text says what **Save form** will do (Added 1: Test · Renamed 1: Industry → Sector), or which line to fix first. **Save form** (or **Save as draft**) puts the text into the form and saves it; mistakes are listed by line (with "did you mean"), and nothing is saved until they're fixed. Removing a field that has saved values, or changing a field's type, asks once in that line: press **Save form** again to go ahead. Switching to **Visual** keeps your text changes too (or stays on Text and points at the line to fix). **Discard** drops them. Renaming a field updates calculations that use its old name.

**Version history** (the **History** tab, admins). Every **Save form** stores a copy of the whole form (fields, sections, relationships, rules, workflow, settings) in `forms/{id}/versions/{versionId}`: `{ n, at, by, kind, note, from, fromN, summary[], form }`, and the form records which version is live in `activeVersion`. The first save after this update also stores the form as it was ("Before version history").
- **Save as draft** stores a version without changing the live form. Opening a form with a newer draft offers **Continue the draft** or **Start from the active version**.
- **View** (as text), **Compare with active** (what making it active would change), **Download JSON**, and **Make active**, which saves that version as the live form through the same checks as Save form (workflow, rule-change dialog, access) and records a new version, so nothing is lost.
- **Load from file** reads a downloaded JSON back in as a draft (a file from another form asks first).
- Versions can't be changed or deleted (security rules). Removing a field never deletes saved values, so restoring an older version brings them back.

## Workflows (stages)

**Form designer → Workflow** turns on stages for a form, like Draft → Review → Approved (a starter set is filled in). Logic in `src/workflow.js` (pure, unit-tested); the tab is `src/wfdesign.js`.

- **Each stage** has a name, who it **goes to** when a record arrives (the record's owner, a specific person, a security group, a role, whoever moved it, or the same person as before), whether they get a **Cadence task** and/or an **email**, and its **buttons** (label → stage; "Ask why" makes the person write a comment, as on Send back). A stage with no buttons is the end.
- **Fields at each stage:** Edit, **Required** (must be filled before moving on to a later stage; saving is still allowed), **View only**, or **Hidden** (its value is kept). Hiding a section heading hides everything under it; child sections, grids and Tasks can be hidden per stage too. Show/hide rules still apply on top.
- **On the record:** a bar shows the stages, where it is, its **Person responsible**, how long it's been there, its due date (Overdue, Due today) and that stage's buttons. While a record is at a stage, **only its assignee (or a member of its group) and administrators can change it**, enforced by the security rules; others see it read-only. Administrators can **Move to** any stage. **New records start at the first stage on their own**, however they're made (the app, an import, an automation, Duplicate): the server does it (`autoStart` in Cadence `automationOnWrite`), so the bar shows "Starting at …" for a moment. Records saved before the workflow was turned on show **Start**.
- **Stage history** (a collapsible section on the record): every move, who made it, which button, the comment, and who it went to. Stored in `records/{id}/stages/`.
- **My work → Waiting on me** (the tab shows once any form has a workflow): records you or your groups are the person responsible for, overdue first, then by due date, then longest waiting, with a **Due** column. Administrators can switch to **Everyone**.
- **Due dates:** a stage can be **due within N working days** (Monday to Friday) of arriving (`stage.dueDays`). The Cadence task for that stage gets the same due date (Toronto time).
- **When it's overdue** (per stage, with a due date): **email whoever has it** the morning after the due date, and optionally, **if it's still overdue** N working days later, **also tell** the administrators, a role or a person. Checked on weekday mornings at 7:30 (Cadence `stageOverdue`), each sent once per stage visit; both are noted in the record's audit trail.
- **Stage in rules and automations:** "Stage" can be picked in show/hide rule conditions and automation conditions, and automations have a **moves to a workflow stage** trigger.
- **Notices** (server, `automationOnWrite` in Cadence): when a record arrives at a stage, the previous stage's workflow tasks for it are ticked done, and the new assignee gets a task and/or email (a group: up to 10 members, each their own).
- **Record fields:** `stage`, `assignee`, `assigneeGroup`, `stageAt`.
- **Not covered:** grid rows inside a record follow the record's stage only through its sections being hidden; someone with "mine only" access sees records assigned to their group only if their normal access lets them see the record (records assigned to them personally always show).

## Show and hide rules

Each form can have rules (form designer → **Rules** tab) that change the record page as people fill it in. A rule reads like a sentence and is built from menus, never formulas:

> **When** Stage **is any of** Review, Done **and** (Clients › Status **is** Paused **or** Budget **more than** 1000) **then** hide Tasks, Estimated hours; set required Due date

- **Conditions** look at the record's own fields or its **parent** record's fields (a site visit can look at its project). Comparisons suit the field: is / is not / is any of / is none of (choices), includes (multiple choice), is Yes / is No, = ≠ more than / less than (numbers and calculations), before / after (dates), contains (text), and is empty / is not empty for everything. Join them with **all** or **any**, with one level of **groups**: (A and B) or C.
- **Actions:** **Hide**, **Show**, **Set required**, **Set not required**, **Clear value**. Several per rule, each on several things: fields, a **Section Heading** (hides every field under it), a sub-form grid, a child section, or Tasks.
- **How they combine:** Show means hidden the rest of the time; Set required means not required the rest of the time. Hide beats Show and Set required beats Set not required; a hidden field is never required. **Clear value** empties the field and locks it ("Cleared by a rule") while the rule applies. A hidden or cleared field counts as empty for other rules, so chains settle the way the record will be saved.
- **Saving:** hidden and cleared fields are emptied when the record is saved (switching back before saving brings typed values back). Hidden grids, child sections and Tasks are only hidden: nothing is deleted. Sub-form rules work per grid row (a hidden or cleared cell shows "—"), with the record on screen as the row's parent.
- **PDF exports and emails** leave out whatever the rules hide.
- **Not a permission:** hiding is layout. Lists, reports and CSV still see the data; use Security groups to restrict access.
- **Imports** apply the rules to each row as it's saved; the check step says how many values the rules will empty, on which fields. Undoing the import puts them back.
- **List "Set field":** when the new value would make rules empty fields on the selected records, it asks first ("Set Stage to Done on 2 projects? … Estimated hours: 2, Progress: 2") and does both together. For admins it's logged in Import history (**Set field: Stage → Done**) with Undo; for others it's an ordinary edit. Both are in the audit trail.
- **A parent changing:** saving a record checks its child records (separate records; grid rows are saved with the parent anyway) whose rules look at its fields. If any would change, it asks "Also update 1 site visit?" with the fields listed. **Update** empties them now (admins: logged in Import history as "Project changed (…)" with Undo); **Not now** leaves them until each is saved.
- **In the designer:** each rule shows as a sentence, with **Applies now** while it applies in **Try it** (fill in sample values, including pretend parent values, and watch fields and sections show and hide; nothing is saved). Problems are listed under the rule (a deleted field, an option that no longer exists, a rule that hides the field it looks at) and clashes at the top. Fields a rule changes are tagged "rule" on the Fields tab. Rules can be switched off, reordered and duplicated; rules about deleted fields are tidied on save. Stored as `form.rules` (see `rules.js` for the shape).
- **The rule list** (right of the rule, above Try it; first on phones): the designer shows one rule at a time and the list picks which, with **‹ Prev / Next ›** too. Each item shows the rule's name (or "Rule 3"), its sentence, and tags: Applies now, **Overlaps**, **Needs attention**, Off. **Find a rule** searches names, fields and sections. **Drag ⋮⋮** to reorder (paused while searching; the ↑ ↓ buttons on the rule still work from the keyboard). Rules are numbered by position, and the order never changes what they do, so reordering or renaming never asks to apply anything to saved records.
- **Names:** each rule can have a name (up to 60 characters, `rule.name`), shown in the list, in problem messages ("Rule 2 · Done projects …"), in overlaps and in Import history (**Rule change: Rule 2 · Done projects**). **Rules that overlap** names the rules on each side as links that open them.
- **Changing rules on a form with saved records:** Save form works out which saved records the new rules would empty fields on and asks: **Apply to all N** empties them now, **Leave them** saves the rules and each record follows them on its next save, or **Cancel**. Applying is written like an import, so it's listed in **Import history** as a **Rule change** (filter: All / Imports / Rule changes) with **Undo** for 7 days, and every record change is in the audit trail. Undo skips records edited since. Rule edits themselves show in the audit trail as "Show and hide rules".

## Working with no signal

Formwright keeps working on a phone, tablet or computer with no signal, once it has been opened there with a signal.

- **Opening offline:** the service worker (`public/sw.js`) keeps the app's own files on the device after each visit with a signal. Page loads always try the network first (up to 6 seconds), so an update is never held back; the device copy opens only when there's no answer. Each build writes `precache.json` (a Vite plugin in `vite.config.js`) listing its files, and the files from older builds are cleared away.
- **Records:** Firestore keeps its own copy of what you've seen on the device (`persistentLocalCache` in `src/firebase.js`). Saves, edits and deletes made offline finish at once and sync when the signal returns. If two people change the same field, the change that reaches the server last wins.
- **The bar:** along the top, **Offline. Changes are saved on this phone and sync when you're back · 3 waiting**, then **Syncing 3 changes…** until the backlog has gone. Changes made in an earlier visit that haven't synced yet are counted too.
- **Photos and files:** picked offline (or on an upload that's taken over 20 seconds), they wait on the device (IndexedDB) and the record shows them straight away from that copy. They upload when the signal returns (and every minute while there's something waiting), and the record then gets the real link. `src/offlinequeue.js`.
- **Needs a signal:** anything that runs on the server: emailing PDFs, Word templates, restoring deleted records, account setup on the very first visit, and the like. These say so ("That needs a connection. Try again when you’re back online.") instead of failing silently.
- **Refused later:** if the server turns down a change made offline (say your access changed in the meantime), a message says so and it's listed under Problems.

## Deleting, Undo and Recently deleted

- **Undo:** deleting a record (⋯ More → Delete, twice) shows "Deleted" with **Undo**. Whoever deleted it can undo for 10 minutes, if they can still add records to that form; it comes back exactly as it was, with the same ID, so its child records, comments and sent emails reconnect, and it opens again. Administrators can undo any deletion.
- **Recently deleted (administrators):** under each form's record list. It lists what was deleted from that form in the last 90 days, who deleted it and when, with **Restore** (and **Open** once it's back). The same deletions are in Settings → Audit trail (filter *Records deleted*).
- Both use Cadence's `restoreRecord` function (the copy kept with each deletion in the audit trail). `src/recentdel.js`.

## Problems and backups (Settings → Problems and backups, administrators)

- **Problems:** when something goes wrong for someone (a save that fails, an error on a screen) in Formwright or Cadence, or for the server's own jobs (an email, an automation, the nightly backup), a short report is kept: what went wrong, where (the screen and the last button pressed), for whom, when, and the technical details. The same problem is grouped ("2 times · Amy, Bo · last 1 hour ago") and new ones are marked; **Details** shows the code, the page, the browser and the error. **Clear** removes a group, **Clear all** (twice) everything shown. Filter by Formwright, Cadence or Server. Reports clear themselves after 30 days.
- **Not reported:** a lost connection, browser noise, and errors from browser extensions. At most 15 reports a page load, and the same one not again for 5 minutes.
- **Morning email:** **Email me each morning when there are new ones** emails you at 7:05 a.m. when there's something new (nothing new, no email). Its link opens this page (`#/problems`).
- **Backups:** the line at the top says when the last nightly backup ran and whether it worked (a failure is also listed as a problem). The backup itself is a Cadence function (see the Cadence README: Nightly backups).
- The Settings card shows how many are new since you last looked.
- Logic in `src/problemlogic.js` (unit-tested); reporting in `src/problems.js`; the page is `src/problemsview.js`. Stored in `problems/{id}` (anyone signed in adds their own; admins read and clear), `system/backup` (written by the server) and `settings/problems` (who gets the email).

## QR codes for records

**⋯ More → QR code** on any saved record (anyone who can see it) shows a label: the QR code, the form with its badge, the record's title and "Scan to open in Formwright".

- **Print label** prints just the label (about 3.5 inches wide); **Download image** saves the code as a large PNG for label printers and documents; **Copy link** copies the record's address.
- Scanning it with a phone's camera opens the record (`#/record/<id>`). Whoever scans it signs in first, and sees it only if they're allowed to; the code holds the address and nothing else.
- Codes are made in the browser by `src/qr.js` (byte mode, error correction level M, so a scuffed or partly covered label still scans; sizes up to version 15), unit-tested and checked against a real decoder in the browser tests. The dialog is `src/qrlabel.js`.

## Record templates (+ New ▾)

A template is a saved starting point for new records: "Standard kitchen refit" with its usual stage, budget and 6 line items.

- **Making one (administrators):** on a saved record, **⋯ More → Save as template…**: a name, then **Save template**, or **Replace** an existing one. It keeps what's typed and chosen, links, files and photos, and the **sub-form rows** (line items). It leaves out the title (typed fresh each time), auto numbers, signatures, calculations, lookups, rollups, the record it's under, child records and tasks, and dates unless **Keep dates too** is ticked. The dialog says what's kept, with counts.
- **Using one:** **+ New ▾** on the form's list (the ▾ beside + New; on phones too): **Blank** or a template, each with what it fills ("9 fields · 6 line items · by Adam, Oct 20"). It opens an unsaved new record that says **From template: …**, with the cursor in the title. Nothing is saved until **Save**, and the template never changes. If the form has changed since, fields that are gone and choices that are no longer options are left out.
- **Managing them (administrators):** **✎** renames and **✕** (tap twice) deletes, in the same menu. Records made from a template stay as they are.
- **Who:** anyone who can add records to the form sees and uses its templates; only administrators make, rename, replace or delete them.
- Stored in `recordTemplates/{id}`: `{ formId, name, values, grids: { <subFormId>: [values…] }, keepDates, fields, rows, by, at }`, read one form at a time. Logic in `src/templatelogic.js` (unit-tested). Needs the security rules in this update.

## Duplicating a record

**Duplicate** in a saved record's top bar (for anyone who can create records on that form) opens an unsaved copy, with its title selected so you can type the new one straight away.

- **Copied:** every typed value, choices, dates, links to records, photos and files (the copy points at the same stored photo or file; nothing is uploaded again), and the same parent. A text title gets " (copy)" added.
- **Not copied:** auto numbers (the copy gets its own when saved), signatures (they belong to one record), calculations (worked out again), child records and Tasks.
- **Sub-form grids:** their rows are copied as new rows of the copy.
- Nothing is saved until you click **Save**; Back without saving leaves no trace. A line under the title says what it's a copy of.

## Rollup fields (a field type under Relations)

A **Rollup** works a value out from other records, always current: on a Client, **Projects in progress: 3**, **Open budget**, **Last site visit**, its **Contacts** as a list; on a Contact, how many site visits name them.

- **From:** the records under this one (Projects under this client), records whose **Link to record** field points here (Site visits that link here (Contact on site)), or **one step further** (Projects → Site visits).
- **Only where** (optional): up to three conditions on those records, like rules (Stage is In progress, Stage isn't Done); all must hold.
- **Show:** **Count**, **Sum**, **Average**, **Min**, **Max** (of a number field, calculations and number lookups too), **Latest** or **Earliest** (of a date), or **List** (each different value, shown as chips).
- **On the record:** the value with **Σ Rollup** and what it counts ("Count of Projects where Stage is In progress"). A count has **Show them**, which lists those records right there to open. Move a project to Done and the client's count drops straight away.
- **Nothing is stored** on the record. It only counts records the viewer can see (like `CHILDSUM`). A record that hasn't been saved yet has nothing under it.
- **Works in** lists (columns and sorting), PDFs, Email PDF, Word templates (`{Contacts|bullets}` for a list), dashboards, sub-form grids and calculations (`{Open budget} * 0.1`). Imports skip it, automations can't set it, and rule conditions don't offer it.
- Stored on the field as `{ type: 'rollup', from: ['c:<formId>' | 'l:<formId>:<linkFieldId>', …], where: [{ field, op, value }], agg, of }`. Logic in `src/rolluplogic.js` (unit-tested); the server kit (Cadence `functions/fwkit.cjs`) does the same for emails, PDFs and automations.

## Lookup fields (a field type under Relations)

A **Lookup** shows a value from another record, always current. A Site visit shows its contact's phone and email, its client's office, or its project's budget, without typing them again.

- **Look up from:** a **Link to record** field on the form, or **the record it's under** (a Site visit's Project), or **one step further** (Project → Client, or Contact on site → Client). **Show its:** any field there, calculations and other lookups included.
- **On the record:** the value (a phone is still a link to call, an address still has Map ↗) with **⇢ Lookup** and **from Dana Okafor ↗**, which opens that record. Nobody types into it. Pick a different contact and it changes straight away, before saving; change the contact's phone and every visit shows the new number.
- **Nothing is stored** on the record (`values` never holds it); the app and the server work it out. A linked record you can't see isn't in your data, so the lookup is empty rather than showing its value.
- **Works in** lists (columns, sorting, filters), PDFs, Email PDF, Word templates (`{Contact phone}`), dashboards, sub-form grids and calculations (`{Client discount} * {Budget}`). Imports skip it, automations can't set it, and rule conditions don't offer it.
- Stored on the field as `{ type: 'lookup', via: ['f:<linkFieldId>' | 'p:<parentFormId>', …], show: '<fieldId>' }`. Logic in `src/lookuplogic.js` (unit-tested); the server kit (Cadence `functions/fwkit.cjs`) does the same.

## Default values, Read only and Instructions (Form designer → a field's settings)

- **Default value:** every field that holds a typed value (text, numbers, dates, choices, Yes / No, website, colour) has one. It's filled in on new records (and new sub-form rows, and Try it) and people can change it. Dates can default to **Today**, times and date & time to **Now**. A choice default that's no longer an option is ignored. `field.defaultValue`.
- **Read only:** people can't change the field on the record; it shows as its value with a small 🔒 **Read only**. Required doesn't apply. Calculations and auto numbers are read only already.
  - **Read only with a default value** = a value the form gives every record. It isn't stored on records: every record, old ones too, shows the form's current value, so changing it in the designer changes it everywhere (lists, PDFs, calculations, emails and automations on the server all see it). Imports skip it.
  - **Read only with no default:** shows what the record holds (set by an automation, an import or before it was made read only), and nobody can change it on the record.
  - **A read-only Website** shows as a button. **Button text** (only once it's read only) sets its words, e.g. "Open the safety checklist ↗"; empty shows the address. In sub-form grids it's a link.
- **Instructions** (under Layout, beside Section heading): an optional title and formatted text (bold, lists, links) shown on the form while it's being filled in: on the record in Edit view, in new records and in Try it. It holds no value, so it isn't in Read view, lists, PDFs, Word templates, imports, calculations or filters. Rules and workflow stages can hide it. In the Text view it's a line like `Before you start: instructions` (its text is kept).
- Logic in `src/fixedlogic.js` (unit-tested); the server kit (`src/server/recordkit.js` → Cadence `functions/fwkit.cjs`) shows fixed values the same way.

## Attachments (a field type under Media)

**Attachments** holds any number of files on a record (**File upload** stays one file).

- **Where it shows:** under a Section Heading, it's a field inside that section and folds with it. Not under a heading, it's **its own section**, titled with its caption, with its own fold arrow (key `a:<fieldId>`, remembered like other sections).
- **Adding files:** drag files onto the field (anywhere on its own section): the drop area lights up. Several at once is fine. Or **Browse…**. On phones: **＋ Add files** and **Take photo**. Each file must be under 25 MB; web pages, SVG pictures and scripts are refused (the storage rules don't allow them). Save waits while files are still uploading.
- **Each file** is a card: a thumbnail for pictures, otherwise a PDF / XLS / DOC / PPT / ZIP tile, its name, size, who added it and when. Click to open it; **✕** removes it (save to keep the change). The title shows the count (**Attachments · 3**).
- **No signal:** files wait on the device and upload when you're back, like File upload; several waiting in one field all arrive.
- **Required** means at least one file ("Add at least one file.").
- **Elsewhere:** lists show "3 files"; PDFs list each file on its own line (name · size); Word templates give `{Attachments|bullets}`, a list of the names; the audit trail says "Added Permit.pdf · Removed Storefront.jpg" (an upload finishing isn't a change); imports skip it.
- Stored as `values.<fieldId> = [{ name, size, type, path, url, by, at }]`.

## Smaller photos

A **Photo** field turns the picture upright and scales it to at most 2,000 pixels on its longest side as a JPEG (quality 85%) before uploading. A 12-megapixel phone photo of about 4 MB becomes roughly 300–500 KB, so saving is quicker on mobile data, storage stays small and PDFs build faster, and it still prints sharply. The smaller copy has no location or camera details. Photos already small enough, GIFs, and pictures the browser can't read (some HEIC photos) are uploaded as they are. **File upload** fields always keep the original file exactly.

## Auto number fields

**Auto number** (Numbers group in the form designer) gives every record its own number when it's first saved: invoices, quotes, work orders, anything. Settings: **Prefix** (e.g. `INV-`), **Starting number**, **Minimum digits** (zero-padded) and **Add the year** (`INV-2026-0001`, starting again each January, Toronto time).

- **Given out by the server.** The Cadence functions (`autoNumberOnCreate`) hand out the next number from a counter in a transaction, so two saves at once, phones saving offline, imports and grid rows all get different numbers. The number shows a second or two after saving ("Being assigned…" until then).
- **Nobody can type over it.** Numbers live in `records/{id}.nums`, which the rules let only the server write. Every record save writes just the record's own fields (`setDoc` with `mergeFields`), so the number is never lost.
- **Never reused**, even after a delete. Raising the starting number moves numbering on; lowering it never goes back.
- **Existing records:** after saving the form, the field's settings show how many records have no number and **Number them now** (oldest first). Changing an existing text or number field's type to Auto number **keeps the numbers already typed in** and carries on after the highest one; clashing typed numbers are listed.
- **Admins can change a number** (record → **Change…**), with a warning. It must not be in use on the same form, the change is noted on the record (`autoLog`), and the counter moves past it so it's never handed out again.
- Works like any field elsewhere: as the record's title, list column, search, reports, CSV and PDF. Imports leave it to the server, and copying from a parent skips it.

## Audit trail (administrators)

**Settings → Audit trail** is one page with every change, newest first, kept for good:

- **Records:** created (with what was filled in), changed (each field: old → new), moved to another parent, given to another owner, deleted (with a copy), restored, and PDFs emailed. Values show the way the app shows them.
- **Admin changes:** form designs (fields added, removed, renamed or retyped, settings), security groups (access per form), accounts (first sign-in, role, groups, Cadence approval, removals), auto numbering and number changes, and PDF export settings.
- **Filters:** form, person (or System), what kind of change, from and to dates, and a search over the loaded entries. The database applies the most specific one (record, form, person, kind) with the dates; the rest are checked on what comes back. **Load more** fetches the next 100.
- **Put back** on a record change sets that field (or the parent, or the owner) back to its old value, asking again if it has changed since. It's an ordinary edit, so it's noted too. Signatures, photos, files and shortened long text can't be put back (only their names or the start are kept).
- **Restore** on a deleted record (within 90 days) brings it back with the same ID, so its grid rows, child records and links reconnect. If its parent was deleted too, it comes back on its own.
- **Export CSV**: one row per change, for what the filters show.
- **History** in a record's top bar (admins) opens the trail for just that record.

The Cadence functions write every entry (`audit/{id}`, `functions/audit.js`) as documents change, so nothing can skip it; the rules let only administrators read it and nobody write it. It needs the `audit` indexes in `firestore.indexes.json`; while they build after an install, the page says so.

## Email PDF (administrators)

**Email PDF** on a saved record sends the same PDF as Export PDF, from the company's Gmail (`GMAIL_USER` in the Cadence functions), shown with the company name from PDF exports. Replies go to the administrator who sent it.

- **To:** suggests email addresses found on the record, records it links to, its parent and grandparent, and the other children of it and its parent (a client's contacts), saying where each came from. Others can be typed. Up to 10 addresses with Cc. **Send me a copy** (on by default) blind-copies the sender.
- **Subject and message** come from the form's template (form designer → Settings → Email PDF), with `{Field name}` for any field plus `{Title}`, `{Item}`, `{Company}`, `{Sender}`, `{Date}`, and can be edited before sending. Unknown names stay as typed so a typo shows. Empty templates use standard wording.
- **Sent emails** on the record lists what was sent, to whom, by whom and when (`records/{id}/emails`, written only by the server, readable by anyone who can see the record). It folds like the other sections (with the latest date when folded) and has the Show menu (10 at first).
- **Clicking an email** opens it: when and by whom, To, Cc, subject, the message, and the PDF exactly as it was sent, with **Open** and **Download** (and a preview on a computer). The PDF is kept in Storage at `sentEmails/{recordId}/{emailId}.pdf`; anyone who can see the record can open it. Emails sent before this was added kept neither the message nor the PDF, and say so.
- **Delete** (administrators) in the pop-up deletes that email's entry and its kept PDF, after a second tap. **Delete all** on the section asks for a second tap, then for the number of emails to be typed. Both go through the server function `deleteSentEmails` and are noted in the audit trail ("Sent emails deleted"). Emails already delivered stay in people's inboxes.
- The server function `emailRecord` (Cadence folder, `functions/email.js`) checks the sender is an administrator, the addresses, the subject and the PDF (8 MB at most), allows 100 emails per person per day, then sends through Gmail with the app password kept in Secret Manager (`GMAIL_APP_PASSWORD`). Gmail also keeps a copy in its Sent folder.
- `emaillogic.js` (pure, unit-tested): templates, typed addresses, suggestions.

## Sections under a record (grids, child records, Tasks)

**The record page:** the form's fields, then its sub-form grids, child sections and **Tasks** (full width, in the form's section order), with **Comments** right under Tasks. The **+ Add …**, **Attach existing** and **+ Add task** buttons are shaded in your colour so they're easy to spot.

**Activity** (stage history and sent emails) is a panel beside the form on wide screens (1,280 pixels and up) and below it otherwise. It only appears when a record has some: a workflow, or emails sent. **»** at its top (or **Alt+.**) folds it to a slim strip on the right, giving the form the width; the strip shows « Activity with a count, and clicking it (or Alt+. again) opens it. Remembered on each device.

Each section under a record's fields has a bar at the top: a search box (once there are more than 5), **Columns**, **Show** (5, 10, 15, 20 or all; 10 to start) and its buttons (**+ Add …**, **Attach existing**, **+ Add task**). Long lists end with "Showing 10 of 34 · Show all".

- **Tables with sortable headings**, like the records lists. Click a heading to sort; again to reverse. Numbers and dates start biggest or newest first.
- **Columns** picks and orders the columns for that section. Child records offer the child form's fields, counts of its own children, and Last updated, Created, Created by and Owner; their title always comes first and they start with the form's list columns. Grids start with the columns set in the form designer. Tasks offer Due (red when overdue), Days open (from when the task was made until it was done, or today), Owner, Assigned to, Status, Repeats, Notes, Created and Done on.
- Your columns, sort and Show choice are kept per section **for you, on this device** (`localStorage` `fw.subs.<uid>`), like folded sections.
- **Search** looks through every record in the section (all fields for child records), then Show applies to the matches.
- **Grids:** new rows go at the top until you save, with the cursor in the first cell. New rows and rows with a problem always show, whatever Show is set to, and totals always cover every row.
- **Phones** show cards with a **Sort** menu instead of the table.
- `sublogic.js` (pure, unit-tested) holds the choices, limits and task cells; `subui.js` draws the bar, picker and menus.

## Word templates (Export ▾)

A saved record's **Export ▾** button offers **PDF** (the standard layout) and every Word template made for that form. Picking one downloads a filled-in `.docx`, named `<Template> - <Record>.docx`. Anyone who can see a form can add templates to it (**Export ▾ → Word templates…**); whoever added one, or an administrator, can rename, replace or delete it. Word files only, up to 10 MB.

- **Making one:** design the document in Word and type placeholders as plain text: `{Field}` (caption or system name), `{Parent form: Field}`, `{Link field: Field}`, `{= formula}` (as in a Calculated field), `{%Photo}` / `{%Signature}` / `{%Logo}` for pictures (`|width=5cm` or `|height=…`). Options after `|`: `short`, `long` or a date pattern in quotes (`"MMM d, yyyy"`), number patterns (`0.00`, `#,##0`), `currency`, `percent`, `Yes/No` for checkboxes, `upper`/`lower`/`title`, `or "None"`, `bullets`/`lines` for several choices, `plain`. Values that every record has: `{Today}`, `{Now}`, `{Exported by}`, `{Owner}`, `{Created by}`, `{Created}`, `{Last updated}`, `{Item name}`, `{Form name}`, `{Stage}`, `{Company name}`, `{Title}`. `{{` gives a real "{".
- **Sections:** `{#if condition} … {#else} … {/if}` (conditions like `Stage = "Approved" and Budget > 1000`, `contains`, `not`, brackets; a bare field means ticked / not empty) and `{#each Grid or child form} … {/each}` (optionally `|sort Field desc`, `|where condition`). Both ends in one paragraph: just that text. Each end on a line of its own: the paragraphs between (those two lines go). Ends in different cells of a table row, or in different rows: those rows repeat.
- **Formatted long text** keeps bold, italics, colours, headings, bullets and numbers when its placeholder is on a line of its own.
- **Checking:** adding (or replacing) a template lists every placeholder, with the ones Formwright doesn't recognise in red; a template with a block left open can't be added. Unrecognised placeholders stay as typed in the filled document, and the export says which.
- **How it works:** `src/docxtpl.js` reads the template's XML (first putting back placeholders Word split into pieces), finds the blocks, and fills it from a "scope" `src/wordui.js` builds from the record, its parent, links and children. Pictures are added as images in the file. Comments and tasks aren't part of it.
- **Placeholders for a form:** **Placeholders for <form> (.docx)** in the Word templates pop-up (and **Placeholders for this form** in the form designer's Settings tab) downloads a Word file listing every placeholder a template for that form can use: its fields (with suitable options and its section headings), its parent's, linked records', each grid and child form (a ready-to-copy repeating row or lines, every field, totals), conditions from its real fields and choices, and what every record has. It's made in the browser from the form as it is now (`src/docxgen.js`); uploading it back as a template recognises everything in it.
- **The sample:** `public/word-template-sample.docx` (linked from the pop-up) shows every option, with notes; `tests/fixtures/quote-template.docx` is the same file, used by the tests.
- The output is `.docx`; to get a PDF, open it in Word and save as PDF.

## Export PDF

**Export ▾ → PDF** in a saved record's top bar downloads it as a tidy document, for example `Site visits - Smith house.pdf`. Anyone who can see the record can export it.

- **Top:** the company name and logo from **Settings → PDF exports** (if set), then the form's name, the record's title, who created it and when, the last update, the owner, and its parent.
- **Fields** in the form's order and layout: half-width fields side by side, section headings as headings (with their help text). Values print as the app shows them: CAD currency, written-out dates, Yes/No, ratings as stars, colours as a swatch, linked records by name, calculation results. Empty fields print empty. Long text prints in full and runs onto the next page if it needs to.
- **Photos and signatures** print as pictures (photos are turned upright and scaled down). Other files are listed by name and size. A photo that can't be read prints as its name, and the message after the download says so.
- **Grids, child records and Tasks** follow as tables, in the form's section order, with the columns and sort you chose for each section on screen (every row, whatever Show is set to): grids with their totals, child records, and the Cadence tasks you can see. Long tables continue on the next page with their headings repeated. Words are never split: every column is at least as wide as its longest word, and short values (dates, amounts, codes) stay on one line; long text such as a description wraps between words. When a table is too wide, it first uses slightly smaller text, then gets landscape pages of its own (the rest stays portrait); only a single enormous word, like a long web address, can break.
- Every page has the export date, who exported it and "Page 1 of 3". Pages are US Letter.
- Unsaved changes: it asks you to save first, so the PDF matches what's saved.
- The standard PDF fonts are used, which cover English and French. Other characters (emoji, symbols, other scripts) print as `?`.

**Settings → PDF exports** (admins) sets the company name and logo. The logo is trimmed of empty space, resized and saved in `settings/exports` (PNG keeps a transparent background). The rule for it is in the Cadence folder.

**Photos need one Storage setting (CORS)** so the browser can read them into a PDF. Without it, PDFs list photos by name. See "Let PDFs include photos" under Setup.

## Importing records (admins)

Admins see **Import and templates** at the top of each form's list.

- **Templates:** an Excel file (.xlsx) with one column per field, headed with the field labels. Required fields end in `*`. Choice fields and Yes / No have dropdowns, and so do links to records when there are up to 2,000 of them. A **Guide** sheet explains every column. Calculations, files, photos and signatures are left out.
  - **Blank template:** for new records.
  - **Export with data, to update:** every record of the form, with a **Record ID** column.
  - **<Sub-form> template:** for a form that sits under this one (line items, site visits). Its second column names the parent record, by name or Record ID.
- **Import a filled-in file…:** works with .xlsx and .csv files, up to 5,000 rows at a time.
  1. **Choose file.** Old .xls and Numbers files are explained rather than refused silently.
  2. **Match columns.** Columns are matched to fields by name. Change any that are wrong, or set them to **Don't import**.
  3. **Check rows.** Nothing is saved yet. Each row is **New**, **Update**, **No change** or **Problem**. Problems say what's wrong (a choice that isn't on the list, a date that isn't a date, a client name with a typo and the closest match) and can be fixed right there. Rows that still have problems are skipped, and can be downloaded afterwards with a **Problem** column.
  4. **Import.** Saved in batches with a progress bar. Keep the tab open until it finishes.
- **How rows are read:**
  - A blank Record ID adds a new record, owned by the admin who imports it. A Record ID updates that record, and only the columns in the file change; an emptied cell clears that field.
  - Dates can be Excel dates, `2026-10-13`, `10/13/2026` or `Oct 13, 2026`. Yes / No accepts Yes, No, Y, N, True, False, 1, 0 and X. Several choices are separated with `;`. Numbers may have `$` and commas.
  - Links and parents are matched by the record's name, or by its Record ID when two records share a name.
  - Calculations are worked out as each record is saved. A new row under a parent gets the parent's values the same way **+ Add** does.
- **Import history** (also in Settings) lists every import. **Undo** is offered for 7 days. It removes what the import added, including rows added under those records since, and puts updated records back the way they were. Records someone has edited since the import are left alone, and the confirmation names them.

The import is admins-only in the app and in the rules (`imports/…`). The records themselves are saved through the normal record rules.

## Pop-up messages

Messages at the bottom of the screen look and work like Cadence's (`toast()` in `src/ui.js`): a dark rounded pill that slides up, an optional action button (**Open**, **Show**), and a × to close. Up to three stack; each stays 3.6 seconds (8 for mentions and workflow news), and waits while the pointer is on it. The records list's **Undo** bar after a delete has the same look. The hidden `#toast` element always holds the newest message as plain text, for tests.

## All tasks and Reassign

- **All tasks (administrators):** a My work tab listing the Cadence tasks linked to Formwright records (people's own tasks without a record stay private; the rules only let administrators read tasks with a `recordId`). Columns: task, record, assigned to, owner, due (overdue in red), status; filters by person, form and Open / Done / All; overdue first.
- **Reassign** changes who a task is with; the owner always stays. An administrator can reassign any record task (one, or several ticked at once), to anyone with Cadence or back to its owner. The person a record task is assigned to can pass it on from the task pop-up (**Assigned to**: keep it, give it back to the owner, or someone else). The new person gets Cadence's "… passed you a task" notice, and it's noted in the audit trail (**Tasks reassigned**). Stored on the task as `reassignedBy`, `reassignedAt`; Cadence's rules allow exactly this change (`tasks.js` `reassignPatch`, unit-tested).

## Comments and @mentions

Every saved record has a **Comments** section right under **Tasks** (it folds like the others). Comments aren't part of the record's PDF.

- **Who can comment:** anyone who can see the record, view-only included. You can **Edit** and **Delete** your own (an edited comment says "edited"); administrators can delete anyone's. **Reply** answers a comment (one level deep; replying to a reply goes under the same comment) and starts with an @mention of the person you're answering. Deleting a comment deletes its replies.
- **@mentions:** type **@** and a few letters of a name (or email) to pick someone: arrows and Enter or Tab, or click. Typing a full "@Name" also counts. Administrators see people who can't open the record greyed out ("can't see this record"); for everyone else the server checks. **Ctrl+Enter** (⌘+Enter) posts.
- **What the people you mention get** (Cadence `commentWritten`, `functions/comments.js`): an email from the company Gmail (with a link to the record when `FORMWRIGHT_URL` is set in the Cadence `functions/.env`), an entry in **My work → Mentions**, and, when you tick **Also give the people I mention a Cadence task**, a task from you to them linked to the record (only for people who use Cadence). Only people who can open the record are told; the comment then shows "Sam can't see this record and wasn't notified" to its writer and administrators. Editing a comment to add someone tells only the new person.
- **My work** is always in the sidebar. **Mentions** lists comments that mention you, newest first, with unread ones marked; the sidebar shows how many are unread. Clicking one opens the record at that comment and marks it read; **Mark all as read** clears the rest. **Waiting on me** (workflow records) is the second tab when a form has a workflow.
- **Pop-ups while Formwright is open:** a new mention slides up at the bottom ("**Bea Martin** mentioned you on **Lobby renovation**" with **Open**), and so does a record a workflow hands to you or your group ("**Lobby renovation** is waiting on you at **Review**" with **Open**). Several at once become one ("2 new mentions", **Show** opens My work). Your own moves don't pop up, and nothing pops up for what was already there when you opened the app (`src/notices.js`, `src/noticelogic.js`).
- **All mentions (administrators):** a My work tab listing every @mention: who it was for, who wrote it, the record, the comment, when, and Read / Unread, filterable by person and unread only. Opening one shows the comment without marking it read for the person it was meant for. (Rules: administrators may read `mentions`; only the person mentioned changes theirs.)
- **Audit trail:** deleting a comment is noted ("deleted a comment on", with its text), filterable as **Comments deleted**.

## Links and Cadence tasks

Each record and form list has its own address, so links and refreshes open the right screen:

- `#/record/<recordId>`: one record. Back goes to its form's list.
- `#/form/<formId>`: a form's records.
- `#/reports` and `#/report/<reportId>`: the Reports list and one report.
- `#/dashboards` and `#/dashboard/<id>`: the Dashboards list and one dashboard.

Cadence links to records this way, from the record chip on a task.

**Tasks panel.** Under each record's fields, Formwright lists the Cadence tasks linked to that record that you own or are assigned. Cadence's rules allow nothing else.

- Overdue tasks come first, then by due date. Done tasks are listed last.
- The tick box marks a task done or reopens it, writing the same fields Cadence does. Ticking off a repeating task creates its next occurrence (as Cadence does: next date, checklist cleared, `spawnedFrom` / `spawnedNext`); reopening it removes that occurrence if it hasn't been done.
- **The task pop-up** (`src/taskmodal.js`; documents built by `src/tasks.js`, unit-tested): **Add task** and tapping a task open it in Formwright. Title, notes, due date and time, repeat, **Assigned to**, type and priority (your own Cadence lists, from `users/{uid}/items/settings`, or Cadence's starting lists), **On the map** (a pill picker of your own Cadence map's nodes, `users/{uid}/items/map`, indented under their parents) and a checklist. Opening a task lets you edit it, mark it done or delete it (owner only). On a task someone gave you, only the notes, date and checklist can change (Cadence's rules), and your map isn't offered. Rescheduling counts `moved`/`pushed` as Cadence does. **Open in Cadence** is a link in the footer (`?task=<id>` / `?addTaskFor=<recordId>`).
- **Who a task can go to:** everyone in Formwright. Cadence only accepts an assignee who is in its people directory (`people/{email}` → uid), so each person is added there when they sign in to Formwright with Cadence switched on (their own entry; Cadence's rules allow only that), and their sign-in email is added to their profile (`profiles/{uid}.email`) so others can pick them. People who can't be given tasks yet are greyed out with the reason.

Set Cadence's address in `VITE_CADENCE_URL` (in `.env.local`, and as a GitHub Actions variable for deploys). Without it, everything works except the Open in Cadence link.

The panel's query needs the `tasks` index on `members` + `recordId`. It's in Cadence's `firestore.indexes.json`.

## Setup

Formwright shares the `tasks-2ae9d` project with Cadence. Sign-in, Firestore, Storage and the rules are already set up there.

### 1. One-time setup in the Firebase console (`tasks-2ae9d`)

1. **Storage → Get started**, in the same location as the Firestore database.
2. **Hosting → Add another site** for Formwright, for example `cadence-forms`.
3. **Authentication → Settings → Authorized domains**: make sure `<site>.web.app` is listed.
4. Deploy the rules from the Cadence folder (see Cadence's README). Formwright can't read or write anything until they're live.

### 2. Run locally

```bash
npm install
cp .env.example .env.local      # paste the values from Cadence's firebase-config.js
npm run dev                     # http://localhost:5173
```

Add `http://localhost:5173`'s host (`localhost`) to authorized domains if it isn't there already. It is by default.

### 3. Make yourself the first admin

1. Sign in once with your Cadence account. This creates your `users/{uid}` document as a member.
2. Then do one of these:
   - **Console:** Firestore → `users` → your document → set `role` to `admin`.
   - **Script:** create a service account key (Project settings → Service accounts → Generate new private key), save it outside the repo, then run:
     ```bash
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run make-admin -- you@example.com
     ```
3. Reload the app. You now see **Form designer**, **Security groups** and **Users**.
4. In the designer, **Load example forms** gives you a working set to explore.

### 4. Give people access

1. People sign in once with their Cadence account (Google, or the same email and password). They then appear under **Users**.
2. Create groups under **Security groups**. For example:
   - *Office*: View and edit all.
   - *Field staff*: View and edit mine only, with Clients set to "View all, read only".
3. Add people to groups, either from the group page or the Users page.

Changes apply immediately. The person's app re-subscribes to exactly the records they may see.

### 5. Removing someone

On **Users**, **Remove…** beside a person (not yourself) asks first, naming them and how many records they own. It can't be undone.

- **Their records:** keep them under their name, shown as "Jane Smith (removed)", or pick **Give them to** someone.
- **Cadence:** tasks they own are deleted; tasks assigned to them go back to the owner, unassigned.
- **Reports, dashboards and list views:** private ones are deleted; shared ones pass to you.
- Their account, groups, private Cadence settings and push settings are deleted, then their sign-in. If they sign in again later they start as a new person with no access.

Removing runs on the server (the `removeAccount` function in the Cadence folder), so deploy the Cadence functions first. An administrator can't remove themselves, and the last administrator can't be removed.

**Removed** (below the people list) shows everyone removed and how many records they still own. **Reassign** gives all of them to someone at any time. To move only some, use **Set owner** in a records list.

---

### 6. Let PDFs include photos (once)

Photos live in Cloud Storage, which by default doesn't let web pages read files' contents. In Cloud Shell (project `tasks-2ae9d`):

```sh
gcloud storage buckets list --format="value(name)"          # shows the bucket, e.g. tasks-2ae9d.firebasestorage.app
cat > cors.json <<'JSON'
[{"origin": ["https://YOUR-FORMWRIGHT-ADDRESS"], "method": ["GET"], "maxAgeSeconds": 3600}]
JSON
gcloud storage buckets update gs://BUCKET-NAME --cors-file=cors.json
```

Use Formwright's address exactly as the browser shows it, with no slash at the end (add both the `.web.app` and `.firebaseapp.com` addresses if people use both). This only lets those pages read files they already have a link to; the Storage rules still decide who gets a link.

## Local development with emulators

The emulators and rules are configured in the Cadence folder. Start them there, under Formwright's demo project name:

```bash
# in the Cadence folder
npx firebase emulators:start --only auth,firestore,storage --project demo-formwright
```

Then, in this repo:

```bash
# .env.local:  VITE_USE_EMULATORS=true   (no real config needed)
npm run dev
npm run make-admin -- you@example.com --emulator
```

## Tests

```bash
npm run test:unit        # formulas, permissions, addresses, lists, dashboards and imports (no Firebase needed)
```

The security rules tests, including Formwright's, are in the Cadence folder under `tests/`.

---

## Deploying with GitHub Actions

`.github/workflows/deploy.yml` runs the unit tests and a build on every pull request. On a push to `main` it also deploys **Hosting only**, to Formwright's site. It never deploys rules: those are shared with Cadence and deploy from the Cadence folder.

### Repository settings

**Secrets** (Settings → Secrets and variables → Actions):

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON key of a `tasks-2ae9d` service account with the **Firebase Hosting Admin** role. If the deploy reports a permissions error, also give it **API Keys Viewer**. |
| `VITE_FIREBASE_API_KEY` | Cadence's `apiKey`. It's not a secret, but this keeps it out of logs. |

**Variables:**

| Name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `tasks-2ae9d` |
| `FIREBASE_HOSTING_SITE` | Formwright's Hosting site name, for example `cadence-forms` |
| `VITE_CADENCE_URL` | Cadence's address, for example `https://cadence-tasks.web.app/` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Cadence's `authDomain` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Cadence's `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cadence's `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | Cadence's `appId` |

Create a `production` environment in GitHub if you want deploy approvals. The deploy job uses it.

Manual deploy: `FIREBASE_HOSTING_SITE=cadence-forms npm run deploy` (with your site's name).

---

## Backups

- **Automatic:** Firestore keeps a daily backup (7 days) and a weekly one (Sundays, 8 weeks). Photos and files are copied nightly to `gs://tasks-2ae9d-file-backups` (kept for good; deletions recoverable for 30 days).
- **Before every deploy:** the deploy workflows (Formwright's and Cadence's) first export the whole database to `gs://tasks-2ae9d-db-exports/before-deploy/<date>-<app>-<commit>` with `scripts/backup-db.mjs`, and stop without deploying if that fails. Cloud Shell deploys do the same with `bash deploy.sh <what>` in the Cadence folder. These copies are deleted after 90 days by a rule on the bucket.
- **Any time:** `gcloud firestore export gs://tasks-2ae9d-db-exports/$(date +%Y-%m-%d-%H%M) --project=tasks-2ae9d` makes a copy that's kept until you delete it.
- **Restoring** overwrites live documents with the same IDs, so plan it first (one collection or everything, into this database or a new one).
- The deploy account needs **Cloud Datastore Import Export Admin** on the project and **Storage Legacy Bucket Writer** on the `tasks-2ae9d-db-exports` bucket only.

## Security

- **Locked libraries.** With a `package-lock.json` in the repository, every deploy installs exactly the library versions recorded there (`npm ci`), so a hijacked new release of a library can't slip into a deploy. Without one, the workflow falls back to the newest allowed versions and shows a warning. To create or refresh it (Cloud Shell or any computer with Node 22): put `package.json` in an empty folder, run `npm install --package-lock-only --no-audit --no-fund`, and upload the `package-lock.json` it makes to the top of the repository. Update libraries on purpose, then run the tests.
- **Scripts only from this site.** The Content Security Policy in `firebase.json` lets pages run scripts only from this site and Google's sign-in and App Check services (`apis.google.com`, `www.google.com`, `www.gstatic.com`). There are no inline scripts: what used to be inline in `index.html` (the theme and the install helper) is `public/boot.js`. Text that slips into a page can't run as code, and neither can an `onerror=` style attribute.
- **No access, no app.** Anyone signed in who isn't an administrator or in at least one security group sees only a blocking screen: "You don't have access yet. Please contact an administrator.", the email they're signed in with, and **Sign out**. Nothing of the app is drawn behind it. It lifts by itself when an admin adds them to a group, and comes back at once if their access is removed.
- **Cadence is by approval.** A Formwright admin switches on **Can use Cadence** on the Users screen (`users/{uid}.cadence`); admins always can. Without it the rules refuse every Cadence task, directory, push-setting and private-item read or write, and Formwright's Tasks panel explains that Cadence isn't on for you. Cadence's sign-in creates the same starting account record Formwright does, so new Cadence people show up on the Users screen to approve.
- **New accounts see nothing** until an admin adds them to a security group: only the no-access screen, and no forms, names, shared dashboards, reports or list views. The rules enforce it; the app also waits, so a new account gets no permission errors.
- **Records** are only ever readable as the person's access allows (see How permissions work). Shared dashboards, reports and list views hold settings only, never record data.
- **Uploads:** up to 25 MB each. Web pages, SVG images, scripts and XML are refused, so a file link can't run code.
- **The site** sends security headers: no framing by other sites (stops click-jacking), no MIME sniffing, a strict referrer policy, and camera/location limited to this site.
- **App Check** (optional, recommended): set the `VITE_APPCHECK_SITE_KEY` variable to a reCAPTCHA Enterprise site key and Firebase can refuse requests that don't come from these sites. It does nothing until the key is set; enforce it in the Firebase console once requests show as verified.
- The Firebase web settings (API key and so on) are public by design. What protects data is the rules above, plus the browser-key website restrictions in Google Cloud.

## Things to know

- **Calculations only see records the person can see.** `CHILDSUM` and similar functions total the child records the viewer has access to. A "mine only" member sees totals of their own children only. Calculation results are also saved on the record when it's saved.
- **Access is recomputed by the admin's browser.** This avoids needing Cloud Functions. If a write is interrupted, Security groups → **Recalculate access** rebuilds everyone's map. A server-side alternative is a Cloud Function on `groups/*` and `users/*` writes. The rules would not change.
- **File links.** Uploads are protected by the Storage rules. The download URL saved on the record carries a token, though, so anyone who can read the record can open the file. That's the intended audience, but a forwarded link keeps working until the file is deleted.
- **Scale.** The app subscribes to every record the person can see, one query per form. That's fine into the low thousands of records per form. Beyond that, add paging and an `orderBy('updatedAt')` index.
- **Offline.** Firestore's persistent cache keeps forms and records readable without signal and queues edits. File uploads need a connection.
- **Deleting a form** deletes its records (admins only). Child records in other forms are kept.
- **Brave and ad blockers.** Brave's Shields (and some blockers) block part of Firestore's connection (`ERR_BLOCKED_BY_CLIENT` in the console). Saves can then fail with "Missing or insufficient permissions" and live updates arrive late. Turn Shields down for the Formwright and Cadence sites.
- **Emails for Cadence tasks are lowercase.** Formwright puts addresses in Cadence's people directory and on tasks in lowercase, as Cadence and its rules do (`normEmail` in `src/tasks.js`); the profile keeps the address exactly as signed in.
- **Renaming a field** updates calculations that reference it, including `CHILDSUM`/`PARENT` references in related forms.
- **After an update** is deployed, a page left open from before may not find a part it loads later (Export, Word templates). It then says the app has been updated and offers **Reload**, rather than failing with an unclear error. Reloading with Ctrl+Shift+R also makes sure you have the newest version.
- **Dates and times are picked, not typed:** clicking anywhere in a date, date-and-time or time box opens its calendar or clock (not only the small icon), everywhere in Formwright: form fields, a dashboard's custom range, a report's dates, automations (`src/pickers.js`). Typing still works from the keyboard. Read-only boxes don't open.
- **Reduced motion:** if a device has animations switched off (Windows: Settings → Accessibility → Visual effects → Animation effects; Mac: Reduce motion), dashboards skip their entrance and hover movement on purpose.
