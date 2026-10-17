import { route, body } from '@/lib/api';
import { answerQuestion } from '@/lib/practice';
export const POST = route<{ id: string }>(async ({ user, req }, { id }) => {
  const b = await body<{ index: number; answer: number[] | string }>(req);
  return answerQuestion(user.id, id, Number(b.index), b.answer);
});
