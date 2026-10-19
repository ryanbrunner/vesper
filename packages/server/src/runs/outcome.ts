/**
 * A run that did not throw can still have failed: Claude was asked to do
 * something and could not (a tool was denied, a service was unreachable, the
 * skill it was told to run does not exist). The SDK reports all of those as
 * `success`, because the session itself ended normally, so the only one who
 * knows is Claude. Every run is told to say so on its last line, and this
 * reads that line back.
 *
 * Lenient on purpose: a reply with no marker is taken as a success, since a
 * model forgetting a formatting instruction should not turn a good run red.
 */
export const OUTCOME_PROMPT = [
  'You are running unattended as a scheduled task, and nobody will read your reply live.',
  'End your final message with exactly one line reporting whether you accomplished what the task asked:',
  '`VESPER_OUTCOME: SUCCESS` if you did, or `VESPER_OUTCOME: FAILURE: <one-sentence reason>` if you could not',
  '(for example: a tool call was denied, a service or file was unavailable, an instruction could not be carried out,',
  'or the result is incomplete). Do not report SUCCESS for work you skipped, guessed at or only partly did.',
].join(' ');

export interface Outcome {
  /** Claude's own text with the marker line removed. */
  text: string;
  /** Claude's stated reason, when it reported failure. */
  failure: string | null;
}

const MARKER = /^[ \t>*`_-]*VESPER_OUTCOME:\s*(SUCCESS|FAILURE)\b[\s:.\-–—]*(.*?)[`*_ \t]*$/gim;

/** The last outcome line in `result`, if any, and the text without it. */
export function parseOutcome(result: string): Outcome {
  const matches = [...result.matchAll(MARKER)];
  const last = matches.at(-1);
  if (!last) return { text: result, failure: null };
  const text = result.replace(MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
  if ((last[1] ?? '').toUpperCase() === 'SUCCESS') return { text, failure: null };
  return { text, failure: (last[2] ?? '').trim() || 'Claude reported that it could not complete the task.' };
}
