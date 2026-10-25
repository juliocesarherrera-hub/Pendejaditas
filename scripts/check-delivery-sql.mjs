import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse,parsePlPgSQL} from 'libpg-query';
const sql=await readFile('supabase/migrations/202610240006_delivery_qr.sql','utf8');
const tree=await parse(sql);
const audit=await parse(await readFile('supabase/diagnostics/audit-delivery.sql','utf8'));assert.equal(audit.stmts.length,1);assert.ok(audit.stmts[0].stmt.SelectStmt);
const allowed=['TransactionStmt','DoStmt','CreateStmt','IndexStmt','AlterTableStmt','GrantStmt','CreatePolicyStmt','CreateFunctionStmt','CreateTrigStmt','NotifyStmt'];
for(const{stmt}of tree.stmts)assert.ok(allowed.includes(Object.keys(stmt)[0]),'Unexpected top-level mutation');
assert.equal(tree.stmts.filter(({stmt})=>stmt.CreateStmt).length,7);
assert.equal((sql.match(/enable row level security/g)||[]).length,7);
assert.equal(tree.stmts.filter(({stmt})=>stmt.CreatePolicyStmt).length,3);
// Four internal tables deliberately have default-deny RLS and no client grants.
assert.match(sql,/grant select on public\.delivery_operations,public\.delivery_events,public\.delivery_incidents to authenticated;/);
const clientFunctions=new Set(['create_delivery','issue_delivery_qr','redeem_delivery_qr','confirm_delivery','cancel_delivery','report_delivery_incident','delivery_health']);
const actualClientFunctions=new Set();
for(const[,definitions,roles]of sql.matchAll(/grant execute on function([\s\S]*?) to ([\w,]+);/g)){
 const names=[...definitions.matchAll(/public\.(\w+)\(/g)].map(match=>match[1]);
 if(roles.split(',').includes('authenticated'))for(const name of names){assert.ok(clientFunctions.has(name),'Internal function exposed to client');actualClientFunctions.add(name);}
 if(names.includes('review_delivery_incident'))assert.equal(roles,'postgres');
 assert.ok(!roles.split(',').includes('anon'),'Delivery functions must not be anonymous');
}
assert.deepEqual(actualClientFunctions,clientFunctions);
assert.match(sql,/revoke all on function public\.review_delivery_incident\(uuid,text,text\) from public,anon,authenticated,service_role;/);
assert.ok(!/\b(?:drop|truncate|delete\s+from)\b/i.test(sql));
assert.ok(!/create or replace|errcode\s*=\s*'40001'/i.test(sql));
assert.ok(!/grant\s+(?:all|insert|update|delete)\s+on\s+public\./i.test(sql));
assert.match(sql,/commit;\s*-- END Pendejaditas delivery QR 202610240006\s*$/);
const functions=[...sql.matchAll(/create function\s+public\.(\w+)[\s\S]*?\$\$;/gi)];
assert.equal(functions.length,14);
for(const[statement,name]of functions){assert.match(statement,/set search_path=''/);if(/language plpgsql/i.test(statement))assert.equal((await parsePlPgSQL(statement)).plpgsql_funcs.length,1);else await parse(statement.split('$$')[1]);console.log(`Syntax OK: ${name}`);}
const blocks=[...sql.matchAll(/\bdo \$\$([\s\S]*?)\$\$;/gi)];assert.equal(blocks.length,2);
for(const[,body]of blocks)await parsePlPgSQL(`create function parser_only() returns void language plpgsql as $$${body}$$;`);
const lock=functions.find(([,name])=>name==='delivery_lock')[0];assert.ok(lock.indexOf('public.products')<lock.indexOf('public.exchange_requests'));assert.ok(lock.indexOf('public.exchange_requests')<lock.indexOf('public.exchange_appointments'));
const redeem=functions.find(([,name])=>name==='redeem_delivery_qr')[0];assert.match(redeem,/auth.uid\(\)<>d.seller_id/);assert.match(redeem,/t.expires_at<=v_now/);assert.match(redeem,/t.consumed_at is not null/);assert.match(redeem,/set consumed_at=v_now/);
const issue=functions.find(([,name])=>name==='issue_delivery_qr')[0];assert.match(issue,/interval '90 seconds'/);assert.match(issue,/sha256\(convert_to\(v_secret,'UTF8'\)\)/);assert.match(issue,/auth.uid\(\)<>d.buyer_id/);
assert.match(blocks[1][1],/array\['delivery_operations','delivery_events'\]/);
const confirm=functions.find(([,name])=>name==='confirm_delivery')[0];assert.match(confirm,/auth.uid\(\)<>d.buyer_id/);assert.match(confirm,/p_expected_revision is distinct from d.revision/);
console.log(`OK: ${tree.stmts.length} SQL statements, 14 function bodies and 2 blocks parsed locally. No SQL executed; runtime/RLS/concurrency still unverified.`);
