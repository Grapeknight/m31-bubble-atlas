import type {Geometry} from './astro';
export type Bubble=Geometry&{id:string;name:string;notes:string;confidence:'silver'|'gold'|'bronze';ra:number;dec:number;a_arcsec:number;b_arcsec:number;pa_deg:number;pa_defined:boolean;revision:number;created_at:string;updated_at:string;map_id:string};
export type Draft=Geometry&{name:string;notes:string;confidence:Bubble['confidence'];id?:string;revision?:number};
export const sameDraft=(a:Draft|null,b:Draft|null)=>JSON.stringify(a)===JSON.stringify(b);
