// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

const usarBindingsRemotos = import.meta.env.CLOUDFLARE_REMOTE === 'true';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: cloudflare({ remoteBindings: usarBindingsRemotos }),
	security: {
		// En producción el middleware genera un nonce aleatorio por respuesta y
		// publica el CSP con 'nonce-...' en la cabecera Content-Security-Policy.
		// En desarrollo se usa 'unsafe-inline' para scripts y estilos.
		csp: {
			algorithm: 'SHA-256',
			directives: [
				"default-src 'self'",
				"img-src 'self' data:",
				"font-src 'self'",
				"connect-src 'self'",
				"base-uri 'self'",
				"form-action 'self'",
				"frame-ancestors 'none'",
				"object-src 'none'",
				'upgrade-insecure-requests',
			],
		},
	},
});