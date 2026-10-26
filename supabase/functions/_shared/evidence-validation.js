export function validateEvidenceBytes(bytes,expectedMime){
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>5242880)throw new Error('invalid_size');
 const starts=values=>values.every((value,index)=>bytes[index]===value);
 let actual=null;
 if(starts([0xff,0xd8,0xff]))actual='image/jpeg';
 else if(starts([137,80,78,71,13,10,26,10]))actual='image/png';
 else if(bytes.length>=12&&starts([82,73,70,70])&&[87,69,66,80].every((value,index)=>bytes[index+8]===value))actual='image/webp';
 else if(starts([37,80,68,70,45]))actual='application/pdf';
 if(!actual||actual!==expectedMime)throw new Error('invalid_format');
 return actual;
}
export async function evidenceSha256(bytes){
 const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
 return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
}
