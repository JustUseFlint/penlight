import fs from 'node:fs';
import path from 'node:path';
import { parseCards, parseLessons, parseQuestions, type ParsedCard, type ParsedLesson, type ParsedQuestion } from './parse';

const dir = () => process.env.CONTENT_DIR || path.join(process.cwd(), 'content');
let cache: { questions: ParsedQuestion[]; cards: ParsedCard[]; lessons: Map<string, ParsedLesson> } | null = null;

export function loadContent() {
  if (cache) return cache;
  const questions: ParsedQuestion[] = [];
  const cards: ParsedCard[] = [];
  const lessons = new Map<string, ParsedLesson>();
  for (const f of fs.readdirSync(dir()).sort()) {
    const src = fs.readFileSync(path.join(dir(), f), 'utf8');
    if (f.startsWith('questions-')) questions.push(...parseQuestions(src, f));
    else if (f.startsWith('cards-')) cards.push(...parseCards(src));
    else if (f.startsWith('lessons-')) for (const l of parseLessons(src)) lessons.set(l.id, l);
  }
  cache = { questions, cards, lessons };
  return cache;
}
export const getLesson = (id: string) => loadContent().lessons.get(id);
