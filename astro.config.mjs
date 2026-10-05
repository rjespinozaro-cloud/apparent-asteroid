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

// Modo Pages (solo para la vista previa estática de GitHub Pages):
// `PAGES_BUILD=1` genera HTML estático con site+base públicos, sin adapter
// ni servidor. El despliegue real (Cloudflare Workers + D1) no cambia:
// por defecto todo sigue igual que antes.
const esPaginas = entorno.PAGES_BUILD === '1' || entorno.PAGES_BUILD === 'true';
const sitioPaginas = 'https://rjespinozaro-cloud.github.io';

/**
 * Solo modo Pages: pre-renderiza todas las rutas públicas (el admin y la API
 * quedan fuera del espejo estático). No toca ningún fichero de página: en el
 * despliegue Cloudflare esta integración ni siquiera se registra.
 */
const integracionPaginas = {
	name: 'paginas-prerender-publico',
	hooks: {
		/** @param {{ route: { component: string, prerender?: boolean } }} opts */
		'astro:route:setup': ({ route }) => {
			const componente = route.component || '';
			if (componente.startsWith('src/pages/admin/') || componente.startsWith('src/pages/api/')) return;
			route.prerender = true;
		},
	},
};

// https://astro.build/config
export default defineConfig({
	devToolbar: { enabled: false },
	site: esPaginas ? sitioPaginas : sitio,
	base: esPaginas ? '/apparent-asteroid' : undefined,
	output: esPaginas ? 'static' : 'server',
	integrations: [...(esPaginas ? [integracionPaginas] : [])],
	// El adapter se mantiene también en modo Pages: Astro lo necesita para
	// las páginas marcadas `prerender = false`, que en salida estática se
	// pre-renderizan igual (el adapter solo se usa al desplegar en Workers).
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