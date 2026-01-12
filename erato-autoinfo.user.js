// ==UserScript==
// @name         AutoInfo Erato - Discord notifier
// @namespace    http://tampermonkey.net/
// @version      0.2.12
// @description  Powiadomienia o herosach/tytanach/kolosach + wybór przy znalezieniu + auto po zabiciu
// @author       Silasik (refaktoryzacja + modyfikacja: community)
// @match        https://aldous.margonem.pl/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=discord.com
// @grant        none
// @run-at       document-idle
// @updateURL    https://erato-autoinfo.user.js
// @downloadURL  https://erato-autoinfo.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        additionalNpcs: [
            'Ogromna płomiennica tląca',
            'Ogromna dzwonkówka tarczowata',
            'Ogromny szpicak ponury',
            'Ogromny bulwiak pospolity',
            'Ogromny mroźlarz',
            'Tropiciel Herosów',
            'Wtajemniczony Tropiciel Herosów',
            'Doświadczony Tropiciel Herosów'
        ],
       roleMap: {
            kolos: {
                'Wernoradzki Drakolisz': '<@&1197640767238328391>',
                'Reuzen': '<@&1197640824398303332>',
                // ... reszta Twoich kolosów ...
                'default': '<@&1080566825009545308>'
            },
            tytan: {
                'Renegat Baulus': '<@&1080957767126352002>',
                // ... reszta tytanów ...
                'default': '<@&1197697280057286697>'
            },
            heros: {
                'Młody Smok': '<@&943483659674062868>',
                'Tepeyollotl': '<@&943483554371883028>',
                'Negthotep Czarny Kapłan': '<@&943483616250458133>',
                'Dęborożec': '<@&943483475883864104>',
                'Vapor Veneno': '<@&943483418564513883>',
                'Demonis Pan Nicości': '<@&943483369017188442>',
                'Mulher Ma': '<@&943483314050834502>',
                'Viviana Nandin': '<@&943483252138713089>',
                'Święty Braciszek': '<@&943483200288723024>',
                'Czarująca Atalia': '<@&943483128385769513>',
                'Obłąkany Łowca Orków': '<@&943483058143756288>',
                'Lichwiarz Grauhaz': '<@&943482663837237268>',
                'Książę Kasim': '<@&941030407145680907>',
                'Baca bez Łowiec': '<@&941031570226163742>',
                'Kochanka Nocy': '<@&941030305706434581>',
                'Koziec Mąciciel Ścieżek': '<@&1177529620732579900>',
                'Piekielny Kościej': '<@&941030105449386015>',
                'Opętany Paladyn': '<@&941030217923838022>',
                'Zły Przewodnik': '<@&941028976174989383>',
                'Złodziej': '<@&787061674649583696>',
                'Karmazynowy Mściciel': '<@&787061889006829600>',
                'Mroczny Patryk': '<@&787061821089251378>',
                'Domina Ecclesiae': '<@&941043415620149298>',
                'Mietek Żul': '<@&1458945864394346507>',
                'Złoty Roger': '<@&1351687307190730772>',
                'Przeraza': '<@&1430943619228897401>',
                'default': '<@&1079817947842879608>'
            },
            other: {
                'Tropiciel Herosów': '<@&1197699297588826112>',
                'Wtajemniczony Tropiciel Herosów': '<@&1197699303783805018>',
                'Doświadczony Tropiciel Herosów': '<@&1197699306182946947>',
                'default': '<@&1197697392485617744>'
            }
        },
        defaultSettings: {
            webhookUrl: 'https://discord.com/api/webhooks/1393891497186951178/D6vxD7O7kpooQpy0ttsP63FXWA83JG7ZtJGQGgcx2INTscl8Z5lQtsQA9_3rbBLScbJN',
            webhookUrlKol: 'https://discord.com/api/webhooks/1393891497186951178/D6vxD7O7kpooQpy0ttsP63FXWA83JG7ZtJGQGgcx2INTscl8Z5lQtsQA9_3rbBLScbJN',
            webhookUrlTyt: 'https://discord.com/api/webhooks/1393891497186951178/D6vxD7O7kpooQpy0ttsP63FXWA83JG7ZtJGQGgcx2INTscl8Z5lQtsQA9_3rbBLScbJN',
            name: ''
        }
    };

    let settings = { ...CONFIG.defaultSettings };
    let trackedBosses = new Map(); // id → {npc, mapData, playerNick}
    let checkBossTimer = null;

    function loadSettings() {
        const saved = localStorage.getItem('heroes-discord-v2');
        if (saved) Object.assign(settings, JSON.parse(saved));
    }

    loadSettings();

    // ────────────────────────────────────────────────────────────────
    // Pomocnicze funkcje (bez zmian)
    // ────────────────────────────────────────────────────────────────
    const isNI = () => document.cookie.includes('interface=ni');
    const getCurrentHeroNick = () => isNI() ? Engine.hero.nick : hero.nick;
    const getWorldName = () => {
        const name = isNI() ? Engine.worldConfig.getWorldName() : g.worldConfig.getWorldName();
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const getNpcType = npc => {
        const wt = npc.wt;
        const isKolosMode = (isNI() ? Engine.map.d.mode : map.mode) === 5;
        if (wt > 99 && isKolosMode) return 'kolos';
        if (wt > 99) return 'tytan';
        if (wt > 79) return 'heros';
        if (CONFIG.additionalNpcs.includes(npc.nick)) return 'other';
        return null;
    };

    const getRole = npc => {
        const type = getNpcType(npc);
        if (!type) return '@here';
        const map = CONFIG.roleMap[type];
        if (!map) return '@here';
        return map[npc.nick] || map['default'];
    };

    const getWebhook = npc => {
        const type = getNpcType(npc);
        const s = settings;
        if (type === 'kolos') return s.webhookUrlKol;
        if (type === 'tytan') return s.webhookUrlTyt;
        return s.webhookUrl;
    };

    // ────────────────────────────────────────────────────────────────
    // Wysyłanie na Discord (bez zmian)
    // ────────────────────────────────────────────────────────────────
    async function sendToDiscord(nick, npc, mapData, isKilled = false) {
        const webhook = getWebhook(npc);
        if (!webhook) return;

        let role = getRole(npc);
        if (isKilled) {
            role = '';
        }

        const typeName = { heros: 'Heros', tytan: 'Tytan', kolos: 'Kolos', other: '' }[getNpcType(npc)] || '';
        const server = getWorldName();
        const coords = `(${npc.x}, ${npc.y})`;

        let file;
        try {
            const imgUrl = 'https://micc.garmory-cdn.cloud/obrazki/npc/' + npc.icon;
            const blob = await fetch(imgUrl).then(r => r.blob());
            file = new File([blob], 'npc.gif');
        } catch {}

        const formData = new FormData();
        if (file) formData.append('files[0]', file);

        let content, title, description, color;

        if (isKilled) {
            content = `**${typeName} ZABITY!**`;
            title = `~~${nick} zabił ${typeName.toLowerCase() || 'npca'}~~`;
            description = `~~${npc.nick} - ${mapData.name} ${coords} - ${server}~~`;
            color = 0x2e7d32;
        } else {
            content = `**${role} ${typeName}:**`;
            title = `${nick} znalazł ${typeName.toLowerCase() || 'npca'}!`;
            description = `${npc.nick} - ${mapData.name} ${coords} - ${server}`;
            color = typeName === 'Heros' ? 0x800080 : 0x800000;
        }

        formData.append('payload_json', JSON.stringify({
            content,
            embeds: [{
                color,
                title,
                description,
                ...(file ? { thumbnail: { url: 'attachment://npc.gif' } } : {}),
                timestamp: new Date().toISOString()
            }]
        }));

        try {
            await fetch(webhook, { method: 'POST', body: formData });
        } catch (err) {
            console.error('Błąd wysyłania:', err);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Okienko wyboru przy znalezieniu (bez zmian)
    // ────────────────────────────────────────────────────────────────
    function showSpawnChoice(npc, mapData, playerNick) {
        const type = getNpcType(npc) || 'npc';
        const typeName = {
            heros: 'HEROS',
            tytan: 'TYTAN',
            kolos: 'KOLOS',
            other: 'SPECJALNY NPC'
        }[type] || 'NPC';

        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '100002',
            background: 'rgba(25,18,12,0.96)',
            border: '3px solid #b8860b',
            borderRadius: '10px',
            padding: '20px 30px',
            color: '#f0e0b0',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '15px',
            textAlign: 'center',
            minWidth: '400px',
            maxWidth: '500px',
            boxShadow: '0 0 28px rgba(0,0,0,0.98)',
            pointerEvents: 'auto',
            opacity: '0',
            transition: 'opacity 0.7s ease-in-out'
        });

        container.innerHTML = `
            <div style="margin-bottom:14px;">
                <img src="https://micc.garmory-cdn.cloud/obrazki/npc/${npc.icon}"
                     style="height:68px; border:2px solid #8b5a2b; border-radius:7px; vertical-align:middle; background:#111;">
            </div>
            <div style="font-weight:bold; color:#ffd700; font-size:20px; margin-bottom:10px;">
                ${typeName} ZNALEZIONY!
            </div>
            <div style="font-weight:bold; font-size:18px; margin:8px 0;">
                ${npc.nick}
            </div>
            <div style="font-size:14px; color:#d4c090; margin-bottom:16px;">
                ${mapData.name} (${npc.x}, ${npc.y})
            </div>
            <div style="font-size:13px; color:#a89b7e; margin-bottom:24px;">
                zgłosił: ${playerNick}
            </div>
            <div style="display:flex; justify-content:center; gap:30px;">
                <button id="btn-send" style="
                    background: linear-gradient(#2e7d32, #1b5e20);
                    color: white;
                    border: none;
                    padding: 14px 40px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 16px;
                    min-width: 180px;
                ">Wyślij na DC</button>

                <button id="btn-cancel" style="
                    background: linear-gradient(#c62828, #8b0000);
                    color: white;
                    border: none;
                    padding: 14px 40px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 16px;
                    min-width: 180px;
                ">Nie wysyłaj</button>
            </div>
        `;

        document.body.appendChild(container);
        setTimeout(() => container.style.opacity = '1', 30);

        container.querySelector('#btn-send').onclick = () => {
            sendToDiscord(playerNick, npc, mapData, false);
            trackedBosses.set(npc.id, { npc, mapData, playerNick });
            startOrUpdateKillChecker();
            container.remove();
        };

        container.querySelector('#btn-cancel').onclick = () => {
            container.remove();
        };
    }

    // ────────────────────────────────────────────────────────────────
    // Timer sprawdzający zabicie (tylko dla zaakceptowanych)
    // ────────────────────────────────────────────────────────────────
    function startOrUpdateKillChecker() {
        if (checkBossTimer) clearInterval(checkBossTimer);

        checkBossTimer = setInterval(() => {
            if (trackedBosses.size === 0) {
                clearInterval(checkBossTimer);
                checkBossTimer = null;
                return;
            }

            for (const [id, data] of trackedBosses.entries()) {
                const bossExists = isNI()
                    ? !!Engine.npcs.getById(id)
                    : !!g.npc?.[id];

                if (!bossExists) {
                    sendToDiscord(data.playerNick, data.npc, data.mapData, true);
                    trackedBosses.delete(id);
                }
            }

            if (trackedBosses.size === 0) {
                clearInterval(checkBossTimer);
                checkBossTimer = null;
            }
        }, 6000);
    }

// ────────────────────────────────────────────────────────────────
// Ikonka statusu – PPM do okienka + przesuwalne oba elementy + zapamiętywanie pozycji
// ────────────────────────────────────────────────────────────────
function addScriptStatusIcon() {
    if (document.getElementById('erato-status-icon')) return;

    const icon = document.createElement('div');
    icon.id = 'erato-status-icon';
    icon.innerHTML = '💚✨';
    icon.title = 'AutoInfo Erato działa\nPrzeciągnij LPM\nPPM: status';

    Object.assign(icon.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '2147483647',
        fontSize: '36px',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        textShadow: '0 0 12px #00ff9d',
        transition: 'transform 0.25s, opacity 0.25s',
        opacity: '0.92',
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,0.5)',
        borderRadius: '50%',
        padding: '8px',
        lineHeight: '1'
    });

    // Ładowanie pozycji ikonki
    const savedIconPos = localStorage.getItem('erato-icon-pos');
    if (savedIconPos) {
        const [top, left] = savedIconPos.split(',');
        icon.style.top = top;
        icon.style.left = left;
        icon.style.right = 'auto';
    }

    // Puls
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
        #erato-status-icon { animation: pulse 3.5s infinite; }
    `;
    document.head.appendChild(style);

    // Przesuwanie ikonki (LPM)
    let isDraggingIcon = false;
    let iconStartX, iconStartY, iconInitialX, iconInitialY;

    const iconDown = (e) => {
        if (e.button !== 0 && e.type !== 'touchstart') return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingIcon = true;

        const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
        const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);

        iconStartX = clientX;
        iconStartY = clientY;
        iconInitialX = icon.offsetLeft;
        iconInitialY = icon.offsetTop;

        icon.style.cursor = 'grabbing';
        icon.style.transform = 'scale(1.35)';
        icon.style.opacity = '1';
        icon.style.pointerEvents = 'none';
    };

    const iconMove = (e) => {
        if (!isDraggingIcon) return;
        e.preventDefault();

        const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
        const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);

        const deltaX = clientX - iconStartX;
        const deltaY = clientY - iconStartY;

        icon.style.left = (iconInitialX + deltaX) + 'px';
        icon.style.top = (iconInitialY + deltaY) + 'px';
        icon.style.right = 'auto';
    };

    const iconUp = () => {
        if (!isDraggingIcon) return;
        isDraggingIcon = false;

        icon.style.cursor = 'grab';
        icon.style.transform = 'scale(1)';
        icon.style.opacity = '0.92';
        icon.style.pointerEvents = 'auto';

        const rect = icon.getBoundingClientRect();
        localStorage.setItem('erato-icon-pos', `${rect.top}px,${rect.left}px`);
    };

    icon.addEventListener('mousedown', iconDown);
    icon.addEventListener('touchstart', iconDown, { passive: false });
    document.addEventListener('mousemove', iconMove, { passive: false });
    document.addEventListener('touchmove', iconMove, { passive: false });
    document.addEventListener('mouseup', iconUp);
    document.addEventListener('touchend', iconUp);
    document.addEventListener('mouseleave', iconUp);

    // PPM (contextmenu) – ładne okienko statusu (też przesuwalne!)
    icon.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const oldWin = document.getElementById('erato-status-window');
        if (oldWin) oldWin.remove();

        const win = document.createElement('div');
        win.id = 'erato-status-window';
        Object.assign(win.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: '9999998',
            background: 'rgba(20,15,10,0.97)',
            border: '2px solid #b8860b',
            borderRadius: '10px',
            padding: '18px 26px',
            color: '#f0e0b0',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            boxShadow: '0 0 24px rgba(0,0,0,0.9)',
            minWidth: '320px',
            maxWidth: '400px',
            pointerEvents: 'auto',
            opacity: '0',
            transition: 'opacity 0.4s ease',
            cursor: 'grab'
        });

        // Ładowanie pozycji okienka
        const savedWinPos = localStorage.getItem('erato-window-pos');
        if (savedWinPos) {
            const [top, left] = savedWinPos.split(',');
            win.style.top = top;
            win.style.left = left;
            win.style.right = 'auto';
        }

        win.innerHTML = `
            <div style="font-weight:bold; color:#ffd700; font-size:19px; margin-bottom:14px; text-align:center;">
                AutoInfo Erato
            </div>
            <div style="margin-bottom:10px;"><strong>Wersja:</strong> 0.2.12</div>
            <div style="margin-bottom:10px;"><strong>Śledzonych bossów:</strong> ${trackedBosses.size}</div>
            <div style="margin-bottom:10px;"><strong>Status:</strong> ${trackedBosses.size > 0 ? 'Aktywnie śledzę spawn' : 'Czekam na nowego bossa'}</div>
            <div style="font-size:12px; color:#a89b7e; text-align:center; margin-top:16px;">
                Przeciągnij okienko myszką, aby zmienić pozycję
            </div>
            <div style="text-align:center; margin-top:18px;">
                <button id="close-status" style="
                    background: linear-gradient(#c62828, #8b0000);
                    color: white;
                    border: none;
                    padding: 10px 32px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: bold;
                ">Zamknij</button>
            </div>
        `;

        document.body.appendChild(win);
        setTimeout(() => win.style.opacity = '1', 10);

        // Przesuwanie okienka (LPM)
        let isDraggingWin = false;
        let winStartX, winStartY, winInitialX, winInitialY;

        const winDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            isDraggingWin = true;

            winStartX = e.clientX;
            winStartY = e.clientY;
            winInitialX = win.offsetLeft;
            winInitialY = win.offsetTop;

            win.style.cursor = 'grabbing';
            win.style.transform = 'scale(1.03)';
        };

        const winMove = (e) => {
            if (!isDraggingWin) return;
            e.preventDefault();

            const deltaX = e.clientX - winStartX;
            const deltaY = e.clientY - winStartY;

            win.style.left = (winInitialX + deltaX) + 'px';
            win.style.top = (winInitialY + deltaY) + 'px';
        };

        const winUp = () => {
            if (!isDraggingWin) return;
            isDraggingWin = false;
            win.style.cursor = 'default';
            win.style.transform = 'scale(1)';

            const rect = win.getBoundingClientRect();
            localStorage.setItem('erato-window-pos', `${rect.top}px,${rect.left}px`);
        };

        win.addEventListener('mousedown', winDown);
        document.addEventListener('mousemove', winMove);
        document.addEventListener('mouseup', winUp);

        win.querySelector('#close-status').onclick = () => {
            win.style.opacity = '0';
            setTimeout(() => win.remove(), 500);
        };
    });

    document.body.appendChild(icon);
    console.log('Dodano przesuwalną ikonkę i przesuwalne okienko statusu (PPM)');
}

// Uruchamiamy z opóźnieniem
setTimeout(addScriptStatusIcon, 2000);
    // ────────────────────────────────────────────────────────────────
    // Główna logika wykrywania (bez zmian)
    // ────────────────────────────────────────────────────────────────
    function handleNewNpc(npc) {
        if (!getNpcType(npc)) return;
        const playerNick = settings.name.trim() || getCurrentHeroNick();
        const mapData = isNI() ? Engine.map.d : map;

        showSpawnChoice(npc, mapData, playerNick);
    }

    // ────────────────────────────────────────────────────────────────
    // Nasłuchiwanie (bez zmian)
    // ────────────────────────────────────────────────────────────────
    if (isNI()) {
        if (!window.Engine?.npcs?.check) {
            setTimeout(() => location.reload(), 400);
            return;
        }
        API.addCallbackToEvent('newNpc', npcObj => {
            if (npcObj?.d) handleNewNpc(npcObj.d);
        });
    } else {
        if (typeof window.newNpc === 'function') {
            const originalNewNpc = window.newNpc;
            window.newNpc = function(data) {
                originalNewNpc.apply(this, arguments);
                if (data && typeof data === 'object') {
                    setTimeout(() => {
                        Object.values(data).forEach(npc => {
                            if (npc && typeof npc === 'object' && npc.id) {
                                handleNewNpc(npc);
                            }
                        });
                    }, 30);
                }
            };
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Testowe funkcje – rozbudowane
    // ────────────────────────────────────────────────────────────────
    window.test = {
        full: (name = "Wernoradzki Drakolisz", lvl = 300, typ = "kolos") => {
            console.clear();
            console.log(`\n=== PEŁNY TEST: ${name} (${typ.toUpperCase()}) ===\n`);
            const wt = typ === 'kolos' ? 150 : typ === 'tytan' ? 120 : typ === 'heros' ? 90 : 0;
            const mode = typ === 'kolos' ? 5 : 3;

            if (isNI()) Engine.map.d.mode = mode;
            else if (window.map) window.map.mode = mode;

            const fakeNpc = {
                nick: name,
                lvl: lvl,
                wt: wt,
                x: 123,
                y: 45,
                icon: '1.gif',
                id: 999999 + Math.floor(Math.random() * 10000)
            };

            console.log("1. Symuluję pojawienie się bossa...");
            handleNewNpc(fakeNpc);

            console.log("\nInstrukcja:");
            console.log("  • Pojawi się okienko z wyborem");
            console.log("  • Kliknij 'Wyślij na DC' → aktywuje śledzenie i wysyła znaleziony");
            console.log("  • Kliknij 'Nie wysyłaj' → pomija śledzenie zabicia");
            console.log("  • Po zaakceptowaniu możesz wywołać test.kill() lub poczekać 6–12s");
        },

        spawn: (name = "Testowy Heros", lvl = 120, typ = "heros") => {
            console.clear();
            console.log(`\n=== TEST ZNALEZIENIA: ${name} (${typ.toUpperCase()}) ===\n`);
            const wt = typ === 'kolos' ? 150 : typ === 'tytan' ? 120 : typ === 'heros' ? 90 : 0;
            const mode = typ === 'kolos' ? 5 : 3;

            if (isNI()) Engine.map.d.mode = mode;
            else if (window.map) window.map.mode = mode;

            const fakeNpc = {
                nick: name,
                lvl: lvl,
                wt: wt,
                x: 123,
                y: 45,
                icon: '1.gif',
                id: 888888 + Math.floor(Math.random() * 10000)
            };

            handleNewNpc(fakeNpc);
        },

        kill: () => {
            if (trackedBosses.size === 0) {
                console.warn("\nBrak śledzonych bossów. Najpierw zaakceptuj znalezienie.");
                return;
            }

            console.log(`\n=== RĘCZNE ZABICIE (${trackedBosses.size} bossów) ===\n`);

            const playerNick = settings.name.trim() || getCurrentHeroNick();
            const mapData = isNI() ? Engine.map.d : map;

            trackedBosses.forEach((data, id) => {
                console.log(`Wysyłam ZABITY: ${data.npc.nick}`);
                sendToDiscord(playerNick, data.npc, data.mapData, true);
            });

            trackedBosses.clear();
            if (checkBossTimer) {
                clearInterval(checkBossTimer);
                checkBossTimer = null;
            }
            console.log("→ Wszystkie śledzone bossy oznaczone jako zabite");
        },

        status: () => {
            console.clear();
            console.log(`\n=== STATUS SKRYPTU ===`);
            console.log(`Śledzonych bossów: ${trackedBosses.size}`);
            if (trackedBosses.size > 0) {
                console.log("Aktualnie śledzone:");
                trackedBosses.forEach((data, id) => {
                    console.log(`  - ${data.npc.nick} (${data.npc.wt}) | ${data.mapData.name}`);
                });
            }
            console.log(`Ikonka statusu: ${document.getElementById('erato-status-icon') ? 'widoczna' : 'niewidoczna'}`);
        },

        clear: () => {
            trackedBosses.clear();
            if (checkBossTimer) {
                clearInterval(checkBossTimer);
                checkBossTimer = null;
            }
            console.log("Śledzenie wyczyszczone.");
        }
    };

    console.log("Skrypt załadowany! Testuj tak:");
    console.log("  test.full()          → pełny test z okienkiem wyboru");
    console.log("  test.spawn()         → tylko znalezienie (wybór)");
    console.log("  test.kill()          → ręcznie wyślij ZABITY");
    console.log("  test.status()        → status skryptu");
    console.log("  test.clear()         → wyczyść śledzenie");
    console.log("Ikonka 💚✨ w prawym górnym rogu – możesz ją przeciągać myszką!");

})();
