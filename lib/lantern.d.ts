export interface LanternRequest {
  method: string;
  /** Le chemin signé, sans la chaîne de requête. */
  path: string;
  header: (name: string) => string | null | undefined;
  /** La racine de l'application, là où vit package.json. Par défaut process.cwd(). */
  root?: string;
  env?: Record<string, string | undefined>;
  /** L'heure, en secondes Unix, pour les tests. */
  now?: number;
}
export interface LanternResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface LanternKey {
  id: string;
  secret: string;
}
export const LANTERN_VERSION: string;
export function handle(request: LanternRequest): LanternResponse;
export function collect(root: string, errors: Array<{ scope: string; reason: string }>): { runtime: object; packages: Array<{ name: string; version: string | null; declared: string | null }> };
export function loadKeys(env: Record<string, string | undefined>): LanternKey[];
