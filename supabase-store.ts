import type { PanelUserPublic, SignedLoanContract, VisitRecord } from './src/types/contract';

export interface StoredUser extends PanelUserPublic {
  passwordHash: string;
}

export class SupabaseStore {
  constructor(
    private readonly secret: string,
    private readonly url: string,
    private readonly publishableKey: string,
  ) {}

  private async rpc<T>(action: string, payload: object = {}): Promise<T> {
    const response = await fetch(new URL('/rest/v1/rpc/rp_financeira_gateway', this.url), {
      method: 'POST',
      headers: { apikey: this.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, backend_secret: this.secret }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw Object.assign(new Error('Supabase rejected the operation'), { code: 'SUPABASE_' + response.status });
    }
    return response.json() as Promise<T>;
  }

  health() { return this.rpc<boolean>('health'); }
  userById(id: string) { return this.rpc<StoredUser | null>('user_id', { id }); }
  userByUsername(username: string) { return this.rpc<StoredUser | null>('user_name', { username }); }
  activeAgent(code: string) { return this.rpc<StoredUser | null>('agent', { code }); }
  users() { return this.rpc<StoredUser[]>('users'); }
  insertUser(user: StoredUser) { return this.rpc<boolean>('user_add', user); }
  updateUser(id: string, changes: Partial<StoredUser>) {
    return this.rpc<StoredUser | null>('user_update', { id, changes });
  }
  deleteUser(id: string) { return this.rpc<null>('user_delete', { id }); }
  insertVisit(visit: VisitRecord) { return this.rpc<null>('visit_add', visit); }
  insertContract(contract: SignedLoanContract) { return this.rpc<null>('contract_add', contract); }
  contract(protocol: string) { return this.rpc<SignedLoanContract | null>('contract', { protocol }); }
  activity(begin: string, end: string, agent: string | null) {
    return this.rpc<{ visits: VisitRecord[]; contracts: SignedLoanContract[] }>('activity', { begin, end, agent });
  }
}
