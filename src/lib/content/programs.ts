import { getLesson } from './load';
import type { DrillKind } from '../dosage';

export type TaskKind = 'lesson' | 'cards' | 'quiz' | 'drill' | 'game';
export interface TaskDef {
  id: string; kind: TaskKind; title: string; minutes: number; optional?: boolean;
  lesson?: string;
  tags?: string[];      // lesson ids used to select cards / questions
  exam?: string;        // restrict questions: teas | nclex | core | dosage
  topic?: string;       // restrict questions to a topic (exam section)
  count?: number; timed?: boolean; mode?: 'tutor' | 'exam';
  drills?: DrillKind[];
  game?: 'match' | 'speed' | 'gap' | 'sequence';
}
export interface DayDef { n: number; title: string; tasks: TaskDef[] }
export interface WeekDef { n: number; title: string; focus: string; days: DayDef[] }
export interface ProgramDef {
  id: string; title: string; subtitle: string; description: string; exam: 'teas' | 'nclex' | 'core' | 'dosage';
  level: string; duration: string; hue: 'brand' | 'coral' | 'sun' | 'sky' | 'grape'; icon: string;
  outcomes: string[]; weeks: WeekDef[];
}

const lessonTitle = (id: string) => getLesson(id)?.title ?? id;
const lessonMin = (id: string) => getLesson(id)?.minutes ?? 6;

function lessonTask(pid: string, d: number, id: string): TaskDef {
  return { id: `${pid}:d${d}:lesson:${id}`, kind: 'lesson', lesson: id, title: `Read: ${lessonTitle(id)}`, minutes: lessonMin(id) };
}
function cardsTask(pid: string, d: number, tags: string[], title = 'Flashcards for this lesson'): TaskDef {
  return { id: `${pid}:d${d}:cards`, kind: 'cards', tags, title, minutes: 8 };
}
function quizTask(pid: string, d: number, o: Partial<TaskDef> & { title: string; count: number }): TaskDef {
  return { id: `${pid}:d${d}:quiz`, kind: 'quiz', minutes: Math.max(5, Math.round(o.count * 1.2)), mode: 'tutor', ...o };
}
function gameTask(pid: string, d: number, game: TaskDef['game'], tags: string[]): TaskDef {
  return { id: `${pid}:d${d}:game`, kind: 'game', game, tags, title: 'Optional: play a game with this week\'s cards', minutes: 5, optional: true };
}
const lessonDay = (pid: string, d: number, ids: string[], exam: string, extraQuiz = true): DayDef => ({
  n: d,
  title: ids.map(lessonTitle).join(' + '),
  tasks: [
    ...ids.map((id) => lessonTask(pid, d, id)),
    cardsTask(pid, d, ids),
    ...(extraQuiz ? [quizTask(pid, d, { title: `Quick check (${ids.length > 1 ? 'both lessons' : 'this lesson'})`, tags: ids, exam, count: Math.min(8, 4 * ids.length) })] : []),
  ],
});

// ------------------------------------------------------------------ TEAS 7
const S = 'teas';
function teasPlan(id: string, weeks: { title: string; focus: string; days: (string[] | 'review-reading' | 'review-math' | 'review-science' | 'review-english' | 'final')[] }[]): WeekDef[] {
  let d = 0;
  return weeks.map((w, wi) => ({
    n: wi + 1, title: w.title, focus: w.focus,
    days: w.days.map((spec) => {
      d += 1;
      if (Array.isArray(spec)) {
        const day = lessonDay(id, d, spec, S);
        if (d % 5 === 0) day.tasks.push(gameTask(id, d, 'match', spec));
        return day;
      }
      const sectionMap: Record<string, { topic: string; title: string }> = {
        'review-reading': { topic: 'Reading', title: 'Review day: Reading' },
        'review-math': { topic: 'Math', title: 'Review day: Math' },
        'review-science': { topic: 'Science', title: 'Review day: Science' },
        'review-english': { topic: 'English & Language', title: 'Review day: English & Language' },
      };
      if (spec === 'final') {
        return { n: d, title: 'Dress rehearsal: mixed practice test', tasks: [quizTask(id, d, { title: 'Timed mixed TEAS-style test (20 questions)', exam: S, count: 20, mode: 'exam', timed: true, minutes: 30 })] };
      }
      const sm = sectionMap[spec];
      return { n: d, title: sm.title, tasks: [
        { id: `${id}:d${d}:cards`, kind: 'cards', title: `Review due ${sm.topic} cards`, minutes: 10, tags: [], topic: sm.topic, exam: S },
        quizTask(id, d, { title: `${sm.topic} practice set`, exam: S, topic: sm.topic, count: 10 }),
      ] };
    }),
  }));
}

const teas6 = teasPlan('teas-6w', [
  { title: 'Reading', focus: 'Main idea, inference, structure, and integrating ideas', days: [['R1'], ['R2'], ['R3'], ['R4'], ['R5']] },
  { title: 'Math foundations', focus: 'Arithmetic, fractions, percents, ratios, algebra', days: [['M1'], ['M2'], ['M3'], ['M4'], ['M5']] },
  { title: 'Math finish and Science begins', focus: 'Measurement, data, then the body systems', days: [['M6'], ['M7'], ['S1'], ['S2'], ['S3']] },
  { title: 'Science: body, cells, and chemistry', focus: 'Immune system, cells, genetics, chemistry', days: [['S4'], ['S5'], ['S6'], ['S7'], ['S8']] },
  { title: 'Scientific reasoning and English', focus: 'Experiments, grammar, punctuation, vocabulary', days: [['S9'], ['E1'], ['E2'], ['E3'], ['E4']] },
  { title: 'Polish and rehearse', focus: 'Final lesson, section reviews, and a timed practice test', days: [['E5'], 'review-reading', 'review-math', 'review-science', 'final'] },
]);

const teas3 = teasPlan('teas-3w', [
  { title: 'Reading and Math', focus: 'Highest-yield skills first', days: [['R1', 'R2'], ['R3', 'R4'], ['M1', 'M2'], ['M3', 'M4'], ['M5', 'M6']] },
  { title: 'Science', focus: 'Anatomy, life science, and chemistry', days: [['S1', 'S2'], ['S3', 'S4'], ['S5', 'S6'], ['S7', 'S8'], ['S9', 'M7']] },
  { title: 'English and rehearsal', focus: 'Grammar, then section reviews and a timed test', days: [['E1', 'E2'], ['E3', 'E4'], ['E5', 'R5'], 'review-science', 'final'] },
]);

// ------------------------------------------------------------------ NCLEX 8w
function nclexWeeks(): WeekDef[] {
  const pid = 'nclex-8w';
  const wk: { title: string; focus: string; cat: string; lessons: string[] }[] = [
    { title: 'Think like the NCLEX', focus: 'Test-taking strategy and Management of Care', cat: 'Management of Care', lessons: ['ST1', 'ST2', 'MC1', 'MC2', 'MC3'] },
    { title: 'Safety and infection control', focus: 'Precautions, falls, restraints, sterile technique', cat: 'Safety & Infection Control', lessons: ['SI1', 'SI2', 'SI3'] },
    { title: 'Health promotion and maintenance', focus: 'Growth, maternal-newborn, screening and prevention', cat: 'Health Promotion & Maintenance', lessons: ['HP1', 'HP2', 'HP3'] },
    { title: 'Psychosocial integrity', focus: 'Communication, crisis, psychiatric care', cat: 'Psychosocial Integrity', lessons: ['PS1', 'PS2', 'PS3'] },
    { title: 'Basic care and comfort', focus: 'Mobility, nutrition, elimination, pain, end of life', cat: 'Basic Care & Comfort', lessons: ['BC1', 'BC2', 'BC3'] },
    { title: 'Pharmacology', focus: 'Safe administration, IV therapy, drug classes and antidotes', cat: 'Pharmacological & Parenteral Therapies', lessons: ['PH1', 'PH2', 'PH3'] },
    { title: 'Reduction of risk potential', focus: 'Labs, perioperative care, complications', cat: 'Reduction of Risk Potential', lessons: ['RR1', 'RR2', 'RR3'] },
    { title: 'Physiological adaptation and final review', focus: 'Acid-base, emergencies, and a full timed rehearsal', cat: 'Physiological Adaptation', lessons: ['PA1', 'PA2', 'PA3'] },
  ];
  let d = 0;
  const seen: string[] = [];
  return wk.map((w, i) => {
    const days: DayDef[] = [];
    for (const l of w.lessons) { d += 1; days.push(lessonDay(pid, d, [l], 'nclex')); seen.push(l); }
    if (i > 0) {
      d += 1;
      days.push({ n: d, title: `${w.cat}: category practice`, tasks: [
        cardsTask(pid, d, w.lessons, 'Review this week\'s flashcards'),
        quizTask(pid, d, { title: `${w.cat} practice set`, exam: 'nclex', topic: w.cat, count: 10 }),
      ] });
      d += 1;
      const last = i === wk.length - 1;
      days.push({ n: d, title: last ? 'Final rehearsal: timed mixed exam' : 'Mixed review of everything so far', tasks: [
        quizTask(pid, d, last
          ? { title: 'Timed mixed NCLEX-style test (20 questions)', exam: 'nclex', count: 20, mode: 'exam', timed: true, minutes: 30 }
          : { title: 'Mixed set (previous weeks)', exam: 'nclex', tags: [...seen], count: 10 }),
        ...(last ? [] : [gameTask(pid, d, 'speed', w.lessons)]),
      ] });
    }
    return { n: i + 1, title: w.title, focus: w.focus, days };
  });
}

// ------------------------------------------------------------------ Core tracks
function coreTrack(pid: string, ids: string[], reviewTitle: string): WeekDef[] {
  const w = (n: number, title: string, focus: string, list: string[], startDay: number): WeekDef => ({
    n, title, focus,
    days: [
      ...list.map((l, i) => lessonDay(pid, startDay + i, [l], 'core')),
      { n: startDay + 4, title: `${reviewTitle}: week ${n} review`, tasks: [
        cardsTask(pid, startDay + 4, list, 'Review this week\'s flashcards'),
        quizTask(pid, startDay + 4, { title: 'Week review quiz', exam: 'core', tags: list, count: 10 }),
        gameTask(pid, startDay + 4, 'match', list),
      ] },
    ],
  });
  return [w(1, 'Week 1', 'Foundations', ids.slice(0, 4), 1), w(2, 'Week 2', 'Building on the basics', ids.slice(4), 6)];
}
const core = (prefix: string) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${prefix}${n}`);

// ------------------------------------------------------------------ Dosage
function dosageWeeks(): WeekDef[] {
  const pid = 'dosage-2w';
  const drill = (d: number, title: string, drills: DrillKind[], count = 8): TaskDef => ({ id: `${pid}:d${d}:drill`, kind: 'drill', title, minutes: 10, count, drills });
  const dayL = (d: number, l: string, dr?: TaskDef): DayDef => ({ n: d, title: lessonTitle(l), tasks: [lessonTask(pid, d, l), cardsTask(pid, d, [l], 'Formula flashcards'), ...(dr ? [dr] : [])] });
  return [
    { n: 1, title: 'Units, oral doses, weight, and IV rates', focus: 'Build the core setups', days: [
      dayL(1, 'DM1', drill(1, 'Conversion drill', ['conversion'])),
      dayL(2, 'DM2', drill(2, 'Oral dosing drill', ['oral'])),
      dayL(3, 'DM3', drill(3, 'Weight-based drill', ['weight'])),
      dayL(4, 'DM4', drill(4, 'IV rate drill', ['iv-rate', 'drip'])),
      { n: 5, title: 'Week 1 review', tasks: [
        { id: `${pid}:d5:quiz`, kind: 'quiz', title: 'Concept check (lessons 1 to 4)', exam: 'dosage', tags: ['DM1', 'DM2', 'DM3', 'DM4'], count: 8, minutes: 10, mode: 'tutor' },
        drill(5, 'Mixed drill', ['conversion', 'oral', 'weight', 'iv-rate', 'drip'], 10),
      ] },
    ] },
    { n: 2, title: 'Drips, safe ranges, and the final check', focus: 'High-alert math and safe practice', days: [
      dayL(6, 'DM5', drill(6, 'Units-per-hour drill', ['units'])),
      dayL(7, 'DM6', drill(7, 'Safe dose range drill', ['safe-range', 'weight'])),
      { n: 8, title: 'Mixed practice', tasks: [drill(8, 'Mixed drill (all types)', ['conversion', 'oral', 'weight', 'iv-rate', 'drip', 'units', 'safe-range'], 12)] },
      { n: 9, title: 'Concept review', tasks: [
        cardsTask(pid, 9, ['DM1', 'DM2', 'DM3', 'DM4', 'DM5', 'DM6'], 'Review all formula cards'),
        { id: `${pid}:d9:quiz`, kind: 'quiz', title: 'Concept quiz (all lessons)', exam: 'dosage', count: 10, minutes: 10, mode: 'tutor' },
      ] },
      { n: 10, title: 'Final assessment', tasks: [drill(10, 'Final assessment: 15 mixed problems', ['conversion', 'oral', 'weight', 'iv-rate', 'drip', 'units', 'safe-range'], 15)] },
    ] },
  ];
}

export const PROGRAMS: ProgramDef[] = [
  { id: 'teas-6w', title: 'TEAS 7 Prep: 6-Week Plan', subtitle: 'The steady path to nursing school entrance', exam: 'teas', level: 'Beginner friendly', duration: '6 weeks · 30 study days', hue: 'brand', icon: 'graduation',
    description: 'Covers all four TEAS 7 sections (Reading, Math, Science, English & Language Usage) with a lesson, flashcards, and a quick check every day, then section reviews and a timed rehearsal.',
    outcomes: ['Review every content area on the TEAS 7 blueprint', 'Build a habit of one short session a day', 'Finish with a timed mixed practice test'], weeks: teas6 },
  { id: 'teas-3w', title: 'TEAS 7 Prep: 3-Week Sprint', subtitle: 'Compressed review for a close test date', exam: 'teas', level: 'Some prior review', duration: '3 weeks · 15 study days', hue: 'coral', icon: 'rocket',
    description: 'Two lessons a day for focused learners. The same TEAS content, paced faster, ending with a science review and a timed mixed test.',
    outcomes: ['Cover all four TEAS sections in 15 days', 'Practice with questions after every lesson pair', 'Rehearse under timed conditions'], weeks: teas3 },
  { id: 'nclex-8w', title: 'NCLEX-RN Foundations: 8 Weeks', subtitle: 'Test-taking strategy plus all eight client-needs categories', exam: 'nclex', level: 'Nursing students', duration: '8 weeks · 40 study days', hue: 'grape', icon: 'stethoscope',
    description: 'Learn how the NCLEX asks questions (ABCs, Maslow, the nursing process, prioritization) and then work through each client-needs category with lessons, flashcards, and practice including select-all-that-apply.',
    outcomes: ['Apply a repeatable method to NCLEX-style questions', 'Review each of the 8 client-needs categories', 'Complete a timed mixed rehearsal in week 8'], weeks: nclexWeeks() },
  { id: 'core-ap', title: 'Anatomy & Physiology Core', subtitle: 'Every major body system in two weeks', exam: 'core', level: 'Prerequisite', duration: '2 weeks · 10 study days', hue: 'sky', icon: 'heart',
    description: 'A clear tour of the body systems nursing students need for pathophysiology.', outcomes: ['Explain how each body system works', 'Link structure to function', 'Prepare for med-surg and pharmacology'], weeks: coreTrack('core-ap', core('AP'), 'A&P') },
  { id: 'core-pharm', title: 'Pharmacology Core', subtitle: 'Drug classes, safety, and the nursing considerations', exam: 'core', level: 'Prerequisite', duration: '2 weeks · 10 study days', hue: 'coral', icon: 'pill',
    description: 'Pharmacokinetics, cardiovascular drugs, anticoagulants, endocrine drugs, antibiotics, pain medicines, CNS drugs, and safe practice, using generic drug names.', outcomes: ['Recognize major drug classes by name endings', 'Know key adverse effects and antidotes', 'Apply medication safety'], weeks: coreTrack('core-pharm', core('PM'), 'Pharmacology') },
  { id: 'core-medsurg', title: 'Med-Surg Basics', subtitle: 'Common adult health disorders and what the nurse does', exam: 'core', level: 'Intermediate', duration: '2 weeks · 10 study days', hue: 'brand', icon: 'clipboard',
    description: 'Cardiovascular, respiratory, endocrine, GI, renal, neurologic, musculoskeletal disorders, and shock.', outcomes: ['Recognize priority signs and symptoms', 'Choose first nursing actions', 'Teach safely'], weeks: coreTrack('core-medsurg', core('MS'), 'Med-Surg') },
  { id: 'core-fund', title: 'Fundamentals of Nursing', subtitle: 'The skills every nurse uses every day', exam: 'core', level: 'Beginner friendly', duration: '2 weeks · 10 study days', hue: 'sun', icon: 'hand',
    description: 'Nursing process, vital signs and assessment, infection prevention, safety, communication, nutrition, wound care, and ethics.', outcomes: ['Use the nursing process', 'Perform safe, standard care', 'Document and communicate clearly'], weeks: coreTrack('core-fund', core('FU'), 'Fundamentals') },
  { id: 'dosage-2w', title: 'Dosage Calculation & Medical Math', subtitle: 'Generated practice with step-by-step worked solutions', exam: 'dosage', level: 'Beginner friendly', duration: '2 weeks · 10 study days', hue: 'sky', icon: 'calculator',
    description: 'Unit conversions, oral doses, weight-based dosing, IV flow rates, units-per-hour infusions, and safe dose ranges. Drills are generated fresh each time, and each shows a computed worked solution.', outcomes: ['Set up dimensional analysis confidently', 'Compute IV rates and weight-based doses', 'Check doses against safe ranges'], weeks: dosageWeeks() },
];

export const getProgram = (id: string) => PROGRAMS.find((p) => p.id === id);
export const programDays = (p: ProgramDef) => p.weeks.flatMap((w) => w.days);
export const programTasks = (p: ProgramDef) => programDays(p).flatMap((d) => d.tasks);
export const requiredTasks = (d: DayDef) => d.tasks.filter((t) => !t.optional);
