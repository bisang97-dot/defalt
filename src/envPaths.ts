import path from "node:path";

/**
 * .env, group_master.env 등 민감한 설정 파일을 프로젝트 루트가 아니라 별도 폴더(`env/`)에 모아둔다.
 * 운영 서버에서 이 폴더 하나만 별도 권한(예: chmod 700, 전용 계정 소유)으로 잠글 수 있게 하기 위함이다.
 *
 * 이 파일(src/envPaths.ts, 빌드 후 dist/envPaths.js)은 항상 프로젝트 루트 바로 아래에 있으므로
 * `..` 한 번으로 루트를 가리킨다. 다른 파일은 이 모듈이 계산한 경로를 가져다 쓰기만 하면 되고,
 * 자기 위치 기준으로 상대 경로를 다시 계산할 필요가 없다.
 */
const PROJECT_ROOT = path.resolve(__dirname, "..");

/** ENV_DIR 환경변수로 폴더 위치 자체를 바꿀 수도 있다 (예: 컨테이너 밖의 별도 볼륨). */
export const ENV_DIR = process.env.ENV_DIR ?? path.join(PROJECT_ROOT, "env");

export const DOTENV_PATH = path.join(ENV_DIR, ".env");
export const GROUP_MASTER_DEFAULT_PATH = path.join(ENV_DIR, "group_master.env");
