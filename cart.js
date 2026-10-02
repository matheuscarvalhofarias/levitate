// Levitate - Centralized Shopping Cart Management

(function () {
    const STORAGE_KEY = 'levitate_cart';
    const FREE_SHIPPING_GOAL = 99.0;

    function getCart() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function saveCart(cart) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        } catch (e) {
            console.error('Error saving cart to localStorage', e);
        }
    }

    function openCart() {
        const cartDrawer = document.getElementById('cartDrawer');
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartDrawer && cartOverlay) {
            cartDrawer.classList.add('open');
            cartOverlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeCart() {
        const cartDrawer = document.getElementById('cartDrawer');
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartDrawer && cartOverlay) {
            cartDrawer.classList.remove('open');
            cartOverlay.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    function renderCart() {
        const cart = getCart();
        const totalItems = cart.reduce((acc, item) => acc + (item.qty || 1), 0);

        // Update nav badge count
        const navCartCount = document.getElementById('navCartCount');
        if (navCartCount) {
            navCartCount.textContent = totalItems;
        }

        // Update drawer badge count
        const drawerCartCount = document.getElementById('drawerCartCount');
        if (drawerCartCount) {
            drawerCartCount.textContent = totalItems;
        }

        const cartItemsList = document.getElementById('cartItemsList');
        const cartSubtotalValue = document.getElementById('cartSubtotalValue');
        const shippingBarText = document.getElementById('shippingBarText');
        const shippingProgress = document.getElementById('shippingProgress');

        if (!cartItemsList) return;

        if (cart.length === 0) {
            cartItemsList.innerHTML = `
                <div class="cart-empty-message">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    <p style="margin-top: 1rem; font-weight: 600; color: #475569;">Sua sacola está vazia.</p>
                    <span style="font-size: 0.85rem; color: #94A3B8;">Adicione produtos para começar seu cuidado.</span>
                </div>
            `;
            if (cartSubtotalValue) cartSubtotalValue.textContent = 'R$ 0,00';
            if (shippingBarText) {
                shippingBarText.innerHTML = `Faltam R$ ${FREE_SHIPPING_GOAL.toFixed(2).replace('.', ',')} para você ganhar <strong>Frete Grátis</strong>!`;
            }
            if (shippingProgress) shippingProgress.style.width = '0%';
            return;
        }

        let subtotal = 0;
        cartItemsList.innerHTML = cart.map((item, index) => {
            const itemQty = item.qty || 1;
            const itemTotal = item.price * itemQty;
            subtotal += itemTotal;
            return `
                <div class="cart-item-card">
                    <img src="${item.img || 'produto_agua_micelar.jpg'}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-details">
                        <h4 class="cart-item-title">${item.name}</h4>
                        <span class="cart-item-variant">${item.variant || 'Cuidado Diário'}</span>
                        <div class="cart-item-price-row">
                            <div class="cart-item-stepper">
                                <button type="button" class="cart-stepper-btn" onclick="window.updateItemQty(${index}, -1)" aria-label="Diminuir">−</button>
                                <span class="cart-stepper-val">${itemQty}</span>
                                <button type="button" class="cart-stepper-btn" onclick="window.updateItemQty(${index}, 1)" aria-label="Aumentar">+</button>
                            </div>
                            <span class="cart-item-price">R$ ${itemTotal.toFixed(2).replace('.', ',')}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (cartSubtotalValue) {
            cartSubtotalValue.textContent = 'R$ ' + subtotal.toFixed(2).replace('.', ',');
        }

        if (shippingBarText && shippingProgress) {
            if (subtotal >= FREE_SHIPPING_GOAL) {
                shippingBarText.innerHTML = '🎉 Parabéns! Você ganhou <strong>Frete Grátis</strong>!';
                shippingProgress.style.width = '100%';
            } else {
                const diff = (FREE_SHIPPING_GOAL - subtotal).toFixed(2).replace('.', ',');
                const percent = Math.min(100, Math.round((subtotal / FREE_SHIPPING_GOAL) * 100));
                shippingBarText.innerHTML = `Faltam R$ ${diff} para você ganhar <strong>Frete Grátis</strong>!`;
                shippingProgress.style.width = percent + '%';
            }
        }
    }

    window.updateItemQty = function (index, delta) {
        const cart = getCart();
        if (cart[index]) {
            cart[index].qty = (cart[index].qty || 1) + delta;
            if (cart[index].qty <= 0) {
                cart.splice(index, 1);
            }
            saveCart(cart);
            renderCart();
        }
    };

    window.levitateAddToCart = function (product) {
        if (!product || !product.name) return;
        const cart = getCart();
        const qty = product.qty && product.qty > 0 ? product.qty : 1;
        const existing = cart.find(item => item.name === product.name);

        if (existing) {
            existing.qty = (existing.qty || 1) + qty;
        } else {
            cart.push({
                name: product.name,
                price: product.price || 0,
                img: product.img || '',
                variant: product.variant || '',
                qty: qty
            });
        }

        saveCart(cart);
        renderCart();
        openCart();
    };

    window.openLevitateCart = openCart;
    window.closeLevitateCart = closeCart;

    document.addEventListener('DOMContentLoaded', () => {
        // Bind Navbar Cart Button
        const openCartBtn = document.getElementById('openCartBtn');
        if (openCartBtn) {
            openCartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openCart();
            });
        }

        // Bind Drawer Close Buttons
        const btnCloseCart = document.getElementById('btnCloseCart');
        if (btnCloseCart) btnCloseCart.addEventListener('click', closeCart);

        const btnKeepShopping = document.getElementById('btnKeepShopping');
        if (btnKeepShopping) btnKeepShopping.addEventListener('click', closeCart);

        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

        // Bind ESC key to close cart
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeCart();
            }
        });

        // Bind Checkout Button
        const btnCheckout = document.getElementById('btnCheckout');
        if (btnCheckout) {
            btnCheckout.removeAttribute('onclick');
            btnCheckout.addEventListener('click', (e) => {
                e.preventDefault();
                const cart = getCart();
                if (!cart || cart.length === 0) {
                    alert('Sua sacola está vazia. Adicione pelo menos um produto para continuar.');
                    return;
                }
                window.location.href = 'checkout.html';
            });
        }

        // Initial render to sync badges & drawer
        renderCart();
    });
})();
