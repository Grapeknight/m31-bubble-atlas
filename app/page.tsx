import {headers} from 'next/headers';
import {currentProfile} from '../lib/profiles';
import {LanguageProvider} from '../components/i18n';
import Workspace from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 const h=await headers();
 const profile=await currentProfile(h.get('cookie'));
 return <LanguageProvider><Workspace initialProfile={profile}/></LanguageProvider>;
}
