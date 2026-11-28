// Workers supports PBKDF2 up to 100,000 iterations. Each password has a random salt.
const iterations=100000;
/** @param {Uint8Array} bytes */
const hex=(bytes)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
/** @param {string} value */
const bytes=(value)=>Uint8Array.from(value.match(/../g)||[],b=>parseInt(b,16));
/** @param {string} password @param {Uint8Array} salt */
async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256)));
}
/** @param {string} password */
export async function hashAdvancedPassword(password){
 if(password.length<8||password.length>128)throw new Error('高级用户密码应为 8–128 个字符。');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return `pbkdf2-sha256$${iterations}$${hex(salt)}$${await derive(password,salt)}`;
}
/** @param {unknown} password @param {string|null} stored */
export async function verifyAdvancedPassword(password,stored){
 if(typeof password!=='string'||password.length<8||password.length>128||!stored)return false;
 const [algorithm,rounds,salt,expected]=stored.split('$');
 if(algorithm!=='pbkdf2-sha256'||rounds!==String(iterations)||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(expected))return false;
 const actual=await derive(password,bytes(salt));
 let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
