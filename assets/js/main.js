const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
const video = document.querySelector('.hero video');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection?.saveData === true;

// A refresh should restart the landing-page story at the opening section rather than
// restoring a previous scroll position (or an old section hash). Direct links
// to sections still work on a fresh navigation.
const navigationEntry = performance.getEntriesByType('navigation')[0];
const isReload = navigationEntry?.type === 'reload';

if (isReload) {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (window.location.hash) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  const resetToHero = () => {
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    });
  };

  resetToHero();
  window.addEventListener('load', resetToHero, { once: true });
  window.addEventListener('pageshow', resetToHero, { once: true });
}

const syncScroll = () => {
  if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
  document.documentElement.style.setProperty('--scroll-progress', progress.toFixed(2));
};

syncScroll();
window.addEventListener('scroll', syncScroll, { passive: true });

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    menu.classList.toggle('is-open', !isOpen);
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      menuButton.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menuButton.getAttribute('aria-expanded') !== 'true') return;
    menuButton.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    menuButton.focus();
  });
}

if (video) {
  if (reduceMotion || saveData) {
    video.pause();
  } else {
    video.play().catch(() => {
      // Browser autoplay policies may require the visitor to start playback.
    });
  }
}

document.querySelectorAll('[data-year]').forEach((node) => {
  node.textContent = new Date().getFullYear();
});

const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.04, rootMargin: '0px 0px -6% 0px' });
  revealItems.forEach((item) => {
    item.classList.add('reveal-pending');
    observer.observe(item);
  });

  // Important content must never remain hidden if an observer event is missed.
  window.setTimeout(() => {
    revealItems.forEach((item) => {
      item.classList.remove('reveal-pending');
      item.classList.add('is-visible');
    });
  }, 1800);
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

document.querySelectorAll('[data-paper-explorer]').forEach((explorer) => {
  const triggers = Array.from(explorer.querySelectorAll('[data-paper-trigger]'));
  const panels = Array.from(explorer.querySelectorAll('[data-paper-panel]'));

  const activatePaper = (paperId) => {
    triggers.forEach((trigger) => {
      const isActive = trigger.dataset.paperTrigger === paperId;
      trigger.classList.toggle('is-active', isActive);
      trigger.setAttribute('aria-pressed', String(isActive));
    });

    panels.forEach((panel) => {
      const isActive = panel.dataset.paperPanel === paperId;
      panel.classList.toggle('is-active', isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
      panel.querySelectorAll('a').forEach((link) => {
        if (isActive) link.removeAttribute('tabindex');
        else link.setAttribute('tabindex', '-1');
      });
    });
  };

  triggers.forEach((trigger, index) => {
    const activate = () => activatePaper(trigger.dataset.paperTrigger);
    trigger.addEventListener('mouseenter', activate);
    trigger.addEventListener('focus', activate);
    trigger.addEventListener('click', activate);
    trigger.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
      event.preventDefault();
      const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const nextTrigger = triggers[(index + direction + triggers.length) % triggers.length];
      nextTrigger.focus();
    });
  });

  const initial = triggers.find((trigger) => trigger.classList.contains('is-active')) || triggers[0];
  if (initial) activatePaper(initial.dataset.paperTrigger);
});

document.querySelectorAll('[data-linkedin-carousel]').forEach((carousel) => {
  const controls = carousel.parentElement;
  const previous = controls?.querySelector('[data-linkedin-prev]');
  const next = controls?.querySelector('[data-linkedin-next]');
  const status = controls?.querySelector('[data-linkedin-status]');
  const cards = Array.from(carousel.querySelectorAll('.linkedin-post'));

  const updateStatus = () => {
    if (!status || !cards.length) return;
    const carouselLeft = carousel.getBoundingClientRect().left;
    const currentIndex = cards.reduce((closestIndex, card, index) => {
      const currentDistance = Math.abs(card.getBoundingClientRect().left - carouselLeft);
      const closestDistance = Math.abs(cards[closestIndex].getBoundingClientRect().left - carouselLeft);
      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);
    status.textContent = `Post ${currentIndex + 1} of ${cards.length} · Swipe or scroll`;
  };

  const scrollOneCard = (direction) => {
    const card = carousel.querySelector('.linkedin-post');
    if (!card) return;
    const gap = Number.parseFloat(getComputedStyle(carousel).columnGap) || 0;
    carousel.scrollBy({
      left: direction * (card.getBoundingClientRect().width + gap),
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  };

  previous?.addEventListener('click', () => scrollOneCard(-1));
  next?.addEventListener('click', () => scrollOneCard(1));
  carousel.addEventListener('scroll', updateStatus, { passive: true });
  updateStatus();
});
