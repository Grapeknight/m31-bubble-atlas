import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/astro.test.mjs'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/astro.test.mjs'});
const r=spawnSync(process.execPath,['--test','.sites-runtime/astro.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
