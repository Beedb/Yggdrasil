/* =========================================================
   YGGDRASIL · painel de links, agenda e tarefas
   Dados: dados.json pelo servidor.py (ou só no navegador, se abrir o
   index.html direto). Sem bibliotecas externas.
   ========================================================= */
(function () {
'use strict';

/* ===================== utilitários ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hojeIso = () => iso(new Date());
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem espaço ou bloqueado */ } };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SEM_CURTA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const CORES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
const TEMAS = [
    { id: 'brasa', nome: 'Brasa', fixo: 'escuro', cores: ['#2a2321', '#2e2623', '#c27447', '#d9834b', '#ffffff'] },
    { id: 'noite', nome: 'Noite', fixo: 'escuro', cores: ['#a9acd9', '#1c1d2b', '#7aa2f7', '#bb9af7', '#9ece6a'] },
    { id: 'papel', nome: 'Papel', fixo: 'claro', cores: ['#f2efe6', '#fbfaf5', '#1b1b1b', '#777777', '#beb8ad'] },
    { id: 'vidro', nome: 'Vidro', fixo: 'claro', cores: ['#c4c4c8', '#ececef', '#2b2b30', '#4b6cb7', '#9a9aa2'] },
    { id: 'catppuccin', nome: 'Catppuccin', duplo: true, escuro: ["#11111b", "#1e1e2e", "#cba6f7", "#89b4fa", "#a6e3a1"], claro: ["#dce0e8", "#eff1f5", "#8839ef", "#1e66f5", "#40a02b"] },
    { id: 'maca', nome: 'Maçã-verde', duplo: true, escuro: ["#0e130e", "#161d16", "#8fd694", "#b5e48c", "#6fc3a0"], claro: ["#e4ecdf", "#f6faf3", "#1f5a2e", "#4c8a2e", "#2f7f6a"] },
    { id: 'lavanda', nome: 'Lavanda', duplo: true, escuro: ["#0c0c22", "#11112b", "#9b7bf0", "#c49bf5", "#7aa7f0"], claro: ["#dfd3f7", "#f4effd", "#6a3fc0", "#9c3fb0", "#3f62c0"] },
    { id: 'yinyang', nome: 'Yin & Yang', duplo: true, escuro: ["#0a0a0a", "#161616", "#ffffff", "#bdbdbd", "#9e9e9e"], claro: ["#f2f2f2", "#ffffff", "#000000", "#555555", "#7a7a7a"] },
    { id: 'yotsuba', nome: 'Pêssego', duplo: true, escuro: ["#1a1412", "#221a17", "#f0b49c", "#e8896a", "#d9b77a"], claro: ["#f3ebe7", "#ffffff", "#a73a1e", "#c96a2e", "#8c6b2a"] },
    { id: 'mono', nome: 'Monocromático', duplo: true, escuro: ["#000000", "#000000", "#ffffff", "#cccccc", "#999999"], claro: ["#ffffff", "#ffffff", "#000000", "#444444", "#777777"] },
    { id: 'aurora', nome: 'Aurora-da-noite', duplo: true, escuro: ["#121016", "#18161d", "#e2457a", "#b06ae0", "#ff8fab"], claro: ["#f6eef1", "#ffffff", "#b0245a", "#7a3fb0", "#d0507a"] },
    { id: 'nord', nome: 'Nord', duplo: true, escuro: ["#242933", "#2e3440", "#88c0d0", "#81a1c1", "#a3be8c"], claro: ["#d8dee9", "#eceff4", "#4a6d98", "#8f5f8a", "#6f8f55"] },
    { id: 'rosa', nome: 'Sakura', duplo: true, escuro: ["#1a1216", "#22171c", "#f48fb1", "#ce93d8", "#ffab91"], claro: ["#fbe4ec", "#fff5f8", "#c2185b", "#8e3fa8", "#d0603a"] },
    { id: 'rubi', nome: 'Rubi', duplo: true, escuro: ["#170d0d", "#1f1212", "#ef5350", "#ff8a65", "#ffca28"], claro: ["#f6e3e3", "#fff7f7", "#b71c1c", "#d0603a", "#a8781c"] },
    { id: 'oceano', nome: 'Oceano', duplo: true, escuro: ["#071318", "#0c1d24", "#2ec4d6", "#4f8cff", "#7ee0c3"], claro: ["#dcecef", "#f4fafb", "#0b7a8c", "#2856c4", "#1f8a6a"] },
    { id: 'floresta', nome: 'Floresta', duplo: true, escuro: ["#0d1610", "#132018", "#c9a24a", "#7fb069", "#d9774a"], claro: ["#e6e9dc", "#f7f8f1", "#2f5d3a", "#8a6a1f", "#b0532a"] },
    { id: 'cafe', nome: 'Café', duplo: true, escuro: ["#16100c", "#1e1612", "#d9a066", "#c27c4e", "#9fb57a"], claro: ["#efe6dc", "#fbf7f2", "#7a4a2a", "#a5562c", "#5a7a32"] },
    { id: 'synthwave', nome: 'Synthwave', duplo: true, escuro: ["#0d0718", "#150c26", "#ff4fd8", "#36e2ff", "#ffd34f"], claro: ["#f3e9fb", "#fdf8ff", "#b0158f", "#0a7fa0", "#9a6a00"] },
    { id: 'terminal', nome: 'Terminal', duplo: true, escuro: ["#000000", "#050a05", "#33ff66", "#2ed3ff", "#ffcc33"], claro: ["#eef5ee", "#fbfffb", "#1a7a32", "#0a6a8a", "#8a6a00"] },
    { id: 'solar', nome: 'Solar', duplo: true, escuro: ["#16120a", "#1f190e", "#ffb627", "#ff7a3d", "#e9e34a"], claro: ["#fbf3e1", "#fffcf3", "#a35d00", "#c2410c", "#7a6a00"] },
    { id: 'artico', nome: 'Ártico', duplo: true, escuro: ["#0b1218", "#111b23", "#8ecae6", "#a7c7ff", "#b8e0d2"], claro: ["#e3edf3", "#f8fbfd", "#2a6f97", "#3a5fc0", "#2f7f6a"] },
    { id: 'vinho', nome: 'Vinho', duplo: true, escuro: ["#14090d", "#1d0e14", "#d65a7e", "#e8a87c", "#c38fd1"], claro: ["#f4e6ea", "#fdf7f9", "#8c1c3f", "#a8541f", "#7a3a8c"] },
    { id: 'areia', nome: 'Areia', duplo: true, escuro: ["#17140f", "#201c15", "#e0b872", "#c98e5a", "#8fb08a"], claro: ["#f1ebdf", "#fcf9f3", "#8a6420", "#a0522d", "#4f7a3a"] },
    { id: 'grafite', nome: 'Grafite', duplo: true, escuro: ["#121417", "#1a1d21", "#6ea8fe", "#a78bfa", "#5eead4"], claro: ["#e9ecef", "#f8f9fa", "#2f6fdb", "#6d4ad0", "#0f7a6a"] },
    { id: 'menta', nome: 'Menta', duplo: true, escuro: ["#08130f", "#0e1c17", "#5fe0b0", "#7cc6ff", "#c5f27a"], claro: ["#e2f3ec", "#f6fcf9", "#0f7a5a", "#1f62b0", "#4f7a10"] },
    { id: 'contraste', nome: 'Alto contraste', duplo: true, escuro: ["#000000", "#000000", "#ffff00", "#00ffff", "#00ff00"], claro: ["#ffffff", "#ffffff", "#0000cc", "#006666", "#006600"] },
];
const BUSCADORES = {
    google: { nome: 'Google', url: 'https://www.google.com/search?q=' },
    duck: { nome: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    bing: { nome: 'Bing', url: 'https://www.bing.com/search?q=' },
    brave: { nome: 'Brave', url: 'https://search.brave.com/search?q=' },
};
const REPETIR = { nao: 'Não repete', diario: 'Todo dia', semanal: 'Toda semana', mensal: 'Todo mês', anual: 'Todo ano' };

function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}
function arrumarUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    return 'https://' + u;
}
function pareceUrl(t) {
    t = t.trim();
    if (/\s/.test(t)) return false;
    return /^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t) || /^localhost(:\d+)?/.test(t);
}
function corDe(texto) {
    let h = 0;
    for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return CORES[h % CORES.length];
}

/* ===================== título e árvore em pixel ===================== */
const GLIFOS = {
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
};
function tituloPixel(texto) {
    const c = 10, g = 1, prof = 3, letras = texto.split('');
    const larg = letras.length * 6 * c - c + prof * 3 + 2;
    const alt = 7 * c + prof * 3 + 2;
    let sombra = '', frente = '';
    letras.forEach((l, i) => {
        const gl = GLIFOS[l];
        if (!gl) return;
        gl.forEach((linha, y) => linha.split('').forEach((b, x) => {
            if (b !== '1') return;
            const px = i * 6 * c + x * c, py = y * c;
            for (let k = prof; k >= 1; k--) sombra += `<rect x="${px + k * 3}" y="${py + k * 3}" width="${c - g}" height="${c - g}"/>`;
            frente += `<rect x="${px}" y="${py}" width="${c - g}" height="${c - g}"/><rect x="${px}" y="${py + 4}" width="${c - g}" height="1.4" fill="var(--card)" opacity=".55"/>`;
        }));
    });
    return `<svg viewBox="0 0 ${larg} ${alt}" role="img" aria-label="${esc(texto)}"><g fill="var(--pixel-sombra)">${sombra}</g><g fill="var(--pixel-frente)">${frente}</g></svg>`;
}
// Logo (pixel art 14x15): 1 = copa, 3 = sombra da copa, 2 = tronco/raízes. Desenho original em assets/yggdrasi.ase (Aseprite)
const ARVORE = [
    '00011111100000',
    '00113331110110',
    '01333311113111',
    '01331111333111',
    '01311113331110',
    '01111111311100',
    '00111111110000',
    '00001202000000',
    '00000222000000',
    '00000220000000',
    '00022222000000',
    '22202020222200',
    '20002002200022',
    '00222000200002',
    '00200000000000',
];
const CORES_LOGO = ['#52ac13', '#43150d', '#3e8011'];
function arvoreSvg(cores) {
    const [copa, tronco, sombra] = cores || ['var(--acento)', 'var(--fraco)', 'color-mix(in srgb, var(--acento) 68%, #000)'];
    const cor = { 1: copa, 2: tronco, 3: sombra };
    let r = '';
    ARVORE.forEach((linha, y) => linha.split('').forEach((b, x) => {
        if (b !== '0') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" style="fill:${cor[b]}"/>`;
    }));
    return `<svg viewBox="0 0 ${ARVORE[0].length} ${ARVORE.length}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
function trocarFavicon() {
    const svg = arvoreSvg(CORES_LOGO);
    $('#favicon').href = 'data:image/svg+xml,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
}

/* grade "desenhada à mão" do fundo */
function desenharGrade() {
    const svg = $('#grade');
    const w = window.innerWidth, h = window.innerHeight, passo = w < 700 ? 74 : 104;
    let semente = 7;
    const rnd = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280 - 0.5; };
    let d = '';
    for (let x = passo / 2; x < w + passo; x += passo) {
        d += `M${x + rnd() * 6},-10 Q${x + rnd() * 14},${h * 0.33} ${x + rnd() * 8},${h * 0.5} T${x + rnd() * 8},${h + 10} `;
    }
    for (let y = passo / 2; y < h + passo; y += passo) {
        d += `M-10,${y + rnd() * 6} Q${w * 0.3},${y + rnd() * 14} ${w * 0.5},${y + rnd() * 8} T${w + 10},${y + rnd() * 8} `;
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
}

/* ===================== dados ===================== */
const CHAVE = 'yggdrasil';
let D = null;
let modoServidor = false;
let timerSalvar = null;

function semente() {
    return {
        versao: 1,
        atualizado: Date.now(),
        perfil: { nome: '' },
        ajustes: { tema: 'brasa', temaV: 2, buscador: 'google', novaAba: true, icones: false, icsUrl: '', avisos: false, avisoMin: 10, emailEscuro: true, modo: 'sistema', preto: false },
        grupos: [],
        links: [],
        eventos: [],
        tarefas: [],
        notas: '',
    };
}

function normalizar(d) {
    const base = semente();
    const temaAntigo = !d.ajustes || d.ajustes.temaV !== 2;
    d.ajustes = Object.assign({}, base.ajustes, d.ajustes || {});
    if (temaAntigo) { d.ajustes.tema = 'brasa'; d.ajustes.temaV = 2; } // paleta nova vira o padrão uma vez
    d.perfil = Object.assign({}, base.perfil, d.perfil || {});
    for (const k of ['grupos', 'links', 'eventos', 'tarefas']) if (!Array.isArray(d[k])) d[k] = [];
    if (typeof d.notas !== 'string') d.notas = '';
    d.links.forEach((l) => { l.tags = Array.isArray(l.tags) ? l.tags : []; l.cliques = l.cliques || 0; l.usado = l.usado || 0; });
    d.eventos.forEach((e) => { e.excecoes = Array.isArray(e.excecoes) ? e.excecoes : []; e.repetir = e.repetir || 'nao'; });
    return d;
}

async function carregar() {
    let remoto;
    if (await escolherPerfilInicial()) {
        try {
            const r = await fetch('api/dados', { cache: 'no-store' });
            if (r.ok) { remoto = (await r.json()).dados; modoServidor = true; }
        } catch (e) { /* servidor caiu no meio */ }
    }
    let local = null;
    try { local = JSON.parse(lsGet(chaveLocal()) || 'null'); } catch (e) { local = null; }
    D = remoto || local || semente();
    normalizar(D);
    if (perfilAtual) D.perfil.nome = perfilAtual.nome;
    if (modoServidor && !remoto) salvar(true); // primeira vez com servidor: cria o dados.json
    estadoSync(modoServidor ? 'ok' : 'local');
}

function salvar(agora) {
    D.atualizado = Date.now();
    lsSet(chaveLocal(), JSON.stringify(D));
    if (!modoServidor) return;
    estadoSync('salvando');
    clearTimeout(timerSalvar);
    const enviar = async () => {
        try {
            const r = await fetch('api/dados', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Yggdrasil': '1' },
                body: JSON.stringify(D),
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            estadoSync('ok');
        } catch (e) {
            estadoSync('erro');
            aviso('Não consegui salvar no servidor. Ficou salvo neste navegador.');
        }
    };
    if (agora === true) enviar(); else timerSalvar = setTimeout(enviar, 350);
}

function estadoSync(estado) {
    const el = $('#sync');
    if (!el) return;
    el.className = 'sync ' + (estado === 'ok' ? '' : estado);
    el.title = { ok: 'Salvo em dados.json', salvando: 'Salvando…', erro: 'Erro ao salvar no servidor', local: 'Salvo só neste navegador' }[estado];
}

// Se outra aba (ou o celular) mudou os dados, recarrega ao voltar para a aba
async function conferirRemoto() {
    if (!modoServidor || document.hidden) return;
    try {
        const r = await fetch('api/dados', { cache: 'no-store' });
        const remoto = (await r.json()).dados;
        if (remoto && (remoto.atualizado || 0) > (D.atualizado || 0)) {
            D = normalizar(remoto);
            if (perfilAtual) D.perfil.nome = perfilAtual.nome;
            lsSet(chaveLocal(), JSON.stringify(D));
            aplicarTema();
            render();
        }
    } catch (e) { /* servidor fechado */ }
}


/* ===================== perfis ===================== */
// Cada pessoa tem seus dados no servidor. O perfil escolhido fica salvo no aparelho;
// o PIN fica só nesta aba (ou no aparelho, se marcar "lembrar").
let perfis = [];
let perfilAtual = null;
let pinAtual = '';
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* bloqueado */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* bloqueado */ } };

const fetchOriginal = window.fetch.bind(window);
window.fetch = function (url, opcoes) {
    if (typeof url === 'string' && url.startsWith('api/') && perfilAtual) {
        opcoes = Object.assign({}, opcoes || {});
        opcoes.headers = Object.assign({}, opcoes.headers || {}, { 'X-Yggdrasil-Perfil': perfilAtual.id }, pinAtual ? { 'X-Yggdrasil-Pin': pinAtual } : {});
        return fetchOriginal(url, opcoes).then((r) => {
            if (r.status === 401 && !url.startsWith('api/perfis/entrar')) {
                r.clone().json().then((j) => { if (j.erro === 'perfil-ou-pin') perfilInvalido(); }).catch(() => {});
            }
            return r;
        });
    }
    return fetchOriginal(url, opcoes);
};
let avisouInvalido = false;
function perfilInvalido() {
    if (avisouInvalido) return;
    avisouInvalido = true;
    ssSet('yggPin:' + (perfilAtual && perfilAtual.id), null);
    lsDel('yggPin:' + (perfilAtual && perfilAtual.id));
    aviso('O PIN deste perfil mudou. Entre de novo.');
    setTimeout(() => { lsDel('yggPerfil'); location.reload(); }, 1500);
}
function chaveLocal() {
    return !perfilAtual || perfilAtual.id === 'principal' ? CHAVE : CHAVE + ':' + perfilAtual.id;
}
function avatar(p, classe) {
    return `<span class="avatar ${classe || ''}" style="--cor:var(--${esc(p.cor || 'c1')})" aria-hidden="true">${esc((p.nome || '?').trim().charAt(0).toUpperCase())}</span>`;
}

// Tela "Quem está usando?" — resolve com {perfil, pin}
function telaPerfis(podeFechar) {
    return new Promise((resolver) => {
        const tela = document.createElement('div');
        tela.className = 'tela-perfis';
        tela.setAttribute('role', 'dialog');
        tela.setAttribute('aria-modal', 'true');
        tela.setAttribute('aria-label', 'Escolher perfil');
        tela.innerHTML = `<div class="tela-perfis-caixa">
            <div class="titulo-pixel mini">${tituloPixel('YGGDRASIL')}</div>
            <h2>Quem está usando?</h2>
            <div class="perfis-grade">${perfis.map((p) => `<button class="perfil-op" data-perfil="${esc(p.id)}">${avatar(p, 'grande')}<span class="nome">${esc(p.nome)}</span>${p.temPin ? '<i class="fa-solid fa-lock" title="Tem PIN"></i>' : ''}</button>`).join('')}</div>
            <form class="pin-form" hidden>
              <label class="f"><span data-pin-rotulo>PIN</span><input class="campo pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" pattern="[0-9]*" aria-label="PIN"></label>
              <label class="op"><input type="checkbox" class="check" name="lembrar"> lembrar neste aparelho</label>
              <div class="pin-erro" role="alert"></div>
              <div class="modal-acoes"><button type="button" class="btn" data-voltar>Voltar</button><button class="btn primario">Entrar</button></div>
            </form>
            ${podeFechar ? '<button class="btn fantasma fechar" data-fechar>cancelar</button>' : ''}
          </div>`;
        document.body.appendChild(tela);
        const form = $('.pin-form', tela), grade = $('.perfis-grade', tela), campo = $('.pin', tela), erro = $('.pin-erro', tela);
        let escolhido = null;
        const terminar = (res) => { tela.remove(); resolver(res); };
        tela.addEventListener('click', (e) => {
            const b = e.target.closest('[data-perfil]');
            if (b) {
                escolhido = perfis.find((p) => p.id === b.dataset.perfil);
                if (!escolhido.temPin) {
                    if (pcLocal) return terminar({ perfil: escolhido, pin: '' });
                    aviso(`O perfil "${escolhido.nome}" não tem PIN, então só abre no próprio PC.`);
                    return;
                }
                grade.hidden = true;
                form.hidden = false;
                $('[data-pin-rotulo]', tela).textContent = 'PIN de ' + escolhido.nome;
                campo.value = '';
                erro.textContent = '';
                campo.focus();
                return;
            }
            if (e.target.closest('[data-voltar]')) { form.hidden = true; grade.hidden = false; return; }
            if (e.target.closest('[data-fechar]')) terminar(null);
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pin = campo.value.trim();
            try {
                const r = await fetchOriginal('api/perfis/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Yggdrasil': '1' }, body: JSON.stringify({ id: escolhido.id, pin }) });
                const j = await r.json();
                if (r.ok) {
                    if (form.lembrar.checked) lsSet('yggPin:' + escolhido.id, pin);
                    return terminar({ perfil: escolhido, pin });
                }
                erro.textContent = j.espera ? `Muitas tentativas. Espere ${j.espera} s.` : 'PIN errado.';
                campo.select();
            } catch (x) { erro.textContent = 'Não consegui falar com o servidor.'; }
        });
        const primeiro = $('.perfil-op', tela);
        if (primeiro) primeiro.focus();
    });
}

let pcLocal = true; // aberto no próprio PC (e não por outro aparelho da rede)
function telaBoasVindas() {
    return new Promise((resolver) => {
        const tela = document.createElement('div');
        tela.className = 'tela-perfis';
        tela.setAttribute('role', 'dialog');
        tela.setAttribute('aria-modal', 'true');
        tela.setAttribute('aria-label', 'Criar seu perfil');
        tela.innerHTML = `<div class="tela-perfis-caixa boas-vindas">
            <div class="titulo-pixel mini">${tituloPixel('YGGDRASIL')}</div>
            <h2>Boas-vindas! Vamos criar o seu perfil</h2>
            <p class="fraco">Tudo fica salvo neste computador. Depois dá para criar perfis para outras pessoas em Ajustes.</p>
            <form class="pin-form">
              <label class="f"><span>Como quer ser chamado?</span><input class="campo" name="nome" required maxlength="30" autocomplete="nickname" autofocus></label>
              <label class="f"><span>PIN (opcional, 6 a 8 números)</span><input class="campo pin" name="pin" type="password" inputmode="numeric" maxlength="8" pattern="[0-9]{6,8}" autocomplete="new-password"></label>
              <p class="fraco" style="margin:0;font-size:12px">O PIN protege o seu perfil e é obrigatório para abrir o Yggdrasil pelo celular.</p>
              <div class="pin-erro" role="alert"></div>
              <div class="modal-acoes"><button class="btn primario"><i class="fa-solid fa-seedling"></i> Começar</button></div>
            </form>
          </div>`;
        document.body.appendChild(tela);
        const form = $('form', tela), erro = $('.pin-erro', tela);
        form.nome.focus();
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = form.nome.value.trim(), pin = form.pin.value.trim();
            if (!nome) { erro.textContent = 'Escreva um nome.'; return; }
            if (pin && !/^\d{6,8}$/.test(pin)) { erro.textContent = 'O PIN precisa ter de 6 a 8 números.'; return; }
            try {
                const r = await fetchOriginal('api/perfis/criar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Yggdrasil': '1' }, body: JSON.stringify({ nome, pin }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) { erro.textContent = j.erro || 'Não deu para criar o perfil.'; return; }
                tela.remove();
                resolver({ perfil: j.perfil, pin });
            } catch (x) { erro.textContent = 'O servidor do Yggdrasil não respondeu.'; }
        });
    });
}

async function escolherPerfilInicial() {
    let lista;
    try {
        const r = await fetchOriginal('api/perfis', { cache: 'no-store' });
        if (!r.ok) return false;
        lista = await r.json();
        perfis = lista.perfis || [];
        pcLocal = lista.local !== false;
    } catch (e) { return false; }
    if (lista.configurar && pcLocal) {
        const r = await telaBoasVindas();
        perfis = [r.perfil];
        perfilAtual = r.perfil;
        pinAtual = r.pin || '';
        lsSet('yggPerfil', perfilAtual.id);
        if (pinAtual) ssSet('yggPin:' + perfilAtual.id, pinAtual);
        return true;
    }
    const salvo = perfis.find((p) => p.id === lsGet('yggPerfil'));
    const pinSalvo = salvo && (ssGet('yggPin:' + salvo.id) || lsGet('yggPin:' + salvo.id) || '');
    if (salvo && (salvo.temPin ? pinSalvo : pcLocal)) {
        perfilAtual = salvo;
        pinAtual = pinSalvo || '';
    } else if (perfis.length === 1 && !perfis[0].temPin && pcLocal) {
        perfilAtual = perfis[0];
    } else {
        const r = await telaPerfis(false);
        perfilAtual = r.perfil;
        pinAtual = r.pin;
    }
    lsSet('yggPerfil', perfilAtual.id);
    if (pinAtual) ssSet('yggPin:' + perfilAtual.id, pinAtual);
    return true;
}
async function trocarPerfil() {
    try { perfis = (await (await fetchOriginal('api/perfis', { cache: 'no-store' })).json()).perfis || perfis; } catch (e) { /* usa a lista que já tem */ }
    const r = await telaPerfis(true);
    if (!r || (r.perfil.id === perfilAtual.id)) return;
    lsSet('yggPerfil', r.perfil.id);
    if (r.pin) ssSet('yggPin:' + r.perfil.id, r.pin);
    location.hash = '#inicio';
    location.reload();
}
function mostrarAvatarLateral() {
    const b = $('#perfil-btn');
    if (!b) return;
    b.hidden = !perfilAtual;
    if (perfilAtual) { b.innerHTML = avatar(perfilAtual); b.title = `${perfilAtual.nome} (trocar perfil)`; }
}

function modalPerfil(id) {
    const novo = !id;
    const p = novo ? { nome: '', cor: 'c2', temPin: false } : perfis.find((x) => x.id === id);
    if (!p) return;
    const ehPrincipal = perfilAtual && perfilAtual.id === 'principal';
    abrirModal(`
        <h2><i class="fa-solid fa-user"></i>${novo ? 'Novo perfil' : 'Editar perfil'}</h2>
        <label class="f"><span>Nome</span><input class="campo" name="nome" value="${esc(p.nome)}" required maxlength="30" autofocus></label>
        <div class="f"><span>Cor</span><div class="cores">${CORES.map((c) => `<label><input type="radio" name="cor" value="${c}" ${p.cor === c ? 'checked' : ''}><span style="--cor:var(--${c})"></span></label>`).join('')}</div></div>
        <label class="f"><span>${p.temPin ? 'Novo PIN (deixe vazio para manter o atual)' : 'PIN (opcional, 6 a 8 números)'}</span><input class="campo" name="pin" type="password" inputmode="numeric" maxlength="8" pattern="[0-9]{6,8}" autocomplete="new-password"></label>
        ${p.temPin ? '<label class="op" style="display:flex;gap:10px;align-items:center"><input type="checkbox" class="check" name="tirarPin"> Tirar o PIN</label>' : ''}
        <p class="fraco" style="margin:0;font-size:12px">Com PIN, ninguém abre este perfil sem saber o número, e o email dele também funciona pelo celular.</p>
        <div class="modal-acoes">
          ${!novo && ehPrincipal && id !== 'principal' ? '<button class="btn perigo esq" value="apagar" formnovalidate><i class="fa-regular fa-trash-can"></i> Apagar perfil</button>' : ''}
          <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
          <button class="btn primario" value="ok"><i class="fa-solid fa-check"></i> Salvar</button>
        </div>`, (fd, botao) => {
        const enviar = async (rota, corpo, msg) => {
            try {
                const j = await postApi(rota, corpo);
                if (j.perfil) {
                    const i = perfis.findIndex((x) => x.id === j.perfil.id);
                    if (i >= 0) perfis[i] = j.perfil; else perfis.push(j.perfil);
                    if (j.perfil.id === perfilAtual.id) {
                        perfilAtual = j.perfil;
                        if ('pin' in corpo) {
                            pinAtual = corpo.pin || '';
                            ssSet('yggPin:' + perfilAtual.id, pinAtual || null);
                            if (lsGet('yggPin:' + perfilAtual.id)) { if (pinAtual) lsSet('yggPin:' + perfilAtual.id, pinAtual); else lsDel('yggPin:' + perfilAtual.id); }
                        }
                        D.perfil.nome = perfilAtual.nome; salvar(); mostrarAvatarLateral();
                    }
                }
                if (rota.endsWith('apagar')) perfis = perfis.filter((x) => x.id !== corpo.id);
                aviso(msg);
                render();
            } catch (e) { aviso(e.message); }
        };
        if (botao && botao.value === 'apagar') {
            if (!confirm(`Apagar o perfil "${p.nome}"? Os dados dele vão para a pasta backups/apagados.`)) return false;
            enviar('api/perfis/apagar', { id }, 'Perfil apagado');
            return;
        }
        const pin = String(fd.get('pin') || '').trim();
        if (pin && !/^\d{6,8}$/.test(pin)) { aviso('O PIN precisa ter de 6 a 8 números.'); return false; }
        const corpo = { nome: String(fd.get('nome') || '').trim(), cor: fd.get('cor') || p.cor };
        if (novo) { if (pin) corpo.pin = pin; enviar('api/perfis/novo', corpo, `Perfil "${corpo.nome}" criado`); return; }
        corpo.id = id;
        if (fd.get('tirarPin')) corpo.pin = '';
        else if (pin) corpo.pin = pin;
        enviar('api/perfis/editar', corpo, 'Perfil salvo');
    });
}
function cartaoPerfis() {
    if (!modoServidor || !perfilAtual) return '';
    const ehPrincipal = perfilAtual.id === 'principal';
    const lista = ehPrincipal ? perfis : perfis.filter((p) => p.id === perfilAtual.id);
    return `<section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-users"></i>Perfis</h2>
        <p>${ehPrincipal ? 'Cada pessoa tem os próprios links, agenda, tarefas, tema e email. Quem abrir o Yggdrasil escolhe o perfil (no celular também).' : 'Você pode mudar o nome, a cor e o PIN do seu perfil.'}</p>
        <div class="lista-perfis">${lista.map((p) => `<div class="perfil-linha">${avatar(p)}<span class="nome">${esc(p.nome)}${p.id === perfilAtual.id ? ' <span class="fraco">(você)</span>' : ''}${p.principal ? ' <span class="fraco">· principal</span>' : ''}</span>${p.temPin ? '<i class="fa-solid fa-lock fraco" title="Tem PIN"></i>' : ''}<button class="btn mini fantasma" data-acao="editar-perfil" data-id="${esc(p.id)}"><i class="fa-solid fa-pen"></i></button></div>`).join('')}</div>
        <div class="linha">${ehPrincipal ? '<button class="btn" data-acao="novo-perfil"><i class="fa-solid fa-user-plus"></i> Novo perfil</button>' : ''}<button class="btn fantasma" data-acao="trocar-perfil"><i class="fa-solid fa-right-left"></i> Trocar de perfil</button></div>
      </section>`;
}

/* ===================== tema ===================== */
const sistemaEscuro = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
function temaAtual() { return TEMAS.find((t) => t.id === D.ajustes.tema) || TEMAS[0]; }
function temaEscuro(t) {
    if (!t.duplo) return t.fixo === 'escuro';
    const m = D.ajustes.modo || 'sistema';
    return m === 'escuro' || (m === 'sistema' && sistemaEscuro());
}
function aplicarTema() {
    const t = temaAtual();
    const escuro = temaEscuro(t);
    const id = t.duplo ? `${t.id}-${escuro ? 'escuro' : 'claro'}` : t.id;
    const raiz = document.documentElement;
    raiz.dataset.tema = id;
    const preto = !!D.ajustes.preto && escuro;
    if (preto) raiz.dataset.preto = '1'; else delete raiz.dataset.preto;
    lsSet('yggTema', id);
    lsSet('yggPreto', preto ? '1' : '');
}
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (D && D.ajustes.modo === 'sistema') { aplicarTema(); if (vistaAtual() === 'ajustes') render(); } }); } catch (e) { /* navegador antigo */ }
function trocarTema() {
    const i = TEMAS.findIndex((t) => t.id === D.ajustes.tema);
    D.ajustes.tema = TEMAS[(i + 1) % TEMAS.length].id;
    aplicarTema();
    salvar();
    aviso('Tema: ' + TEMAS.find((t) => t.id === D.ajustes.tema).nome);
    if (vistaAtual() === 'ajustes') render();
}

/* ===================== avisos ===================== */
function aviso(texto, acao) {
    const el = document.createElement('div');
    el.className = 'aviso';
    el.innerHTML = `<span>${esc(texto)}</span>`;
    if (acao) {
        const b = document.createElement('button');
        b.textContent = acao.rotulo;
        b.onclick = () => { acao.fn(); el.remove(); };
        el.appendChild(b);
    }
    $('#avisos').appendChild(el);
    setTimeout(() => el.remove(), acao ? (acao.ms || 7000) : 3200);
}

/* ===================== anúncios (anuncio.json na pasta do Yggdrasil) ===================== */
async function conferirAnuncio() {
    if (!modoServidor) return;
    try {
        const r = await fetch('anuncio.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const a = await r.json();
        if (!a || !a.id || lsGet('yggAnuncio') === String(a.id)) return;
        lsSet('yggAnuncio', String(a.id));
        const abrir = () => { if (!a.link) return; if (a.link.startsWith('#')) location.hash = a.link; else window.open(a.link, '_blank', 'noopener'); };
        aviso(`${a.titulo || 'Yggdrasil'}: ${a.texto || ''}`, a.link ? { rotulo: a.botao || 'Abrir', fn: abrir, ms: 120000 } : { rotulo: 'Ok', fn: () => {}, ms: 120000 });
        if ('Notification' in window && Notification.permission === 'granted') {
            try { const n = new Notification(a.titulo || 'Yggdrasil', { body: a.texto || '', tag: 'ygg-anuncio' }); n.onclick = () => { window.focus(); abrir(); }; } catch (e) { /* sem suporte */ }
        }
    } catch (e) { /* sem anúncio */ }
}

/* ===================== links ===================== */
function grupoNome(id) {
    const g = D.grupos.find((x) => x.id === id);
    return g ? g.nome : '';
}
function favicon(l, classe) {
    const cor = corDe(l.titulo);
    const letra = esc((l.titulo || host(l.url) || '?').trim().charAt(0).toUpperCase());
    if (D.ajustes.icones && /^https?:/i.test(l.url)) {
        return `<img class="fav ${classe || ''}" alt="" loading="lazy" src="https://icons.duckduckgo.com/ip3/${esc(host(l.url))}.ico" data-letra="${letra}" data-cor="${cor}" onerror="yggSemIcone(this)">`;
    }
    return `<span class="fav ${classe || ''}" style="--cor:var(--${cor})" aria-hidden="true">${letra}</span>`;
}
window.yggSemIcone = function (img) {
    const s = document.createElement('span');
    s.className = img.className;
    s.style.setProperty('--cor', `var(--${img.dataset.cor})`);
    s.setAttribute('aria-hidden', 'true');
    s.textContent = img.dataset.letra;
    img.replaceWith(s);
};

function atribAbrir() {
    return D.ajustes.novaAba ? ' target="_blank" rel="noopener noreferrer"' : ' rel="noreferrer"';
}
function registrarClique(id) {
    const l = D.links.find((x) => x.id === id);
    if (!l) return;
    l.cliques = (l.cliques || 0) + 1;
    l.usado = Date.now();
    salvar();
}
function abrirLink(l) {
    registrarClique(l.id);
    if (D.ajustes.novaAba) window.open(l.url, '_blank', 'noopener'); else location.href = l.url;
}

function buscarLinks(q) {
    const termos = normal(q).split(/\s+/).filter(Boolean);
    if (!termos.length) return [];
    return D.links
        .map((l) => {
            const t = normal(l.titulo), alvo = [t, normal(l.url), normal(l.tags.join(' ')), normal(grupoNome(l.grupo)), normal(l.nota)].join(' ');
            if (!termos.every((x) => alvo.includes(x))) return null;
            let p = l.cliques * 0.05;
            if (t.startsWith(termos[0])) p += 10;
            else if (t.includes(termos[0])) p += 5;
            return { l, p };
        })
        .filter(Boolean)
        .sort((a, b) => b.p - a.p)
        .map((x) => x.l);
}

function salvarLink(dados, id) {
    if (id) {
        const l = D.links.find((x) => x.id === id);
        Object.assign(l, dados);
        delete l.exemplo;
    } else {
        D.links.push(Object.assign({ id: uid(), cliques: 0, usado: 0, criado: Date.now() }, dados));
    }
    salvar();
    render();
}
function apagarLink(id) {
    const i = D.links.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [l] = D.links.splice(i, 1);
    salvar();
    render();
    aviso(`"${l.titulo}" apagado`, { rotulo: 'Desfazer', fn: () => { D.links.splice(i, 0, l); salvar(); render(); } });
}
function alternarFixo(id) {
    const l = D.links.find((x) => x.id === id);
    l.fixo = !l.fixo;
    salvar();
    render();
}
function todasTags() {
    const m = new Map();
    D.links.forEach((l) => l.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

/* ===================== agenda ===================== */
function ocorre(ev, d) {
    const di = iso(d);
    if (di < ev.data) return false;
    if (ev.ate && di > ev.ate) return false;
    if (ev.excecoes.includes(di)) return false;
    const ini = deIso(ev.data);
    switch (ev.repetir) {
        case 'diario': return true;
        case 'semanal': return (ev.dias && ev.dias.length ? ev.dias : [ini.getDay()]).includes(d.getDay());
        case 'mensal': return d.getDate() === ini.getDate();
        case 'anual': return d.getDate() === ini.getDate() && d.getMonth() === ini.getMonth();
        default: return di === ev.data;
    }
}

// Agenda externa (.ics) — só com o servidor
const icsCache = {};
let icsErro = '';
function garantirIcs(iniIso, fimIso) {
    if (!modoServidor || !D.ajustes.icsUrl) return;
    const k = iniIso + '|' + fimIso;
    if (icsCache[k]) return;
    icsCache[k] = { carregando: true, eventos: [] };
    fetch(`api/ics?inicio=${iniIso}&fim=${fimIso}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => {
            icsErro = j.erro || '';
            icsCache[k] = { eventos: (j.eventos || []).map(converterIcs).flat() };
            render(true);
        })
        .catch(() => { icsErro = 'Não consegui ler a agenda externa.'; icsCache[k] = { eventos: [] }; });
}
function limparIcs() { for (const k in icsCache) delete icsCache[k]; icsErro = ''; }
function converterIcs(e) {
    if (e.diaInteiro) {
        const r = [];
        let d = deIso(e.inicio);
        const fim = deIso(e.fim || e.inicio);
        do { r.push({ externo: true, titulo: e.titulo, local: e.local, data: iso(d), hora: '', fim: '', cor: 'c6' }); d = somaDias(d, 1); } while (d < fim);
        return r;
    }
    const a = new Date(e.inicio), b = new Date(e.fim);
    return [{ externo: true, titulo: e.titulo, local: e.local, data: iso(a), hora: `${pad(a.getHours())}:${pad(a.getMinutes())}`, fim: iso(b) === iso(a) ? `${pad(b.getHours())}:${pad(b.getMinutes())}` : '', cor: 'c6' }];
}
function eventosIcsNoDia(di) {
    const vistos = new Set(), r = [];
    for (const k in icsCache) {
        const [a, b] = k.split('|');
        if (di < a || di >= b) continue;
        for (const e of icsCache[k].eventos) {
            const chave = e.titulo + e.data + e.hora;
            if (e.data === di && !vistos.has(chave)) { vistos.add(chave); r.push(e); }
        }
    }
    return r;
}

function eventosDoDia(d) {
    const di = iso(d);
    const locais = D.eventos.filter((ev) => ocorre(ev, d)).map((ev) => ({ ev, id: ev.id, titulo: ev.titulo, data: di, hora: ev.hora, fim: ev.fim, cor: ev.cor || 'c1', link: ev.link, local: ev.local, nota: ev.nota }));
    return locais.concat(eventosIcsNoDia(di)).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
}
function inicioDe(o) {
    const d = deIso(o.data);
    if (o.hora) { const [h, m] = o.hora.split(':'); d.setHours(+h, +m); }
    return d;
}
function fimDe(o) {
    const d = deIso(o.data);
    if (o.fim) { const [h, m] = o.fim.split(':'); d.setHours(+h, +m); return d; }
    if (o.hora) return new Date(inicioDe(o).getTime() + 60 * 60000);
    return somaDias(d, 1);
}
function proximoEvento() {
    const agora = new Date();
    for (let i = 0; i < 14; i++) {
        const d = somaDias(agora, i);
        const evs = eventosDoDia(d).filter((o) => o.hora && inicioDe(o) > agora);
        if (evs.length) return evs[0];
    }
    return null;
}
function faltam(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d) return `${d}d ${pad(h)}h`;
    return `${pad(h)}h ${pad(m)}min`;
}
function salvarEvento(dados, id) {
    if (id) Object.assign(D.eventos.find((x) => x.id === id), dados);
    else D.eventos.push(Object.assign({ id: uid(), excecoes: [] }, dados));
    salvar();
    render();
}
function apagarEvento(id, soData) {
    const ev = D.eventos.find((x) => x.id === id);
    if (!ev) return;
    if (soData && ev.repetir !== 'nao') ev.excecoes.push(soData);
    else D.eventos = D.eventos.filter((x) => x.id !== id);
    salvar();
    render();
}

/* ===================== roteamento ===================== */
const ui = {
    colecao: lsGet('yggColecao') || '',
    grupo: 'todos',
    tag: '',
    filtro: '',
    ordem: lsGet('yggOrdem') || 'manual',
    mes: null,
    diaSel: hojeIso(),
    abaTarefas: lsGet('yggAba') || 'tarefas',
    selBusca: 0,
};
function vistaAtual() {
    const v = location.hash.replace('#', '');
    return ['inicio', 'links', 'agenda', 'email', 'ajustes', 'sobre'].includes(v) ? v : 'inicio';
}

function render(soDados) {
    const v = vistaAtual();
    $$('.lateral-nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.vista === v));
    const foco = document.activeElement;
    const focoId = foco && foco.id;
    const sel = foco && 'selectionStart' in foco ? [foco.selectionStart, foco.selectionEnd] : null;
    const main = $('#vista');
    main.innerHTML = ({ inicio: vInicio, links: vLinks, agenda: vAgenda, email: vEmail, ajustes: vAjustes, sobre: vSobre })[v]() + rodape();
    document.title = ({ inicio: 'Yggdrasil', links: 'Links · Yggdrasil', agenda: 'Agenda · Yggdrasil', email: 'Email · Yggdrasil', ajustes: 'Ajustes · Yggdrasil', sobre: 'Sobre · Yggdrasil' })[v];
    if (focoId && $('#' + focoId)) {
        const el = $('#' + focoId);
        el.focus({ preventScroll: true });
        if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* campo sem seleção */ }
    }
    tique();
    if (!soDados && v === 'inicio' && ui.filtro) mostrarResultados();
}

/* ===================== vista: início ===================== */
function saudacao(h) {
    if (h < 5) return 'boa madrugada';
    if (h < 12) return 'bom dia';
    if (h < 18) return 'boa tarde';
    return 'boa noite';
}

function vInicio() {
    const agora = new Date();
    const hoje = eventosDoDia(agora);
    garantirIcs(hojeIso(), iso(somaDias(agora, 15)));
    const fixos = D.links.filter((l) => l.fixo);
    const exemplos = D.links.some((l) => l.exemplo);
    const pendentes = D.tarefas.filter((t) => !t.feita).length;

    if (!D.grupos.some((g) => g.id === ui.colecao)) ui.colecao = (D.grupos[0] || {}).id || '';
    const daColecao = D.links.filter((l) => (ui.colecao === 'sem' ? !l.grupo || !D.grupos.some((g) => g.id === l.grupo) : l.grupo === ui.colecao));
    const semGrupo = D.links.some((l) => !l.grupo || !D.grupos.some((g) => g.id === l.grupo));

    return `
    <div class="painel">
      ${exemplos ? `<div class="banner"><i class="fa-solid fa-seedling"></i><span>Os links que estão aqui são exemplos. Adicione os seus ou importe de um arquivo.</span>
        <div class="acoes"><a class="btn mini" href="#ajustes">Importar</a><button class="btn mini perigo" data-acao="apagar-exemplos">Apagar exemplos</button></div></div>` : ''}
      <div class="coluna">
        <section class="card moldura heroi">
          <div class="prompt"><span class="u">${esc(normal(D.perfil.nome || 'eu').replace(/\s+/g, ''))}</span>@<span class="h">yggdrasil</span> ~/ <span data-saudacao>${saudacao(agora.getHours())}</span>, ${esc(D.perfil.nome || '')}<span class="cursor"></span></div>
          <h1 class="titulo-pixel">${tituloPixel('YGGDRASIL')}</h1>
          <div class="busca">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="busca" class="campo" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar nos links ou na web…" value="${esc(ui.filtro)}" aria-label="Buscar" aria-controls="resultados">
            <kbd>/</kbd>
            <div class="resultados" id="resultados" role="listbox" hidden></div>
          </div>
        </section>

        <section class="card c-favoritos">
          <div class="card-topo"><h2 class="card-titulo"><i class="fa-solid fa-thumbtack"></i>Favoritos</h2>
            <div class="acoes"><a class="btn mini fantasma" href="#links">ver todos <i class="fa-solid fa-arrow-right"></i></a></div></div>
          <div class="favoritos">
            ${fixos.map(tile).join('')}
            <button class="tile add" data-acao="novo-link" data-fixo="1"><i class="fa-solid fa-plus"></i><span class="nome">adicionar</span></button>
          </div>
        </section>

        ${cardEmail()}

        <section class="card c-colecoes">
          <div class="card-topo"><h2 class="card-titulo"><i class="fa-solid fa-folder-tree"></i>Coleções</h2>
            <div class="acoes"><button class="btn mini fantasma" data-acao="novo-grupo"><i class="fa-solid fa-plus"></i> grupo</button></div></div>
          <div class="abas" role="tablist">
            ${D.grupos.map((g) => `<button class="chip ${g.id === ui.colecao ? 'ativo' : ''}" role="tab" aria-selected="${g.id === ui.colecao}" data-colecao="${g.id}"><i class="fa-solid ${esc(g.icone || 'fa-folder')}"></i>${esc(g.nome)} <span class="n">${D.links.filter((l) => l.grupo === g.id).length}</span></button>`).join('')}
            ${semGrupo ? `<button class="chip ${ui.colecao === 'sem' ? 'ativo' : ''}" data-colecao="sem">sem grupo</button>` : ''}
          </div>
          ${daColecao.length ? `<div class="lista-colecao">${daColecao.map(linhaLink).join('')}</div>` : (!D.grupos.length && !semGrupo ? `<div class="vazio"><i class="fa-regular fa-folder-open"></i>Grupos juntam links por assunto (estudos, trabalho, lazer…). <button class="btn mini" data-acao="novo-grupo">Criar o primeiro grupo</button></div>` : `<div class="vazio"><i class="fa-regular fa-folder-open"></i>Nada nesse grupo ainda. <button class="btn mini" data-acao="novo-link" data-grupo="${esc(ui.colecao)}">Adicionar link</button></div>`)}
        </section>
      </div>

      <div class="coluna">
        <section class="card moldura relogio c-relogio">
          <div class="hora"><span data-relogio="hm">--:--</span><span class="seg" data-relogio="s">--</span></div>
          <div class="data" data-relogio="data"></div>
          <div class="contadores">
            <div class="contador"><b>${D.links.length}</b>links</div>
            <div class="contador"><b>${hoje.length}</b>${hoje.length === 1 ? 'evento hoje' : 'eventos hoje'}</div>
            <div class="contador"><b>${pendentes}</b>${pendentes === 1 ? 'tarefa' : 'tarefas'}</div>
          </div>
        </section>

        <section class="card c-hoje">
          <div class="card-topo"><h2 class="card-titulo"><i class="fa-solid fa-calendar-day"></i>Hoje</h2>
            <div class="acoes"><button class="btn mini" data-acao="novo-evento" data-data="${hojeIso()}"><i class="fa-solid fa-plus"></i> evento</button></div></div>
          <div class="proximo" data-proximo></div>
          ${hoje.length ? `<div class="eventos">${hoje.map(linhaEvento).join('')}</div>` : '<div class="vazio">Dia livre por enquanto.</div>'}
        </section>

        <section class="card c-cal">${miniCalendario()}</section>

        <section class="card c-tarefas">${blocoTarefas()}</section>
      </div>
    </div>`;
}

function tile(l) {
    return `<a class="tile" href="${esc(l.url)}"${atribAbrir()} data-link="${l.id}" title="${esc(l.titulo)} · ${esc(host(l.url))}">
        ${favicon(l)}<span class="nome">${esc(l.titulo)}</span>
        <button class="editar" data-acao="editar-link" data-id="${l.id}" aria-label="Editar ${esc(l.titulo)}"><i class="fa-solid fa-pen"></i></button></a>`;
}
function linhaLink(l) {
    return `<a class="linha-link" href="${esc(l.url)}"${atribAbrir()} data-link="${l.id}">${favicon(l)}<span class="txt"><span class="t">${esc(l.titulo)}</span><span class="h">${esc(host(l.url))}</span></span></a>`;
}

function linhaEvento(o) {
    const agora = new Date(), ini = inicioDe(o), fim = fimDe(o);
    const passou = fim < agora, rolando = o.hora && ini <= agora && agora < fim;
    const perto = o.link && ini - agora < 15 * 60000 && agora < fim;
    const quando = o.hora ? `<b>${o.hora}</b>${o.fim ? o.fim : ''}` : '<b>dia</b>todo';
    const sub = [o.local, o.externo ? 'agenda externa' : '', o.ev && o.ev.repetir !== 'nao' ? REPETIR[o.ev.repetir].toLowerCase() : ''].filter(Boolean).join(' · ');
    return `<div class="evento ${passou ? 'passou' : ''} ${rolando ? 'agora' : ''}" style="--cor:var(--${esc(o.cor)})" ${o.id ? `data-acao="editar-evento" data-id="${o.id}" data-data="${o.data}" tabindex="0" role="button"` : ''}>
        <div class="quando">${quando}</div>
        <div style="min-width:0"><div class="t">${esc(o.titulo)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
        ${o.link ? `<a class="btn mini ${perto ? 'entrar' : 'fantasma'}" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer" title="Abrir link do evento"><i class="fa-solid fa-video"></i>${perto ? ' entrar' : ''}</a>` : '<span></span>'}
      </div>`;
}

function miniCalendario() {
    const base = ui.mes || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const ini = somaDias(base, -base.getDay());
    garantirIcs(iso(ini), iso(somaDias(ini, 42)));
    let dias = '';
    for (let i = 0; i < 42; i++) {
        const d = somaDias(ini, i), di = iso(d), evs = eventosDoDia(d);
        dias += `<button class="${d.getMonth() !== base.getMonth() ? 'fora' : ''} ${di === hojeIso() ? 'hoje' : ''}" data-ir-dia="${di}" aria-label="${d.getDate()} de ${MESES[d.getMonth()]}${evs.length ? ', ' + evs.length + ' eventos' : ''}">${d.getDate()}${evs.length ? `<span class="pontos">${evs.slice(0, 3).map((e) => `<i style="--cor:var(--${esc(e.cor)})"></i>`).join('')}</span>` : ''}</button>`;
    }
    return `<div class="cal-topo"><span class="mes">${MESES[base.getMonth()]} ${base.getFullYear()}</span>
        <button class="btn icone fantasma" data-mes="-1" aria-label="Mês anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <button class="btn icone fantasma" data-mes="0" aria-label="Este mês"><i class="fa-regular fa-circle-dot"></i></button>
        <button class="btn icone fantasma" data-mes="1" aria-label="Próximo mês"><i class="fa-solid fa-chevron-right"></i></button></div>
      <div class="cal">${SEM_CURTA.map((s) => `<span class="sem">${s}</span>`).join('')}${dias}</div>`;
}

function blocoTarefas() {
    const aba = ui.abaTarefas;
    const feitas = D.tarefas.filter((t) => t.feita).length;
    return `<div class="card-topo">
        <div class="abas" role="tablist" style="margin:0">
          <button class="chip ${aba === 'tarefas' ? 'ativo' : ''}" data-aba="tarefas" role="tab" aria-selected="${aba === 'tarefas'}"><i class="fa-solid fa-list-check"></i>Tarefas</button>
          <button class="chip ${aba === 'notas' ? 'ativo' : ''}" data-aba="notas" role="tab" aria-selected="${aba === 'notas'}"><i class="fa-solid fa-note-sticky"></i>Notas</button>
        </div></div>
      ${aba === 'tarefas' ? `
        <form class="tarefa-nova" data-form="tarefa"><input id="nova-tarefa" class="campo" placeholder="Nova tarefa…" autocomplete="off" aria-label="Nova tarefa"><button class="btn icone primario" aria-label="Adicionar tarefa"><i class="fa-solid fa-plus"></i></button></form>
        ${D.tarefas.length ? `<ul class="tarefas">${D.tarefas.map((t) => `<li class="tarefa ${t.feita ? 'feita' : ''}">
            <input type="checkbox" class="check" id="t-${t.id}" data-tarefa="${t.id}" ${t.feita ? 'checked' : ''}>
            <label for="t-${t.id}">${esc(t.texto)}</label>
            <button class="btn icone fantasma x" data-acao="apagar-tarefa" data-id="${t.id}" aria-label="Apagar tarefa"><i class="fa-solid fa-xmark"></i></button></li>`).join('')}</ul>` : '<div class="vazio">Nada pendente.</div>'}
        ${feitas ? `<div class="rodape-card"><span>${feitas} feita${feitas > 1 ? 's' : ''}</span><button class="btn mini fantasma" data-acao="limpar-feitas">limpar feitas</button></div>` : ''}`
        : `<div class="notas"><textarea id="notas" class="campo" placeholder="Rascunho rápido. Salva sozinho." aria-label="Notas">${esc(D.notas)}</textarea></div>`}`;
}

/* ===================== vista: links ===================== */
function vLinks() {
    const tags = todasTags();
    let lista = D.links.slice();
    let titulo = 'Todos os links', icone = 'fa-layer-group';
    const g = D.grupos.find((x) => x.id === ui.grupo);
    if (ui.grupo === 'fixos') { lista = lista.filter((l) => l.fixo); titulo = 'Favoritos'; }
    else if (ui.grupo === 'usados') { lista = lista.filter((l) => l.cliques).sort((a, b) => b.cliques - a.cliques).slice(0, 30); titulo = 'Mais usados'; }
    else if (ui.grupo === 'recentes') { lista = lista.filter((l) => l.usado).sort((a, b) => b.usado - a.usado).slice(0, 30); titulo = 'Usados recentemente'; }
    else if (ui.grupo === 'sem') { lista = lista.filter((l) => !D.grupos.some((x) => x.id === l.grupo)); titulo = 'Sem grupo'; }
    else if (g) { lista = lista.filter((l) => l.grupo === g.id); titulo = g.nome; icone = g.icone; }
    else ui.grupo = 'todos';
    if (ui.tag) lista = lista.filter((l) => l.tags.includes(ui.tag));
    if (ui.filtro) { const achados = new Set(buscarLinks(ui.filtro).map((l) => l.id)); lista = lista.filter((l) => achados.has(l.id)); }
    if (!['usados', 'recentes'].includes(ui.grupo)) {
        if (ui.ordem === 'az') lista.sort((a, b) => a.titulo.localeCompare(b.titulo));
        if (ui.ordem === 'cliques') lista.sort((a, b) => b.cliques - a.cliques);
        if (ui.ordem === 'novos') lista.sort((a, b) => (b.criado || 0) - (a.criado || 0));
    }
    const cont = (f) => D.links.filter(f).length;
    const item = (id, ic, nome, n) => `<button class="grupo-item ${ui.grupo === id ? 'ativo' : ''}" data-grupo="${id}"><i class="fa-solid ${esc(ic)}"></i><span>${esc(nome)}</span>${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
    const semGrupo = cont((l) => !D.grupos.some((x) => x.id === l.grupo));

    return `<div class="vista-links">
      <aside class="card grupos">
        <h3>Atalhos</h3>
        <div class="grupos-lista">
          ${item('todos', 'fa-layer-group', 'Todos', D.links.length)}
          ${item('fixos', 'fa-thumbtack', 'Favoritos', cont((l) => l.fixo))}
          ${item('usados', 'fa-fire', 'Mais usados')}
          ${item('recentes', 'fa-clock-rotate-left', 'Recentes')}
        </div>
        <h3>Grupos</h3>
        <div class="grupos-lista">
          ${D.grupos.map((x) => item(x.id, x.icone || 'fa-folder', x.nome, cont((l) => l.grupo === x.id))).join('')}
          ${semGrupo ? item('sem', 'fa-circle-question', 'Sem grupo', semGrupo) : ''}
          <button class="grupo-item" data-acao="novo-grupo"><i class="fa-solid fa-plus"></i><span>Novo grupo</span></button>
        </div>
      </aside>
      <section class="card">
        <div class="titulo-vista"><h2><i class="fa-solid ${esc(icone)}" style="color:var(--acento);font-size:16px"></i> ${esc(titulo)}</h2><span>${lista.length} link${lista.length === 1 ? '' : 's'}</span>
          ${g ? `<button class="btn mini fantasma" data-acao="editar-grupo" data-id="${g.id}" style="margin-left:auto"><i class="fa-solid fa-pen"></i> grupo</button>` : ''}</div>
        <div class="barra">
          <div class="busca"><i class="fa-solid fa-filter"></i><input id="filtro" class="campo" type="search" placeholder="Filtrar…" value="${esc(ui.filtro)}" autocomplete="off" aria-label="Filtrar links"></div>
          <select id="ordem" class="campo" aria-label="Ordem">
            ${[['manual', 'Ordem de criação'], ['az', 'A–Z'], ['cliques', 'Mais clicados'], ['novos', 'Mais novos']].map(([v, n]) => `<option value="${v}" ${ui.ordem === v ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <button class="btn primario" data-acao="novo-link" data-grupo="${g ? g.id : ''}"><i class="fa-solid fa-plus"></i> Novo link</button>
        </div>
        ${tags.length ? `<div class="tags">${tags.map(([t, n]) => `<button class="chip ${ui.tag === t ? 'ativo' : ''}" data-tag="${esc(t)}">#${esc(t)} <span class="n">${n}</span></button>`).join('')}</div>` : ''}
        ${lista.length ? `<div class="tabela">${lista.map(itemLink).join('')}</div>` : `<div class="vazio"><i class="fa-solid fa-link-slash"></i>${D.links.length ? 'Nenhum link com esse filtro.' : 'Nenhum link ainda. Cole um link (Ctrl+V) em qualquer lugar da página para adicionar.'}</div>`}
      </section>
    </div>`;
}

function itemLink(l) {
    return `<div class="item-link">
        ${favicon(l)}
        <div class="info">
          <div class="t"><a href="${esc(l.url)}"${atribAbrir()} data-link="${l.id}">${esc(l.titulo)}</a>${l.fixo ? '<i class="fa-solid fa-thumbtack" title="Favorito"></i>' : ''}</div>
          <div class="meta"><span class="host">${esc(host(l.url))}</span>${ui.grupo === 'todos' && grupoNome(l.grupo) ? `<span>· ${esc(grupoNome(l.grupo))}</span>` : ''}${l.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}${l.cliques ? `<span>· ${l.cliques} clique${l.cliques > 1 ? 's' : ''}</span>` : ''}</div>
          ${l.nota ? `<div class="nota">${esc(l.nota)}</div>` : ''}
        </div>
        <div class="botoes">
          <button class="btn icone fantasma ${l.fixo ? 'ativo' : ''}" data-acao="fixar" data-id="${l.id}" aria-label="${l.fixo ? 'Tirar dos favoritos' : 'Pôr nos favoritos'}" title="${l.fixo ? 'Tirar dos favoritos' : 'Pôr nos favoritos'}"><i class="fa-solid fa-thumbtack"></i></button>
          <button class="btn icone fantasma" data-acao="copiar" data-id="${l.id}" aria-label="Copiar link" title="Copiar link"><i class="fa-regular fa-copy"></i></button>
          <button class="btn icone fantasma" data-acao="editar-link" data-id="${l.id}" aria-label="Editar" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn icone fantasma" data-acao="apagar-link" data-id="${l.id}" aria-label="Apagar" title="Apagar"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>`;
}

/* ===================== vista: agenda ===================== */
function vAgenda() {
    const base = ui.mes || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const ini = somaDias(base, -base.getDay());
    garantirIcs(iso(ini), iso(somaDias(ini, 42)));
    garantirIcs(hojeIso(), iso(somaDias(new Date(), 15)));
    let dias = '';
    for (let i = 0; i < 42; i++) {
        const d = somaDias(ini, i), di = iso(d), evs = eventosDoDia(d);
        dias += `<div class="dia ${d.getMonth() !== base.getMonth() ? 'fora' : ''} ${di === hojeIso() ? 'hoje' : ''} ${di === ui.diaSel ? 'sel' : ''}" data-dia="${di}" role="button" tabindex="0" aria-label="${d.getDate()} de ${MESES[d.getMonth()]}, ${evs.length} eventos">
            <span class="num">${d.getDate()}</span>
            ${evs.slice(0, 3).map((e) => `<span class="ev" style="--cor:var(--${esc(e.cor)})">${e.hora ? e.hora + ' ' : ''}${esc(e.titulo)}</span>`).join('')}
            ${evs.length > 3 ? `<span class="mais">+${evs.length - 3}</span>` : ''}</div>`;
    }
    const dSel = deIso(ui.diaSel);
    const doDia = eventosDoDia(dSel);
    let proximos = '';
    for (let i = 1; i <= 7; i++) {
        const d = somaDias(dSel, i), evs = eventosDoDia(d);
        if (evs.length) proximos += `<h4>${SEMANA[d.getDay()]}, ${d.getDate()}/${pad(d.getMonth() + 1)}</h4><div class="eventos">${evs.map(linhaEvento).join('')}</div>`;
    }
    const ics = D.ajustes.icsUrl ? (modoServidor ? (icsErro ? `<div class="aviso-ics erro"><i class="fa-solid fa-triangle-exclamation"></i> Agenda externa: ${esc(icsErro)}</div>` : '<div class="aviso-ics"><i class="fa-solid fa-cloud"></i> Mostrando também a agenda externa (azul claro).</div>') : '<div class="aviso-ics">A agenda externa só aparece com o servidor rodando.</div>') : '';

    return `<div class="vista-agenda">
      <section class="card mes-grande">
        <div class="cal-topo"><span class="mes">${MESES[base.getMonth()]} ${base.getFullYear()}</span>
          <button class="btn icone" data-mes="-1" aria-label="Mês anterior"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="btn mini" data-mes="0">hoje</button>
          <button class="btn icone" data-mes="1" aria-label="Próximo mês"><i class="fa-solid fa-chevron-right"></i></button>
          <button class="btn primario" data-acao="novo-evento" data-data="${ui.diaSel}"><i class="fa-solid fa-plus"></i> Evento</button></div>
        <div class="cal">${SEMANA.map((s) => `<span class="sem">${s.slice(0, 3)}</span>`).join('')}${dias}</div>
        ${ics}
      </section>
      <aside class="card painel-dia">
        <h3>${SEMANA[dSel.getDay()]}, ${dSel.getDate()} de ${MESES[dSel.getMonth()]}</h3>
        <div class="sub">${ui.diaSel === hojeIso() ? 'hoje' : dSel < new Date() ? 'já passou' : 'daqui a ' + Math.ceil((dSel - new Date()) / 864e5) + ' dia(s)'}</div>
        ${doDia.length ? `<div class="eventos">${doDia.map(linhaEvento).join('')}</div>` : '<div class="vazio">Nada marcado.</div>'}
        <button class="btn" style="margin-top:10px;width:100%" data-acao="novo-evento" data-data="${ui.diaSel}"><i class="fa-solid fa-plus"></i> evento neste dia</button>
        <div class="lista-proximos">${proximos ? '<div class="card-titulo">Próximos 7 dias</div>' + proximos : ''}</div>
      </aside>
    </div>`;
}

/* ===================== vista: ajustes ===================== */
/* ===================== endereços (IP) ===================== */
let rede = null;
function cartaoRede() {
    if (!modoServidor) return '';
    if (!rede) {
        rede = { carregando: true };
        api('api/rede').then((r) => { rede = r; if (vistaAtual() === 'ajustes' && !ehCampo(document.activeElement)) render(true); })
            .catch(() => { rede = { erro: true }; });
    }
    if (rede.carregando || rede.erro) return '';
    const linha = (rotulo, url, obs) => `<div class="endereco"><span class="fraco">${rotulo}</span><a href="${esc(url)}" target="_blank" rel="noopener"><code>${esc(url)}</code></a><button class="btn mini fantasma" data-acao="copiar-endereco" data-url="${esc(url)}" title="Copiar"><i class="fa-regular fa-copy"></i></button>${obs ? `<span class="fraco obs">${obs}</span>` : ''}</div>`;
    return `<section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-network-wired"></i>Endereços</h2>
        <label class="op"><input type="checkbox" class="check" id="aj-rede" ${rede.rede ? 'checked' : ''}> Deixar outros aparelhos da rede (celular, notebook) abrirem o Yggdrasil</label>
        <p class="fraco">${rede.rede
            ? 'Qualquer aparelho no mesmo wifi alcança o Yggdrasil, sem criptografia (http). Use só em rede de casa e coloque PIN nos perfis; o email pela rede só abre em perfil com PIN.'
            : 'Desligado: só este PC abre o Yggdrasil. É o mais seguro. Para ligar, todos os perfis precisam ter PIN.'}${rede.rede && !rede.redeAoIniciar ? ' <b>Reinicie o servidor para valer.</b>' : ''}</p>
        <div class="enderecos">
          ${!rede.rede ? '' : rede.ip ? linha('Yggdrasil na rede', `http://${rede.ip}:${rede.porta}/`, 'é este o IP que vai no app Android') : '<p>Não achei o IP da rede deste PC (está sem wifi/cabo?).</p>'}
          ${linha('Neste PC', `http://localhost:${rede.porta}/`)}
        </div>
        ${rede.rede ? '<p class="fraco">O IP pode mudar se o roteador reiniciar. Se o celular parar de achar, confira aqui.</p>' : ''}
      </section>`;
}
function copiarTexto(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => aviso('Copiado'), () => aviso(t));
    const c = document.createElement('textarea');
    c.value = t; document.body.appendChild(c); c.select();
    try { document.execCommand('copy'); aviso('Copiado'); } catch (e) { aviso(t); }
    c.remove();
}

function vAjustes() {
    const a = D.ajustes;
    return `<div class="vista-ajustes">
      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-floppy-disk"></i>Onde fica salvo</h2>
        ${modoServidor
            ? '<div class="estado-salvar ok"><i class="fa-solid fa-circle-check"></i><span>Tudo salvo em <b>' + (perfilAtual && perfilAtual.id !== 'principal' ? 'perfis/' + esc(perfilAtual.id) + '.json' : 'dados.json') + '</b>, na pasta do Yggdrasil, com backup diário em <b>backups/</b>.</span></div>'
            : '<div class="estado-salvar local"><i class="fa-solid fa-triangle-exclamation"></i><span>Aberto sem o servidor: os dados ficam só neste navegador. Rode o <b>servidor.py</b> (ou o atalho) para salvar num arquivo e usar a agenda externa.</span></div>'}
        <div class="linha">
          <button class="btn" data-acao="exportar"><i class="fa-solid fa-download"></i> Baixar backup</button>
          <button class="btn" data-acao="importar-backup"><i class="fa-solid fa-upload"></i> Restaurar backup</button>
        </div>
      </section>

      ${cartaoPerfis()}

      ${cartaoRede()}

      ${cartaoIa()}

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-file-import"></i>Importar links</h2>
        <p>Favoritos exportados do navegador (Chrome, Firefox, Edge: arquivo .html), ou páginas HTML com links. Pode escolher vários arquivos de uma vez; cada pasta ou página vira um grupo.</p>
        <div class="linha"><button class="btn primario" data-acao="importar-html"><i class="fa-solid fa-file-code"></i> Escolher arquivos</button></div>
      </section>

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-palette"></i>Tema</h2>
        <div class="tema-modo">${[['sistema', 'fa-circle-half-stroke', 'Sistema'], ['claro', 'fa-sun', 'Claro'], ['escuro', 'fa-moon', 'Escuro']].map(([m, i, n]) => `<button class="chip ${(a.modo || 'sistema') === m ? 'ativo' : ''}" data-acao="tema-modo" data-modo="${m}"><i class="fa-solid ${i}"></i>${n}</button>`).join('')}</div>
        <div class="temas">${TEMAS.map((t) => { const cores = t.duplo ? t[temaEscuro(t) ? 'escuro' : 'claro'] : t.cores; return `<button class="tema-op ${a.tema === t.id ? 'ativo' : ''}" data-tema="${t.id}"><span class="amostra">${cores.map((c) => `<span style="background:${c}"></span>`).join('')}</span><span>${t.nome}${t.duplo ? '' : `<span class="so">só ${t.fixo}</span>`}</span></button>`; }).join('')}</div>
        <label class="op"><input type="checkbox" class="check" id="aj-preto" ${a.preto ? 'checked' : ''}> Modo noturno com preto absoluto <span class="fraco">(fundo preto puro, bom para tela OLED)</span></label>
      </section>

      ${modoServidor ? `<section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-brands fa-android"></i>App Android</h2>
        ${window.YggApp ? `<p>Você está no app. Ele confere o PC a cada 15 minutos e avisa de email novo, compromisso chegando e cada compilado das newsletters (só no wifi de casa).</p>
        <p class="fraco">${esc((() => { try { return window.YggApp.status(); } catch (e) { return ''; } })() || '')}</p>
        <div class="linha"><button class="btn" data-acao="app-config"><i class="fa-solid fa-gear"></i> Endereço do servidor e bateria</button></div>`
        : `<p>Instale no celular para ter o Yggdrasil em tela cheia e receber notificações de email, agenda e do compilado, mesmo com o app fechado. Abra este link no celular (no wifi de casa) e permita instalar de fontes desconhecidas.</p>
        <div class="linha"><a class="btn primario" href="android/Yggdrasil.apk" download><i class="fa-solid fa-download"></i> Baixar o APK</a></div>`}
      </section>` : ''}

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-user"></i>Você</h2>
        ${modoServidor ? '' : `<label class="f"><span>Seu nome</span><input class="campo" id="aj-nome" value="${esc(D.perfil.nome)}" maxlength="40"></label>`}
        <label class="f"><span>Buscar na web com</span><select class="campo" id="aj-buscador">${Object.entries(BUSCADORES).map(([k, b]) => `<option value="${k}" ${a.buscador === k ? 'selected' : ''}>${b.nome}</option>`).join('')}</select></label>
        <label class="op"><input type="checkbox" class="check" id="aj-novaaba" ${a.novaAba ? 'checked' : ''}> Abrir links em nova aba</label>
        <label class="op"><input type="checkbox" class="check" id="aj-icones" ${a.icones ? 'checked' : ''}> Mostrar o ícone dos sites (manda o endereço de cada site para o icons.duckduckgo.com buscar o ícone)</label>
      </section>

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-calendar-days"></i>Agenda externa</h2>
        <p>Cole o link .ics publicado da sua agenda para ver os eventos dela junto (só leitura). No Outlook: Configurações › Calendário › Calendários compartilhados › Publicar um calendário › copie o link ICS. No Google Agenda: Configurações da agenda › Endereço secreto no formato iCal.</p>
        <input class="campo" id="aj-ics" placeholder="https://outlook.live.com/owa/calendar/…/calendar.ics" value="${esc(a.icsUrl)}" spellcheck="false">
        <div class="linha"><button class="btn" data-acao="salvar-ics"><i class="fa-solid fa-check"></i> Salvar link</button>${a.icsUrl ? '<button class="btn fantasma" data-acao="tirar-ics">remover</button>' : ''}</div>
        ${!modoServidor ? '<p>Precisa do servidor rodando para funcionar.</p>' : ''}
      </section>

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-bell"></i>Notificações</h2>
        <label class="op"><input type="checkbox" class="check" id="aj-avisos" ${a.avisos ? 'checked' : ''}> Notificações do navegador (com o Yggdrasil aberto numa aba)</label>
        ${window.YggApp ? '<p>No app, quem avisa é o próprio app, mesmo fechado.</p>' : !('Notification' in window) ? '<p>Este navegador não mostra notificações.</p>' : Notification.permission === 'denied' ? '<p>O navegador bloqueou as notificações deste site. Libere no cadeado ao lado do endereço.</p>' : ''}
        <label class="op"><input type="checkbox" class="check" id="aj-avisos-email" ${a.avisosEmail !== false ? 'checked' : ''} ${a.avisos ? '' : 'disabled'}> Email novo na caixa de entrada</label>
        <label class="op"><input type="checkbox" class="check" id="aj-avisos-compilado" ${a.avisosCompilado !== false ? 'checked' : ''} ${a.avisos ? '' : 'disabled'}> Compilado das newsletters pronto</label>
        <label class="op"><input type="checkbox" class="check" checked disabled> Compromissos da agenda</label>
        <label class="f"><span>Avisar os compromissos quantos minutos antes</span><select class="campo" id="aj-avisomin">${[5, 10, 15, 30, 60].map((m) => `<option ${+a.avisoMin === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <div class="linha"><button class="btn fantasma" data-acao="testar-aviso" ${a.avisos ? '' : 'disabled'}><i class="fa-solid fa-bell"></i> Testar</button></div>
      </section>

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-keyboard"></i>Atalhos</h2>
        <div class="atalhos">
          <kbd>/</kbd><span>buscar (Enter abre o primeiro, ou busca na web)</span>
          <kbd>N</kbd><span>novo link</span>
          <kbd>E</kbd><span>novo evento</span>
          <kbd>T</kbd><span>trocar tema</span>
          <kbd>Alt+1…5</kbd><span>início, links, agenda, email, ajustes</span>
          <kbd>C · R · F</kbd><span>no email: escrever, responder (Shift+R: todos), encaminhar</span>
          <kbd>A · Delete</kbd><span>no email: arquivar, lixeira</span>
          <kbd>Ctrl+V</kbd><span>colar um link fora de um campo já abre o "novo link"</span>
        </div>
      </section>

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-triangle-exclamation"></i>Zerar</h2>
        <p>Apaga todos os links, eventos, tarefas e notas. Baixe um backup antes.</p>
        <div class="linha"><button class="btn perigo" data-acao="zerar"><i class="fa-regular fa-trash-can"></i> Apagar tudo</button></div>
      </section>

      <section class="card ajuste">
        <h2 class="card-titulo"><i class="fa-solid fa-circle-info"></i>Sobre e privacidade</h2>
        <p>O Yggdrasil é código aberto (licença MIT) e roda no seu computador. Seus dados ficam na pasta do Yggdrasil; nada é enviado para quem fez o programa, e não há rastreamento.</p>
        <div><a class="btn mini" href="#sobre"><i class="fa-solid fa-seedling"></i> Sobre o Yggdrasil</a></div>
      </section>
    </div>`;
}

/* ===================== rodapé e página "sobre" ===================== */
const AUTOR = { nome: 'Ded', site: 'https://dedfotos.netlify.app/', email: 'ded.beed@outlook.com' };
function rodape() {
    return `<footer class="rodape">
      <p><i class="fa-solid fa-code" aria-hidden="true"></i> Yggdrasil <i class="fa-solid fa-code" aria-hidden="true"></i></p>
      <p>Desenvolvido por <a href="${AUTOR.site}" target="_blank" rel="noopener">${AUTOR.nome}</a> · código aberto (MIT) · seus dados ficam no seu PC</p>
      <p><a href="#sobre">Sobre</a> · <a href="mailto:${AUTOR.email}">Contato</a> · <a href="#ajustes">Ajustes</a></p>
    </footer>`;
}
function vSobre() {
    const fora = [
        ['fa-envelope', 'Email', 'vai e vem direto do seu provedor (Microsoft, Gmail, Yahoo…).'],
        ['fa-wand-magic-sparkles', 'Compilado', 'manda o texto das newsletters ao Google (Gemini), só se você ligar.'],
        ['fa-image', 'Ícones dos sites', 'pede o ícone de cada domínio ao DuckDuckGo, só se você ligar.'],
        ['fa-calendar-days', 'Agenda externa', 'baixa o .ics do endereço que você colar.'],
    ];
    const creditos = [
        ['Font Awesome Free', 'https://fontawesome.com', 'ícones (CC BY 4.0 / SIL OFL / MIT)'],
        ['JetBrains Mono', 'https://www.jetbrains.com/lp/mono/', 'fonte (SIL OFL 1.1)'],
        ['Catppuccin', 'https://catppuccin.com', 'inspiração de paleta (MIT)'],
        ['Nord', 'https://www.nordtheme.com', 'inspiração de paleta (MIT)'],
    ];
    return `<div class="vista-sobre">
      <section class="card sobre-topo">
        <span class="sobre-logo" aria-hidden="true">${arvoreSvg()}</span>
        <div>
          <h1>Yggdrasil</h1>
          <p>Um painel pessoal para o dia a dia: links, agenda, tarefas, notas e email num lugar só, com um compilado das newsletters feito por IA e um app Android que avisa do que importa.</p>
          <p class="fraco">Na mitologia nórdica, Yggdrasil é a árvore que liga todos os mundos. Aqui ela liga as coisas que você usa todo dia.</p>
        </div>
      </section>
      <div class="sobre-grade">
        <section class="card">
          <h2 class="card-titulo"><i class="fa-solid fa-bullseye"></i>Objetivo</h2>
          <p>Abrir o navegador e ter tudo à mão, sem depender de conta, assinatura ou de um serviço que pode sumir amanhã. É um projeto pessoal, feito para ser simples de rodar: só precisa de Python.</p>
        </section>
        <section class="card">
          <h2 class="card-titulo"><i class="fa-solid fa-shield-halved"></i>Princípios</h2>
          <ul class="sobre-lista">
            <li><i class="fa-solid fa-house-laptop"></i>Roda no seu computador. Os dados ficam na pasta do Yggdrasil.</li>
            <li><i class="fa-solid fa-user-slash"></i>Sem conta, sem servidor central e sem rastreamento.</li>
            <li><i class="fa-solid fa-code-branch"></i>Código aberto, licença MIT: dá para ler, mudar e compartilhar.</li>
            <li><i class="fa-solid fa-feather"></i>Leve: sem pacotes para instalar e sem frameworks.</li>
          </ul>
        </section>
        <section class="card">
          <h2 class="card-titulo"><i class="fa-solid fa-right-from-bracket"></i>O que sai do seu PC</h2>
          <ul class="sobre-lista">${fora.map(([i, t, d]) => `<li><i class="fa-solid ${i}"></i><span><b>${t}:</b> ${d}</span></li>`).join('')}</ul>
          <p class="fraco">Nada vai para quem fez o programa. Detalhes no arquivo PRIVACIDADE.md.</p>
        </section>
        <section class="card">
          <h2 class="card-titulo"><i class="fa-solid fa-user"></i>Quem fez</h2>
          <p>Feito por <a href="${AUTOR.site}" target="_blank" rel="noopener"><b>${AUTOR.nome}</b></a>, como projeto pessoal e de prática.</p>
          <p>Achou um problema, tem uma ideia ou quer falar com o ${AUTOR.nome}? Escreva para <a href="mailto:${AUTOR.email}"><b>${AUTOR.email}</b></a>.</p>
          <p class="fraco">Falhas de segurança: mande por esse email, sem publicar os detalhes antes.</p>
        </section>
        <section class="card">
          <h2 class="card-titulo"><i class="fa-solid fa-hands-praying"></i>Agradecimentos</h2>
          <ul class="sobre-lista">${creditos.map(([n, u, d]) => `<li><i class="fa-solid fa-heart"></i><span><a href="${u}" target="_blank" rel="noopener">${n}</a>: ${d}</span></li>`).join('')}</ul>
          <p class="fraco">Gmail, Outlook e outros nomes aparecem só para identificar serviços; são marcas dos seus donos.</p>
        </section>
        <section class="card">
          <h2 class="card-titulo"><i class="fa-solid fa-scale-balanced"></i>Licença</h2>
          <p>MIT. Você pode usar, copiar, modificar e distribuir, inclusive em projetos comerciais, mantendo o aviso de copyright. O programa vem sem garantia.</p>
          ${window.YggApp ? `<p class="fraco">App Android ${esc(String(window.YggApp.versao ? window.YggApp.versao() : ''))}</p>` : ''}
        </section>
      </div>
    </div>`;
}

/* ===================== relógio e coisas que mudam sozinhas ===================== */
let avisados = new Set();
function tique() {
    const d = new Date();
    $$('[data-relogio="h"]').forEach((e) => (e.textContent = pad(d.getHours())));
    $$('[data-relogio="m"]').forEach((e) => (e.textContent = pad(d.getMinutes())));
    $$('[data-relogio="hm"]').forEach((e) => (e.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`));
    $$('[data-relogio="s"]').forEach((e) => (e.textContent = pad(d.getSeconds())));
    $$('[data-relogio="data"]').forEach((e) => (e.innerHTML = `<b>${SEMANA[d.getDay()]}</b>, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`));
    $$('[data-saudacao]').forEach((e) => (e.textContent = saudacao(d.getHours())));
    const px = $('[data-proximo]');
    if (px) {
        const p = proximoEvento();
        px.innerHTML = p ? `Próximo: <b>${esc(p.titulo)}</b> em <span class="em">${faltam(inicioDe(p) - d)}</span>` : 'Nenhum compromisso nos próximos dias.';
    }
}
function podeNotificar() {
    return !!D.ajustes.avisos && !window.YggApp && 'Notification' in window && Notification.permission === 'granted';
}
function notificar(titulo, corpo, tag, hash) {
    if (!podeNotificar()) return;
    try {
        const n = new Notification(titulo, { body: corpo || '', tag, icon: 'assets/yggdrasil.svg' });
        n.onclick = () => { window.focus(); if (hash) location.hash = hash; n.close(); };
    } catch (e) { /* sem suporte */ }
}
// Emails novos: compara a caixa de entrada com a da última vez (a primeira carga só guarda)
let emailsConhecidos = null;
function conferirEmailsNovos(entrada) {
    if (!entrada || !Array.isArray(entrada.emails)) return;
    const naoLidos = entrada.emails.filter((m) => !m.lido);
    const chaves = new Set(naoLidos.map((m) => m.conta + '|' + m.id));
    const antes = emailsConhecidos;
    emailsConhecidos = new Set([...(antes || []), ...chaves]);
    if (!antes || D.ajustes.avisosEmail === false) return;
    const novos = naoLidos.filter((m) => !antes.has(m.conta + '|' + m.id));
    if (!novos.length) return;
    const de = (m) => (m.de && (m.de.nome || m.de.email)) || 'Email novo';
    if (novos.length === 1) notificar(de(novos[0]), novos[0].assunto, 'ygg-email', '#email');
    else notificar(`${novos.length} emails novos`, novos.slice(0, 4).map((m) => `${de(m)}: ${m.assunto}`).join('\n'), 'ygg-email', '#email');
}
function conferirLembretes() {
    if (!D.ajustes.avisos || !('Notification' in window) || Notification.permission !== 'granted') return;
    const agora = new Date(), lim = (+D.ajustes.avisoMin || 10) * 60000;
    for (const o of eventosDoDia(agora).concat(eventosDoDia(somaDias(agora, 1)))) {
        if (!o.hora) continue;
        const falta = inicioDe(o) - agora, chave = o.titulo + o.data + o.hora;
        if (falta > 0 && falta <= lim && !avisados.has(chave)) {
            avisados.add(chave);
            notificar(o.titulo, `Às ${o.hora}${o.local ? ' · ' + o.local : ''}`, chave, '#agenda');
        }
    }
}

/* ===================== busca do início ===================== */
function mostrarResultados() {
    const box = $('#resultados'), q = ui.filtro.trim();
    if (!box) return;
    if (!q) { box.hidden = true; return; }
    const achados = buscarLinks(q).slice(0, 7);
    const web = BUSCADORES[D.ajustes.buscador] || BUSCADORES.google;
    const itens = achados.map((l) => ({ tipo: 'link', l }));
    if (pareceUrl(q)) itens.push({ tipo: 'url', url: arrumarUrl(q) });
    itens.push({ tipo: 'web', url: web.url + encodeURIComponent(q), nome: web.nome });
    ui.selBusca = Math.min(ui.selBusca, itens.length - 1);
    box._itens = itens;
    box.innerHTML = itens.map((it, i) => {
        const s = i === ui.selBusca ? 'sel' : '';
        if (it.tipo === 'link') return `<div class="resultado ${s}" role="option" data-i="${i}">${favicon(it.l)}<span class="t">${esc(it.l.titulo)}</span><span class="d">${esc(grupoNome(it.l.grupo) || host(it.l.url))}</span></div>`;
        if (it.tipo === 'url') return `<div class="resultado ${s}" role="option" data-i="${i}"><i class="fa-solid fa-arrow-up-right-from-square fav" style="--cor:var(--c3)"></i><span class="t">Abrir ${esc(it.url)}</span></div>`;
        return `<div class="resultado ${s}" role="option" data-i="${i}"><i class="fa-solid fa-magnifying-glass fav" style="--cor:var(--c2)"></i><span class="t">Buscar "${esc(q)}"</span><span class="d">${esc(it.nome)}</span></div>`;
    }).join('');
    box.hidden = false;
}
function escolherResultado(i) {
    const box = $('#resultados');
    const it = box && box._itens && box._itens[i];
    if (!it) return;
    if (it.tipo === 'link') abrirLink(it.l);
    else if (D.ajustes.novaAba) window.open(it.url, '_blank', 'noopener');
    else location.href = it.url;
    ui.filtro = '';
    ui.selBusca = 0;
    const b = $('#busca');
    if (b) b.value = '';
    box.hidden = true;
}

/* ===================== modais ===================== */
const modal = () => $('#modal');
function abrirModal(html, aoEnviar) {
    const m = modal();
    // o primeiro botão de envio é o que o Enter aperta: um "ok" escondido no topo evita que o Enter cancele ou apague
    m.innerHTML = `<form method="dialog" class="modal-corpo"><button type="submit" value="ok" class="enviar-padrao" tabindex="-1" aria-hidden="true"></button>${html}</form>`;
    const f = $('form', m);
    f.addEventListener('submit', (e) => {
        if (e.submitter && e.submitter.value === 'cancelar') return;
        e.preventDefault();
        if (aoEnviar(new FormData(f), e.submitter) !== false) m.close();
    });
    m.showModal();
    const primeiro = $('[autofocus]', m) || $('input,select,textarea', m);
    if (primeiro) primeiro.focus();
}

function modalLink(id, preset) {
    const l = id ? D.links.find((x) => x.id === id) : Object.assign({ titulo: '', url: '', grupo: '', tags: [], nota: '', fixo: false }, preset || {});
    if (!l) return;
    const opcoes = D.grupos.map((g) => `<option value="${g.id}" ${l.grupo === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('');
    abrirModal(`
        <h2><i class="fa-solid fa-link"></i>${id ? 'Editar link' : 'Novo link'}</h2>
        <label class="f"><span>Endereço</span><input class="campo" name="url" value="${esc(l.url)}" placeholder="https://…" required ${l.url ? '' : 'autofocus'} spellcheck="false" inputmode="url"></label>
        <label class="f"><span>Nome</span><input class="campo" name="titulo" value="${esc(l.titulo)}" placeholder="se deixar vazio, usa o nome do site" ${l.url ? 'autofocus' : ''}></label>
        <div class="f2">
          <label class="f"><span>Grupo</span><select class="campo" name="grupo"><option value="">(sem grupo)</option>${opcoes}<option value="__novo">+ novo grupo…</option></select></label>
          <label class="f"><span>Tags (separe por vírgula)</span><input class="campo" name="tags" value="${esc(l.tags.join(', '))}" placeholder="ia, faculdade" list="lista-tags"></label>
        </div>
        <datalist id="lista-tags">${todasTags().map(([t]) => `<option value="${esc(t)}">`).join('')}</datalist>
        <label class="f" data-novo-grupo hidden><span>Nome do novo grupo</span><input class="campo" name="novoGrupo"></label>
        <label class="f"><span>Nota</span><input class="campo" name="nota" value="${esc(l.nota)}" placeholder="opcional"></label>
        <label class="op" style="display:flex;gap:10px;align-items:center"><input type="checkbox" class="check" name="fixo" ${l.fixo ? 'checked' : ''}> Mostrar nos favoritos do início</label>
        <div class="modal-acoes">
          ${id ? '<button class="btn perigo esq" value="apagar" formnovalidate><i class="fa-regular fa-trash-can"></i> Apagar</button>' : ''}
          <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
          <button class="btn primario" value="ok"><i class="fa-solid fa-check"></i> Salvar</button>
        </div>`, (fd, botao) => {
        if (botao && botao.value === 'apagar') { apagarLink(id); return; }
        const url = arrumarUrl(fd.get('url'));
        if (!url) return false;
        let grupo = fd.get('grupo');
        if (grupo === '__novo') {
            const nome = String(fd.get('novoGrupo') || '').trim();
            if (nome) { const g = { id: uid(), nome, icone: 'fa-folder' }; D.grupos.push(g); grupo = g.id; } else grupo = '';
        }
        const titulo = String(fd.get('titulo') || '').trim() || nomeDoSite(url);
        const tags = String(fd.get('tags') || '').split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
        salvarLink({ url, titulo, grupo, tags: Array.from(new Set(tags)), nota: String(fd.get('nota') || '').trim(), fixo: !!fd.get('fixo') }, id);
        aviso(id ? 'Link salvo' : `"${titulo}" adicionado`);
    });
    const sel = $('select[name="grupo"]', modal());
    sel.addEventListener('change', () => { $('[data-novo-grupo]', modal()).hidden = sel.value !== '__novo'; });
}
function nomeDoSite(url) {
    const h = host(url).split('.');
    const n = h.length > 2 && h[0].length > 3 ? h[0] : h[h.length - 2] || h[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
}

const ICONES_GRUPO = ['fa-folder', 'fa-sun', 'fa-book-open', 'fa-graduation-cap', 'fa-briefcase', 'fa-gamepad', 'fa-dice-d20', 'fa-music', 'fa-film', 'fa-robot', 'fa-newspaper', 'fa-cart-shopping', 'fa-code', 'fa-palette', 'fa-heart', 'fa-tree'];
function modalGrupo(id) {
    const g = id ? D.grupos.find((x) => x.id === id) : { nome: '', icone: 'fa-folder' };
    abrirModal(`
        <h2><i class="fa-solid fa-folder"></i>${id ? 'Editar grupo' : 'Novo grupo'}</h2>
        <label class="f"><span>Nome</span><input class="campo" name="nome" value="${esc(g.nome)}" required autofocus maxlength="30"></label>
        <div class="f"><span>Ícone</span><div class="dias-semana">${ICONES_GRUPO.map((ic) => `<label><input type="radio" name="icone" value="${ic}" ${g.icone === ic ? 'checked' : ''}><span><i class="fa-solid ${ic}"></i></span></label>`).join('')}</div></div>
        <div class="modal-acoes">
          ${id ? '<button class="btn perigo esq" value="apagar" formnovalidate><i class="fa-regular fa-trash-can"></i> Apagar grupo</button>' : ''}
          <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
          <button class="btn primario" value="ok"><i class="fa-solid fa-check"></i> Salvar</button>
        </div>`, (fd, botao) => {
        if (botao && botao.value === 'apagar') {
            const n = D.links.filter((l) => l.grupo === id).length;
            if (n && !confirm(`Apagar o grupo "${g.nome}"? Os ${n} links dele continuam salvos, em "Sem grupo".`)) return false;
            D.grupos = D.grupos.filter((x) => x.id !== id);
            if (ui.grupo === id) ui.grupo = 'todos';
            salvar(); render(); return;
        }
        const nome = String(fd.get('nome') || '').trim();
        if (!nome) return false;
        if (id) Object.assign(g, { nome, icone: fd.get('icone') || g.icone });
        else { const novo = { id: uid(), nome, icone: fd.get('icone') || 'fa-folder' }; D.grupos.push(novo); ui.colecao = novo.id; }
        salvar(); render();
    });
}

function modalEvento(id, data) {
    const ev = id ? D.eventos.find((x) => x.id === id) : { titulo: '', data: data || hojeIso(), hora: '', fim: '', repetir: 'nao', dias: [], ate: '', link: '', local: '', nota: '', cor: 'c1' };
    if (!ev) return;
    const diaInicial = deIso(ev.data).getDay();
    const dias = ev.dias && ev.dias.length ? ev.dias : [diaInicial];
    abrirModal(`
        <h2><i class="fa-solid fa-calendar-plus"></i>${id ? 'Editar evento' : 'Novo evento'}</h2>
        <label class="f"><span>O que é</span><input class="campo" name="titulo" value="${esc(ev.titulo)}" required autofocus placeholder="Aula, reunião, sessão de RPG…"></label>
        <div class="f3">
          <label class="f"><span>Dia</span><input class="campo" type="date" name="data" value="${ev.data}" required></label>
          <label class="f"><span>Começa</span><input class="campo" type="time" name="hora" value="${esc(ev.hora)}"></label>
          <label class="f"><span>Termina</span><input class="campo" type="time" name="fim" value="${esc(ev.fim)}"></label>
        </div>
        <div class="f2">
          <label class="f"><span>Repetir</span><select class="campo" name="repetir">${Object.entries(REPETIR).map(([k, n]) => `<option value="${k}" ${ev.repetir === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="f" data-rep><span>Até (opcional)</span><input class="campo" type="date" name="ate" value="${esc(ev.ate || '')}"></label>
        </div>
        <div class="f" data-semanal><span>Nos dias</span><div class="dias-semana">${SEMANA.map((s, i) => `<label><input type="checkbox" name="dias" value="${i}" ${dias.includes(i) ? 'checked' : ''}><span>${s.slice(0, 3)}</span></label>`).join('')}</div></div>
        <div class="f2">
          <label class="f"><span>Link (Meet, Teams, Discord…)</span><input class="campo" name="link" value="${esc(ev.link || '')}" placeholder="opcional" spellcheck="false"></label>
          <label class="f"><span>Local</span><input class="campo" name="local" value="${esc(ev.local || '')}" placeholder="opcional"></label>
        </div>
        <div class="f"><span>Cor</span><div class="cores">${CORES.map((c) => `<label><input type="radio" name="cor" value="${c}" ${ev.cor === c ? 'checked' : ''}><span style="--cor:var(--${c})"></span></label>`).join('')}</div></div>
        <label class="f"><span>Nota</span><input class="campo" name="nota" value="${esc(ev.nota || '')}" placeholder="opcional"></label>
        <div class="modal-acoes">
          ${id ? `${ev.repetir !== 'nao' && data ? '<button class="btn perigo esq" value="apagar-um" formnovalidate>Apagar só este dia</button>' : ''}<button class="btn perigo ${ev.repetir !== 'nao' && data ? '' : 'esq'}" value="apagar" formnovalidate><i class="fa-regular fa-trash-can"></i> ${ev.repetir !== 'nao' ? 'Apagar todos' : 'Apagar'}</button>` : ''}
          <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
          <button class="btn primario" value="ok"><i class="fa-solid fa-check"></i> Salvar</button>
        </div>`, (fd, botao) => {
        if (botao && botao.value === 'apagar') { apagarEvento(id); return; }
        if (botao && botao.value === 'apagar-um') { apagarEvento(id, data); return; }
        const repetir = fd.get('repetir');
        const novo = {
            titulo: String(fd.get('titulo')).trim(), data: fd.get('data'), hora: fd.get('hora') || '', fim: fd.get('hora') ? fd.get('fim') || '' : '',
            repetir, dias: repetir === 'semanal' ? fd.getAll('dias').map(Number) : [], ate: repetir !== 'nao' ? fd.get('ate') || '' : '',
            link: fd.get('link') ? arrumarUrl(fd.get('link')) : '', local: String(fd.get('local') || '').trim(), nota: String(fd.get('nota') || '').trim(), cor: fd.get('cor') || 'c1',
        };
        if (!novo.titulo || !novo.data) return false;
        salvarEvento(novo, id);
        aviso(id ? 'Evento salvo' : 'Evento criado');
    });
    const m = modal(), rep = $('select[name="repetir"]', m);
    const atualizar = () => { $('[data-semanal]', m).hidden = rep.value !== 'semanal'; $('[data-rep]', m).style.visibility = rep.value === 'nao' ? 'hidden' : 'visible'; };
    rep.addEventListener('change', atualizar);
    atualizar();
}


/* ===================== email (Outlook, várias contas) ===================== */
const email = { ia: null, iaGerando: false, hoje: null, conta: null, entrada: null, caixa: null, erro: '', pasta: 'entrada', filtro: '', sel: null, msg: null, carregandoMsg: false, imagens: false, timerLogin: null };
const PASTAS_EMAIL = { entrada: ['Entrada', 'fa-inbox'], enviados: ['Enviados', 'fa-paper-plane'], arquivo: ['Arquivo', 'fa-box-archive'], lixeira: ['Lixeira', 'fa-trash-can'], spam: ['Spam', 'fa-ban'] };

async function api(caminho, opcoes) {
    const r = await fetch(caminho, Object.assign({ cache: 'no-store' }, opcoes || {}));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.erro || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return j;
}
function postApi(caminho, corpo) {
    return api(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Yggdrasil': '1' }, body: JSON.stringify(corpo || {}) });
}
const contasEmail = () => (email.conta && email.conta.contas) || [];
const chaveEmail = (conta, id) => conta + '|' + id;
function contaDe(id) { return contasEmail().find((c) => c.id === id); }
const CORES_CONTA = ['c1', 'c6', 'c3', 'c5', 'c4', 'c2'];
function corConta(id) { const i = contasEmail().findIndex((c) => c.id === id); return CORES_CONTA[(i < 0 ? 0 : i) % CORES_CONTA.length]; }
function nomeConta(c) { return c ? (c.email || c.nome || 'Conta do Outlook') : ''; }

async function carregarContaEmail() {
    const antes = email.conta && email.conta.login && email.conta.login.estado;
    try { email.conta = await api('api/email/conta'); } catch (e) { email.conta = e.status === 403 ? { bloqueado: true } : null; }
    if (email.filtro && !contaDe(email.filtro)) email.filtro = '';
    const agora = email.conta && email.conta.login && email.conta.login.estado;
    if (antes === 'aguardando' && agora === 'conectado') aviso('Conta conectada');
    if (email.conta && !email.conta.bloqueado) await carregarIa();
    if (email.conta && email.conta.conectado) carregarCaixa();
    else { email.entrada = email.caixa = null; atualizarEmailNaTela(true); }
    acompanharLogin();
}
function acompanharLogin() {
    clearTimeout(email.timerLogin);
    if (email.conta && email.conta.login && email.conta.login.estado === 'aguardando') {
        email.timerLogin = setTimeout(carregarContaEmail, 3000);
    }
}
async function carregarCaixa() {
    const padrao = email.pasta === 'entrada' && !email.filtro;
    try {
        const pedidos = [api('api/email/caixa?n=30')];
        if (!padrao) pedidos.push(api(`api/email/caixa?n=30&pasta=${email.pasta}${email.filtro ? '&conta=' + encodeURIComponent(email.filtro) : ''}`));
        const meiaNoite = new Date(); meiaNoite.setHours(0, 0, 0, 0);
        const hoje = api('api/email/hoje?desde=' + meiaNoite.toISOString().replace(/\.\d+Z$/, 'Z')).catch(() => null);
        const [entrada, vista] = await Promise.all(pedidos);
        email.hoje = await hoje;
        await carregarIa();
        email.entrada = entrada;
        conferirEmailsNovos(entrada);
        email.caixa = vista || entrada;
        email.erro = '';
    } catch (e) {
        if (e.status === 401) { carregarContaEmail(); return; }
        email.erro = e.message;
    }
    atualizarEmailNaTela(false);
}
function atualizarEmailNaTela(tudo) {
    const n = email.entrada ? email.entrada.naoLidos : 0;
    const b = $('[data-vista="email"] .badge');
    if (b) { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }
    const v = vistaAtual();
    if (v === 'email' && !tudo && $('#email-lista')) { $('#email-lista').innerHTML = listaEmails(); return; }
    if ((v === 'inicio' || v === 'email') && !ehCampo(document.activeElement) && !modal().open) render(true);
}
function acharItem(chave) {
    const [conta, id] = chave.split('|');
    for (const cx of [email.caixa, email.entrada]) {
        const it = cx && cx.emails.find((x) => x.conta === conta && x.id === id);
        if (it) return it;
    }
    return null;
}
function mudarLidoLocal(chave, lido) {
    const [conta, id] = chave.split('|');
    for (const cx of new Set([email.caixa, email.entrada])) {
        const it = cx && cx.emails.find((x) => x.conta === conta && x.id === id);
        if (it && it.lido !== lido) { it.lido = lido; if (cx === email.entrada || email.pasta === 'entrada') cx.naoLidos = Math.max(0, cx.naoLidos + (lido ? -1 : 1)); }
    }
}
async function abrirEmail(chave) {
    email.sel = chave;
    email.msg = null;
    email.carregandoMsg = true;
    email.imagens = false;
    if (vistaAtual() !== 'email') { location.hash = '#email'; } else render(true);
    const [conta, id] = chave.split('|');
    try {
        email.msg = await api(`api/email/msg?conta=${encodeURIComponent(conta)}&id=${encodeURIComponent(id)}`);
        mudarLidoLocal(chave, true);
    } catch (e) {
        email.msg = { erro: e.message };
    }
    email.carregandoMsg = false;
    if (vistaAtual() === 'email' && email.sel === chave) render(true);
    atualizarEmailNaTela(false);
    if (window.matchMedia('(max-width: 900px)').matches) { const l = $('.leitor'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function tirarDaLista(chave) {
    const [conta, id] = chave.split('|');
    for (const cx of [email.caixa, email.entrada]) if (cx) cx.emails = cx.emails.filter((x) => !(x.conta === conta && x.id === id));
}
async function acaoEmail(qual, chave) {
    chave = chave || email.sel;
    if (!chave) return;
    const [conta, id] = chave.split('|');
    try {
        await postApi('api/email/acao', { conta, id, acao: qual });
    } catch (e) { return aviso('Não deu: ' + e.message); }
    const textos = { arquivar: 'Arquivado', lixeira: 'Foi para a lixeira', apagar: 'Apagado de vez', entrada: 'Voltou para a entrada', spam: 'Marcado como spam', naolido: 'Marcado como não lido', lido: 'Marcado como lido', marcar: 'Sinalizado', desmarcar: 'Sinal tirado' };
    if (['arquivar', 'lixeira', 'apagar', 'entrada', 'spam'].includes(qual)) {
        const it = acharItem(chave);
        if (it && !it.lido && email.entrada && email.pasta === 'entrada') email.entrada.naoLidos = Math.max(0, email.entrada.naoLidos - 1);
        tirarDaLista(chave);
        email.sel = null; email.msg = null;
    } else if (qual === 'naolido' || qual === 'lido') {
        mudarLidoLocal(chave, qual === 'lido');
        if (qual === 'naolido') { email.sel = null; email.msg = null; }
    } else if (email.msg) {
        email.msg.marcado = qual === 'marcar';
        const it = acharItem(chave); if (it) it.marcado = email.msg.marcado;
    }
    aviso(textos[qual] || 'Feito');
    render(true);
    atualizarEmailNaTela(false);
    setTimeout(carregarCaixa, 1500);
}
async function baixarAnexo(conta, msg, id, nome) {
    try {
        const r = await fetch(`api/email/anexo?conta=${encodeURIComponent(conta)}&msg=${encodeURIComponent(msg)}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'HTTP ' + r.status);
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url; a.download = nome || 'anexo';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { aviso('Não deu para baixar: ' + e.message); }
}
function dataEmail(isoTxt) {
    if (!isoTxt) return '';
    const d = new Date(isoTxt), agora = new Date();
    if (iso(d) === iso(agora)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (iso(d) === iso(somaDias(agora, -1))) return 'ontem';
    if (d.getFullYear() === agora.getFullYear()) return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}
function tamanho(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}
function itemEmail(m, compacto) {
    const chave = chaveEmail(m.conta, m.id);
    const varias = contasEmail().length > 1;
    const quem = email.pasta === 'enviados' && !compacto ? 'para ' + (m.para || []).map((p) => p.nome || p.email).join(', ') : (m.de.nome || m.de.email || '(sem remetente)');
    return `<button class="email-item ${m.lido ? '' : 'novo'} ${email.sel === chave ? 'sel' : ''} ${varias ? 'multi' : ''}" data-email="${esc(chave)}" ${varias ? `style="--cc: var(--${corConta(m.conta)})" title="${esc(nomeConta(contaDe(m.conta)))}"` : ''}>
        <span class="de">${m.lido ? '' : '<i class="ponto"></i>'}${esc(quem)}</span>
        <span class="quando">${m.marcado ? '<i class="fa-solid fa-flag" style="color:var(--c5)"></i> ' : ''}${m.anexos ? '<i class="fa-solid fa-paperclip"></i> ' : ''}${m.importante ? '<i class="fa-solid fa-exclamation" style="color:var(--c5)"></i> ' : ''}${dataEmail(m.data)}</span>
        <span class="assunto">${esc(m.assunto)}</span>
        ${compacto ? '' : `<span class="previa">${esc(m.previa)}</span>`}
      </button>`;
}
function listaEmails() {
    if (email.erro) return `<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>${esc(email.erro)}</div>`;
    if (!email.caixa) return '<div class="vazio"><i class="fa-solid fa-spinner fa-spin"></i>Carregando…</div>';
    const falhas = (email.caixa.contas || []).filter((c) => c.erro).map((c) => `<div class="email-falha"><i class="ponto-conta ${corConta(c.id)}"></i>${esc(nomeConta(contaDe(c.id)))}: ${esc(c.erro)}</div>`).join('');
    if (!email.caixa.emails.length) return falhas + '<div class="vazio"><i class="fa-regular fa-envelope-open"></i>Nada aqui.</div>';
    return falhas + email.caixa.emails.map((m) => itemEmail(m)).join('');
}
function blocoCodigo(l) {
    return `<div class="conectar">
        <p>1. Abra <a class="btn mini" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.url.replace(/^https?:\/\//, ''))} <i class="fa-solid fa-arrow-up-right-from-square"></i></a></p>
        <p>2. Digite o código:</p>
        <div class="codigo"><b>${esc(l.codigo)}</b><button class="btn mini" data-acao="copiar-codigo" data-codigo="${esc(l.codigo)}"><i class="fa-regular fa-copy"></i> copiar</button></div>
        <p class="fraco">3. Entre com a conta do Outlook (Hotmail, Live, Office…) e aceite a permissão. Esta tela atualiza sozinha.</p>
        <div><button class="btn mini fantasma" data-acao="email-cancelar">cancelar</button></div>
      </div>`;
}
function blocoConectar() {
    const c = email.conta;
    if (!modoServidor) return '<div class="vazio">O email só funciona com o servidor rodando.</div>';
    if (!c) return '<div class="vazio">Não consegui falar com o servidor.</div>';
    if (c.bloqueado) return '<div class="vazio"><i class="fa-solid fa-lock"></i>Pela rede, o email só abre em perfil com PIN. Coloque um PIN no seu perfil em Ajustes › Perfis (ou abra no PC onde o Yggdrasil está rodando).</div>';
    const l = c.login || {};
    if (l.estado === 'aguardando') return blocoCodigo(l);
    const expiradas = contasEmail().filter((x) => x.expirou);
    return `<div class="conectar">
        <p>Leia, responda e escreva seus emails aqui dentro. Dá para ligar várias contas, de provedores diferentes.${l.estado === 'erro' ? `<br><span style="color:var(--c5)">${esc(l.erro)}</span>` : ''}${l.estado === 'expirado' ? '<br><span style="color:var(--c5)">O código expirou, tente de novo.</span>' : ''}</p>
        ${expiradas.map((x) => `<p class="fraco">${esc(nomeConta(x))} precisa entrar de novo. <button class="btn mini" data-acao="${x.tipo === 'imap' ? 'email-imap' : 'email-login'}" data-conta="${esc(x.id)}">entrar de novo</button></p>`).join('')}
        <div class="linha">${c.outlook ? '<button class="btn primario" data-acao="email-login"><i class="fa-brands fa-microsoft"></i> Conectar Outlook</button>' : ''}
          <button class="btn ${c.outlook ? '' : 'primario'}" data-acao="email-imap"><i class="fa-brands fa-google"></i> Gmail e outros</button></div>
        <p class="fraco" style="font-size:12px">Gmail, Yahoo, iCloud, UOL, BOL, Terra, Zoho e qualquer email com IMAP.</p>
      </div>`;
}
function blocoContas() {
    const c = email.conta || {};
    const l = c.login || {};
    const lista = contasEmail();
    const abrir = l.estado === 'aguardando' || lista.some((x) => x.expirou || !x.podeEnviar) || l.estado === 'erro';
    return `<details class="contas-email" ${abrir ? 'open' : ''}>
        <summary><i class="fa-solid fa-at"></i> Contas (${lista.length})</summary>
        ${lista.map((x) => `<div class="conta-linha">
            <i class="ponto-conta ${corConta(x.id)}"></i>
            <span class="conta-nome" title="${esc(x.nome)}">${esc(nomeConta(x))} <small class="fraco">${esc(x.provedor || '')}</small>${x.expirou ? ' <em>expirou</em>' : !x.podeEnviar ? ' <em>só leitura</em>' : ''}</span>
            ${x.expirou ? `<button class="btn mini" data-acao="${x.tipo === 'imap' ? 'email-imap' : 'email-login'}" data-conta="${esc(x.id)}">entrar de novo</button>` : !x.podeEnviar ? `<button class="btn mini" data-acao="email-login" data-conta="${esc(x.id)}" title="Entre de novo com esta conta para poder responder e enviar daqui">liberar envio</button>` : ''}
            <button class="btn icone fantasma" data-acao="email-sair" data-conta="${esc(x.id)}" aria-label="Tirar esta conta" title="Tirar esta conta"><i class="fa-solid fa-xmark"></i></button>
          </div>`).join('')}
        ${l.estado === 'aguardando' ? blocoCodigo(l) : `<div class="linha">${c.outlook ? '<button class="btn mini" data-acao="email-login"><i class="fa-brands fa-microsoft"></i> + Outlook</button>' : ''}<button class="btn mini" data-acao="email-imap"><i class="fa-brands fa-google"></i> + Gmail e outros</button></div>${l.estado === 'erro' ? `<p class="fraco" style="color:var(--c5)">${esc(l.erro)}</p>` : ''}`}
      </details>`;
}
/* ---------- resumo de hoje ---------- */
/* ---------- resumo com IA (Gemini) ---------- */
async function carregarIa() {
    try { email.ia = await api('api/ia'); } catch (e) { email.ia = null; return; }
    const r = email.ia.resumo;
    // Avisa quando o resumo diário fica pronto (se os lembretes estiverem ligados)
    if (r && !r.parcial && lsGet('yggIaVisto') !== r.gerado) {
        lsSet('yggIaVisto', r.gerado);
        const recente = Date.now() - new Date(r.gerado).getTime() < 3 * 3600 * 1000;
        if (recente && D.ajustes.avisosCompilado !== false) {
            notificar('Compilado das newsletters', r.manchete || 'Pronto', 'ygg-resumo', '#email');
        }
    }
}
function horaCurta(isoTxt) { const d = new Date(isoTxt); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function diaCurto(isoTxt) {
    const d = new Date(isoTxt), hoje = new Date();
    if (iso(d) === iso(hoje)) return 'hoje';
    if (iso(d) === iso(somaDias(hoje, -1))) return 'ontem';
    return `${d.getDate()}/${pad(d.getMonth() + 1)}`;
}
function blocoIa(compacto) {
    const ia = email.ia;
    if (!ia) return '';
    const c = ia.config;
    const icone = '<i class="fa-solid fa-newspaper"></i>';
    if (!c.configurada) {
        return compacto ? '' : `<div class="ia-resumo">
            <div class="ia-topo"><h2>${icone} Compilado das newsletters</h2></div>
            <p class="fraco">${ia.podeConfigurar ? `Coloque a chave do Gemini em Ajustes e ${textoHorarios(c)} aparece aqui um compilado das suas newsletters.` : 'O perfil principal ainda não ligou o compilado com IA.'}</p>
            ${ia.podeConfigurar ? '<div><a class="btn mini" href="#ajustes">Ir para Ajustes</a></div>' : ''}
          </div>`;
    }
    const r = ia.resumo && ia.resumo.versao === 2 ? ia.resumo : null;
    const gerando = email.iaGerando;
    const botoes = `<button class="btn mini ${compacto ? 'fantasma' : 'primario'}" data-acao="ia-gerar" data-parcial="1" ${gerando ? 'disabled' : ''} title="Compila o que chegou desde o último horário até agora">${gerando ? '<i class="fa-solid fa-spinner fa-spin"></i> Compilando…' : '<i class="fa-solid fa-wand-magic-sparkles"></i> Compilar agora'}</button>`;
    const titulo = !r ? 'Compilado das newsletters' : r.parcial ? 'Compilado até agora' : `Compilado das ${horaH(r.fim)}`;
    const periodo = r ? `${diaCurto(r.inicio)} ${horaCurta(r.inicio)} → ${diaCurto(r.fim)} ${horaCurta(r.fim)}` : '';
    const falha = ia.falha && ia.falha !== 'sem login' ? `<p class="email-falha"><i class="fa-solid fa-triangle-exclamation"></i> Última tentativa automática falhou: ${esc(ia.falha)}</p>` : '';
    if (!r) {
        return `<div class="ia-resumo ${compacto ? 'compacto' : ''}">
            <div class="ia-topo"><${compacto ? 'h3' : 'h2'}>${icone} ${titulo}</${compacto ? 'h3' : 'h2'}>${botoes}</div>
            <p class="fraco">O próximo compilado sai às ${proximoHorarioIa(c)}${c.ligado ? '' : ' (está desligado em Ajustes)'}. Ou peça um agora (leva uns segundos).</p>${falha}
          </div>`;
    }
    const fonte = (f) => `<button class="ia-fonte" data-email="${esc(chaveEmail(f.conta, f.id))}" title="${esc(f.assunto)}">${esc(f.nome)}</button>`;
    const acao = (x) => `<${x.id ? `button data-email="${esc(chaveEmail(x.conta, x.id))}"` : 'div'} class="ia-item">
        <i class="fa-solid fa-square-check"></i>
        <span><b>${esc(x.texto)}</b>${x.prazo ? ` <span class="ia-prazo"><i class="fa-regular fa-clock"></i> ${esc(x.prazo)}</span>` : ''}${x.de ? `<em>${esc(x.de)}</em>` : ''}</span>
      </${x.id ? 'button' : 'div'}>`;
    const temas = r.temas || [];
    if (compacto) {
        const itens = temas.flatMap((t) => t.itens.slice(0, 2).map((i) => ({ i, t }))).slice(0, 5);
        return `<div class="ia-resumo compacto">
            <div class="ia-topo"><h3>${icone} ${titulo} <span class="fraco">${periodo}</span></h3>${botoes}</div>
            ${r.manchete ? `<p class="ia-manchete">${esc(r.manchete)}</p>` : ''}
            ${itens.length ? `<ul class="ia-mini">${itens.map(({ i, t }) => `<li><span class="ia-emoji">${esc(t.emoji || '•')}</span>${i.fontes[0] ? `<button data-email="${esc(chaveEmail(i.fontes[0].conta, i.fontes[0].id))}">${esc(i.titulo)}</button>` : esc(i.titulo)}</li>`).join('')}</ul>` : ''}
            ${(r.acoes || []).length ? `<p class="fraco" style="font-size:12px"><i class="fa-solid fa-square-check" style="color:var(--acento)"></i> ${r.acoes.length} coisa${r.acoes.length > 1 ? 's' : ''} pra fazer nos outros emails</p>` : ''}
            <a class="btn mini fantasma" href="#email" data-acao="email-resumo">ver o compilado inteiro <i class="fa-solid fa-arrow-right"></i></a>
          </div>`;
    }
    return `<div class="ia-resumo">
        <div class="ia-topo"><h2>${icone} ${titulo}</h2>${botoes}</div>
        <p class="fraco">${periodo} · ${r.newsletters || 0} newsletter${r.newsletters === 1 ? '' : 's'} de ${r.total} email${r.total === 1 ? '' : 's'} · feito ${diaCurto(r.gerado)} às ${horaCurta(r.gerado)}</p>
        ${(r.erros || []).map((e) => `<p class="email-falha">${esc(e)}</p>`).join('')}${falha}
        ${r.manchete ? `<p class="ia-manchete">${esc(r.manchete)}</p>` : ''}
        ${temas.map((t) => `<section class="ia-tema">
            <h3><span class="ia-emoji">${esc(t.emoji || '•')}</span> ${esc(t.tema)}</h3>
            ${t.itens.map((i) => `<div class="ia-noticia"><b>${esc(i.titulo)}</b><p>${esc(i.texto)}</p>${i.fontes.length ? `<div class="ia-fontes">${i.fontes.map(fonte).join('')}</div>` : ''}</div>`).join('')}
          </section>`).join('')}
        ${!temas.length && r.total ? '<p class="fraco">Nenhuma newsletter nesse período.</p>' : ''}
        ${(r.acoes || []).length ? `<h3><i class="fa-solid fa-list-check"></i> Pra fazer (outros emails)</h3><div class="ia-lista">${r.acoes.map(acao).join('')}</div>` : ''}
        ${r.outros ? `<p class="fraco">${esc(r.outros)}</p>` : ''}
        <p class="fraco dica">Feito pelo ${esc(r.modelo || 'Gemini')} a partir das suas newsletters. A IA pode errar: clique na fonte para ler o original.</p>
      </div>`;
}
// "às 00h, 06h, 12h e 18h" a partir da hora e do intervalo do compilado
function horariosIa(c) {
    const [h, m] = String(c.hora || '06:00').split(':').map(Number);
    const passo = +c.intervalo || 24, r = [];
    for (let k = 0; k < 24; k += passo) r.push(((h + k) % 24) * 60 + m);
    return r.sort((a, b) => a - b).map((x) => `${pad(Math.floor(x / 60))}h${x % 60 ? pad(x % 60) : ''}`);
}
function textoHorarios(c, inicioFrase) {
    const hs = horariosIa(c);
    const lista = hs.length === 1 ? hs[0] : hs.length <= 6 ? hs.slice(0, -1).join(', ') + ' e ' + hs[hs.length - 1] : '';
    const t = lista ? `todo dia às ${lista}` : `a cada ${c.intervalo} horas`;
    return inicioFrase ? t[0].toUpperCase() + t.slice(1) : t;
}
function proximoHorarioIa(c) {
    const [h, m] = String(c.hora || '06:00').split(':').map(Number);
    const agora = new Date(), passo = (+c.intervalo || 24) * 60;
    const min = agora.getHours() * 60 + agora.getMinutes();
    let base = h * 60 + m;
    while (base > min) base -= passo;
    while (base <= min) base += passo;
    base = ((base % 1440) + 1440) % 1440;
    return `${pad(Math.floor(base / 60))}h${base % 60 ? pad(base % 60) : ''}`;
}
function horaH(isoTxt) {
    const d = new Date(isoTxt);
    return isNaN(d) ? '' : `${pad(d.getHours())}h${d.getMinutes() ? pad(d.getMinutes()) : ''}`;
}
function cartaoIa() {
    if (!modoServidor) return '';
    const ia = email.ia;
    const cab = '<h2 class="card-titulo"><i class="fa-solid fa-wand-magic-sparkles"></i>Compilado das newsletters (IA)</h2>';
    if (!ia) return `<section class="card ajuste">${cab}<p class="fraco">${email.conta && email.conta.bloqueado ? 'Pela rede, só em perfil com PIN.' : 'Não consegui falar com o servidor.'}</p></section>`;
    const c = ia.config;
    if (!ia.podeConfigurar) {
        return `<section class="card ajuste">${cab}<p>${c.configurada ? `Ligado: ${textoHorarios(c)} sai um compilado dos seus emails, na tela de Email.` : 'O perfil principal ainda não colocou a chave do Gemini.'}</p></section>`;
    }
    return `<section class="card ajuste">${cab}
        <p>${textoHorarios(c, true)}, o Yggdrasil lê os emails que chegaram desde o compilado anterior, em todas as contas de cada perfil, e o Gemini junta as newsletters num compilado curto por assunto (a mesma notícia em várias newsletters vira um item só). Se o PC estiver desligado num horário, ele faz assim que o Yggdrasil abrir, cobrindo o tempo que ficou de fora. "Compilar agora" pega do último horário até o momento.</p>
        <div class="estado-salvar ${c.configurada ? 'ok' : 'local'}"><i class="fa-solid ${c.configurada ? 'fa-circle-check' : 'fa-key'}"></i><span>${c.configurada ? `Chave salva (termina em <b>${esc(c.final)}</b>). Ela fica só no ia-config.json do seu PC.` : 'Falta a chave da API do Gemini.'}</span></div>
        <label class="f"><span>Chave da API do Gemini</span><input class="campo" id="ia-chave" type="password" autocomplete="off" spellcheck="false" placeholder="${c.configurada ? 'deixe vazio para manter a atual' : 'cole a chave aqui'}"></label>
        <p class="fraco" style="font-size:12px;margin:0">Crie em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> e <b>ative o faturamento</b> no projeto da chave. Os <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">termos da API</a> proíbem mandar dados pessoais (como emails) no uso grátis, e no uso grátis o Google pode ler e usar o conteúdo para melhorar os produtos dele. A assinatura do app Gemini não inclui a API. Cada compilado custa centavos.</p>
        <label class="op" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" class="check" id="ia-consentimento" ${c.consentimento ? 'checked' : ''}> <span>Entendo que, com o compilado ligado, o texto dos emails recebidos (que pode ter dados de outras pessoas) é enviado ao Google (Gemini) para ser resumido, e que a chave é de um projeto com faturamento ativo.</span></label>
        <div class="f2">
          <label class="f"><span>A cada</span><select class="campo" id="ia-intervalo">${[[1, '1 hora'], [2, '2 horas'], [3, '3 horas'], [4, '4 horas'], [6, '6 horas'], [8, '8 horas'], [12, '12 horas'], [24, '24 horas (1 por dia)']].map(([v, n]) => `<option value="${v}" ${+c.intervalo === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="f"><span>A partir de</span><input class="campo" id="ia-hora" type="time" value="${esc(c.hora)}"></label>
          <label class="f"><span>Modelo</span><input class="campo" id="ia-modelo" value="${esc(c.modelo)}" spellcheck="false"></label>
        </div>
        <label class="op" style="display:flex;gap:10px;align-items:center"><input type="checkbox" class="check" id="ia-ligado" ${c.ligado ? 'checked' : ''}> Fazer o compilado sozinho nesses horários</label>
        <div class="linha">
          <button class="btn primario" data-acao="ia-salvar"><i class="fa-solid fa-check"></i> Salvar</button>
          ${c.configurada ? `<button class="btn" data-acao="ia-gerar" data-parcial="1" ${email.iaGerando ? 'disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i> Compilar agora</button><button class="btn perigo" data-acao="ia-tirar">Tirar a chave</button>` : ''}
        </div>
      </section>`;
}
async function gerarResumoIa(parcial) {
    if (email.iaGerando) return;
    email.iaGerando = true;
    if (vistaAtual() === 'ajustes') { email.sel = null; email.msg = null; location.hash = '#email'; } else render(true);
    aviso('Lendo as newsletters e montando o compilado… pode levar até um minuto');
    try {
        const r = await postApi('api/ia/gerar', { parcial: !!parcial });
        if (email.ia) email.ia.resumo = r.resumo;
        aviso('Compilado pronto');
    } catch (e) {
        aviso('Não deu para compilar: ' + e.message);
    }
    email.iaGerando = false;
    if (vistaAtual() === 'email' && email.sel) { email.sel = null; email.msg = null; }
    render(true);
}

function resumoHoje(compacto) {
    const h = email.hoje;
    if (!h) return compacto ? '' : '<div class="vazio leitor-vazio"><i class="fa-regular fa-envelope"></i>Escolha um email na lista.</div>';
    const plural = (n, um, varios) => `<b>${n}</b> ${n === 1 ? um : varios}`;
    const linha = (m, previa) => `<button class="resumo-item ${m.lido ? '' : 'novo'}" data-email="${esc(chaveEmail(m.conta, m.id))}">
        <span class="quem">${m.lido ? '' : '<i class="ponto"></i>'}${m.importante ? '<i class="fa-solid fa-exclamation" style="color:var(--c5)"></i>' : ''}${m.marcado ? '<i class="fa-solid fa-flag" style="color:var(--c5)"></i>' : ''}${esc(m.de.nome || m.de.email)}</span>
        <span class="sobre">${esc(m.assunto)}${previa && m.previa ? `<em> · ${esc(m.previa)}</em>` : ''}</span>
        <span class="quando">${dataEmail(m.data)}</span>
      </button>`;
    const falhas = (h.contas || []).filter((c) => c.erro).map((c) => `<p class="email-falha"><i class="ponto-conta ${corConta(c.id)}"></i>${esc(nomeConta(contaDe(c.id)))}: ${esc(c.erro)}</p>`).join('');
    if (!h.total) return `<div class="resumo-hoje ${compacto ? 'compacto' : 'cheio'}">${compacto ? '' : '<h2>Resumo de hoje</h2>'}<p class="fraco">Nenhum email chegou hoje ainda.</p>${falhas}</div>`;
    const numeros = `<div class="resumo-num"><span>${plural(h.total, 'recebido', 'recebidos')}</span><span>${plural(h.naoLidos, 'não lido', 'não lidos')}</span><span>${plural(h.pessoas, 'de gente', 'de gente')}</span><span>${plural(h.automaticos, 'automático', 'automáticos')}</span>${h.anexos ? `<span>${plural(h.anexos, 'com anexo', 'com anexo')}</span>` : ''}</div>`;
    const remet = h.remetentes.length ? `<div class="resumo-remet">${h.remetentes.slice(0, compacto ? 5 : 8).map((r) => `<span class="chip ${r.naoLidos ? 'tem-novo' : ''}" title="${esc(r.email)}">${esc(r.nome)}${r.n > 1 ? ` <b>×${r.n}</b>` : ''}</span>`).join('')}</div>` : '';
    if (compacto) {
        return `<div class="resumo-hoje compacto">
            <div class="resumo-titulo"><i class="fa-solid fa-sun"></i> Hoje</div>
            ${numeros}
            ${h.destaques.length ? `<div class="resumo-lista">${h.destaques.slice(0, 4).map((m) => linha(m, false)).join('')}</div>` : '<p class="fraco">Nada de gente esperando resposta. 🎉</p>'}
            ${falhas}
          </div>`;
    }
    const d = new Date();
    const outrasPessoas = h.pessoasLista.filter((m) => !h.destaques.some((x) => x.id === m.id && x.conta === m.conta));
    return `<div class="resumo-hoje cheio">
        <h2>Resumo de hoje</h2>
        <p class="fraco">${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}${contasEmail().length > 1 ? ' · todas as contas' : ''}</p>
        ${numeros}
        ${falhas}
        <h3><i class="fa-solid fa-star"></i> Pra ver primeiro</h3>
        ${h.destaques.length ? `<div class="resumo-lista">${h.destaques.map((m) => linha(m, true)).join('')}</div>` : '<p class="fraco">Nada importante nem de gente sem ler. 🎉</p>'}
        ${outrasPessoas.length ? `<h3><i class="fa-solid fa-user"></i> Outras mensagens de gente</h3><div class="resumo-lista">${outrasPessoas.map((m) => linha(m, true)).join('')}</div>` : ''}
        ${remet ? `<h3><i class="fa-solid fa-users"></i> Quem mais mandou</h3>${remet}` : ''}
        <p class="fraco dica">"Automático" é o que o Outlook põe em "Outros" ou vem de endereço tipo no-reply e newsletter.</p>
      </div>`;
}
function cardEmail() {
    if (!modoServidor || !email.conta || email.conta.bloqueado) return '';
    const c = email.conta;
    const n = email.entrada ? email.entrada.naoLidos : 0;
    const lista = c.conectado && email.entrada ? email.entrada.emails.slice(0, 6) : [];
    return `<section class="card c-email">
        <div class="card-topo"><h2 class="card-titulo"><i class="fa-solid fa-envelope"></i>Caixa de entrada${n ? ` <span class="pilula">${n}</span>` : ''}</h2>
          <div class="acoes">${c.conectado ? '<button class="btn icone fantasma" data-acao="email-escrever" aria-label="Escrever email" title="Escrever"><i class="fa-solid fa-pen"></i></button><button class="btn icone fantasma" data-acao="email-atualizar" aria-label="Atualizar"><i class="fa-solid fa-rotate"></i></button>' : ''}<a class="btn mini fantasma" href="#email">abrir <i class="fa-solid fa-arrow-right"></i></a></div></div>
        ${c.conectado ? blocoIa(true) + resumoHoje(true) : ''}
        ${c.conectado ? (email.erro ? `<div class="vazio">${esc(email.erro)}</div>` : lista.length ? `<div class="email-mini">${lista.map((m) => itemEmail(m, true)).join('')}</div>` : (email.entrada ? '<div class="vazio">Caixa vazia.</div>' : '<div class="vazio"><i class="fa-solid fa-spinner fa-spin"></i></div>')) : blocoConectar()}
      </section>`;
}
// Modo escuro do email: inverte as cores (fundo claro vira escuro) e desinverte imagens,
// assim emails com layout próprio continuam legíveis sem perder o contraste.
const ESCURO_EMAIL = 'html{background:#1f1f1f}body{filter:invert(.88);background:#fff;margin:0;padding:18px;min-height:100vh;box-sizing:border-box}img,video,picture,svg,[style*="background-image"],[background]{filter:invert(1)}';
function leitor() {
    if (!email.sel) return `<div class="leitor-resumos">${blocoIa(false)}${resumoHoje(false)}</div>`;
    if (email.carregandoMsg || !email.msg) return '<div class="vazio leitor-vazio"><i class="fa-solid fa-spinner fa-spin"></i>Abrindo…</div>';
    const m = email.msg;
    if (m.erro) return `<div class="vazio leitor-vazio"><i class="fa-solid fa-triangle-exclamation"></i>${esc(m.erro)}</div>`;
    const escuro = !!D.ajustes.emailEscuro;
    const csp = `default-src 'none'; img-src ${email.imagens ? '* data: blob:' : 'data: cid:'}; style-src 'unsafe-inline' *; font-src * data:`;
    const corpo = m.html || `<pre style="white-space:pre-wrap;font:14px/1.5 sans-serif">${esc(m.texto)}</pre>`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html{background:#fff}body{margin:18px;font:14px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;color:#222;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}${escuro ? ESCURO_EMAIL : ''}</style></head><body>${corpo}</body></html>`;
    const temImagens = /<img\b[^>]*src=["']?https?:/i.test(m.html || '');
    const pessoas = (l) => l.map((p) => esc(p.nome || p.email)).join(', ');
    const conta = contaDe(m.conta);
    const varias = contasEmail().length > 1;
    const pode = conta && conta.podeEnviar;
    const p = email.pasta;
    const mover = p === 'lixeira'
        ? '<button class="btn mini fantasma" data-acao="email-mover" data-qual="entrada"><i class="fa-solid fa-inbox"></i> Voltar p/ entrada</button><button class="btn mini perigo" data-acao="email-mover" data-qual="apagar"><i class="fa-regular fa-trash-can"></i> Apagar de vez</button>'
        : `${p === 'arquivo' || p === 'spam' ? '<button class="btn mini fantasma" data-acao="email-mover" data-qual="entrada"><i class="fa-solid fa-inbox"></i> Voltar p/ entrada</button>' : ''}${p !== 'arquivo' ? '<button class="btn mini fantasma" data-acao="email-mover" data-qual="arquivar" title="Arquivar (A)"><i class="fa-solid fa-box-archive"></i> Arquivar</button>' : ''}<button class="btn mini fantasma" data-acao="email-mover" data-qual="lixeira" title="Lixeira (Delete)"><i class="fa-regular fa-trash-can"></i> Lixeira</button>`;
    return `<div class="leitor-topo">
        <h2>${esc(m.assunto)}</h2>
        <div class="meta"><b>${esc(m.de.nome)}</b> <span>&lt;${esc(m.de.email)}&gt;</span> · ${new Date(m.data).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        ${m.para.length ? `<div class="meta">para ${pessoas(m.para)}${m.cc.length ? ` · cc ${pessoas(m.cc)}` : ''}</div>` : ''}
        ${varias && conta ? `<div class="meta"><i class="ponto-conta ${corConta(m.conta)}"></i> na conta ${esc(nomeConta(conta))}</div>` : ''}
        <div class="leitor-acoes">
          ${pode ? `<button class="btn mini primario" data-acao="email-responder" data-modo="responder" title="Responder (R)"><i class="fa-solid fa-reply"></i> Responder</button>
          ${m.para.length + m.cc.length > 1 ? '<button class="btn mini" data-acao="email-responder" data-modo="responderTodos"><i class="fa-solid fa-reply-all"></i> Todos</button>' : ''}
          <button class="btn mini" data-acao="email-responder" data-modo="encaminhar" title="Encaminhar (F)"><i class="fa-solid fa-share"></i> Encaminhar</button>` : (conta ? `<button class="btn mini" data-acao="email-login" data-conta="${esc(conta.id)}" title="Esta conta foi ligada só para ler"><i class="fa-solid fa-unlock"></i> Liberar responder daqui</button>` : '')}
          ${mover}
          <button class="btn mini fantasma" data-acao="email-mover" data-qual="naolido"><i class="fa-regular fa-envelope"></i> Não lido</button>
          <button class="btn mini fantasma" data-acao="email-mover" data-qual="${m.marcado ? 'desmarcar' : 'marcar'}"><i class="fa-${m.marcado ? 'solid' : 'regular'} fa-flag"></i> ${m.marcado ? 'Tirar sinal' : 'Sinalizar'}</button>
          <button class="btn mini fantasma" data-acao="email-escuro" title="${escuro ? 'Ler com fundo claro (o email como foi enviado)' : 'Ler com fundo escuro'}"><i class="fa-solid ${escuro ? 'fa-sun' : 'fa-moon'}"></i> ${escuro ? 'Claro' : 'Escuro'}</button>
          ${temImagens && !email.imagens ? '<button class="btn mini fantasma" data-acao="email-imagens"><i class="fa-regular fa-image"></i> Mostrar imagens</button>' : ''}
          ${m.link ? `<a class="btn mini fantasma" href="${esc(m.link)}" target="_blank" rel="noopener noreferrer" title="Abrir no Outlook"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
        </div>
        ${m.anexos.length ? `<div class="anexos">${m.anexos.map((a) => `<button class="chip" data-acao="email-anexo" data-id="${esc(a.id)}" data-nome="${esc(a.nome)}" title="Baixar"><i class="fa-solid fa-paperclip"></i>${esc(a.nome)} <span class="fraco">${tamanho(a.tamanho || 0)}</span> <i class="fa-solid fa-download"></i></button>`).join('')}</div>` : ''}
      </div>
      <iframe class="corpo-email ${escuro ? 'escuro' : ''}" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="${esc(doc)}" title="Conteúdo do email"></iframe>`;
}
function vEmail() {
    const c = email.conta;
    if (!c || !c.conectado) {
        return `<div class="vista-email-vazia"><section class="card"><div class="card-topo"><h2 class="card-titulo"><i class="fa-solid fa-envelope"></i>Email</h2></div>${blocoConectar()}</section></div>`;
    }
    const n = email.entrada ? email.entrada.naoLidos : 0;
    const [nomePasta, iconePasta] = PASTAS_EMAIL[email.pasta];
    const contas = contasEmail().filter((x) => !x.expirou);
    return `<div class="vista-email">
      <section class="card lista-email">
        <div class="card-topo"><h2 class="card-titulo"><i class="fa-solid ${iconePasta}"></i>${nomePasta}${email.pasta === 'entrada' && n ? ` <span class="pilula">${n}</span>` : ''}</h2>
          <div class="acoes"><button class="btn icone fantasma" data-acao="email-resumo" aria-label="Resumo de hoje" title="Resumo de hoje"><i class="fa-solid fa-sun"></i></button>
          <button class="btn mini primario" data-acao="email-escrever" title="Escrever (C)"><i class="fa-solid fa-pen"></i> Escrever</button>
          <button class="btn icone fantasma" data-acao="email-atualizar" aria-label="Atualizar"><i class="fa-solid fa-rotate"></i></button></div></div>
        <div class="email-filtros">
          ${Object.entries(PASTAS_EMAIL).map(([id, [nome, ic]]) => `<button class="chip ${email.pasta === id ? 'ativo' : ''}" data-acao="email-pasta" data-id="${id}" title="${nome}"><i class="fa-solid ${ic}"></i><span>${nome}</span></button>`).join('')}
        </div>
        ${contas.length > 1 ? `<div class="email-filtros">
          <button class="chip ${!email.filtro ? 'ativo' : ''}" data-acao="email-filtro" data-id="">Todas</button>
          ${contas.map((x) => { const nl = email.entrada && (email.entrada.contas || []).find((k) => k.id === x.id); return `<button class="chip ${email.filtro === x.id ? 'ativo' : ''}" data-acao="email-filtro" data-id="${esc(x.id)}" title="${esc(nomeConta(x))}"><i class="ponto-conta ${corConta(x.id)}"></i><span>${esc(nomeConta(x).split('@')[0])}</span>${nl && nl.naoLidos ? ` <b>${nl.naoLidos}</b>` : ''}</button>`; }).join('')}
        </div>` : ''}
        <div id="email-lista" class="email-lista">${listaEmails()}</div>
        ${blocoContas()}
      </section>
      <section class="card leitor ${email.sel ? '' : 'sem-sel'}">${leitor()}</section>
    </div>`;
}

/* ---------- conta IMAP (Gmail, Yahoo...) ---------- */
const AJUDA_IMAP = {
    gmail: 'No Gmail a senha normal não funciona. Ative a <b>verificação em duas etapas</b> e crie uma <b>senha de app</b> (16 letras) em',
    yahoo: 'No Yahoo, crie uma <b>senha de app</b> em Segurança da conta:',
    icloud: 'No iCloud, crie uma <b>senha de app</b> em Iniciar sessão e segurança:',
    aol: 'Na AOL, crie uma <b>senha de app</b> em Segurança da conta:',
    zoho: 'No Zoho, crie uma <b>senha de app</b> (ou use a senha normal se não tiver verificação em duas etapas):',
    uol: 'No UOL, use a senha do email. Se não entrar, confira nas configurações do UOL Mail se o acesso por IMAP está liberado:',
    bol: 'No BOL, use a senha do email. Se não entrar, confira se o acesso por IMAP está liberado:',
    terra: 'No Terra, use a senha do email:',
    gmx: 'No GMX, ative o acesso por IMAP/POP nas configurações e use a senha do email:',
};
function modalContaImap(idConta) {
    const c = email.conta || {};
    const prov = c.provedores || {};
    const antiga = idConta ? contaDe(idConta) : null;
    const dominio = (e) => (c.dominios || {})[String(e).split('@')[1] || ''] || '';
    const inicial = antiga ? (dominio(antiga.email) || 'outro') : 'gmail';
    abrirModal(`
        <h2><i class="fa-solid fa-at"></i>${antiga ? 'Entrar de novo' : 'Adicionar conta de email'}</h2>
        <label class="f"><span>Provedor</span><select class="campo" name="provedor">${Object.entries(prov).map(([k, v]) => `<option value="${k}" ${k === inicial ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}<option value="outro" ${inicial === 'outro' ? 'selected' : ''}>Outro (IMAP)</option></select></label>
        <label class="f"><span>Endereço de email</span><input class="campo" name="email" type="email" required autocomplete="off" spellcheck="false" value="${esc(antiga ? antiga.email : '')}" ${antiga ? '' : 'autofocus'}></label>
        <label class="f"><span>Senha de app</span><input class="campo" name="senha" type="password" required autocomplete="new-password" spellcheck="false" ${antiga ? 'autofocus' : ''}></label>
        <p class="fraco ajuda-imap" style="font-size:12px;margin:0"></p>
        <div data-outro hidden>
          <div class="f2">
            <label class="f"><span>Servidor IMAP</span><input class="campo" name="imap" placeholder="imap.exemplo.com" spellcheck="false"></label>
            <label class="f"><span>Porta</span><input class="campo" name="imap_porta" value="993" inputmode="numeric"></label>
          </div>
          <div class="f2">
            <label class="f"><span>Servidor SMTP (envio)</span><input class="campo" name="smtp" placeholder="smtp.exemplo.com" spellcheck="false"></label>
            <label class="f"><span>Porta</span><input class="campo" name="smtp_porta" value="465" inputmode="numeric"></label>
          </div>
        </div>
        <label class="f"><span>Seu nome nos emails enviados (opcional)</span><input class="campo" name="nome" value="${esc(antiga ? antiga.nome : (D.perfil && D.perfil.nome) || '')}"></label>
        <p class="fraco" style="font-size:12px;margin:0"><i class="fa-solid fa-lock"></i> A senha fica só no seu PC, na pasta email-contas/ do Yggdrasil.</p>
        <p class="fraco erro-envio" hidden></p>
        <div class="modal-acoes">
          <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
          <button class="btn primario" value="ok"><i class="fa-solid fa-plug"></i> Conectar</button>
        </div>`, (fd, botao) => {
        conectarImap(fd, botao);
        return false;
    });
    const m = modal();
    const sel = $('select[name="provedor"]', m), em = $('input[name="email"]', m);
    const atualizar = () => {
        const p = sel.value;
        $('[data-outro]', m).hidden = p !== 'outro';
        $$('[data-outro] input[name="imap"], [data-outro] input[name="smtp"]', m).forEach((i) => { i.required = p === 'outro'; });
        const info = prov[p];
        $('.ajuda-imap', m).innerHTML = p === 'outro' || !info
            ? 'Procure "configurações IMAP" do seu provedor: ele informa os servidores e as portas. Use a senha do email ou uma senha de app.'
            : `${AJUDA_IMAP[p] || 'Use a senha de app do provedor:'} <a href="${esc(info.ajuda)}" target="_blank" rel="noopener noreferrer">${esc(info.ajuda.replace(/^https:\/\//, '').replace(/\/$/, ''))}</a>`;
    };
    sel.addEventListener('change', atualizar);
    em.addEventListener('change', () => { const d = dominio(em.value.trim().toLowerCase()); if (d) { sel.value = d; atualizar(); } });
    atualizar();
}
async function conectarImap(fd, botao) {
    const erroEl = $('.erro-envio', modal());
    const corpo = {};
    for (const k of ['provedor', 'email', 'senha', 'imap', 'imap_porta', 'smtp', 'smtp_porta', 'nome']) corpo[k] = String(fd.get(k) || '').trim();
    const html0 = botao ? botao.innerHTML : '';
    if (botao) { botao.disabled = true; botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testando…'; }
    erroEl.hidden = true;
    try {
        const r = await postApi('api/email/adicionar', corpo);
        email.conta = r;
        modal().close();
        aviso(`${corpo.email} conectado`);
        email.caixa = null;
        if (vistaAtual() !== 'email') location.hash = '#email'; else render(true);
        carregarCaixa();
    } catch (e) {
        if (botao) { botao.disabled = false; botao.innerHTML = html0; }
        erroEl.textContent = 'Não conectou: ' + e.message;
        erroEl.hidden = false;
        erroEl.style.color = 'var(--c5)';
    }
}

/* ---------- escrever / responder ---------- */
function lerArquivo(f) {
    return new Promise((ok, erro) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1] || '');
        r.onerror = () => erro(r.error);
        r.readAsDataURL(f);
    });
}
function modalEscrever(modo, original) {
    modo = modo || 'novo';
    const podem = contasEmail().filter((x) => x.podeEnviar && !x.expirou);
    if (!podem.length) {
        const so = contasEmail()[0];
        return aviso('Nenhuma conta liberada para enviar. Em Email › Contas, use "liberar envio".', so ? { rotulo: 'Liberar', fn: () => postApi('api/email/login', { conta: so.id }).then((c) => { email.conta = c; location.hash = '#email'; render(true); acompanharLogin(); }) } : null);
    }
    const m = original || {};
    const contaPadrao = m.conta && contaDe(m.conta) && contaDe(m.conta).podeEnviar ? m.conta : (email.filtro && contaDe(email.filtro) && contaDe(email.filtro).podeEnviar ? email.filtro : podem[0].id);
    const resposta = modo === 'responder' || modo === 'responderTodos';
    const titulo = { novo: 'Escrever email', responder: 'Responder', responderTodos: 'Responder a todos', encaminhar: 'Encaminhar' }[modo];
    const prefixo = resposta ? 'Re: ' : modo === 'encaminhar' ? 'Enc: ' : '';
    const assunto = m.assunto ? (new RegExp('^' + prefixo.trim(), 'i').test(m.assunto) ? m.assunto : prefixo + m.assunto) : '';
    let paraFixo = '';
    if (modo === 'responder') paraFixo = esc(m.de.nome || m.de.email);
    if (modo === 'responderTodos') {
        const eu = (contaDe(m.conta) || {}).email || '';
        paraFixo = [m.de].concat(m.para, m.cc).filter((p) => p && p.email && p.email.toLowerCase() !== eu.toLowerCase()).map((p) => esc(p.nome || p.email)).join(', ');
    }
    abrirModal(`
        <h2><i class="fa-solid ${modo === 'novo' ? 'fa-pen' : modo === 'encaminhar' ? 'fa-share' : 'fa-reply'}"></i>${titulo}</h2>
        ${podem.length > 1 || modo === 'novo' ? `<label class="f"><span>De</span><select class="campo" name="conta">${podem.map((x) => `<option value="${esc(x.id)}" ${x.id === contaPadrao ? 'selected' : ''}>${esc(nomeConta(x))}</option>`).join('')}</select></label>` : `<input type="hidden" name="conta" value="${esc(contaPadrao)}">`}
        ${resposta ? `<div class="f"><span>Para</span><div class="campo fixo">${paraFixo}</div></div>
          <label class="f"><span>Mais alguém? (opcional, separe por vírgula)</span><input class="campo" name="para" type="text" inputmode="email" spellcheck="false" autocomplete="email"></label>`
        : `<label class="f"><span>Para</span><input class="campo" name="para" type="text" inputmode="email" spellcheck="false" autocomplete="email" required placeholder="nome@exemplo.com, outro@exemplo.com" ${modo === 'encaminhar' || !m.assunto ? 'autofocus' : ''} value="${esc(m.paraInicial || '')}"></label>`}
        <details class="f-mais"><summary>Cc e Cco</summary>
          <div class="f2">
            <label class="f"><span>Cc</span><input class="campo" name="cc" type="text" inputmode="email" spellcheck="false"></label>
            <label class="f"><span>Cco (oculto)</span><input class="campo" name="cco" type="text" inputmode="email" spellcheck="false"></label>
          </div>
        </details>
        ${resposta ? `<div class="f"><span>Assunto</span><div class="campo fixo">${esc(assunto)}</div></div>` : `<label class="f"><span>Assunto</span><input class="campo" name="assunto" value="${esc(assunto)}" ${modo === 'encaminhar' ? 'readonly' : ''}></label>`}
        <label class="f"><span>Mensagem</span><textarea class="campo texto-email" name="texto" rows="9" ${resposta ? 'autofocus' : ''} placeholder="${resposta ? 'Sua resposta (o email original vai citado embaixo)' : modo === 'encaminhar' ? 'Um recado antes do email encaminhado (opcional)' : ''}"></textarea></label>
        <label class="f"><span>Anexos (até 3 MB no total)</span><input class="campo" type="file" name="anexos" multiple></label>
        <p class="fraco erro-envio" hidden></p>
        <div class="modal-acoes">
          <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
          <button class="btn primario" value="ok"><i class="fa-solid fa-paper-plane"></i> Enviar</button>
        </div>`, (fd, botao) => {
        enviarEmail(fd, modo, m, botao);
        return false;
    });
}
async function enviarEmail(fd, modo, original, botao) {
    const erroEl = $('.erro-envio', modal());
    const mostrarErro = (t) => { erroEl.textContent = t; erroEl.hidden = false; erroEl.style.color = 'var(--c5)'; };
    const arquivos = Array.from(fd.getAll('anexos')).filter((f) => f && f.size);
    const total = arquivos.reduce((s, f) => s + f.size, 0);
    if (total > 3 * 1024 * 1024) return mostrarErro(`Os anexos têm ${tamanho(total)}. O limite daqui é 3 MB; para mais, use o Outlook.`);
    const texto = String(fd.get('texto') || '');
    if (modo === 'novo' && !String(fd.get('assunto') || '').trim() && !confirm('Enviar sem assunto?')) return;
    if (!texto.trim() && modo !== 'encaminhar' && !arquivos.length && !confirm('Enviar sem mensagem?')) return;
    const original_html = botao ? botao.innerHTML : '';
    if (botao) { botao.disabled = true; botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…'; }
    try {
        const anexos = await Promise.all(arquivos.map(async (f) => ({ nome: f.name, tipo: f.type || 'application/octet-stream', base64: await lerArquivo(f) })));
        await postApi('api/email/enviar', {
            conta: fd.get('conta'), modo, id: original.id || '',
            para: String(fd.get('para') || ''), cc: String(fd.get('cc') || ''), cco: String(fd.get('cco') || ''),
            assunto: String(fd.get('assunto') || ''), texto, anexos,
        });
        modal().close();
        aviso(modo === 'encaminhar' ? 'Encaminhado' : modo === 'novo' ? 'Email enviado' : 'Resposta enviada');
        setTimeout(carregarCaixa, 1500);
    } catch (e) {
        if (botao) { botao.disabled = false; botao.innerHTML = original_html; }
        mostrarErro('Não foi: ' + e.message);
    }
}

/* ===================== importar / exportar ===================== */
function escolherArquivos(aceita, varios) {
    return new Promise((ok) => {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = aceita;
        i.multiple = !!varios;
        i.onchange = () => ok(Array.from(i.files || []));
        i.click();
    });
}
function exportar() {
    const blob = new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yggdrasil-backup-${hojeIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importarBackup() {
    const [f] = await escolherArquivos('.json,application/json');
    if (!f) return;
    try {
        const novo = JSON.parse(await f.text());
        if (!novo || !Array.isArray(novo.links)) throw new Error();
        if (!confirm('Trocar tudo o que está aqui pelo backup escolhido?')) return;
        D = normalizar(novo);
        aplicarTema(); salvar(true); render();
        aviso('Backup restaurado');
    } catch (e) { aviso('Esse arquivo não é um backup do Yggdrasil.'); }
}
async function importarHtml() {
    const arquivos = await escolherArquivos('.html,.htm,text/html', true);
    if (!arquivos.length) return;
    const existentes = new Set(D.links.map((l) => l.url.replace(/\/$/, '')));
    let novos = 0, gruposNovos = 0;
    const acharGrupo = (nome) => {
        nome = (nome || '').trim().slice(0, 40) || 'Importados';
        let g = D.grupos.find((x) => normal(x.nome) === normal(nome));
        if (!g) { g = { id: uid(), nome, icone: 'fa-folder' }; D.grupos.push(g); gruposNovos++; }
        return g.id;
    };
    for (const f of arquivos) {
        const doc = new DOMParser().parseFromString(await f.text(), 'text/html');
        const favoritos = /NETSCAPE-Bookmark/i.test(doc.documentElement.innerHTML.slice(0, 400)) || doc.querySelector('dt > h3');
        const tituloPag = (doc.title || f.name.replace(/\.html?$/i, '')).split('·').pop().trim();
        for (const a of doc.querySelectorAll('a[href]')) {
            const url = a.getAttribute('href');
            if (!/^https?:\/\//i.test(url)) continue;
            if (a.closest('footer, nav, header')) continue;
            const chave = url.replace(/\/$/, '');
            if (existentes.has(chave)) continue;
            let grupoNomeImp = tituloPag;
            if (favoritos) {
                const dl = a.closest('dl');
                const h3 = dl && dl.previousElementSibling && dl.previousElementSibling.tagName === 'H3' ? dl.previousElementSibling : dl && dl.parentElement && dl.parentElement.querySelector(':scope > h3');
                grupoNomeImp = h3 ? h3.textContent : 'Favoritos do navegador';
            }
            const nomeEl = a.querySelector('.name');
            const titulo = ((nomeEl ? nomeEl.textContent : a.textContent) || '').replace(/\s+/g, ' ').trim() || nomeDoSite(url);
            D.links.push({ id: uid(), titulo: titulo.slice(0, 80), url, grupo: acharGrupo(grupoNomeImp), tags: [], nota: '', fixo: false, cliques: 0, usado: 0, criado: Date.now() });
            existentes.add(chave);
            novos++;
        }
    }
    salvar(); render();
    aviso(novos ? `${novos} links importados${gruposNovos ? ` em ${gruposNovos} grupo(s) novo(s)` : ''}` : 'Nenhum link novo encontrado.');
}

/* ===================== eventos da página ===================== */
function ehCampo(el) {
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

document.addEventListener('click', (e) => {
    const t = e.target;

    // botão dentro de um link (editar no tile): não abre o link
    const acao = t.closest('[data-acao]');
    if (acao && acao.closest('a[data-link]') && acao !== acao.closest('a[data-link]')) e.preventDefault();

    if (acao) {
        const id = acao.dataset.id;
        switch (acao.dataset.acao) {
            case 'novo-link': return modalLink(null, { grupo: acao.dataset.grupo || (vistaAtual() === 'links' && D.grupos.some((g) => g.id === ui.grupo) ? ui.grupo : ''), fixo: acao.dataset.fixo === '1' });
            case 'editar-link': return modalLink(id);
            case 'apagar-link': return apagarLink(id);
            case 'fixar': return alternarFixo(id);
            case 'copiar': {
                const l = D.links.find((x) => x.id === id);
                if (navigator.clipboard) navigator.clipboard.writeText(l.url).then(() => aviso('Link copiado'), () => aviso(l.url));
                else aviso(l.url);
                return;
            }
            case 'novo-grupo': return modalGrupo();
            case 'editar-grupo': return modalGrupo(id);
            case 'novo-evento': return modalEvento(null, acao.dataset.data);
            case 'editar-evento': if (!t.closest('a')) modalEvento(id, acao.dataset.data); return;
            case 'apagar-tarefa': D.tarefas = D.tarefas.filter((x) => x.id !== id); salvar(); return render();
            case 'limpar-feitas': D.tarefas = D.tarefas.filter((x) => !x.feita); salvar(); return render();
            case 'trocar-tema': return trocarTema();
            case 'copiar-endereco': return copiarTexto(acao.dataset.url);
            case 'testar-aviso':
                if (!('Notification' in window)) return aviso('Este navegador não mostra notificações.');
                if (Notification.permission !== 'granted') { Notification.requestPermission().then((p) => { if (p === 'granted') notificar('Yggdrasil', 'As notificações estão funcionando.', 'ygg-teste'); else aviso('O navegador bloqueou as notificações.'); }); return; }
                notificar('Yggdrasil', 'As notificações estão funcionando.', 'ygg-teste');
                return aviso('Notificação enviada.');
            case 'app-config': try { window.YggApp.configurar(); } catch (e) { /* fora do app */ } return;
            case 'tema-modo': D.ajustes.modo = acao.dataset.modo; aplicarTema(); salvar(); return render();
            case 'apagar-exemplos': {
                const antes = D.links.slice();
                D.links = D.links.filter((l) => !l.exemplo);
                salvar(); render();
                return aviso('Exemplos apagados', { rotulo: 'Desfazer', fn: () => { D.links = antes; salvar(); render(); } });
            }
            case 'exportar': return exportar();
            case 'importar-backup': return importarBackup();
            case 'importar-html': return importarHtml();
            case 'salvar-ics': D.ajustes.icsUrl = $('#aj-ics').value.trim(); limparIcs(); salvar(true); render(); return aviso(D.ajustes.icsUrl ? 'Agenda externa salva' : 'Link removido');
            case 'tirar-ics': D.ajustes.icsUrl = ''; limparIcs(); salvar(); return render();
            case 'email-login':
                postApi('api/email/login', { conta: acao.dataset.conta || '' }).then((c) => { email.conta = c; render(true); acompanharLogin(); }).catch((e) => aviso('Não deu para iniciar o login: ' + e.message));
                return;
            case 'email-imap': return modalContaImap(acao.dataset.conta || null);
            case 'email-cancelar':
                postApi('api/email/cancelar').then((c) => { email.conta = c; clearTimeout(email.timerLogin); render(true); });
                return;
            case 'email-sair': {
                const cx = contaDe(acao.dataset.conta);
                if (!cx || !confirm(`Tirar a conta ${nomeConta(cx)} deste perfil do Yggdrasil? (Nada é apagado no Outlook.)`)) return;
                postApi('api/email/sair', { conta: cx.id }).then((c) => {
                    email.conta = c;
                    if (email.filtro === cx.id) email.filtro = '';
                    if (email.sel && email.sel.startsWith(cx.id + '|')) { email.sel = null; email.msg = null; }
                    if (c.conectado) carregarCaixa(); else { email.entrada = email.caixa = null; }
                    render(true); atualizarEmailNaTela(true);
                });
                return;
            }
            case 'email-atualizar': carregarCaixa(); return aviso('Atualizando…');
            case 'email-imagens': email.imagens = true; return render(true);
            case 'email-pasta': email.pasta = acao.dataset.id; email.sel = null; email.msg = null; email.caixa = null; render(true); return carregarCaixa();
            case 'email-filtro': email.filtro = acao.dataset.id; email.sel = null; email.msg = null; email.caixa = null; render(true); return carregarCaixa();
            case 'email-mover': return acaoEmail(acao.dataset.qual);
            case 'email-escrever': return modalEscrever('novo');
            case 'email-resumo': email.sel = null; email.msg = null; if (vistaAtual() !== 'email') return; return render(true);
            case 'ia-gerar': return gerarResumoIa(acao.dataset.parcial === '1');
            case 'ia-salvar': {
                const corpo = { hora: $('#ia-hora').value, intervalo: +$('#ia-intervalo').value, modelo: $('#ia-modelo').value.trim(), ligado: $('#ia-ligado').checked, consentimento: $('#ia-consentimento').checked };
                const chave = $('#ia-chave').value.trim();
                if ((chave || corpo.ligado) && !corpo.consentimento) return aviso('Marque que você entende o envio dos emails ao Google antes de salvar.');
                if (chave) corpo.gemini_key = chave;
                postApi('api/ia/config', corpo).then((r) => { email.ia.config = r.config; render(); aviso('Resumo com IA salvo'); }).catch((e) => aviso('Não salvou: ' + e.message));
                return;
            }
            case 'ia-tirar':
                if (!confirm('Tirar a chave do Gemini? O compilado diário para.')) return;
                postApi('api/ia/config', { gemini_key: '' }).then((r) => { email.ia.config = r.config; render(); aviso('Chave removida'); });
                return;
            case 'email-escuro': D.ajustes.emailEscuro = !D.ajustes.emailEscuro; salvar(); return render(true);
            case 'email-responder': if (email.msg && !email.msg.erro) modalEscrever(acao.dataset.modo, email.msg); return;
            case 'email-anexo': if (email.msg) baixarAnexo(email.msg.conta, email.msg.id, acao.dataset.id, acao.dataset.nome); return;
            case 'copiar-codigo':
                if (navigator.clipboard) navigator.clipboard.writeText(acao.dataset.codigo).then(() => aviso('Código copiado'));
                return;
            case 'novo-perfil': return modalPerfil(null);
            case 'editar-perfil': return modalPerfil(id);
            case 'trocar-perfil': return trocarPerfil();
            case 'zerar':
                if (!confirm('Apagar mesmo TODOS os links, eventos, tarefas e notas?')) return;
                Object.assign(D, { links: [], grupos: [], eventos: [], tarefas: [], notas: '' });
                salvar(); render(); return aviso('Tudo apagado');
        }
    }

    const em = t.closest('[data-email]');
    if (em) return abrirEmail(em.dataset.email);

    const link = t.closest('a[data-link]');
    if (link) { registrarClique(link.dataset.link); return; }

    const col = t.closest('[data-colecao]');
    if (col) { ui.colecao = col.dataset.colecao; lsSet('yggColecao', ui.colecao); return render(); }
    const gr = t.closest('[data-grupo]');
    if (gr && gr.classList.contains('grupo-item')) { ui.grupo = gr.dataset.grupo; ui.tag = ''; return render(); }
    const tag = t.closest('[data-tag]');
    if (tag) { ui.tag = ui.tag === tag.dataset.tag ? '' : tag.dataset.tag; return render(); }
    const aba = t.closest('[data-aba]');
    if (aba) { ui.abaTarefas = aba.dataset.aba; lsSet('yggAba', ui.abaTarefas); return render(); }
    const tema = t.closest('[data-tema]');
    if (tema && tema.classList.contains('tema-op')) { D.ajustes.tema = tema.dataset.tema; aplicarTema(); salvar(); return render(); }

    const mes = t.closest('[data-mes]');
    if (mes) {
        const n = +mes.dataset.mes, atual = ui.mes || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        ui.mes = n === 0 ? null : new Date(atual.getFullYear(), atual.getMonth() + n, 1);
        if (n === 0) ui.diaSel = hojeIso();
        return render();
    }
    const irDia = t.closest('[data-ir-dia]');
    if (irDia) { ui.diaSel = irDia.dataset.irDia; const d = deIso(ui.diaSel); ui.mes = new Date(d.getFullYear(), d.getMonth(), 1); location.hash = '#agenda'; return; }
    const dia = t.closest('[data-dia]');
    if (dia) {
        ui.diaSel = dia.dataset.dia;
        return render();
    }
    const res = t.closest('.resultado');
    if (res) return escolherResultado(+res.dataset.i);

    if (!t.closest('.busca')) { const r = $('#resultados'); if (r) r.hidden = true; }
});

document.addEventListener('dblclick', (e) => {
    const dia = e.target.closest('[data-dia]');
    if (dia) modalEvento(null, dia.dataset.dia);
});

document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'busca') { ui.filtro = t.value; ui.selBusca = 0; mostrarResultados(); }
    if (t.id === 'filtro') { ui.filtro = t.value; render(); }
    if (t.id === 'notas') { D.notas = t.value; salvar(); }
    if (t.id === 'aj-nome') { D.perfil.nome = t.value; salvar(); }
});

document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.tarefa) {
        const x = D.tarefas.find((y) => y.id === t.dataset.tarefa);
        x.feita = t.checked;
        salvar();
        setTimeout(render, 120);
    }
    if (t.id === 'ordem') { ui.ordem = t.value; lsSet('yggOrdem', t.value); render(); }
    if (t.id === 'aj-buscador') { D.ajustes.buscador = t.value; salvar(); }
    if (t.id === 'aj-novaaba') { D.ajustes.novaAba = t.checked; salvar(); }
    if (t.id === 'aj-rede') {
        postApi('api/rede', { ligada: t.checked }).then((r) => { rede = r; render(true); aviso(r.rede ? 'Rede ligada' : 'Rede desligada: só este PC'); })
            .catch((e) => { t.checked = !t.checked; aviso(e.message || 'Não deu para mudar'); });
    }
    if (t.id === 'aj-preto') { D.ajustes.preto = t.checked; aplicarTema(); salvar(); }
    if (t.id === 'aj-icones') { D.ajustes.icones = t.checked; salvar(); }
    if (t.id === 'aj-avisomin') { D.ajustes.avisoMin = +t.value; salvar(); }
    if (t.id === 'aj-avisos-email') { D.ajustes.avisosEmail = t.checked; salvar(); }
    if (t.id === 'aj-avisos-compilado') { D.ajustes.avisosCompilado = t.checked; salvar(); }
    if (t.id === 'aj-avisos') {
        D.ajustes.avisos = t.checked;
        salvar();
        render(true);
        if (t.checked && 'Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission().then((p) => { if (p !== 'granted') aviso('O navegador bloqueou as notificações.'); });
        }
    }
});

document.addEventListener('submit', (e) => {
    if (e.target.dataset.form === 'tarefa') {
        e.preventDefault();
        const i = $('#nova-tarefa'), texto = i.value.trim();
        if (!texto) return;
        D.tarefas.push({ id: uid(), texto, feita: false });
        salvar();
        render();
        $('#nova-tarefa').focus();
    }
});

document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.id === 'busca') {
        const box = $('#resultados'), n = box && box._itens ? box._itens.length : 0;
        if (e.key === 'ArrowDown' && n) { e.preventDefault(); ui.selBusca = (ui.selBusca + 1) % n; mostrarResultados(); }
        else if (e.key === 'ArrowUp' && n) { e.preventDefault(); ui.selBusca = (ui.selBusca - 1 + n) % n; mostrarResultados(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (ui.filtro.trim()) { mostrarResultados(); escolherResultado(ui.selBusca); } }
        else if (e.key === 'Escape') { ui.filtro = ''; t.value = ''; box.hidden = true; t.blur(); }
        return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && (t.matches('[data-dia]') || t.matches('.evento[role="button"]'))) { e.preventDefault(); t.click(); return; }
    if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); location.hash = '#' + ['inicio', 'links', 'agenda', 'email', 'ajustes'][+e.key - 1]; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focarBusca(); return; }
    if (ehCampo(t) || e.ctrlKey || e.metaKey || e.altKey || modal().open) return;
    if (vistaAtual() === 'email' && email.conta && email.conta.conectado) {
        const k = e.key.toLowerCase();
        const aberto = email.msg && !email.msg.erro && !email.carregandoMsg;
        const pode = aberto && (contaDe(email.msg.conta) || {}).podeEnviar;
        if (k === 'c') { e.preventDefault(); return modalEscrever('novo'); }
        if (k === 'r' && pode) { e.preventDefault(); return modalEscrever(e.shiftKey ? 'responderTodos' : 'responder', email.msg); }
        if (k === 'f' && pode) { e.preventDefault(); return modalEscrever('encaminhar', email.msg); }
        if (k === 'a' && aberto && email.pasta !== 'arquivo') { e.preventDefault(); return acaoEmail('arquivar'); }
        if (e.key === 'Delete' && aberto) { e.preventDefault(); return acaoEmail(email.pasta === 'lixeira' ? 'apagar' : 'lixeira'); }
    }
    if (e.key === '/') { e.preventDefault(); focarBusca(); }
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); modalLink(null); }
    else if (e.key.toLowerCase() === 'e') { e.preventDefault(); modalEvento(null, vistaAtual() === 'agenda' ? ui.diaSel : hojeIso()); }
    else if (e.key.toLowerCase() === 't') trocarTema();
});
function focarBusca() {
    if (vistaAtual() === 'links') { const f = $('#filtro'); if (f) f.focus(); return; }
    if (vistaAtual() !== 'inicio') { location.hash = '#inicio'; setTimeout(() => $('#busca') && $('#busca').focus(), 30); return; }
    $('#busca').focus();
}

// Colar um link em qualquer lugar (fora de campos) já abre o "novo link"
document.addEventListener('paste', (e) => {
    if (ehCampo(e.target) || modal().open) return;
    const texto = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (!pareceUrl(texto)) return;
    e.preventDefault();
    modalLink(null, { url: arrumarUrl(texto), grupo: vistaAtual() === 'links' && D.grupos.some((g) => g.id === ui.grupo) ? ui.grupo : '' });
});

modal().addEventListener('click', (e) => { if (e.target === modal()) modal().close(); });

window.addEventListener('hashchange', () => { ui.filtro = ''; ui.tag = ''; render(); $('#vista').focus({ preventScroll: true }); window.scrollTo(0, 0); });
let timerGrade;
window.addEventListener('resize', () => { clearTimeout(timerGrade); timerGrade = setTimeout(desenharGrade, 150); });
document.addEventListener('visibilitychange', conferirRemoto);
window.addEventListener('focus', conferirRemoto);

/* ===================== início ===================== */
(async function iniciar() {
    $('[data-pixel="arvore"]').innerHTML = arvoreSvg();
    trocarFavicon();
    desenharGrade();
    await carregar();
    aplicarTema();
    mostrarAvatarLateral();
    render();
    let ultimoDia = hojeIso();
    setInterval(() => {
        tique();
        if (hojeIso() !== ultimoDia) { ultimoDia = hojeIso(); render(true); } // virou o dia
    }, 1000);
    setInterval(() => { conferirLembretes(); if (vistaAtual() === 'inicio' && !ehCampo(document.activeElement) && !modal().open) render(true); }, 60000);
    conferirLembretes();
    if (window.YggApp && perfilAtual) { try { window.YggApp.perfil(perfilAtual.id, pinAtual || ''); } catch (e) { /* app antigo */ } }
    conferirAnuncio(); setInterval(conferirAnuncio, 60000);
    if (modoServidor) { carregarContaEmail(); setInterval(() => { if (email.conta && email.conta.conectado) carregarCaixa(); }, 120000); }
})();
})();
