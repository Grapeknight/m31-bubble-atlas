import {env} from 'cloudflare:workers';
import type {Profile} from './permissions';
export type {Profile} from './permissions';
export const COOKIE='m31_observer';
export async function hashToken(token:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
export function tokenFromCookie(header:string|null){return header?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||null;}
export async function currentProfile(cookie:string|null):Promise<Profile|null>{
 const token=tokenFromCookie(cookie);if(!token||!env.DB)return null;
 const profile=await env.DB.prepare("SELECT p.id,p.name,CASE WHEN p.role='advanced' AND p.access_code_hash IS NOT NULL AND s.access_code_hash=p.access_code_hash THEN 'advanced' ELSE 'standard' END AS role,p.role='advanced' AS advanced_available FROM profiles p JOIN profile_sessions s ON s.profile_id=p.id WHERE s.token_hash=? AND s.expires_at>?").bind(await hashToken(token),new Date().toISOString()).first<Profile>();
 return profile?{...profile,advanced_available:!!profile.advanced_available}:null;
}
export function writeCookie(token:string,request:Request,maxAge=30*86400){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
