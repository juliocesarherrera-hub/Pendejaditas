// Reproducible, credential-free single-file source for Supabase Dashboard.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const main=await readFile('supabase/functions/claim-evidence/index.ts','utf8');
const shared=await readFile('supabase/functions/_shared/evidence-validation.js','utf8');
const dependency="import {validateEvidenceBytes,evidenceSha256} from '../_shared/evidence-validation.js';";
assert.equal(main.split(dependency).length,2);
// Add real TS annotations when embedding the shared JS in a .ts file.
// Keep JS unchanged for the app/tests and verify each conversion explicitly.
let typedShared=shared.replace(/^export /gm,'');
for(const [before,after]of [
 ['function validateEvidenceBytes(bytes,expectedMime)', 'function validateEvidenceBytes(bytes: Uint8Array,expectedMime: string)'],
 ['const starts=values=>', 'const starts=(values: number[])=>'],
 ['let actual=null;', 'let actual: string | null=null;'],
 ['async function evidenceSha256(bytes)', 'async function evidenceSha256(bytes: Uint8Array)'],
]){assert.equal(typedShared.split(before).length,2);typedShared=typedShared.replace(before,after);}
const source='// Generated from the local audited function. No credentials embedded.\n'+main.replace(dependency,typedShared);
await mkdir('.cache',{recursive:true});
await writeFile('.cache/claim-evidence-dashboard.ts',source);
// Editor-only declarations use the installed SDK's real types. They are not
// included in or required by the deployed, self-contained function.
await writeFile('.cache/claim-evidence-editor.d.ts',`declare module 'npm:@supabase/supabase-js@2.118.0' {
 export const createClient: typeof import('@supabase/supabase-js').createClient;
}
declare const Deno: {
 env: {get(name: string): string | undefined};
 serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};
`);
// Only third-party declaration internals are skipped: the SDK includes Node and
// WebAuthn declarations that do not match this narrow Edge editor environment.
// The function itself remains under strict checking, using the real SDK types.
await writeFile('.cache/tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',lib:['ES2022','DOM'],strict:true,noEmit:true,types:[],skipLibCheck:true},files:['claim-evidence-dashboard.ts','claim-evidence-editor.d.ts']},null,2)+'\n');
console.log('Prepared .cache/claim-evidence-dashboard.ts. No deployment, dependency installation or remote changes.');
