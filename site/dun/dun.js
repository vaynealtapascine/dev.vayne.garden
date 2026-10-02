// The "Laundry in 45 minutes" example, played once as it scrolls into view:
// the phrase is typed into a quick-add field, the timer appears, and its ring
// drains in real time with the app's own motion. Without JavaScript the
// example stays a still picture, and reduced motion skips the typing.
(() => {
  const demo = document.querySelector('[data-demo]');
  if (!demo || !('IntersectionObserver' in window)) return;

  const typed = demo.querySelector('.demo-typed');
  const card = demo.querySelector('.timer-example');
  const value = demo.querySelector('.dial-value');
  const progress = demo.querySelector('.progress');
  const phrase = typed.textContent;
  const total = 45 * 60;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const show = seconds => {
    value.textContent = clock(seconds);
    progress.style.strokeDashoffset = String(100 - (seconds / total) * 100);
  };

  card.setAttribute('aria-label', 'Illustrative Laundry timer, counting down from 45 minutes');
  demo.classList.add('ready');

  function run() {
    let remaining = total;
    const tick = () => {
      demo.classList.add('ticking');
      const started = performance.now();
      setInterval(() => {
        // Count from the start time rather than the number of ticks, so a
        // throttled background tab still shows the right time when it returns.
        remaining = Math.max(0, total - Math.round((performance.now() - started) / 1000));
        show(remaining);
      }, 1000);
    };

    if (reduce) {
      typed.textContent = '';
      demo.classList.add('added');
      show(remaining);
      tick();
      return;
    }

    typed.textContent = '';
    demo.classList.add('typing');
    progress.style.strokeDashoffset = '100';
    value.textContent = '0:00';
    let i = 0;
    const type = setInterval(() => {
      typed.textContent = phrase.slice(0, ++i);
      if (i < phrase.length) return;
      clearInterval(type);
      // A beat to read it, then Enter: the field clears and the timer arrives.
      setTimeout(() => {
        demo.classList.remove('typing');
        typed.textContent = '';
        demo.classList.add('added');
        show(remaining);
        setTimeout(tick, 600);
      }, 450);
    }, 55);
  }

  new IntersectionObserver((entries, observer) => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    run();
  }, { threshold: 0.5 }).observe(demo);
})();
