import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse, parsePlPgSQL } from 'libpg-query';

const file = 'supabase/migrations/202610240002_meetings.sql';
const sql = await readFile(file,'utf8');
const tree = await parse(sql);
await parse(await readFile('supabase/diagnostics/check-meetings-installation.sql','utf8'));
assert.match(sql, /\bbegin;/i);
assert.match(sql, /commit;\s*-- END Pendejaditas meetings migration 202610240002\s*$/);
assert.ok(!/\b(?:drop|truncate|delete\s+from)\b/i.test(sql));
const functions = [...sql.matchAll(/create function\s+public\.(\w+)[\s\S]*?\$\$;/gi)];
assert.equal(functions.length,4,'Se esperan las cuatro funciones completas.');
let plpgsql = 0;
for (const [statement,name] of functions) {
  if (/language plpgsql/i.test(statement)) {
    const parsed = await parsePlPgSQL(statement);
    assert.equal(parsed.plpgsql_funcs.length,1);
    plpgsql++;
    console.log(`PL/pgSQL válido: ${name}.`);
  } else {
    const body = statement.split('$$')[1];
    await parse(body);
    console.log(`Cuerpo SQL válido: ${name}.`);
  }
}
assert.equal(plpgsql,3);
// Regression: the original complete function failed without CASE parentheses.
const corrected = functions.find((entry) => entry[1] === 'change_appointment')[0];
const bad = corrected.replace('(case when v_exists then v_appointment.revision else 0 end)','case when v_exists then v_appointment.revision else 0 end');
await assert.rejects(() => parsePlPgSQL(bad),/syntax error at end of input/);
console.log(`OK: ${tree.stmts.length} instrucciones SQL, 3 cuerpos PL/pgSQL y 1 cuerpo SQL. La variante original reproduce el error; la corregida pasa.`);
console.log(`SHA-256 del archivo comprobado: ${createHash('sha256').update(sql).digest('hex')}`);
console.log('Análisis de sintaxis local con parser PostgreSQL 18; no se ejecutó ninguna instrucción ni se comprobó el estado del catálogo remoto.');
const correction=await readFile('supabase/migrations/202610240003_meetings_conflicts.sql','utf8');
const patchTree=await parse(correction);
assert.ok(!correction.includes("errcode='40001'"));
const replacements=[...correction.matchAll(/create or replace function\s+public\.(\w+)[\s\S]*?\$\$;/gi)];
assert.equal(replacements.length,2);
for(const [statement,name] of replacements) { await parsePlPgSQL(statement); console.log(`Corrección RPC válida: ${name}.`); }
assert.match(correction,/commit;\s*-- END Pendejaditas stale revision fix 202610240003\s*$/);
assert.equal(patchTree.stmts.filter((entry)=>entry.stmt.CreateFunctionStmt).length,2);
assert.ok(patchTree.stmts.every((entry)=>['TransactionStmt','CreateFunctionStmt','NotifyStmt'].includes(Object.keys(entry.stmt)[0])));
console.log('OK: corrección 003 analizada; solo definiciones de funciones, transacción y recarga de esquema.');
