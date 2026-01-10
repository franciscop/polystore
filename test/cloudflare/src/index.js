import kv from '../../../';

export default {
	async fetch(request, env, ctx) {
		const store = kv(env.POLYSTORE);

		await store.set('key1', 'Hello world', { expires: '1h' });
		console.log(await store.get('key1'));
		// "Hello world"

		return new Response('My response');
	},
};
