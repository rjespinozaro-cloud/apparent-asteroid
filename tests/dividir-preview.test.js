import assert from 'node:assert/strict';
import test from 'node:test';

import { dividirPreview } from '../src/lib/utils/texto.js';

/**
 * Batería P0-0: la vista previa de una guía de pago nunca puede ser el
 * cuerpo entero, con cualquier estructura de Markdown que se le ponga.
 */

test('dos ## o más: corta en el primero y lista los títulos reales', () => {
  const md = '# T\n\nIntro.\n\n## Adelanto\n\nTexto visible.\n\n## 1. Paso dos\n\nOculto.\n';
  const { preview, resto } = dividirPreview(md);
  assert.ok(preview.includes('Texto visible.'));
  assert.ok(!preview.includes('Oculto.'));
  assert.deepEqual(resto, ['Paso dos']);
});

test('sin ningún ## corta en el primer punto razonable y oculta el final', () => {
  const cuerpo = [
    'El adelanto explica cómo preparar el laboratorio antes de tocar la red privada.',
    'La segunda frase amplía el contexto con ejemplos reales del entorno de pruebas.',
    'Una tercera frase sigue desarrollando la parte visible de esta guía de pago con detalle. ',
    'La cuarta frase también queda a la vista para que la previa resulte completa y natural.',
    'FINAL_SECRETO_NO_DEBE_SALIR',
  ].join(' ');
  const { preview, resto } = dividirPreview(cuerpo);
  assert.ok(preview.trim().length >= 240, 'la previa alcanza un mínimo razonable');
  assert.ok(preview.trim().length < cuerpo.length, 'nunca el cuerpo entero');
  assert.ok(!preview.includes('FINAL_SECRETO_NO_DEBE_SALIR'), 'el final queda fuera');
  assert.deepEqual(resto, [], 'sin títulos reales no se inventa ninguno');
});

test('un único ## no convierte la previa en el cuerpo entero', () => {
  const md = '## Adelanto\n\n' + 'Parrafo de relleno con oraciones variadas para alargar la previa. '.repeat(5) + 'CANARY_UNICO_H2';
  const { preview } = dividirPreview(md);
  assert.ok(preview.trim().length < md.length, 'previa estrictamente menor al cuerpo');
  assert.ok(!preview.includes('CANARY_UNICO_H2'));
});

test('## que no abre línea (hash inline) también se corta', () => {
  const md = 'Texto previo largo para superar el mínimo. '.repeat(6) + '## Seccion inline\n\nCANARY_INLINE_NO_SALGA';
  const { preview, resto } = dividirPreview(md);
  assert.ok(preview.trim().length < md.length);
  assert.ok(!preview.includes('CANARY_INLINE_NO_SALGA'));
  assert.deepEqual(resto, [], 'el ## no abre línea: no es título transitable');
});

test('corta en ### y lista esos títulos reales en el resto', () => {
  const md = 'Intro que alarga hasta superar el mínimo de previa. '.repeat(6) + '\n### Subseccion oculta\n\nCONTENIDO_DESPUES_DEL_CORTE';
  const { preview, resto } = dividirPreview(md);
  assert.ok(!preview.includes('CONTENIDO_DESPUES_DEL_CORTE'));
  assert.ok(!preview.includes('###'), 'el corte deja el título fuera de la previa');
  assert.deepEqual(resto, ['Subseccion oculta'], 'título real, sin almohadillas');
});

test('texto sin estructura (sin espacios ni oraciones) igual se corta', () => {
  const cuerpo = 'x'.repeat(50);
  const { preview } = dividirPreview(cuerpo);
  assert.ok(preview.trim().length < cuerpo.length, 'corte duro garantizado');
});

test('cuerpo vacío: previa vacía y resto vacío', () => {
  assert.deepEqual(dividirPreview(''), { preview: '', resto: [] });
  assert.deepEqual(dividirPreview(null), { preview: '', resto: [] });
});

test('propiedad: ninguna entrada de pago devuelve el cuerpo completo', () => {
  const entradas = [
    'A'.repeat(10),
    'Una sola oración corta.',
    'parrafo '.repeat(120),
    '# Titulo\n\nUnico bloque sin secciones. '.repeat(10),
    '## Unico\n\n' + 'contenido '.repeat(80),
    '### SoloSub\n\n' + 'datos '.repeat(90),
  ];
  for (const entrada of entradas) {
    const { preview } = dividirPreview(entrada);
    assert.ok(preview.trim().length < entrada.trim().length, `fuga con: ${entrada.slice(0, 30)}…`);
  }
});
