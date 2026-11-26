import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/astro.test.mjs','tests/statistics.test.mjs','tests/preferences.test.mjs'],bundle:true,platform:'node',format:'esm',outdir:'.sites-runtime/tests'});
const r=spawnSync(process.execPath,['--test','.sites-runtime/tests/astro.test.js','.sites-runtime/tests/statistics.test.js','.sites-runtime/tests/preferences.test.js'],{stdio:'inherit'});process.exitCode=r.status??1;
