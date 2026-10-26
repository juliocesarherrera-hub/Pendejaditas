import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parse,parsePlPgSQL} from 'libpg-query';
const sql=await readFile('supabase/migrations/202610250007_claims.sql','utf8'),tree=await parse(sql);
const types=new Set(['TransactionStmt','DoStmt','CreateStmt','IndexStmt','AlterTableStmt','GrantStmt','CreatePolicyStmt','CreateFunctionStmt','CreateTrigStmt','InsertStmt','NotifyStmt']);
for(const{stmt}of tree.stmts){assert.ok(types.has(Object.keys(stmt)[0]));if(stmt.InsertStmt)assert.equal(stmt.InsertStmt.relation.relname,'buckets');}
assert.equal(tree.stmts.filter(({stmt})=>stmt.CreateStmt).length,11);
assert.ok(!/\b(?:drop|truncate|delete\s+from)\b/i.test(sql));assert.ok(!/create or replace/i.test(sql));assert.match(sql,/commit;\s*-- END Pendejaditas claims and moderation 202610250007\s*$/);
const functions=[...sql.matchAll(/create function\s+public\.(\w+)[\s\S]*?\$\$;/gi)];assert.equal(functions.length,26);
for(const[statement,name]of functions){assert.match(statement,/set search_path=''/);if(/language plpgsql/i.test(statement))await parsePlPgSQL(statement);else await parse(statement.split('$$')[1]);console.log(`Syntax OK: ${name}`);}
const blocks=[...sql.matchAll(/\bdo \$\$([\s\S]*?)\$\$;/gi)];assert.equal(blocks.length,4);for(const[,body]of blocks)await parsePlPgSQL(`create function parser_only() returns void language plpgsql as $$${body}$$;`);
const get=name=>functions.find(([,value])=>name===value)[0];
assert.match(get('my_moderation_role'),/auth.jwt\(\)->>'aal'='aal2'/);assert.match(get('can_moderate_claim'),/auth.uid\(\) not in\(c.buyer_id,c.seller_id\)/);assert.match(get('can_moderate_claim'),/r.resolver_id=auth.uid\(\)/);
assert.match(sql,/values\('claim-evidence','claim-evidence',false,5242880/);assert.match(sql,/claim_files_delete_guard[\s\S]*?using\(bucket_id<>'claim-evidence'\)/);
assert.match(sql,/seal_claim_evidence\(uuid,uuid,text,integer,text\) to service_role/);assert.ok(!/seal_claim_evidence\(uuid,uuid,text,integer,text\) to authenticated/.test(sql));
assert.match(get('open_claim'),/not coalesce\(/);assert.match(get('set_claim_hold'),/p_hours not between 1 and 72/);
assert.ok(!/alter publication|cron.schedule/.test(sql));
const audit=await parse(await readFile('supabase/diagnostics/audit-claims.sql','utf8'));assert.equal(audit.stmts.length,1);assert.ok(audit.stmts[0].stmt.SelectStmt);
console.log(`OK: ${tree.stmts.length} SQL statements, 26 functions and 4 blocks parsed locally. No migration, Edge deployment or remote RLS test executed.`);
