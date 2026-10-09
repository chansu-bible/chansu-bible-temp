import pg from 'pg'

// SQL 한 문장을 실행한다. 자리표시는 $1, $2...
export type Query = <T>(text: string, params?: unknown[]) => Promise<T[]>

// 서버가 쓰는 최소 인터페이스. 운영은 pg, 시험은 PGlite가 구현한다.
export type Sql = {
  query: Query
  // 연결 하나에서 트랜잭션으로 묶어 실행한다. fn이 던지면 되돌린다.
  transaction<T>(fn: (query: Query) => Promise<T>): Promise<T>
}

export function pgSql(databaseUrl: string): Sql & { end(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 })
  // 쉬는 연결이 끊겨도 서버가 죽지 않게 한다(다음 요청이 새로 연결한다).
  pool.on('error', (error) => console.error('Postgres 연결 오류:', error.message))
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pool.query(text, params)).rows as T[],
    transaction: async <T>(fn: (query: Query) => Promise<T>): Promise<T> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(async <R>(text: string, params: unknown[] = []) => (await client.query(text, params)).rows as R[])
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
    end: () => pool.end(),
  }
}

// 표 만들기. 서버가 시작할 때마다 돌려도 된다.
// records: 사용자(sub)별 기록 줄. seq는 서버가 매기는 순번이라, 기기 시계와 상관없이 어디까지 받아 갔는지 정한다.
export async function migrate(sql: Pick<Sql, 'query'>): Promise<void> {
  await sql.query('CREATE SEQUENCE IF NOT EXISTS record_seq')
  await sql.query(`CREATE TABLE IF NOT EXISTS records (
    user_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT,
    seq BIGINT NOT NULL,
    PRIMARY KEY (user_id, collection, id)
  )`)
  await sql.query('CREATE INDEX IF NOT EXISTS records_user_seq ON records (user_id, seq)')
}
