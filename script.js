const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 30 ? '0 16px 60px rgba(0,0,0,.28)' : 'none';
});

const cards = document.querySelectorAll('.card, .price-card, .app-window, .download-box');
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

cards.forEach(card => observer.observe(card));
