import kv from '../../../src/index.js';

let buffer = '';
const describe = async (text, cb) => {
	await cb();
	console.log(text + ' ' + buffer);
	buffer = '';
};
const assert = (a, b) => (buffer += a === b ? ' ✔' : ` 𝒙 ${a} is not ${b}`);

const test = async (store) => {
	await describe('Basic test', async () => {
		assert(await store.get('test'), null);
		await store.set('test', 'hello cloudflare');
		assert(await store.get('test'), 'hello cloudflare');
		await store.del('test');
		assert(await store.get('test'), null);
	});

	// Cloudflare's min TTL is 60s 🤷‍♂️
	// await describe('Expires', async () => {
	// 	await store.set('test', 'hello cloudflare', { expires: '1s' });
	// 	assert(await store.get('test'), 'hello cloudflare');
	// 	await new Promise((done) => setTimeout(done, 2000));
	// 	assert(await store.get('test'), null);
	// });
};

export default {
	async fetch(request, env, ctx) {
		try {
			const store = kv(env.POLYSTORE);
			await test(store);

			return new Response('Hello World!');
		} catch (error) {
			return new Response('Error:' + error.message);
		}
	},
};
