import fs from "node:fs";
import { GROUP_MASTER_DEFAULT_PATH } from "../envPaths";

/**
 * Anthropic Admin API의 RBAC 그룹 조회(`/v1/organizations/rbac_groups`)가 이 서비스가 쓰는
 * Admin API 키로는 동작하지 않는 조직(권한/스코프/그룹 기능 미사용 등)을 위해,
 * "로그인 이메일 -> 소속 그룹명" 매핑을 로컬 파일에서 직접 관리하는 방식으로 대체한다.
 *
 * 파일 형식 (기본 경로: env/group_master.env, GROUP_MASTER_PATH 환경변수로 변경 가능):
 *   이메일, "그룹명"
 * 예)
 *   skim@lgacademy.com, "업무지원/재경"
 *   sjyang@lgacademy.com, "리더교육센터"
 *
 * `#` 로 시작하는 줄과 빈 줄은 무시한다. 이메일만 있고 그룹명이 없는 줄도 무시한다
 * (같은 줄에 유효한 그룹명이 함께 적힌 이메일만 매핑에 포함되고, 그 결과 대시보드에도 그 대상자만 표시된다).
 * 파일이 수정되면(mtime 변경 시) 다음 조회에서 자동 반영된다.
 */

function resolvePath(): string {
  return process.env.GROUP_MASTER_PATH ?? GROUP_MASTER_DEFAULT_PATH;
}

function parseLine(rawLine: string): [email: string, group: string] | null {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;

  const commaIndex = line.indexOf(",");
  if (commaIndex === -1) return null;

  const email = line.slice(0, commaIndex).trim().toLowerCase();
  let group = line.slice(commaIndex + 1).trim();
  if (group.length >= 2 && group.startsWith('"') && group.endsWith('"')) {
    group = group.slice(1, -1).trim();
  }

  if (!email || !group) return null;
  return [email, group];
}

interface Cache {
  mtimeMs: number;
  byEmail: Map<string, string>;
}

let cache: Cache | null = null;

function load(): Map<string, string> {
  const filePath = resolvePath();

  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // 파일이 없으면 그룹 매핑 없이 동작한다 (모든 멤버의 소속 그룹이 "-" 로 표시됨).
    cache = null;
    return new Map();
  }

  if (cache && cache.mtimeMs === mtimeMs) {
    return cache.byEmail;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const byEmail = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed) byEmail.set(parsed[0], parsed[1]);
  }

  cache = { mtimeMs, byEmail };
  return byEmail;
}

/** 이메일(대소문자 무관) -> 그룹명. 매핑이 없으면 null. */
export function getGroupForEmail(email: string): string | null {
  return load().get(email.trim().toLowerCase()) ?? null;
}

/** 전체 이메일 -> 그룹명 매핑. */
export function getAllGroupAssignments(): Map<string, string> {
  return load();
}

/** group_master.env 파일 자체를 찾지 못했거나 비어 있는지 여부 (진단용 경고 표시에 사용). */
export function isGroupMasterMissingOrEmpty(): boolean {
  return load().size === 0;
}
