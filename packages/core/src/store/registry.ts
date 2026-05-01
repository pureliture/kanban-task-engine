import fs from 'fs/promises';
import YAML from 'yaml';

export type RegistrySpaceType = 'single' | 'container';

export interface RegistryProject {
  path: string;
}

export interface RegistrySpace {
  type: RegistrySpaceType;
  idPrefix: string;
  issues: string;
  epics: string;
  board: string;
  epicBoard: string;
  projects?: Record<string, RegistryProject>;
}

export interface VaultRegistry {
  spaces: Record<string, RegistrySpace>;
}

export async function loadRegistry(registryPath: string): Promise<VaultRegistry> {
  return parseRegistryYaml(await fs.readFile(registryPath, 'utf8'));
}

export function parseRegistryYaml(content: string): VaultRegistry {
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid registry YAML: ${message}`);
  }

  return validateRegistry(parsed);
}

export function getRegistrySpace(registry: VaultRegistry, space: string): RegistrySpace {
  const entry = registry.spaces[space];
  if (!entry) {
    throw new Error(`Unknown registry space: ${space}`);
  }
  return entry;
}

export function listRegistrySpaces(registry: VaultRegistry): string[] {
  return Object.keys(registry.spaces);
}

function validateRegistry(input: unknown): VaultRegistry {
  if (!isRecord(input)) {
    throw new Error('Registry must be an object');
  }

  if (!isRecord(input.spaces)) {
    throw new Error('Registry must define spaces');
  }

  const spaces: Record<string, RegistrySpace> = {};
  for (const [spaceName, rawSpace] of Object.entries(input.spaces)) {
    spaces[spaceName] = validateSpace(spaceName, rawSpace);
  }

  return { spaces };
}

function validateSpace(spaceName: string, input: unknown): RegistrySpace {
  if (!isRecord(input)) {
    throw new Error(`Registry space '${spaceName}' must be an object`);
  }

  if ('workspace_path' in input || 'workspacePath' in input) {
    throw new Error(`Registry space '${spaceName}' uses a legacy workspace path field`);
  }

  const type = requireString(input, 'type', spaceName);
  if (type !== 'single' && type !== 'container') {
    throw new Error(`Registry space '${spaceName}' has invalid type: ${type}`);
  }

  const idPrefix = requireString(input, 'idPrefix', spaceName);
  if (!/^[A-Z][A-Z0-9]*$/.test(idPrefix)) {
    throw new Error(`Registry space '${spaceName}' has invalid idPrefix: ${idPrefix}`);
  }

  const entry: RegistrySpace = {
    type,
    idPrefix,
    issues: requireRelativePath(input, 'issues', spaceName),
    epics: requireRelativePath(input, 'epics', spaceName),
    board: requireRelativePath(input, 'board', spaceName),
    epicBoard: requireRelativePath(input, 'epicBoard', spaceName),
  };

  if (input.projects !== undefined) {
    if (!isRecord(input.projects)) {
      throw new Error(`Registry space '${spaceName}' projects must be an object`);
    }

    entry.projects = {};
    for (const [projectName, rawProject] of Object.entries(input.projects)) {
      if (!isRecord(rawProject)) {
        throw new Error(`Registry project '${spaceName}/${projectName}' must be an object`);
      }
      entry.projects[projectName] = {
        path: requireRelativePath(rawProject, 'path', `${spaceName}/${projectName}`),
      };
    }
  }

  return entry;
}

function requireString(input: Record<string, unknown>, field: string, context: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Registry '${context}' missing required string field: ${field}`);
  }
  return value;
}

function requireRelativePath(input: Record<string, unknown>, field: string, context: string): string {
  const value = requireString(input, field, context);
  if (value.startsWith('/') || value.includes('..')) {
    throw new Error(`Registry '${context}' field '${field}' must be a relative safe path`);
  }
  return value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
