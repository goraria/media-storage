import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "@/utils/environment";
if (!databaseUrl) throw new Error("cloud_database_not_configured");
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 15000 });
let client: PoolClient;
beforeAll(async () => { client = await pool.connect(); await client.query("BEGIN"); await client.query("SET LOCAL statement_timeout='15s'"); });
beforeEach(async () => { await client.query("SAVEPOINT fixture"); });
afterEach(async () => { if (client) { await client.query("ROLLBACK TO SAVEPOINT fixture"); await client.query("RELEASE SAVEPOINT fixture"); } });
afterAll(async () => { if (client) { await client.query("ROLLBACK"); client.release(); } await pool.end(); });

const bucket="readiness-"+crypto.randomUUID();
async function profile(application:string) {
  return client.query("INSERT INTO media_storage_profile(application,bucket_name,endpoint,region,credentials_url) VALUES($1,$2,'https://storage.fixture.invalid','auto','https://app.fixture.invalid/internal/storage/credential') RETURNING id,application,enabled",[application,bucket]);
}
it("keeps a single storage profile for an application/bucket", async()=>{
  await profile("reader");
  await expect(profile("reader")).rejects.toMatchObject({code:"23505"});
});
it("keeps profiles of two applications independent", async()=>{
  await profile("reader");await profile("chat");
  const {rows}=await client.query("SELECT application FROM media_storage_profile WHERE bucket_name=$1 ORDER BY application",[bucket]);
  expect(rows).toEqual([{application:"chat"},{application:"reader"}]);
});
it("persists routing metadata without adding storage credential columns", async()=>{
  const result=await profile("reader");
  expect(result.rows[0]).toMatchObject({application:"reader",enabled:true});
  const {rows}=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='media_storage_profile' AND column_name ~ '(secret|access_key|token|password)'");
  expect(rows).toEqual([]);
});
