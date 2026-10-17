# Medical-accuracy self-review

**Scope.** Every static question (319), flashcard (361) and lesson (90) in `content/` was re-read line by line in a dedicated pass
(separate from authoring). Generated dosage drills are computed in code and verified by the automated tests.

**Reviewer.** This was a self-review by the build agent against standard, widely published entry-level nursing references
(for example the NCLEX-RN test plan categories, common fundamentals/med-surg/pharmacology textbook consensus, CDC isolation guidance).
It is **not** a review by a licensed clinician or educator, and Penlight says so in the app footer / disclaimer.

## Checks applied
- Drug names are generic only; antidotes, monitoring labs and hold parameters match textbook consensus.
- Normal values (electrolytes, ABGs, INR, platelets, vital signs, lithium, digoxin, phenytoin) match typical adult ranges.
- Every question has exactly one defensible best answer (SATA: each option independently true/false) and a rationale.
- Distractors do not duplicate the correct answer; no "all/none of the above"; no brand names.
- Sequence/ordering facts (PPE, abdominal assessment, insulin mixing, triage, RACE, ABG ROME, Naegele's rule arithmetic).

## Changes made in this pass
| File | Change | Why |
|---|---|---|
| `questions-nclex-2.md` | Lithium toxicity rationale now states therapeutic range 0.6–1.2 and that signs usually appear above ~1.5 | "Above 1.2 = toxicity" was too loose |
| `questions-teas-2.md` + `lessons-teas.md` (E5) | Replaced "Each nurse brought her or his badge" pronoun item with a non-controversial singular-noun item ("The hospital updated its visitor policy") | Singular *they* is now widely accepted; the old item had a debatable "correct" answer |
| `lessons-nclex.md` (BC1) | Cane/gait-belt guidance: cane in the hand on the stronger side; nurse stands on the weaker side | Original wording ("assist toward stronger side") was ambiguous |
| `lessons-core.md` (MS2) | Chest tube: intermittent water-seal bubbling can be expected early with pneumothorax; **continuous** bubbling = persistent leak; accidental removal → sterile occlusive dressing per policy | Original text implied an air leak is "expected" |
| earlier session | Fixed duplicate options (0.45×0.2, 3(x+2)=24), cardiac-output rationale | Found by validity tests |
| `src/lib/games.ts` | Fill-the-Gap no longer blanks words from list-like or low-information card backs, and now shows the card's term as context | Found by visual review: gaps were unanswerable |

## Known judgment calls (left as-is, documented)
- Nitroglycerin: "call 911 if pain is not relieved 5 minutes after the first dose" (current AHA guidance); some older texts say 3 doses first.
- Hypertension threshold: lesson cites ACC/AHA 130/80 and notes 140/90 used elsewhere; preeclampsia uses 140/90.
- Delegation (LPN/UAP) varies by state Nurse Practice Act; items follow the common NCLEX convention.
- Accidental chest-tube removal dressing technique differs by source; the lesson defers to facility policy.
- Fowler's position angle ranges differ slightly between texts (45–60° used).

## Limits
Content is exam-prep support. It is not clinical guidance and not a substitute for instructors, current official references, or facility policy.
