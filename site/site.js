// Compare slider + scroll reveals. Without JS the page still works: the slider sits at 50%, everything is visible.
const slider = document.getElementById('slider');
if (slider) {
  const input = slider.querySelector('input');
  const set = (v) => slider.style.setProperty('--pos', v + '%');
  input.addEventListener('input', () => set(input.value));
  // a gentle hint on first view: sweep to 70%, back to 50%
  let hinted = false;
  new IntersectionObserver((entries, io) => {
    if (hinted || !entries[0].isIntersecting || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    hinted = true; io.disconnect();
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1400);
      const v = 50 + Math.sin(p * Math.PI) * 20;
      if (!input.matches(':active')) { input.value = v; set(v); }
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.6 }).observe(slider);
}

// Reveal on scroll: IntersectionObserver + CSS transitions. The 'js' class is set in <head> only when motion is
// allowed; anything that never gets observed (old browser) is shown right away.
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('in'));
}
