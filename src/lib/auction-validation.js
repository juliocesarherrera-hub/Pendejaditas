export function validateAuctionRules(form){
 const initialPrice=Number(form.price),minIncrement=Number(form.increment),durationHours=Number(form.duration),delayMinutes=Number(form.delay||0);
 if(!Number.isInteger(initialPrice)||initialPrice<1||initialPrice>1000000)throw new Error('El precio inicial debe ser un entero de 1 a 1,000,000 MXN.');
 if(!Number.isInteger(minIncrement)||minIncrement<1||minIncrement>100000)throw new Error('El incremento debe ser un entero de 1 a 100,000 MXN.');
 if(![1,24,48,72,168].includes(durationHours)||!Number.isInteger(delayMinutes)||delayMinutes<0||delayMinutes>1440)throw new Error('Revisa la duración y la programación.');
 const terms=form.terms?.trim();if(!terms||terms.length<20||terms.length>3000)throw new Error('Escribe condiciones de 20 a 3,000 caracteres.');
 return {initialPrice,minIncrement,durationHours,delayMinutes,terms};
}
