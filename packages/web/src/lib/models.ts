import { EFFORT_LEVELS, TASK_MODELS, type ApiModel, type EffortLevel } from '@vesper/shared';

/**
 * The model the CLI listed under this alias or full id, if it did. The same
 * match the server makes before a run.
 */
export function findModel(models: ApiModel[], model: string | null): ApiModel | undefined {
  return model ? models.find((m) => m.value === model || m.resolvedModel === model) : undefined;
}

/**
 * The effort levels worth offering beside `model`. Reads the CLI's answer the
 * way the server does: a model it did not list, or a capability it did not
 * report, is assumed to take every level. No model at all is the CLI's
 * default, which is not known here, so it is offered everything too.
 */
export function effortLevelsFor(models: ApiModel[], model: string | null): readonly EffortLevel[] {
  const m = findModel(models, model);
  if (!m) return EFFORT_LEVELS;
  if (m.supportsEffort === false) return [];
  return m.supportedEffortLevels ?? EFFORT_LEVELS;
}

/**
 * The choices for a model select: the four fixed aliases a task can pin,
 * labelled with whatever the CLI calls each one once it has answered.
 * Unlike Reeve, there is no "unlisted value kept as its own option" fallback
 * — model is a closed enum here, so a task can never hold anything outside
 * this list.
 */
export function modelOptions(models: ApiModel[]): Array<{ value: string; label: string }> {
  return TASK_MODELS.map((alias) => ({ value: alias, label: findModel(models, alias)?.displayName ?? alias }));
}

/**
 * What to keep of an effort when the model beside it changes: itself, if the
 * new model takes it, or nothing — so the form never holds a pair the run
 * would have to quietly correct.
 */
export function keepEffort(models: ApiModel[], model: string | null, effort: EffortLevel | null): EffortLevel | null {
  return effort && effortLevelsFor(models, model).includes(effort) ? effort : null;
}
