const filtroEquipo = document.querySelector('[data-filtro-equipo]');
const filtroHerramienta = document.querySelector('[data-filtro-herramienta]');
const tarjetas = document.querySelectorAll('[data-guia-card]');
const parametros = new URLSearchParams(window.location.search);

const aplicarFiltros = () => {
  const equipo = filtroEquipo?.value ?? '';
  const herramienta = filtroHerramienta?.value ?? '';

  tarjetas.forEach((tarjeta) => {
    const coincideEquipo = !equipo || tarjeta.dataset.equipo === equipo;
    const coincideHerramienta = !herramienta || tarjeta.dataset.herramienta === herramienta;
    tarjeta.hidden = !(coincideEquipo && coincideHerramienta);
  });
};

filtroEquipo?.addEventListener('change', aplicarFiltros);
filtroHerramienta?.addEventListener('change', aplicarFiltros);

if (filtroEquipo && parametros.has('equipo')) filtroEquipo.value = parametros.get('equipo') ?? '';
if (filtroHerramienta && parametros.has('herramienta')) filtroHerramienta.value = parametros.get('herramienta') ?? '';
aplicarFiltros();
