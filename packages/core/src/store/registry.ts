import fs from 'fs/promises';
import YAML from 'yaml';

export type RegistrySpaceType = 'single' | 'container';

export interface RegistryProject {
  path: string;
}

/**
 * 외부 시스템 투영 주소 (ADR-0001 / ADR-0002).
 * neurons brain_id / Confluence space.key / Jira project key 의 명시적 매핑.
 * toLowerCase 등 자동 변환은 REFUTED(OC≠openclaw) — 반드시 명시한다.
 * 선택 필드이므로 미선언 시 기존 로더 동작에 영향을 주지 않는다.
 */
export interface RegistryExternal {
  brain_id?: string;
  confluence_space_key?: string;
  jira_project_key?: string;
}

export interface RegistrySpace {
  type: RegistrySpaceType;
  idPrefix: string;
  issues: string;
  epics: string;
  board: string;
  epicBoard: string;
  projects?: Record<string, RegistryProject>;
  external?: RegistryExternal;
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

  // NOTE: idPrefix 중복/subset 충돌은 로더에서 강제하지 않는다 — 기존 시스템은
  // 여러 space가 같은 idPrefix를 갖는 것을 의도적으로 허용한다(id→space 역추출
  // 없이 space 선택 기반 라우팅; reconcile-board 테스트 참조). atlassian-porting
  // 통합 작업의 3-way 매핑 정합성(충돌 회피)은 scripts/verify-naming-three-way.ts가
  // 발행 게이트로 검사한다 (ADR-0002).

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

  if (input.external !== undefined) {
    if (!isRecord(input.external)) {
      throw new Error(`Registry space '${spaceName}' external must be an object`);
    }
    entry.external = {
      brain_id: optionalString(input.external, 'brain_id', `${spaceName}/external`),
      confluence_space_key: optionalString(input.external, 'confluence_space_key', `${spaceName}/external`),
      jira_project_key: optionalString(input.external, 'jira_project_key', `${spaceName}/external`),
    };
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

function optionalString(input: Record<string, unknown>, field: string, context: string): string | undefined {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Registry '${context}' field '${field}' must be a string when present`);
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
