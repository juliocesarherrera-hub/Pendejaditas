import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse, parsePlPgSQL} from 'libpg-query';

const sql = await readFile('supabase/migrations/202610240004_private_chat.sql', 'utf8');
const tree = await parse(sql);
assert.match(sql, /^--[\s\S]*?\bbegin;/i);
assert.match(sql, /commit;\s*-- END Pendejaditas private chat foundation 202610240004\s*$/);
const tables = tree.stmts.filter(({stmt}) => stmt.CreateStmt);
assert.equal(tables.length, 7);
const allowed = ['TransactionStmt','CreateStmt','IndexStmt','CreateFunctionStmt','AlterTableStmt','GrantStmt','GrantRoleStmt','CreatePolicyStmt','DoStmt','NotifyStmt'];
for (const {stmt} of tree.stmts) assert.ok(allowed.includes(Object.keys(stmt)[0]), 'Unexpected top-level SQL mutation');
assert.equal((sql.match(/enable row level security/g) || []).length, 7);
assert.equal(tree.stmts.filter(({stmt}) => stmt.CreatePolicyStmt).length, 7);
const functions = [...sql.matchAll(/create function\s+public\.(\w+)[\s\S]*?\$\$;/gi)];
assert.equal(functions.length, 9);
let procedural = 0;
for (const [statement, name] of functions) {
  assert.match(statement, /set search_path=''/);
  if (/language plpgsql/i.test(statement)) {
    const parsed = await parsePlPgSQL(statement);
    assert.equal(parsed.plpgsql_funcs.length, 1);
    procedural++;
  } else await parse(statement.split('$$')[1]);
  console.log(`Syntax OK: ${name}`);
}
assert.equal(procedural, 5);
const block = sql.match(/do \$\$([\s\S]*?)\$\$;/i);
assert.ok(block);
await parsePlPgSQL(`create function parser_only() returns void language plpgsql as $$${block[1]}$$;`);
assert.ok(!/errcode\s*=\s*'40001'/i.test(sql));
assert.ok(!/grant\s+(?:all|insert|update|delete)\s+on\s+public\./i.test(sql));
console.log(`OK: ${tree.stmts.length} SQL statements, 9 function bodies and publication block parsed locally. No migration executed; remote permissions still require A/B/C tests.`);
