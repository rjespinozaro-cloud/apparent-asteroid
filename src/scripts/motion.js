/**
 * Motion utilities - Scroll reveals, reading progress, spotlight cursor
 * All animations respect prefers-reduced-motion
 */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;

  if (prefersReducedMotion) {
    document.documentElement.classList.add('reduce-motion');
    return;
  }

  // ==========================================================================
  // PAUSE ANIMATIONS OFFSCREEN
  // ==========================================================================
  const animatedElements = document.querySelectorAll(
    '.panel-lab, .boton--premium, .boton, .admin-boton--secundario, [data-spotlight], .separador'
  );
  
  if (animatedElements.length > 0) {
    const animationObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const els = entry.target.querySelectorAll('[style*="animation"], [class*="animation"]');
        els.forEach((el) => {
          el.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
        });
        // Also check the element itself
        if (entry.target.style.animation) {
          entry.target.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
        }
      });
    }, {
      rootMargin: '100px',
      threshold: 0
    });

    animatedElements.forEach((el) => animationObserver.observe(el));
  }

  // ==========================================================================
  // SCROLL REVEALS - IntersectionObserver fallback
  // ==========================================================================
  const revealElements = document.querySelectorAll('.reveal, .reveal--fast, .reveal--slow, .reveal--stagger > *');
  
  if (revealElements.length > 0 && !CSS.supports('animation-timeline', 'view()')) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.1
    });

    revealElements.forEach((el) => revealObserver.observe(el));
  }

  // ==========================================================================
  // READING PROGRESS BAR
  // ==========================================================================
  const progressBar = document.querySelector('.progreso-lectura');
  
  if (progressBar && !CSS.supports('animation-timeline', 'view()')) {
    let ticking = false;
    
    function updateProgress() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? scrollTop / docHeight : 0;
      progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
      ticking = false;
    }
    
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    }, { passive: true });
  }

  // ==========================================================================
  // SPOTLIGHT CURSOR - Solo en puntero fino
  // ==========================================================================
  if (isFinePointer) {
    const spotlightElements = document.querySelectorAll('[data-spotlight]');
    
    if (spotlightElements.length > 0) {
      let mouseX = 0;
      let mouseY = 0;
      let rafId = null;
      
      function updateSpotlight(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            spotlightElements.forEach((el) => {
              const rect = el.getBoundingClientRect();
              const x = ((mouseX - rect.left) / rect.width) * 100;
              const y = ((mouseY - rect.top) / rect.height) * 100;
              
              if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                el.style.setProperty('--mouse-x', `${x}%`);
                el.style.setProperty('--mouse-y', `${y}%`);
                el.classList.add('spotlight-active');
              } else {
                el.classList.remove('spotlight-active');
              }
            });
            rafId = null;
          });
        }
      }
      
      function clearSpotlight() {
        spotlightElements.forEach((el) => el.classList.remove('spotlight-active'));
      }
      
      document.addEventListener('mousemove', updateSpotlight, { passive: true });
      document.addEventListener('mouseleave', clearSpotlight);
    }
  }

  // ==========================================================================
  // PAGE ENTER ANIMATION
  // ==========================================================================
  const pageEnterElements = document.querySelectorAll('.page-enter > *');
  
  if (pageEnterElements.length > 0) {
    pageEnterElements.forEach((el, index) => {
      el.style.animationDelay = `${index * 80}ms`;
    });
  }

  // ==========================================================================
  // VIEW TRANSITIONS - Fallback para navegación
  // ==========================================================================
  if (!prefersReducedMotion && document.startViewTransition) {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//')) return;
      
      if (link.target === '_blank') return;
      
      e.preventDefault();
      
      document.startViewTransition(() => {
        window.location.href = href;
      });
    });
  }
})();
