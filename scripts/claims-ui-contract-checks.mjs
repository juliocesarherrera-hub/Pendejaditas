import assert from 'node:assert/strict';
import {claimTargets,selectedClaimTarget} from '../src/lib/claim-form.js';
import {createModeratorMfa,totpState} from '../src/lib/moderator-mfa.js';
import {holdIsActive,matchingClaimHold} from '../src/lib/claim-holds.js';
const serverTime='2026-10-25T12:00:00Z',hold={id:'hold',scope:'exchange',active:true,expires_at:'2026-10-25T13:00:00Z'};
assert.equal(holdIsActive(hold,serverTime),true);
assert.equal(matchingClaimHold([hold],'exchange',null,serverTime),hold);
assert.equal(matchingClaimHold([hold],'delivery','delivery',serverTime),hold);
assert.equal(matchingClaimHold([{...hold,active:false}],'exchange',null,serverTime),undefined);
assert.equal(matchingClaimHold([{...hold,expires_at:serverTime}],'exchange',null,serverTime),undefined);
assert.equal(matchingClaimHold([{...hold,scope:'delivery',delivery_id:'one'}],'delivery','other',serverTime),undefined);
const exchange={id:'exchange',product_id:'product'};
const targets=claimTargets(exchange,[{id:'appointment',exchange_id:'exchange'},{id:'foreign',exchange_id:'other'}],[{id:'delivery',exchange_id:'exchange'}]);
assert.equal(selectedClaimTarget('',targets),'publication:product');assert.equal(selectedClaimTarget('appointment:appointment',targets),'appointment:appointment');assert.equal(selectedClaimTarget('delivery:foreign',targets),'publication:product');assert.ok(!targets.some(row=>row.id==='foreign'));
assert.equal(selectedClaimTarget('',claimTargets({id:'exchange',product_id:null})),'exchange:exchange');
const pending={id:'pending',factor_type:'totp',status:'unverified',friendly_name:'Moderación Pendejaditas'};
assert.equal(totpState({all:[pending],totp:[]}).pending.length,1);
let factors=[pending],level='aal1',creates=0,removes=0,verifies=0;
const mfa=createModeratorMfa({auth:{mfa:{
 listFactors:async()=>({data:{all:factors,totp:factors.filter(f=>f.status==='verified')},error:null}),
 getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level},error:null}),
 enroll:async params=>{creates++;assert.match(params.friendlyName,/^Pendejaditas /);factors=[{...pending,id:'new'}];return {data:{id:'new',totp:{uri:'otpauth://technical-fixture',secret:'TEST_ONLY_NOT_A_REAL_KEY'}},error:null};},
 unenroll:async({factorId})=>{assert.equal(factorId,'pending');removes++;factors=[];return {error:null};},
 challengeAndVerify:async({factorId,code})=>{assert.equal(factorId,'new');assert.equal(code,'123456');verifies++;factors=[{...pending,id:'new',status:'verified'}];level='aal2';return {error:null};},
}}});
await assert.rejects(()=>mfa.enroll(),/configuración pendiente/);assert.equal(creates,0);
await assert.rejects(()=>mfa.restart('pending',false));assert.equal(removes,0);
factors=[{...pending,status:'verified'}];await assert.rejects(()=>mfa.restart('pending',true));assert.equal(removes,0);
factors=[{...pending,friendly_name:'Otro flujo'}];await assert.rejects(()=>mfa.restart('pending',true));assert.equal(removes,0);
factors=[pending];await mfa.restart('pending',true);assert.equal(removes,1);assert.equal(creates,1);
await assert.rejects(()=>mfa.verify('new','123'));assert.equal(verifies,0);
assert.equal((await mfa.verify('new','123456')).currentLevel,'aal2');assert.equal(verifies,1);
await assert.rejects(()=>mfa.enroll(),/verificado/);assert.equal(creates,1);
console.log('OK: contexto inicial válido sin ocultar el formulario; MFA usa factores pendientes de all, evita duplicados y solo reinicia pendientes propios con confirmación. Nunca elimina factores verificados. Pruebas con clientes inyectados, sin cambios remotos.');
