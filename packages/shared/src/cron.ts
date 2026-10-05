import parser from 'cron-parser';
import cronstrue from 'cronstrue';

/**
 * Whether a string parses as a 5-field cron expression. Used on both sides of
 * the wire so the client can refuse a bad schedule before it ever reaches the
 * server, and the server can refuse it again regardless of who's asking.
 */
export function isValidCron(expression: string): boolean {
  try {
    parser.parseExpression(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * A plain-language reading of a cron expression, e.g. "Every weekday at
 * 09:00" — the text next to a task's schedule everywhere one is shown. Null
 * for anything that doesn't parse, so a form can show it beside a field that
 * hasn't settled on a valid expression yet without throwing.
 */
export function describeCron(expression: string): string | null {
  if (!isValidCron(expression)) return null;
  try {
    return cronstrue.toString(expression);
  } catch {
    return null;
  }
}
