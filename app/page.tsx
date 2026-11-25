import {headers} from 'next/headers';
import {currentProfile} from '../lib/profiles';
import Workspace from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 const h=await headers();
 const profile=await currentProfile(h.get('cookie'));
 return <Workspace initialProfile={profile}/>;
}
