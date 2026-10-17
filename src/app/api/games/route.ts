import { route, body } from '@/lib/api';
import { GAMES, gameData, gameStats, recordGame, type GameId } from '@/lib/games';
export const GET = route(async ({ user, req }) => {
  const q = new URL(req.url).searchParams;
  const game = q.get('game') as GameId | null;
  if (!game) return { games: GAMES, stats: gameStats(user.id) };
  return gameData(user.id, game, { lectureId: q.get('lecture') || undefined, deck: q.get('deck') || undefined, exam: q.get('exam') || undefined, tags: q.get('tags')?.split(',').filter(Boolean), seed: q.get('seed') || undefined });
});
export const POST = route(async ({ user, tz, req }) => {
  const b = await body<Parameters<typeof recordGame>[1]>(req);
  return recordGame(user.id, b, tz);
});
