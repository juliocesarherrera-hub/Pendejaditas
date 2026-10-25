export async function preparePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2097152)throw new Error('Selecciona fotografías JPG, PNG o WebP de hasta 2 MB.');
 const url=URL.createObjectURL(file);
 try{
  const picture=new Image();picture.src=url;await picture.decode();
  if(picture.naturalWidth*picture.naturalHeight>40000000)throw new Error('Fotografía demasiado grande.');
  const ratio=Math.min(1,1600/Math.max(picture.naturalWidth,picture.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(picture.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(picture.naturalHeight*ratio));canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!blob||blob.size>2097152)throw new Error('No se pudo optimizar una fotografía.');
  return new File([blob],'foto.webp',{type:'image/webp'});
 }finally{URL.revokeObjectURL(url);}
}
