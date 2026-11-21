import test, { is } from 'tst'
// The family's manifests: audio.js names every member that has a manifest (a package of packages/ the umbrella depends
// on, with an audio.js), and no other; each name a member's manifest exports is the entry's, the same binding
test('audio.js lists every member that has a manifest', async () => {
	const { readdirSync, existsSync, readFileSync } = await import('node:fs')
	const at = p => new URL(p, import.meta.url), { dependencies } = JSON.parse(readFileSync(at('package.json'), 'utf8'))
	const members = readdirSync(at('packages')).filter(d => existsSync(at(`packages/${d}/audio.js`)))
		.map(d => JSON.parse(readFileSync(at(`packages/${d}/package.json`), 'utf8')).name).filter(n => n in dependencies).sort()
	const listed = [...readFileSync(at('audio.js'), 'utf8').matchAll(/^export \* from '(@audio\/[^']+)\/audio'$/gm)].map(m => m[1]).sort()
	is(listed, members, 'one line per member, no other')
	const family = await import(at('audio.js')), missing = []
	for (const m of members) for (const [k, v] of Object.entries(await import(`${m}/audio`))) if (k !== 'default' && family[k] !== v) missing.push(`${m}: ${k}`)
	is(missing, [], 'every name a member\'s manifest exports, the same binding')
})
