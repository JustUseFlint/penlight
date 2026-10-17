# Self-critique against the design inspirations

Screens reviewed: `docs/screenshots/` (desktop 1440 and mobile 390, light plus dark for key screens).

## Airbnb: warmth, generous space, photographic calm
**Done well:** warm off-white canvas (not stark white), generous card radii and whitespace, one confident hero with a single primary action,
soft shadows, friendly illustration in the hero, restrained use of color. **Short of the bar:** Airbnb leans on real photography; Penlight
uses custom SVG art only, so it feels cleaner but less emotional. Some dense screens (Progress, lecture guide) get long on desktop.

## Robinhood: confident numbers, calm data
**Done well:** the Progress screen leads with big tabular numbers (level, streak, minutes), arc gauges for TEAS/NCLEX readiness with an
explicit "Estimates, not predictions" chip, a trend chart, heatmap, and mastery bars. Dark mode is a first-class theme.
**Short:** charts are simple (no scrubbing or tooltips on touch), and the readiness gauge copy is more cautious than Robinhood's data-first
tone, which is deliberate for exam-prep honesty.

## WGU: structured paths and clear next steps
**Done well:** Programs are week-by-week with a "Day N is up next" card on Home, task checklists (lesson, cards, quick check), progress
rings and completion states. **Short:** WGU-style assessments and mentors (human guidance) obviously do not exist; there is no calendar
sync or reminders.

## Duolingo: playful reinforcement without noise
**Done well:** streak flame and XP chip always visible, 3D-edge buttons, four short games, confetti and subtle animation on completion,
graded flashcard buttons with color-coded intervals, achievements. No sound (as specified). **Short:** Duolingo has a mascot and richer
celebration moments, and Penlight's games are text-based; the Speed Round and Match Rush are fun but visually plain.

## Biggest remaining gaps (honest)
1. Lite-mode study guides are readable but heuristic; the AI mode is the quality path and was only verified against a mock server.
2. Mobile data-heavy screens (Progress, long lecture guide) are long scrolls; a sticky section jump would help.
3. No real photography or mascot, so the emotional warmth is below Airbnb/Duolingo.
4. Game screens leave empty space on very wide desktops (content is intentionally centered at a reading width).
5. Accessibility was machine-checked (axe: 0 serious/critical on 8 screens x light/dark x 1280px/390px) and keyboard-tested for flashcards,
   tests and games, but not tested with a real screen reader.
