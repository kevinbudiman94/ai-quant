(function(root){
'use strict';
const V=4,S=17+4*V,DATA_CW=80,ECC_CW=20;
function gfTables(){const exp=new Array(512),log=new Array(256).fill(0);let x=1;for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)exp[i]=exp[i-255];return {exp,log};}
const GF=gfTables();
function gfMul(a,b){if(a===0||b===0)return 0;return GF.exp[GF.log[a]+GF.log[b]];}
function rsDivisor(deg){let res=new Array(deg).fill(0);res[deg-1]=1;let root=1;for(let i=0;i<deg;i++){for(let j=0;j<deg;j++){res[j]=gfMul(res[j],root);if(j+1<deg)res[j]^=res[j+1];}root=gfMul(root,2);}return res;}
function rsRemainder(data,div){let res=new Array(div.length).fill(0);for(const b of data){const factor=b^res[0];res.shift();res.push(0);for(let i=0;i<div.length;i++)res[i]^=gfMul(div[i],factor);}return res;}
function bitsPush(arr,val,len){for(let i=len-1;i>=0;i--)arr.push((val>>>i)&1);}
function dataCodewords(text){const bytes=Array.from(new TextEncoder().encode(text));if(bytes.length>78)throw Error('Token too long for QR v4-L');let bits=[];bitsPush(bits,0b0100,4);bitsPush(bits,bytes.length,8);for(const b of bytes)bitsPush(bits,b,8);const cap=DATA_CW*8;for(let i=0;i<Math.min(4,cap-bits.length);i++)bits.push(0);while(bits.length%8)bits.push(0);let out=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];out.push(v);}let pad=0;while(out.length<DATA_CW){out.push(pad%2===0?0xEC:0x11);pad++;}return out;}
function makeMatrix(text){const data=dataCodewords(text);const ecc=rsRemainder(data,rsDivisor(ECC_CW));const code=data.concat(ecc);let modules=Array.from({length:S},()=>Array(S).fill(false));let isFunc=Array.from({length:S},()=>Array(S).fill(false));
 function setf(x,y,d){if(x>=0&&x<S&&y>=0&&y<S){modules[y][x]=!!d;isFunc[y][x]=true;}}
 function finder(cx,cy){for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){let x=cx+dx,y=cy+dy;if(x<0||x>=S||y<0||y>=S)continue;let dist=Math.max(Math.abs(dx),Math.abs(dy));setf(x,y,dist!==2&&dist!==4);}}
 function align(cx,cy){for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)setf(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
 // Timing patterns first, then finder patterns overwrite overlaps.
 for(let i=0;i<S;i++){setf(6,i,i%2===0);setf(i,6,i%2===0);} 
 finder(3,3); finder(S-4,3); finder(3,S-4); align(26,26);
 // Reserve format areas with placeholder false; dark module included later.
 for(let i=0;i<9;i++){if(i!==6){setf(8,i,false);setf(i,8,false);}}
 for(let i=0;i<8;i++){setf(S-1-i,8,false);setf(8,S-1-i,false);} 
 setf(8,S-8,true);
 // Place data bits zig-zag, mask 0 applied inline.
 let bits=[];for(const b of code)bitsPush(bits,b,8);let bi=0,up=true;
 for(let right=S-1;right>=1;right-=2){if(right===6)right--;for(let vert=0;vert<S;vert++){let y=up?S-1-vert:vert;for(let j=0;j<2;j++){let x=right-j;if(isFunc[y][x])continue;let bit=bi<bits.length?bits[bi++]:0;if(((x+y)&1)===0)bit^=1;modules[y][x]=!!bit;}}up=!up;}
 if(bi!==bits.length)throw Error('QR placement mismatch '+bi+' vs '+bits.length);
 // Format bits: ECL L=01, mask=0. BCH(15,5), then xor 0x5412.
 let fmtData=(1<<3)|0;let rem=fmtData<<10;const gen=0x537;for(let i=14;i>=10;i--){if((rem>>>i)&1)rem^=gen<<(i-10);}let fmt=((fmtData<<10)|(rem&0x3FF))^0x5412;
 function fb(i){return ((fmt>>>i)&1)!==0;}
 for(let i=0;i<=5;i++)setf(8,i,fb(i));setf(8,7,fb(6));setf(8,8,fb(7));setf(7,8,fb(8));for(let i=9;i<15;i++)setf(14-i,8,fb(i));
 for(let i=0;i<8;i++)setf(S-1-i,8,fb(i));for(let i=8;i<15;i++)setf(8,S-15+i,fb(i));setf(8,S-8,true);
 return modules;
}
root.AIQuantQR={makeMatrix,render:function(el,text,scale=7,border=4){const m=makeMatrix(text),n=m.length,size=(n+2*border)*scale;el.innerHTML='';const c=document.createElement('canvas');c.width=size;c.height=size;c.style.width='min(82vw,330px)';c.style.height='auto';c.style.imageRendering='pixelated';const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,size,size);g.fillStyle='#000';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(m[y][x])g.fillRect((x+border)*scale,(y+border)*scale,scale,scale);el.appendChild(c);return c;}};
if(typeof module!=='undefined'&&module.exports)module.exports=root.AIQuantQR;
})(typeof window!=='undefined'?window:globalThis);
