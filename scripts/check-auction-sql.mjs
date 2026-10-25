import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse,parsePlPgSQL} from 'libpg-query';

const sql=await readFile('supabase/migrations/202610240005_auctions.sql','utf8');
const tree=await parse(sql);
const audit=await parse(await readFile('supabase/diagnostics/audit-auctions.sql','utf8'));
assert.equal(audit.stmts.length,1);
assert.ok(audit.stmts[0].stmt.SelectStmt);
assert.match(sql,/begin;/);
assert.match(sql,/commit;\s*-- END Pendejaditas auction engine 202610240005\s*$/);
const allowed=['TransactionStmt','DoStmt','CreateStmt','IndexStmt','AlterTableStmt','GrantStmt','CreatePolicyStmt','CreateFunctionStmt','CreateTrigStmt','NotifyStmt'];
for(const {stmt}of tree.stmts)assert.ok(allowed.includes(Object.keys(stmt)[0]),'Unexpected top-level database mutation');
assert.equal(tree.stmts.filter(({stmt})=>stmt.CreateStmt).length,9);
assert.equal((sql.match(/enable row level security/g)||[]).length,9);
assert.ok(!/\b(?:truncate|drop\s+table|delete\s+from)\b/i.test(sql));
assert.ok(!/grant\s+(?:all|insert|update|delete)\s+on\s+public\./i.test(sql));
assert.ok(!/errcode\s*=\s*'40001'/i.test(sql));
const functions=[...sql.matchAll(/create function\s+public\.(\w+)[\s\S]*?\$\$;/gi)];
assert.equal(functions.length,12);
for(const [statement,name]of functions){
  assert.match(statement,/set search_path=''/);
  if(/language plpgsql/i.test(statement))assert.equal((await parsePlPgSQL(statement)).plpgsql_funcs.length,1);
  else await parse(statement.split('$$')[1]);
  console.log(`Syntax OK: ${name}`);
}
const blocks=[...sql.matchAll(/\bdo \$\$([\s\S]*?)\$\$;/gi)];
assert.equal(blocks.length,2);
for(const [,body]of blocks)await parsePlPgSQL(`create function parser_only() returns void language plpgsql as $$${body}$$;`);
const guard=functions.find(([,name])=>name==='place_auction_bid')[0];
assert.ok(guard.indexOf('for share')<guard.indexOf('for update'),'Lock order must remain product before auction');
assert.match(guard,/clock_timestamp\(\)/);
assert.match(guard,/v\.ends_at\+interval '2 minutes'/);
assert.match(guard,/v\.ends_at-v_now<=interval '1 minute'/);
assert.match(guard,/p_amount<v_min/);
assert.match(guard,/p_amount<>trunc\(p_amount\)/);
assert.match(guard,/v\.seller_id=v_user/);
console.log(`OK: ${tree.stmts.length} SQL statements, ${functions.length} function bodies and 2 procedural blocks parsed. No SQL executed; remote catalog, Cron and A/B/C concurrency still require verification after installation.`);
