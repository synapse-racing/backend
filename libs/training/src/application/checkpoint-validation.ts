import { BadRequestException } from '@nestjs/common';
import { parseTrackRecipe } from '@synapse/domain';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPair(value: unknown, key: (entry: unknown) => boolean): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    key(value[0]) &&
    isIndex(value[1])
  );
}

function isGenome(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.connections)
  )
    return false;
  const nodes = new Set<number>();
  let inputs = 0;
  let outputs = 0;
  for (const node of value.nodes as unknown[]) {
    if (
      !isRecord(node) ||
      !isIndex(node.id) ||
      nodes.has(node.id) ||
      typeof node.type !== 'string' ||
      !['input', 'bias', 'hidden', 'output'].includes(node.type) ||
      !Number.isFinite(node.layer)
    )
      return false;
    nodes.add(node.id);
    if (node.type === 'input') inputs++;
    if (node.type === 'output') outputs++;
  }
  return (
    inputs === 6 &&
    outputs === 2 &&
    value.connections.every(
      (connection: unknown) =>
        isRecord(connection) &&
        isIndex(connection.innovation) &&
        isIndex(connection.source) &&
        nodes.has(connection.source) &&
        isIndex(connection.target) &&
        nodes.has(connection.target) &&
        Number.isFinite(connection.weight) &&
        typeof connection.enabled === 'boolean',
    )
  );
}

export function validateTrainingConfig(config: Record<string, unknown>): void {
  if (
    !isIndex(config.populationSize) ||
    config.populationSize < 1 ||
    config.populationSize > 256 ||
    (config.inputCount !== undefined && config.inputCount !== 6) ||
    (config.outputCount !== undefined && config.outputCount !== 2)
  ) {
    throw new BadRequestException('Invalid training configuration');
  }
  try {
    parseTrackRecipe(config.track);
  } catch {
    throw new BadRequestException('Invalid training configuration');
  }
}

export function validateCheckpoint(
  snapshot: Record<string, unknown>,
  generation: number,
  seed: number,
  bestGenome: unknown,
): void {
  if (snapshot.version !== 1)
    throw new BadRequestException('Unsupported snapshot version');
  const { config, genomes, innovations } = snapshot;
  if (
    snapshot.seed !== seed ||
    snapshot.generation !== generation ||
    !isIndex(snapshot.nextGenomeId) ||
    !isIndex(snapshot.randomState) ||
    snapshot.randomState > 0xffff_ffff ||
    !isRecord(config) ||
    config.inputCount !== 6 ||
    config.outputCount !== 2 ||
    !Array.isArray(genomes) ||
    genomes.length !== config.populationSize ||
    !genomes.every(isGenome) ||
    !isRecord(innovations) ||
    !isIndex(innovations.nextNode) ||
    !isIndex(innovations.nextInnovation) ||
    !Array.isArray(innovations.connections) ||
    !innovations.connections.every((pair: unknown) =>
      isPair(pair, (key) => typeof key === 'string'),
    ) ||
    !Array.isArray(innovations.splitNodes) ||
    !innovations.splitNodes.every((pair: unknown) => isPair(pair, isIndex)) ||
    (bestGenome != null && !isGenome(bestGenome))
  ) {
    throw new BadRequestException('Invalid training snapshot');
  }
  validateTrainingConfig(config);
}
