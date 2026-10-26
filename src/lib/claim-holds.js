export function holdIsActive(hold,serverTime){
 return hold.active&&Date.parse(hold.expires_at)>Date.parse(serverTime);
}
export function matchingClaimHold(holds,scope,deliveryId,serverTime){
 return holds.find(hold=>holdIsActive(hold,serverTime)&&(hold.scope==='exchange'||scope==='delivery'&&hold.delivery_id===deliveryId));
}
