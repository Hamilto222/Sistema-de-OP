import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { validateUpload } from '../src/services/upload-validation.ts';
import { productionPdf } from './fixtures/pdf.mjs';
import { photoPng } from './fixtures/operator.mjs';
const types=['application/pdf','image/jpeg','image/png','image/webp'];
const validate=file=>validateUpload(file,types,10*1024*1024);
test('Parsing aceita PDF real e decodificação confirma PNG/JPEG/WebP reais',async()=>{
 const inputs=[new File([productionPdf()],'op.pdf',{type:'application/pdf'}),new File([photoPng()],'foto.png',{type:'image/png'})];
 for(const format of ['jpeg','webp'])inputs.push(new File([await sharp(photoPng()).toFormat(format).toBuffer()],`foto.${format==='jpeg'?'jpg':format}`,{type:`image/${format}`}));
 for(const file of inputs){const result=await validate(file);assert.equal(result.mime,file.type);assert.equal(result.bytes.byteLength,file.size);}
});
test('MIME declarado e marcadores PDF não fazem um arquivo falso passar',async()=>{
 for(const bytes of [Buffer.from('HTML disfarçado'),Buffer.from('%PDF-1.7\nHTML disfarçado\n%%EOF')])await assert.rejects(validate(new File([bytes],'op.pdf',{type:'application/pdf'})),/PDF/);
 const empty=await PDFDocument.create();await assert.rejects(validate(new File([await empty.save({addDefaultPage:false})],'empty.pdf',{type:'application/pdf'})),/PDF/);
});
test('Cabeçalhos de imagens falsos/truncados não passam pela decodificação',async()=>{
 for(const [type,extension,bytes] of [['image/png','png',photoPng().subarray(0,33)],['image/jpeg','jpg',Buffer.from([255,216,255,0,1,2,3])],['image/webp','webp',Buffer.from('RIFF0000WEBPFAKE')]])await assert.rejects(validate(new File([bytes],`fake.${extension}`,{type})),/imagem/);
});
test('Extensão não permitida e MIME incompatível são recusados mesmo com conteúdo válido',async()=>{
 for(const [name,type,bytes] of [['foto.html','image/png',photoPng()],['foto.png.exe','image/png',photoPng()],['foto.jpg','image/png',photoPng()],['op.pdf','image/png',photoPng()],['op.pdf','text/html',productionPdf()]])await assert.rejects(validate(new File([bytes],name,{type})),/Extensão/);
});
test('Limites de bytes e arquivo vazio são verificados antes de processar conteúdo',async()=>{
 await assert.rejects(validate(new File([],'foto.png',{type:'image/png'})),/não vazio/);
 await assert.rejects(validate(new File([Buffer.alloc(10*1024*1024+1)],'foto.png',{type:'image/png'})),/10 MB/);
});
test('PNG pequeno comprimido com dimensões excessivas é recusado pelo limite de pixels',async()=>{
 const bytes=await sharp({create:{width:5000,height:5000,channels:3,background:'#ffffff'}}).png().toBuffer();
 assert.ok(bytes.length<10*1024*1024);await assert.rejects(validate(new File([bytes],'large.png',{type:'image/png'})),/megapixels/);
});
