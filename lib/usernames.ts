/** NFKC first. Full-width/CJK/emoji count as two, Latin and ASCII as one. */
export function usernameWidth(value:string){return Array.from(value.trim().normalize('NFKC')).reduce((n,c)=>n+(/\p{Mark}/u.test(c)?0:/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u3000-\u303f\uff01-\uff60]/u.test(c)?2:1),0);}
export function validUsername(value:string){const name=value.trim().normalize('NFKC');return !!name&&name.length<=100&&usernameWidth(name)>0&&usernameWidth(name)<=20&&!/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(name);}
