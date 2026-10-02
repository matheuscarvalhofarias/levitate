// Levitate - Sistema de Autenticação, Conta e Pedidos (auth.js)

const LEVITATE_USER_KEY = 'levitate_user_session';

// Mock do usuário padrão para demonstração instantânea
const DEFAULT_DEMO_USER = {
    name: "Camila Mendes",
    email: "camila.mendes@exemplo.com",
    phone: "(11) 98765-4321",
    cpf: "348.912.045-89",
    birthDate: "1994-08-14",
    memberSince: "2026",
    points: 150,
    addresses: [
        {
            id: 1,
            title: "Minha Casa",
            recipient: "Camila Mendes",
            street: "Av. Paulista, 1578",
            complement: "Apto 82 - Torre Sul",
            neighborhood: "Bela Vista",
            city: "São Paulo",
            state: "SP",
            zip: "01310-200",
            isDefault: true
        }
    ],
    orders: [
        {
            id: "LEV-92841",
            date: "01/10/2026",
            status: "Em Transporte",
            statusClass: "status-shipping",
            statusText: "Em rota de entrega",
            trackingCode: "BR849204192LV",
            deliveryEstimate: "Previsão: 04/10/2026",
            timeline: [
                { title: "Pedido Realizado", time: "01/10 às 14:20", done: true },
                { title: "Pagamento Aprovado via PIX", time: "01/10 às 14:22", done: true },
                { title: "Nota Fiscal Emitida (NF-e 8241)", time: "01/10 às 16:05", done: true },
                { title: "Coletado pela Transportadora", time: "01/10 às 18:30", done: true },
                { title: "Em Transporte para sua Região", time: "02/10 às 08:15", active: true },
                { title: "Saiu para Entrega ao Destinatário", time: "Previsão 04/10", done: false },
                { title: "Pedido Entregue", time: "-", done: false }
            ],
            items: [
                { id: "agua-micelar-200ml", name: "Água Micelar Corporal Levitate (200ml)", qty: 1, price: 59.90, img: "assets/images/produto_agua_micelar.jpg" },
                { id: "lencos-48un", name: "Lenços Umedecidos Levitate (48 un)", qty: 1, price: 29.90, img: "assets/images/produto_lencos.jpg" }
            ],
            subtotal: 89.80,
            shipping: 0.00,
            total: 89.80,
            paymentMethod: "PIX (À Vista)"
        },
        {
            id: "LEV-71049",
            date: "15/09/2026",
            status: "Entregue",
            statusClass: "status-delivered",
            statusText: "Entregue no endereço",
            trackingCode: "BR710492819LV",
            deliveryEstimate: "Entregue em 18/09/2026",
            timeline: [
                { title: "Pedido Realizado", time: "15/09 às 10:11", done: true },
                { title: "Pagamento Aprovado", time: "15/09 às 10:12", done: true },
                { title: "Em Separação", time: "15/09 às 14:00", done: true },
                { title: "Em Transporte", time: "16/09 às 09:30", done: true },
                { title: "Saiu para Entrega", time: "18/09 às 11:20", done: true },
                { title: "Pedido Entregue", time: "18/09 às 15:45", done: true }
            ],
            items: [
                { id: "neutralizador-500ml", name: "Neutralizador Têxtil Levitate (500ml)", qty: 1, price: 69.90, img: "assets/images/produto_neutralizador.jpg" }
            ],
            subtotal: 69.90,
            shipping: 0.00,
            total: 69.90,
            paymentMethod: "Cartão de Crédito (Final 4821)"
        }
    ]
};

// Funções do Repositório de Usuário
window.LevitateAuth = {
    // Retorna o usuário ativo ou null
    getUser() {
        const stored = localStorage.getItem(LEVITATE_USER_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Erro ao carregar sessão do usuário:", e);
            }
        }
        return null;
    },

    // Salva ou atualiza a sessão do usuário
    saveUser(userData) {
        localStorage.setItem(LEVITATE_USER_KEY, JSON.stringify(userData));
        this.updateHeaderBadge();
    },

    // Login com e-mail e senha
    login(email, password) {
        const existing = this.getUser();
        // Se já houver usuário com mesmo e-mail, usa ele
        if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
            this.saveUser(existing);
            return existing;
        }

        // Se for o e-mail de demonstração ou login padrão
        const user = JSON.parse(JSON.stringify(DEFAULT_DEMO_USER));
        user.email = email;
        this.saveUser(user);
        return user;
    },

    // Login rápido com perfil de demonstração
    loginDemo() {
        const user = JSON.parse(JSON.stringify(DEFAULT_DEMO_USER));
        this.saveUser(user);
        return user;
    },

    // Cadastro de nova conta
    register(userData) {
        const newUser = {
            ...JSON.parse(JSON.stringify(DEFAULT_DEMO_USER)),
            ...userData,
            orders: [], // nova conta inicia sem pedidos ou com o padrão
            points: 100, // bônus de 100 pontos de boas-vindas
            memberSince: "2026"
        };
        this.saveUser(newUser);
        return newUser;
    },

    // Logout
    logout() {
        localStorage.removeItem(LEVITATE_USER_KEY);
        this.updateHeaderBadge();
    },

    // Adiciona novo endereço
    addAddress(address) {
        const user = this.getUser();
        if (!user) return;
        if (!user.addresses) user.addresses = [];
        address.id = Date.now();
        if (address.isDefault) {
            user.addresses.forEach(a => a.isDefault = false);
        }
        user.addresses.push(address);
        this.saveUser(user);
    },

    // Remove endereço
    deleteAddress(id) {
        const user = this.getUser();
        if (!user || !user.addresses) return;
        user.addresses = user.addresses.filter(a => a.id !== id);
        this.saveUser(user);
    },

    // Atualiza dados cadastrais
    updateProfile(data) {
        const user = this.getUser();
        if (!user) return;
        Object.assign(user, data);
        this.saveUser(user);
    },

    // Comprar novamente (adiciona itens do pedido ao carrinho)
    reorder(orderId) {
        const user = this.getUser();
        if (!user || !user.orders) return;
        const order = user.orders.find(o => o.id === orderId);
        if (!order || !order.items) return;

        // Adiciona itens ao carrinho via API central da loja
        if (typeof window.levitateAddToCart === 'function') {
            order.items.forEach(item => {
                window.levitateAddToCart({
                    name: item.name,
                    price: item.price,
                    img: item.img,
                    qty: item.qty
                });
            });
            if (typeof showToast === 'function') {
                showToast(`Itens do pedido ${orderId} adicionados à sacola!`);
            }
        } else {
            alert(`Itens do pedido ${orderId} adicionados à sacola!`);
        }
    },

    // Atualiza o botão do usuário na Navbar de qualquer página
    updateHeaderBadge() {
        const user = this.getUser();
        const accountBtns = document.querySelectorAll('#openAccountBtn, button[aria-label="Minha Conta"], .nav-account-btn');

        accountBtns.forEach(btn => {
            if (user && user.name) {
                const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                btn.innerHTML = `<span class="nav-user-initials" title="Olá, ${user.name}!">${initials}</span>`;
                btn.classList.add('is-logged-in');
            } else {
                btn.innerHTML = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                `;
                btn.classList.remove('is-logged-in');
            }

            // Ao clicar no botão da conta
            btn.onclick = (e) => {
                e.preventDefault();
                // Redireciona sempre de forma limpa para conta.html
                window.location.href = 'conta.html';
            };
        });
    }
};

// Executa ao carregar o DOM
document.addEventListener('DOMContentLoaded', () => {
    window.LevitateAuth.updateHeaderBadge();
});
