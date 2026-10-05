/**
 * The fixed set of model aliases a task can pin. Closed, unlike Reeve's own
 * model field: a task here can never end up holding a CLI id outside this
 * list, so there is no "unlisted model, kept as its own option" fallback to
 * carry — see ApiModel/listModels for what the CLI reports about each one.
 */
export const TASK_MODELS = ['sonnet', 'opus', 'haiku', 'fable'] as const;
export type TaskModel = (typeof TASK_MODELS)[number];

/**
 * How hard a model should think. Which of these a given model accepts is its
 * own `supportedEffortLevels`, reported through ApiModel.
 */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * What the CLI's own `supportedModels()` reports about one model, passed
 * through from packages/server/src/runs/models.ts. Every capability field but
 * `supportsAutoMode` is absent-means-yes, so an unannotated model is not
 * crippled; `supportsAutoMode` is absent-means-no — see `fitToModel` in
 * packages/server/src/runs/claude.ts for why that one field reads backwards.
 */
export interface ApiModel {
  /** What to send as `model`: an alias like `opus`, or a full id. */
  value: string;
  /** The full id the alias currently points at, when it is one. */
  resolvedModel: string | null;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: EffortLevel[];
  supportsAdaptiveThinking?: boolean;
  supportsAutoMode?: boolean;
}

export interface ModelsResponse {
  /** Empty when the CLI could not be asked — offline, or not logged in. */
  models: ApiModel[];
}
