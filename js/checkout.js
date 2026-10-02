/**
 * Levitate - Motor de Checkout & Pagamento (checkout.js)
 * 
 * Este arquivo orquestra todo o fluxo do checkout:
 * 1. Carregamento dos itens da sacola (cart.js)
 * 2. Integração com dados do usuário logado (auth.js)
 * 3. Busca automática de endereço por CEP (ViaCEP)
 * 4. Cálculo dinâmico de fretes, cupons e desconto PIX (5% OFF)
 * 5. Máscaras e validações de formulário (Cartão, CPF, Celular)
 * 6. Criação do pedido final (Pronto para persistir no Supabase / Banco de Dados / Webhook)
 */

(function () {
    'use strict';

    const CART_STORAGE_KEY = 'levitate_cart';
    const PIX_DISCOUNT_PERCENT = 0.05; // 5% de desconto no PIX
    const FREE_SHIPPING_THRESHOLD = 99.0;

    // Estado interno do Checkout
    const checkoutState = {
        items: [],
        customer: null,
        shippingMethod: 'pac',
        shippingFee: 12.90,
        paymentMethod: 'pix',
        coupon: null, // { code: 'BEMVINDA10', type: 'percent', value: 10 }
        pixCountdownInterval: null
    };

    // Cupons Válidos da Loja
    const VALID_COUPONS = {
        'BEMVINDA10': { type: 'percent', value: 10, label: '10% OFF' },
        'FRETEGRATIS': { type: 'shipping', value: 0, label: 'Frete Grátis' },
        'LEVITATEVIP': { type: 'percent', value: 15, label: '15% OFF VIP' },
        'CLUB10': { type: 'percent', value: 10, label: '10% Levitate Club' }
    };

    // Utilitário para exibir Toast
    function showToast(msg) {
        const toast = document.getElementById('checkoutToast');
        const text = document.getElementById('checkoutToastMessage');
        if (toast && text) {
            text.innerText = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3500);
        }
    }

    // Formata Moeda (BRL)
    function formatMoney(val) {
        return 'R$ ' + (val || 0).toFixed(2).replace('.', ',');
    }

    // Carrega itens da sacola
    function loadCartItems() {
        try {
            const raw = localStorage.getItem(CART_STORAGE_KEY);
            let items = raw ? JSON.parse(raw) : [];

            // Se o carrinho estiver vazio (por exemplo, acessou /checkout.html direto para testar),
            // fornece um item padrão de demonstração para uma experiência suave
            if (!items || items.length === 0) {
                items = [
                    {
                        name: "Água Micelar Corporal Levitate",
                        price: 59.90,
                        qty: 1,
                        img: "assets/images/produto_agua_micelar.jpg",
                        variant: "200ml • Hipoalergênico"
                    },
                    {
                        name: "Lenços Secos Descartáveis Levitate",
                        price: 29.90,
                        qty: 1,
                        img: "assets/images/produto_lencos.jpg",
                        variant: "48 Unidades • Toque Macio"
                    }
                ];
                // Salva no storage para manter sincronizado
                localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
            }
            checkoutState.items = items;
        } catch (e) {
            console.error("Erro ao carregar itens do carrinho:", e);
            checkoutState.items = [];
        }
    }

    // Renderiza a lista de itens no Resumo Lateral
    function renderOrderSummaryItems() {
        const container = document.getElementById('checkoutOrderItemsList');
        const badge = document.getElementById('summaryItemsBadge');
        if (!container) return;

        const totalQty = checkoutState.items.reduce((acc, item) => acc + (item.qty || 1), 0);
        if (badge) badge.innerText = `${totalQty} ${totalQty === 1 ? 'item' : 'itens'}`;

        if (checkoutState.items.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem 1rem; color: #64748B;">
                    <p style="font-weight: 600;">Sua sacola está vazia.</p>
                    <a href="index.html#produtos" style="color: #E83E8C; text-decoration: underline; font-size: 0.9rem;">Escolher produtos</a>
                </div>
            `;
            return;
        }

        container.innerHTML = checkoutState.items.map(item => {
            const qty = item.qty || 1;
            const itemTotal = item.price * qty;
            return `
                <div class="summary-item-row">
                    <div class="summary-item-thumb">
                        <img src="${item.img || 'assets/images/produto_agua_micelar.jpg'}" alt="${item.name}">
                        <span class="summary-item-qty">${qty}</span>
                    </div>
                    <div class="summary-item-details">
                        <h4>${item.name}</h4>
                        <span class="summary-item-var">${item.variant || 'Cuidado Diário'}</span>
                    </div>
                    <div class="summary-item-price">
                        ${formatMoney(itemTotal)}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Calcula e atualiza todos os valores financeiros
    function updatePricingBreakdown() {
        const subtotal = checkoutState.items.reduce((acc, item) => acc + (item.price * (item.qty || 1)), 0);
        
        // Regra de Frete: Grátis acima de R$ 99 para PAC
        let shipping = checkoutState.shippingFee;
        const badgePac = document.getElementById('badgePacPrice');

        if (subtotal >= FREE_SHIPPING_THRESHOLD) {
            if (badgePac) {
                badgePac.innerHTML = '<span class="price-free">GRÁTIS</span>';
            }
            if (checkoutState.shippingMethod === 'pac') {
                shipping = 0.00;
            }
        } else {
            if (badgePac) {
                badgePac.innerHTML = '<span class="price-val">R$ 12,90</span>';
            }
        }

        // Cupom de frete grátis
        if (checkoutState.coupon && checkoutState.coupon.type === 'shipping') {
            shipping = 0.00;
        }

        // Desconto do Cupom
        let couponDiscount = 0;
        if (checkoutState.coupon) {
            if (checkoutState.coupon.type === 'percent') {
                couponDiscount = (subtotal * checkoutState.coupon.value) / 100;
            }
        }

        // Subtotal após cupom
        const amountAfterCoupon = Math.max(0, subtotal - couponDiscount);

        // Desconto PIX (5% sobre produtos)
        let pixDiscount = 0;
        if (checkoutState.paymentMethod === 'pix') {
            pixDiscount = amountAfterCoupon * PIX_DISCOUNT_PERCENT;
        }

        // Total Final
        const total = Math.max(0, amountAfterCoupon - pixDiscount + shipping);

        // Atualiza Elementos do DOM
        const elSubtotal = document.getElementById('summarySubtotal');
        const elShipping = document.getElementById('summaryShipping');
        const rowCoupon = document.getElementById('rowCouponDiscount');
        const elCoupon = document.getElementById('summaryCouponDiscount');
        const rowPix = document.getElementById('rowPixDiscount');
        const elPix = document.getElementById('summaryPixDiscount');
        const elTotal = document.getElementById('summaryTotal');
        const btnText = document.getElementById('btnSubmitText');
        const elInstallments = document.getElementById('summaryInstallmentText');

        if (elSubtotal) elSubtotal.innerText = formatMoney(subtotal);
        
        if (elShipping) {
            if (shipping === 0) {
                elShipping.innerHTML = '<strong style="color: #10B981;">Grátis</strong>';
            } else {
                elShipping.innerText = formatMoney(shipping);
            }
        }

        if (rowCoupon && elCoupon) {
            if (couponDiscount > 0) {
                rowCoupon.style.display = 'flex';
                elCoupon.innerText = '- ' + formatMoney(couponDiscount);
            } else {
                rowCoupon.style.display = 'none';
            }
        }

        if (rowPix && elPix) {
            if (checkoutState.paymentMethod === 'pix' && pixDiscount > 0) {
                rowPix.style.display = 'flex';
                elPix.innerText = '- ' + formatMoney(pixDiscount);
            } else {
                rowPix.style.display = 'none';
            }
        }

        if (elTotal) elTotal.innerText = formatMoney(total);
        if (btnText) btnText.innerText = `Finalizar Pedido • ${formatMoney(total)}`;

        // Atualiza opções de parcelamento no dropdown do cartão
        if (elInstallments) {
            if (checkoutState.paymentMethod === 'pix') {
                elInstallments.innerText = 'com 5% OFF à vista';
            } else if (checkoutState.paymentMethod === 'credit_card') {
                const installmentVal = (total / 6).toFixed(2).replace('.', ',');
                elInstallments.innerText = `até 6x de R$ ${installmentVal} sem juros`;
            } else {
                elInstallments.innerText = 'à vista via boleto';
            }
        }

        updateInstallmentsSelect(total);
    }

    // Atualiza opções do select de parcelas
    function updateInstallmentsSelect(total) {
        const select = document.getElementById('ccInstallments');
        if (!select) return;

        select.innerHTML = '';
        for (let i = 1; i <= 6; i++) {
            const val = (total / i).toFixed(2).replace('.', ',');
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${i}x de R$ ${val} sem juros${i === 1 ? ' (À vista)' : ''}`;
            select.appendChild(opt);
        }

        // 10x com acréscimo simulado
        const totalComJuros = total * 1.12;
        const val10x = (totalComJuros / 10).toFixed(2).replace('.', ',');
        const opt10 = document.createElement('option');
        opt10.value = 10;
        opt10.textContent = `10x de R$ ${val10x} (com juros padrão)`;
        select.appendChild(opt10);
    }

    // Auto-preenchimento com dados do usuário logado (se houver)
    function setupAuthIntegration() {
        if (!window.LevitateAuth) return;
        const user = window.LevitateAuth.getUser();

        const banner = document.getElementById('checkoutAuthStatus');
        const avatar = document.getElementById('checkoutUserAvatar');
        const greeting = document.getElementById('checkoutUserGreeting');
        const emailEl = document.getElementById('checkoutUserEmail');
        const btnSwitch = document.getElementById('btnSwitchUser');

        if (user && user.name) {
            checkoutState.customer = user;

            // Mostra banner de usuário logado
            if (banner) banner.style.display = 'flex';
            if (avatar) {
                const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                avatar.innerText = initials;
            }
            if (greeting) greeting.innerHTML = `Comprando como <strong>${user.name}</strong>`;
            if (emailEl) emailEl.innerText = user.email || '';

            // Preenche campos de identificação
            const nameInp = document.getElementById('custName');
            const emailInp = document.getElementById('custEmail');
            const phoneInp = document.getElementById('custPhone');
            const cpfInp = document.getElementById('custCpf');

            if (nameInp) nameInp.value = user.name || '';
            if (emailInp) emailInp.value = user.email || '';
            if (phoneInp) phoneInp.value = user.phone || '';
            if (cpfInp) cpfInp.value = user.cpf || '';

            // Endereços salvos
            if (user.addresses && user.addresses.length > 0) {
                renderSavedAddresses(user.addresses);
            }

            if (btnSwitch) {
                btnSwitch.addEventListener('click', () => {
                    if (confirm('Deseja sair desta conta para usar outros dados?')) {
                        window.LevitateAuth.logout();
                        window.location.reload();
                    }
                });
            }
        }
    }

    // Renderiza endereços salvos da conta do cliente
    function renderSavedAddresses(addresses) {
        const wrap = document.getElementById('savedAddressesWrap');
        const list = document.getElementById('savedAddressesList');
        if (!wrap || !list) return;

        wrap.style.display = 'block';
        list.innerHTML = addresses.map((addr, idx) => {
            const isSelected = idx === 0 ? 'selected' : '';
            return `
                <div class="saved-addr-card ${isSelected}" data-index="${idx}">
                    <div class="saved-addr-header">
                        <strong>${addr.title || 'Endereço Principal'}</strong>
                        ${addr.isDefault ? '<span class="addr-default-pill">Padrão</span>' : ''}
                    </div>
                    <p>${addr.street}, ${addr.complement || ''} - ${addr.neighborhood}</p>
                    <p>${addr.city} / ${addr.state} • CEP ${addr.zip}</p>
                    <button type="button" class="btn-use-addr" data-index="${idx}">Usar este endereço</button>
                </div>
            `;
        }).join('');

        // Preenche o formulário com o primeiro endereço por padrão
        if (addresses.length > 0) {
            fillAddressFields(addresses[0]);
        }

        // Listener para alternar endereço selecionado
        list.querySelectorAll('.btn-use-addr, .saved-addr-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const targetCard = card.closest('.saved-addr-card');
                if (!targetCard) return;
                const idx = parseInt(targetCard.getAttribute('data-index'), 10);
                list.querySelectorAll('.saved-addr-card').forEach(c => c.classList.remove('selected'));
                targetCard.classList.add('selected');
                if (addresses[idx]) {
                    fillAddressFields(addresses[idx]);
                    showToast(`Endereço "${addresses[idx].title}" selecionado.`);
                }
            });
        });
    }

    function fillAddressFields(addr) {
        if (!addr) return;
        const zipInp = document.getElementById('shipZip');
        const streetInp = document.getElementById('shipStreet');
        const compInp = document.getElementById('shipComplement');
        const neighInp = document.getElementById('shipNeighborhood');
        const cityInp = document.getElementById('shipCity');
        const stateInp = document.getElementById('shipState');

        if (zipInp && addr.zip) zipInp.value = addr.zip;
        if (streetInp && addr.street) streetInp.value = addr.street;
        if (compInp && addr.complement) compInp.value = addr.complement;
        if (neighInp && addr.neighborhood) neighInp.value = addr.neighborhood;
        if (cityInp && addr.city) cityInp.value = addr.city;
        if (stateInp && addr.state) stateInp.value = addr.state;
    }

    // Busca de CEP via ViaCEP
    function setupCepLookup() {
        const zipInput = document.getElementById('shipZip');
        const searchBtn = document.getElementById('btnSearchCep');
        const feedback = document.getElementById('cepFeedback');

        async function doLookup() {
            if (!zipInput) return;
            const clean = zipInput.value.replace(/\D/g, '');
            if (clean.length !== 8) {
                if (feedback) feedback.innerText = 'Digite um CEP válido com 8 dígitos.';
                return;
            }

            if (feedback) feedback.innerText = 'Consultando Correios...';
            try {
                const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
                const data = await response.json();

                if (data.erro) {
                    if (feedback) feedback.innerText = 'CEP não encontrado. Preencha manualmente.';
                    return;
                }

                document.getElementById('shipStreet').value = data.logradouro || '';
                document.getElementById('shipNeighborhood').value = data.bairro || '';
                document.getElementById('shipCity').value = data.localidade || '';
                document.getElementById('shipState').value = data.uf || '';

                if (feedback) feedback.innerHTML = '✓ Endereço localizado com sucesso!';
                document.getElementById('shipNumber').focus();
            } catch (err) {
                if (feedback) feedback.innerText = 'Não foi possível buscar o CEP automaticamente.';
            }
        }

        if (searchBtn) searchBtn.addEventListener('click', doLookup);
        if (zipInput) {
            zipInput.addEventListener('blur', () => {
                if (zipInput.value.replace(/\D/g, '').length === 8) doLookup();
            });
            // Máscara 00000-000
            zipInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 8);
                if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
                e.target.value = v;
            });
        }
    }

    // Métodos de Envio
    function setupShippingMethods() {
        const radios = document.querySelectorAll('input[name="shippingMethod"]');
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('.shipping-option-card').forEach(c => c.classList.remove('selected'));
                radio.closest('.shipping-option-card').classList.add('selected');

                checkoutState.shippingMethod = radio.value;
                if (radio.value === 'pac') checkoutState.shippingFee = 12.90;
                else if (radio.value === 'sedex') checkoutState.shippingFee = 18.90;
                else if (radio.value === 'pickup') checkoutState.shippingFee = 0.00;

                updatePricingBreakdown();
            });
        });
    }

    // Abas de Forma de Pagamento
    function setupPaymentTabs() {
        const tabBtns = document.querySelectorAll('.payment-tab-btn');
        const panels = {
            'pix': document.getElementById('panelPix'),
            'credit_card': document.getElementById('panelCreditCard'),
            'boleto': document.getElementById('panelBoleto')
        };

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const method = btn.getAttribute('data-method');
                checkoutState.paymentMethod = method;

                tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');

                Object.keys(panels).forEach(key => {
                    if (panels[key]) panels[key].classList.remove('active');
                });

                if (panels[method]) panels[method].classList.add('active');

                updatePricingBreakdown();
            });
        });
    }

    // Máscaras de entrada (Cartão, CPF, Celular)
    function setupInputMasks() {
        // CPF: 000.000.000-00
        const cpfInp = document.getElementById('custCpf');
        if (cpfInp) {
            cpfInp.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                v = v.replace(/(\d{3})(\d)/, '$1.$2')
                     .replace(/(\d{3})(\d)/, '$1.$2')
                     .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                e.target.value = v;
            });
        }

        // Telefone: (00) 00000-0000
        const phoneInp = document.getElementById('custPhone');
        if (phoneInp) {
            phoneInp.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                if (v.length > 10) {
                    v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
                } else if (v.length > 5) {
                    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
                } else if (v.length > 2) {
                    v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
                }
                e.target.value = v;
            });
        }

        // Número do Cartão com detecção de bandeira
        const ccNumber = document.getElementById('ccNumber');
        if (ccNumber) {
            ccNumber.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 16);
                const parts = v.match(/.{1,4}/g);
                e.target.value = parts ? parts.join(' ') : v;

                // Detecção de bandeira
                const flags = {
                    visa: document.getElementById('flagVisa'),
                    master: document.getElementById('flagMaster'),
                    elo: document.getElementById('flagElo'),
                    hiper: document.getElementById('flagHiper')
                };
                Object.values(flags).forEach(f => f && f.classList.remove('active'));

                if (v.startsWith('4')) flags.visa && flags.visa.classList.add('active');
                else if (v.startsWith('5')) flags.master && flags.master.classList.add('active');
                else if (v.startsWith('6')) flags.elo && flags.elo.classList.add('active');
            });
        }

        // Validade: MM/AA
        const ccExp = document.getElementById('ccExp');
        if (ccExp) {
            ccExp.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2})$/, '$1/$2');
                e.target.value = v;
            });
        }

        // CVV: 3 ou 4 dígitos
        const ccCvc = document.getElementById('ccCvc');
        if (ccCvc) {
            ccCvc.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            });
        }
    }

    // Botão Demo de Preenchimento Rápido
    function setupDemoFill() {
        const btn = document.getElementById('btnFillDemoData');
        if (!btn) return;

        btn.addEventListener('click', () => {
            document.getElementById('custName').value = "Camila Mendes da Silva";
            document.getElementById('custEmail').value = "camila.mendes@exemplo.com";
            document.getElementById('custPhone').value = "(11) 98765-4321";
            document.getElementById('custCpf').value = "348.912.045-89";

            document.getElementById('shipZip').value = "01310-200";
            document.getElementById('shipStreet').value = "Avenida Paulista";
            document.getElementById('shipNumber').value = "1578";
            document.getElementById('shipComplement').value = "Apto 82, Bloco B";
            document.getElementById('shipNeighborhood').value = "Bela Vista";
            document.getElementById('shipCity').value = "São Paulo";
            document.getElementById('shipState').value = "SP";

            // Se for cartão, preenche dados simulados
            const ccNum = document.getElementById('ccNumber');
            if (ccNum) ccNum.value = "4111 2222 3333 4821";
            const ccName = document.getElementById('ccName');
            if (ccName) ccName.value = "CAMILA M SILVA";
            const ccExp = document.getElementById('ccExp');
            if (ccExp) ccExp.value = "12/29";
            const ccCvc = document.getElementById('ccCvc');
            if (ccCvc) ccCvc.value = "482";

            showToast("Dados de demonstração preenchidos com sucesso!");
        });
    }

    // Sistema de Cupons
    function setupCouponSystem() {
        const btnApply = document.getElementById('btnApplyCoupon');
        const input = document.getElementById('couponInput');
        const badge = document.getElementById('couponAppliedBadge');
        const badgeName = document.getElementById('couponAppliedName');
        const btnRemove = document.getElementById('btnRemoveCoupon');

        if (!btnApply || !input) return;

        btnApply.addEventListener('click', () => {
            const code = input.value.trim().toUpperCase();
            if (!code) {
                alert('Por favor, digite o código do cupom.');
                return;
            }

            if (VALID_COUPONS[code]) {
                checkoutState.coupon = {
                    code: code,
                    ...VALID_COUPONS[code]
                };

                input.value = '';
                if (badge && badgeName) {
                    badge.style.display = 'inline-flex';
                    badgeName.innerText = `${code} (${checkoutState.coupon.label})`;
                }
                showToast(`Cupom ${code} aplicado com sucesso!`);
                updatePricingBreakdown();
            } else {
                alert(`Cupom "${code}" inválido ou expirado. Tente BEMVINDA10 ou FRETEGRATIS.`);
            }
        });

        if (btnRemove) {
            btnRemove.addEventListener('click', () => {
                checkoutState.coupon = null;
                if (badge) badge.style.display = 'none';
                showToast("Cupom removido.");
                updatePricingBreakdown();
            });
        }
    }

    // Validação dos Campos Obrigatórios
    function validateForm() {
        const name = document.getElementById('custName').value.trim();
        const email = document.getElementById('custEmail').value.trim();
        const phone = document.getElementById('custPhone').value.trim();
        const cpf = document.getElementById('custCpf').value.trim();

        const zip = document.getElementById('shipZip').value.trim();
        const street = document.getElementById('shipStreet').value.trim();
        const number = document.getElementById('shipNumber').value.trim();
        const neighborhood = document.getElementById('shipNeighborhood').value.trim();
        const city = document.getElementById('shipCity').value.trim();
        const state = document.getElementById('shipState').value;

        if (!name || !email || !phone || !cpf) {
            alert('Por favor, preencha todos os dados de Identificação (Passo 1).');
            document.getElementById('stepCustomer').scrollIntoView({ behavior: 'smooth' });
            return false;
        }

        if (!zip || !street || !number || !neighborhood || !city || !state) {
            alert('Por favor, preencha todos os dados obrigatórios do Endereço de Entrega (Passo 2).');
            document.getElementById('stepShipping').scrollIntoView({ behavior: 'smooth' });
            return false;
        }

        if (checkoutState.paymentMethod === 'credit_card') {
            const ccNum = document.getElementById('ccNumber').value.trim();
            const ccName = document.getElementById('ccName').value.trim();
            const ccExp = document.getElementById('ccExp').value.trim();
            const ccCvc = document.getElementById('ccCvc').value.trim();

            if (!ccNum || !ccName || !ccExp || !ccCvc) {
                alert('Por favor, preencha todos os dados do Cartão de Crédito.');
                document.getElementById('stepPayment').scrollIntoView({ behavior: 'smooth' });
                return false;
            }
        }

        return true;
    }

    // Submissão do Pedido e Transição para Sucesso
    function setupOrderSubmission() {
        const btnSubmit = document.getElementById('btnSubmitCheckout');
        if (!btnSubmit) return;

        btnSubmit.addEventListener('click', async () => {
            if (!validateForm()) return;

            // Feedback visual de carregamento
            const originalText = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spinner-spin">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#FFFFFF"></path>
                </svg>
                <span>Processando Pagamento Seguro...</span>
            `;

            // Simula latência de gateway seguro (1.2s)
            await new Promise(r => setTimeout(r, 1200));

            // Gera dados consolidados do pedido
            const orderNumber = 'LEV-' + Math.floor(10000 + Math.random() * 90000);
            const subtotal = checkoutState.items.reduce((acc, item) => acc + (item.price * (item.qty || 1)), 0);
            const totalStr = document.getElementById('summaryTotal').innerText.replace('R$ ', '').replace(',', '.');
            const total = parseFloat(totalStr) || subtotal;

            const orderPayload = {
                orderId: orderNumber,
                createdAt: new Date().toISOString(),
                date: new Date().toLocaleDateString('pt-BR'),
                customer: {
                    name: document.getElementById('custName').value.trim(),
                    email: document.getElementById('custEmail').value.trim(),
                    phone: document.getElementById('custPhone').value.trim(),
                    cpf: document.getElementById('custCpf').value.trim()
                },
                shippingAddress: {
                    zip: document.getElementById('shipZip').value.trim(),
                    street: document.getElementById('shipStreet').value.trim(),
                    number: document.getElementById('shipNumber').value.trim(),
                    complement: document.getElementById('shipComplement').value.trim(),
                    neighborhood: document.getElementById('shipNeighborhood').value.trim(),
                    city: document.getElementById('shipCity').value.trim(),
                    state: document.getElementById('shipState').value
                },
                shippingMethod: checkoutState.shippingMethod,
                shippingFee: checkoutState.shippingFee,
                paymentMethod: checkoutState.paymentMethod === 'pix' ? 'PIX (À Vista com 5% OFF)' :
                               checkoutState.paymentMethod === 'credit_card' ? 'Cartão de Crédito' : 'Boleto Bancário',
                items: checkoutState.items,
                subtotal: subtotal,
                total: total,
                status: checkoutState.paymentMethod === 'credit_card' ? 'Pagamento Aprovado' : 'Aguardando Pagamento',
                statusClass: checkoutState.paymentMethod === 'credit_card' ? 'status-paid' : 'status-pending',
                statusText: checkoutState.paymentMethod === 'credit_card' ? 'Em Separação no Centro de Distribuição' : 'Aguardando confirmação do pagamento',
                trackingCode: 'BR' + Math.floor(100000000 + Math.random() * 900000000) + 'LV',
                deliveryEstimate: 'Previsão: 3 a 5 dias úteis',
                timeline: [
                    { title: "Pedido Realizado", time: "Hoje às " + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), done: true },
                    { 
                        title: checkoutState.paymentMethod === 'credit_card' ? "Pagamento Aprovado Instantaneamente" : "Aguardando Pagamento", 
                        time: checkoutState.paymentMethod === 'credit_card' ? "Aprovado via Gateway Seguro" : "Pendente", 
                        done: checkoutState.paymentMethod === 'credit_card',
                        active: checkoutState.paymentMethod !== 'credit_card'
                    },
                    { title: "Nota Fiscal em Emissão", time: "Em fila", done: false },
                    { title: "Coleta e Envio para Transportadora", time: "-", done: false },
                    { title: "Em Transporte", time: "-", done: false },
                    { title: "Pedido Entregue", time: "-", done: false }
                ]
            };

            // =========================================================================
            // 🔌 PONTO DE ENTRADA PARA O SEU BANCO DE DADOS (SUPABASE / POSTGRESQL / API):
            // Quando você for integrar, basta descomentar a chamada abaixo:
            // 
            // await fetch('/api/orders', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(orderPayload)
            // });
            // =========================================================================

            // Integração nativa com a sessão da conta Levitate (auth.js)
            if (window.LevitateAuth) {
                let user = window.LevitateAuth.getUser();
                if (!user) {
                    // Se não estava logado, cria a conta instantaneamente com os dados informados
                    user = window.LevitateAuth.register({
                        name: orderPayload.customer.name,
                        email: orderPayload.customer.email,
                        phone: orderPayload.customer.phone,
                        cpf: orderPayload.customer.cpf
                    });
                }
                if (!user.orders) user.orders = [];
                user.orders.unshift(orderPayload);
                window.LevitateAuth.saveUser(user);
            }

            // Limpa a sacola de compras
            try {
                localStorage.removeItem(CART_STORAGE_KEY);
            } catch (e) {}

            // Exibe a Tela de Sucesso
            displaySuccessModal(orderPayload);
        });
    }

    // Exibe Modal de Sucesso
    function displaySuccessModal(order) {
        const modal = document.getElementById('checkoutSuccessModal');
        const numEl = document.getElementById('successOrderNumber');
        const emailEl = document.getElementById('successCustomerEmail');

        const boxPix = document.getElementById('successPixBox');
        const boxCard = document.getElementById('successCardBox');
        const boxBoleto = document.getElementById('successBoletoBox');

        if (numEl) numEl.innerText = `#${order.orderId}`;
        if (emailEl) emailEl.innerText = order.customer.email;

        if (boxPix) boxPix.style.display = checkoutState.paymentMethod === 'pix' ? 'block' : 'none';
        if (boxCard) boxCard.style.display = checkoutState.paymentMethod === 'credit_card' ? 'block' : 'none';
        if (boxBoleto) boxBoleto.style.display = checkoutState.paymentMethod === 'boleto' ? 'block' : 'none';

        if (checkoutState.paymentMethod === 'pix') {
            startPixCountdown();
        }

        if (modal) {
            modal.style.display = 'flex';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Botão de copiar PIX
        const btnCopyPix = document.getElementById('btnCopyPix');
        if (btnCopyPix) {
            btnCopyPix.onclick = () => {
                const code = document.getElementById('pixCopyCode').value;
                navigator.clipboard.writeText(code).then(() => {
                    btnCopyPix.innerHTML = '<span>✓ Código PIX Copiado!</span>';
                    btnCopyPix.style.background = '#059669';
                    setTimeout(() => {
                        btnCopyPix.innerHTML = '<span>Copiar Código PIX</span>';
                        btnCopyPix.style.background = '';
                    }, 3000);
                });
            };
        }
    }

    // Contagem regressiva do PIX (15 minutos)
    function startPixCountdown() {
        if (checkoutState.pixCountdownInterval) clearInterval(checkoutState.pixCountdownInterval);
        let secondsLeft = 15 * 60; // 15 minutos

        const countdownEl = document.getElementById('pixCountdown');

        checkoutState.pixCountdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearInterval(checkoutState.pixCountdownInterval);
                if (countdownEl) countdownEl.innerText = 'Expirado';
                return;
            }

            const mins = Math.floor(secondsLeft / 60);
            const secs = secondsLeft % 60;
            if (countdownEl) {
                countdownEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    // Inicialização
    document.addEventListener('DOMContentLoaded', () => {
        loadCartItems();
        renderOrderSummaryItems();
        setupAuthIntegration();
        setupCepLookup();
        setupShippingMethods();
        setupPaymentTabs();
        setupInputMasks();
        setupDemoFill();
        setupCouponSystem();
        setupOrderSubmission();
        updatePricingBreakdown();
    });

})();
