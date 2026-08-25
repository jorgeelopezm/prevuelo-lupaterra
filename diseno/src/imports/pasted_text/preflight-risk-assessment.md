<persona>
You are an expert product designer specializing in aviation and safety-critical interfaces. You design clean, high-legibility UIs that pilots can read quickly under time pressure and cognitive load, following the conventions of modern flight-planning tools (e.g. ForeFlight, SkyDemon, Garmin Pilot).
</persona>

<task> Design a high-fidelity, interactive UI prototype for a general aviation (GA) web application. This is a design and prototyping exercise only. Produce mockup screens and a clickable click-through flow — do NOT write application code and do NOT build any backend. </task>

<critical_constraint>
NO API, NO backend, NO live data of any kind is used in this project. Every value on every screen is static, mocked, placeholder content that you invent to look realistic. Weather strings, NOTAMs, decoded plain-language text, chat responses, aircraft telemetry, and checklists are all hard-coded sample data for demonstration. Design the interface as if real data were flowing, but populate it entirely with believable canned content. Do not design or reference API integrations, MCP servers, or RAG pipelines as live systems — where a feature would "normally" fetch data, simply show representative sample data instead.
</critical_constraint>

<context> The users are general aviation pilots preparing for and conducting flights. The app supports the pre-flight decision-making workflow, so the interface must prioritize fast scanning, unambiguous status indication (especially for weather and hazards), and clear visual hierarchy. Aviation data is dense and jargon-heavy; a core value of the app is presenting official raw/coded data alongside plain-language interpretations so both experienced and lower-time pilots can use it. </context> <navigation> Use a persistent left-hand navigation panel (sidebar) as the app shell, linking to: Home/Dashboard, Weather & NOTAMs, Checklists, Pre-Flight Risk Assessment, Aircraft & Logbook, and Documents & AIS Assistant. The selected item has a clear active state. The same sidebar appears on every screen for consistency. </navigation>

<features_to_design>
Design the following sections. Each is reachable from the left-panel navigation, plus a home/dashboard.

Home / Dashboard
At-a-glance summary: a "what needs attention now" view with color-coded status badges (e.g. a green "all clear" badge unless something is out of range), quick links into each section, and the currently selected aircraft.
Aviation Weather & NOTAMs
Let the user enter/select an airport (ICAO code) or route (all inputs are mocked; selecting a code just swaps to pre-written sample content).
Display METAR, TAF, and NOTAMs using realistic sample strings.
For each, provide a toggle (or side-by-side view) between (a) the official raw/coded text and (b) a human-friendly, decoded plain-language version — both written out as static sample text. Show clearly which mode is active.
Use color-coded status indicators (e.g. VFR / MVFR / IFR / LIFR), each paired with a text label and/or icon (never color alone).
Checklists
The left panel (or a left sub-panel within this section) shows a list of the pilot's REGISTERED AIRCRAFT (e.g. tail number + type, such as "N4521G — Cessna 172S"). This list is shared with the Aircraft & Logbook section — the same fleet.
Selecting an aircraft reveals its associated checklists (e.g. Preflight/Walkaround, Before Start, Before Takeoff, Cruise, Descent/Approach, Before Landing, Shutdown/Securing, plus an Emergency/Abnormal group).
Selecting a checklist opens a full-screen, touch-friendly checklist with large, easily tappable items and unmistakable checked/unchecked states. Items can be toggled interactively (state held in the mockup only, no persistence). Show completion progress (e.g. "8 / 14 complete") and a clear "checklist complete" confirmation state.
Group emergency checklists so they are visually distinct and quickly reachable.
Pre-Flight Risk Self-Assessment
An interactive checklist/questionnaire the pilot completes before flying (a flight risk assessment tool) using IMSAFE / PAVE-style domains (pilot fitness, aircraft, environment/weather, external pressures).
The "aircraft" domain is enriched with mocked telemetry from the selected registered aircraft (see section 5): surface sample data such as engine-trend flags from the last flight, fuel remaining, and hours until the next maintenance interval, and let those visibly feed the risk score.
Aggregate responses into an overall Low/Medium/High rating with a clear visual gauge and a summary of the top contributing risk factors.
Aircraft & Logbook
A dashboard for the pilot's registered aircraft (same fleet list as Checklists) showing mocked avionics/logbook data: recent flights, Hobbs and Tach hours, engine-health trends (e.g. CHT, oil pressure, EGT in a compact engine strip), fuel history, and hours remaining until scheduled maintenance.
Present realistic sample values (e.g. "42.3 Hobbs hrs, 18 hrs to oil change") with simple trend visuals.
Documents & AIS Assistant
Access to reference material: Standard Operating Procedures (SOP), Aeronautical Information Service (AIS) publications, and similar documents (a browsable/searchable sample list).
A chat interface styled as a document assistant, showing a scripted, pre-written sample conversation (2–3 exchanges) where the pilot asks a natural-language question and receives an answer with source/citation references displayed in the reply. The chat is a visual mockup only — no live responses.
</features_to_design>

<design_principles>
Apply established aviation/safety-critical SaaS UX principles throughout:

Clarity under pressure: strong contrast, a clear information hierarchy, and tightly ranked alerts to reduce cognitive load. Meet WCAG 2.1 contrast ratios.
Never rely on color alone: pair every red/amber/green status with a text label or icon so it is legible to colorblind and low-vision users.
Progressive disclosure: lead each screen with the one thing that needs attention (e.g. a simple green "all clear" badge), and reveal detailed panels only on request. Use contextual help icons/tooltips for jargon and units.
Consistency: a single shared design system — colors, typography, iconography, and components (cards, status chips, toggles, gauges, buttons) — reused identically across every section, so controls never need relearning. Use conventional aviation iconography where it exists.
Pilot-focused checklist pattern: full-screen, alert-only view with large action buttons and unmistakable status lines, optimized for quick glances.
Mobile/tablet-first and touch-friendly: design for the smaller screen first with oversized tap targets and simple menus, since pilots often use tablets in tight, high-glare cockpits.
Safe recovery: for any high-impact toggle, offer a lightweight confirmation or undo rather than blocking the workflow.
</design_principles>
<constraints> - Do NOT write or generate application code. Deliver visual prototypes and an interactive click-through only. - Do NOT integrate, reference, or design any API, MCP, RAG, or backend as a live system — all data is static mock content. - Keep the aesthetic professional, calm, and utilitarian — appropriate for a safety-critical tool, not flashy. </constraints> <deliverables> Produce, at minimum, these prototype screens, presented as a connected, navigable prototype with a shared design system and a persistent left-panel navigation: 1. Home / dashboard. 2. Weather & NOTAMs (raw vs. plain-language toggle, labeled status color coding). 3. Checklists (registered-aircraft list → per-aircraft checklists → full-screen interactive checklist with progress). 4. Pre-flight risk self-assessment (questionnaire + result/score view, with mocked aircraft telemetry feeding the aircraft domain). 5. Aircraft & logbook dashboard (telemetry, hours, engine trends, maintenance). 6. Documents & AIS assistant (document browser + scripted chat with citations). </deliverables>