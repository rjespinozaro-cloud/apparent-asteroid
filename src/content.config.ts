import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const guias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guias' }),
  schema: z.object({
    titulo: z.string(),
    herramienta: z.string().regex(/^[a-z0-9-]+$/),
    equipo: z.enum(['blue', 'red']),
    nivel: z.enum(['basico', 'intermedio', 'avanzado']),
    acceso: z.enum(['gratis', 'pago']),
    enlaceCompra: z.url().optional(),
    guiaPareja: z.string().optional(),
    fecha: z.coerce.date(),
  }).superRefine((datos, contexto) => {
    if (datos.acceso === 'pago' && !datos.enlaceCompra) {
      contexto.addIssue({
        code: 'custom',
        message: 'Las guías de pago deben incluir enlaceCompra.',
        path: ['enlaceCompra'],
      });
    }
  }),
});

export const collections = { guias };
