// Levitate - Navigation & Mobile Hamburger Menu Controller

document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.querySelector('.navbar');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');
    const mobileBackdrop = document.getElementById('mobileBackdrop');

    // 1. Navbar Scroll Effect (Home page)
    if (navbar && !navbar.classList.contains('always-scrolled')) {
        const handleScroll = () => {
            if (window.scrollY > 40) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
    }

    // 2. Mobile Hamburger Drawer Toggle
    if (hamburgerBtn && navLinks) {
        const toggleMenu = () => {
            const isOpen = navLinks.classList.toggle('is-open');
            hamburgerBtn.classList.toggle('is-active');
            if (mobileBackdrop) {
                mobileBackdrop.classList.toggle('is-open');
            }
            hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            hamburgerBtn.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
            document.body.style.overflow = isOpen ? 'hidden' : '';
        };

        const closeMenu = () => {
            navLinks.classList.remove('is-open');
            hamburgerBtn.classList.remove('is-active');
            if (mobileBackdrop) {
                mobileBackdrop.classList.remove('is-open');
            }
            hamburgerBtn.setAttribute('aria-expanded', 'false');
            hamburgerBtn.setAttribute('aria-label', 'Abrir menu');
            document.body.style.overflow = '';
        };

        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });

        if (mobileBackdrop) {
            mobileBackdrop.addEventListener('click', closeMenu);
        }

        // Close menu when clicking on any nav link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                closeMenu();
            });
        });

        // Close menu on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
                closeMenu();
            }
        });

        // Close menu on resize back to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 900 && navLinks.classList.contains('is-open')) {
                closeMenu();
            }
        });
    }
});
