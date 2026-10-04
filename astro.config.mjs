// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// `globalThis.process` evita depender de los tipos de Node, que el proyecto no
// necesita en el runtime (Workers). Los secretos nunca llegan aquí: solo se
// leen variables públicas de configuración del despliegue.
/** @type {Record<string, string | undefined>} */
const entorno = /** @type {any} */ (globalThis).process?.env ?? {};

const usarBindingsRemotos = entorno.CLOUDFLARE_REMOTE === 'true';
/** Dominio canónico: define `PUBLIC_SITE_URL` en producción para canonical y sitemap. */
const sitio = entorno.PUBLIC_SITE_URL || entorno.SITE_URL || undefined;

// https://astro.build/config
export default defineConfig({
	site: sitio,
	output: 'server',
	adapter: cloudflare({
		remoteBindings: usarBindingsRemotos,
		// El proyecto no usa el servicio de imágenes de Astro (no hay <Image/>),
		// así que se evita depender del binding IMAGES.
		imageService: 'passthrough',
	}),
	security: {
		// Astro calcula los hashes SHA-256 de los estilos y scripts que él mismo
		// emite y los publica en la cabecera Content-Security-Policy.
		// `resources: ["'self'"]` es obligatorio: los bundles de /_astro se sirven
		// como archivos externos y no se pueden autorizar con hash.
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
				"manifest-src 'self'",
				'upgrade-insecure-requests',
			],
			scriptDirective: { resources: ["'self'"] },
			styleDirective: { resources: ["'self'"] },
		},
	},
});