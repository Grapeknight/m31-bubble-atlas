export type Role = 'standard' | 'advanced';
export type Profile = {id:string;name:string;role?:Role;count?:number;advanced_available?:boolean};
export function canSeeCatalogueStats(viewer:Profile|null,ownerId:string){
 return !!viewer && (viewer.role==='advanced'||viewer.id===ownerId);
}
export function normalizeConfidence(value:string){return ({likely:'gold',candidate:'silver',uncertain:'bronze'} as Record<string,string>)[value]||value;}
