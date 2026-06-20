#!/usr/bin/env -S node --import tsx
/**
 * verify-naming-three-way.ts — P0-1 검증 게이트 (ADR-0001 / ADR-0002)
 *
 * registry 의 3-way naming 정합성을 검사한다. 이 검사는 registry 로더에 강제하지
 * 않는다 — 기존 시스템은 idPrefix 중복을 허용하므로(space 선택 라우팅), atlassian
 * 발행 경로의 정합성만 여기서 게이트한다.
 *
 * 검사 항목:
 *  1. idPrefix 정규식 ^[A-Z][A-Z0-9]*$ (로더와 동일, 재확인)
 *  2. idPrefix prefix-subset 충돌(OC ⊂ OCA) / 중복 — 발행 라우팅 모호성 차단
 *  3. external.brain_id 형식 /project/<slug> (소문자-하이픈)
 *  4. external.confluence_space_key 가 placeholder(<...>)이거나 미설정이면 warn (M4 probe까지 허용)
 *
 * 사용: pnpm exec tsx scripts/verify-naming-three-way.ts [--registry <path>]
 * exit: error 있으면 1, 아니면 0 (warn 만 있어도 0)
 */

import { loadRegistry } from '../packages/core/src/store/registry';

const ID_PREFIX_RE = /^[A-Z][A-Z0-9]*$/;
const BRAIN_ID_RE = /^\/project\/[a-z0-9][a-z0-9-]*$/;
const PLACEHOLDER_RE = /[<>]/;

type Finding = { level: 'ok' | 'warn' | 'error'; space: string; msg: string };

function resolveDefaultRegistry(): string {
  const home = process.env.KANBAN_HOME ?? `${process.env.HOME}/.openclaw/workspace-kanban/kanban`;
  return `${home}/registry.yaml`;
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--registry');
  const registryPath = i >= 0 ? argv[i + 1] : resolveDefaultRegistry();

  console.log(`[verify-naming-three-way] registry: ${registryPath}`);
  const registry = await loadRegistry(registryPath);
  const findings: Finding[] = [];

  const prefixes = Object.entries(registry.spaces).map(([name, s]) => ({ name, prefix: s.idPrefix }));

  for (const [name, space] of Object.entries(registry.spaces)) {
    if (!ID_PREFIX_RE.test(space.idPrefix)) {
      findings.push({ level: 'error', space: name, msg: `idPrefix '${space.idPrefix}' 정규식 위반` });
    }
    const ext = space.external;
    if (!ext) {
      findings.push({ level: 'error', space: name, msg: 'external 매핑 미정의 (ADR-0002)' });
      continue;
    }
    if (!ext.brain_id || !BRAIN_ID_RE.test(ext.brain_id)) {
      findings.push({ level: 'error', space: name, msg: `external.brain_id '${ext.brain_id}' 형식 위반(/project/<slug>)` });
    } else {
      findings.push({ level: 'ok', space: name, msg: `brain_id ${ext.brain_id}` });
    }
    if (!ext.confluence_space_key || PLACEHOLDER_RE.test(ext.confluence_space_key)) {
      findings.push({ level: 'warn', space: name, msg: 'confluence_space_key 미설정/placeholder (M4 probe에서 실값 확보)' });
    }
  }

  // prefix-subset / 중복 충돌 (발행 라우팅 정합성)
  for (const a of prefixes) {
    for (const b of prefixes) {
      if (a.name === b.name) continue;
      if (a.prefix === b.prefix) {
        findings.push({ level: 'error', space: `${a.name}/${b.name}`, msg: `idPrefix 중복: ${a.prefix}` });
      } else if (b.prefix.startsWith(a.prefix)) {
        findings.push({ level: 'error', space: `${a.name}→${b.name}`, msg: `prefix-subset 충돌: '${a.prefix}' ⊂ '${b.prefix}'` });
      }
    }
  }

  for (const f of findings) {
    const icon = f.level === 'ok' ? '✓' : f.level === 'warn' ? '⚠' : '✗';
    console.log(`${icon} [${f.space}] ${f.msg}`);
  }
  const errors = findings.filter((f) => f.level === 'error').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  console.log(`\n결과: ${errors} error, ${warns} warn`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
