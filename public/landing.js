// ======================== EXOFALL LANDING PAGE ========================
(function () {
    'use strict';

    // ======================== STARFIELD ========================
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    const stars = [];
    const meteors = [];
    let W, H;

    function resizeCanvas() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Create stars
    for (let i = 0; i < 300; i++) {
        stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            size: Math.random() * 2 + 0.3,
            speed: Math.random() * 0.4 + 0.05,
            brightness: Math.random() * 0.5 + 0.3,
            twinkleSpeed: Math.random() * 0.02 + 0.005
        });
    }

    // Distant planet
    const planet = { x: W * 0.8, y: H * 0.7, r: 80 };

    function spawnMeteor() {
        if (meteors.length > 2) return;
        meteors.push({
            x: Math.random() * W,
            y: -10,
            speed: 300 + Math.random() * 200,
            angle: Math.PI / 4 + Math.random() * 0.3,
            life: 1.0,
            length: 40 + Math.random() * 60
        });
    }

    let frame = 0;
    function renderStarfield(dt) {
        ctx.clearRect(0, 0, W, H);

        // Deep space gradient
        const grad = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, W * 0.8);
        grad.addColorStop(0, '#0f1629');
        grad.addColorStop(1, '#0B0F1A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Planet silhouette
        const px = planet.x - scrollY * 0.05;
        ctx.beginPath();
        ctx.arc(px, planet.y, planet.r, 0, Math.PI * 2);
        ctx.fillStyle = '#060a12';
        ctx.fill();
        ctx.strokeStyle = 'rgba(77,166,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Atmosphere glow
        const atmo = ctx.createRadialGradient(px, planet.y, planet.r - 5, px, planet.y, planet.r + 20);
        atmo.addColorStop(0, 'transparent');
        atmo.addColorStop(1, 'rgba(77,166,255,0.04)');
        ctx.beginPath();
        ctx.arc(px, planet.y, planet.r + 20, 0, Math.PI * 2);
        ctx.fillStyle = atmo;
        ctx.fill();

        // Stars with parallax
        const scrollFactor = scrollY * 0.15;
        for (const star of stars) {
            const sy = ((star.y + scrollFactor * star.speed) % H + H) % H;
            const twinkle = Math.sin(frame * star.twinkleSpeed) * 0.3 + star.brightness;
            ctx.fillStyle = `rgba(230,241,255,${Math.max(0.1, twinkle)})`;
            ctx.fillRect(star.x, sy, star.size, star.size);
        }

        // Meteors
        for (let i = meteors.length - 1; i >= 0; i--) {
            const m = meteors[i];
            m.x += Math.cos(m.angle) * m.speed * dt;
            m.y += Math.sin(m.angle) * m.speed * dt;
            m.life -= dt * 0.8;

            if (m.life <= 0 || m.y > H + 50) { meteors.splice(i, 1); continue; }

            const tailX = m.x - Math.cos(m.angle) * m.length;
            const tailY = m.y - Math.sin(m.angle) * m.length;
            const mg = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
            mg.addColorStop(0, `rgba(230,241,255,${m.life * 0.8})`);
            mg.addColorStop(1, 'transparent');
            ctx.strokeStyle = mg;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
        }

        frame++;
        if (Math.random() < 0.005) spawnMeteor();
    }

    // ======================== TYPED SUBTITLE ========================
    const subtitleEl = document.getElementById('heroSubtitle');
    const subtitleText = 'COOPERATIVE SPACE SURVIVAL';
    let charIndex = 0;
    function typeSubtitle() {
        if (charIndex <= subtitleText.length) {
            subtitleEl.textContent = subtitleText.slice(0, charIndex);
            charIndex++;
            setTimeout(typeSubtitle, 60 + Math.random() * 40);
        }
    }
    setTimeout(typeSubtitle, 1200);

    // ======================== CURSOR GLOW ========================
    const cursorGlow = document.getElementById('cursorGlow');
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursorGlow.style.left = mouseX + 'px';
        cursorGlow.style.top = mouseY + 'px';
    });

    // ======================== SCROLL REVEAL ========================
    const revealElements = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = entry.target.dataset.delay || 0;
                setTimeout(() => entry.target.classList.add('visible'), parseInt(delay));
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => observer.observe(el));

    // ======================== COUNTER ANIMATION ========================
    const counterEls = document.querySelectorAll('.counter-val');
    let countersAnimated = false;
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !countersAnimated) {
                countersAnimated = true;
                counterEls.forEach(el => {
                    const target = parseInt(el.dataset.target);
                    animateCounter(el, target);
                });
                counterObserver.disconnect();
            }
        });
    }, { threshold: 0.3 });

    if (counterEls.length > 0) {
        counterObserver.observe(counterEls[0].closest('.counter-grid'));
    }

    function animateCounter(el, target) {
        let current = 0;
        const step = target / 40;
        const interval = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(interval);
            }
            el.textContent = Math.round(current);
        }, 30);
    }

    // ======================== BUTTON PARTICLES ========================
    document.querySelectorAll('.btn-pixel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const rect = btn.getBoundingClientRect();
            for (let i = 0; i < 8; i++) {
                const particle = document.createElement('div');
                particle.style.cssText = `
                    position: fixed; width: 4px; height: 4px; border-radius: 50%;
                    background: ${btn.classList.contains('btn-primary-pixel') ? '#4DFF88' : '#4DA6FF'};
                    left: ${e.clientX}px; top: ${e.clientY}px;
                    pointer-events: none; z-index: 10000;
                    transition: all 0.6s ease-out; opacity: 1;
                `;
                document.body.appendChild(particle);
                requestAnimationFrame(() => {
                    particle.style.transform = `translate(${(Math.random() - 0.5) * 80}px, ${(Math.random() - 0.5) * 80}px)`;
                    particle.style.opacity = '0';
                });
                setTimeout(() => particle.remove(), 600);
            }
        });
    });

    // ======================== GLITCH EASTER EGG ========================
    let titleClicks = 0;
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
        heroTitle.style.cursor = 'pointer';
        heroTitle.addEventListener('click', () => {
            titleClicks++;
            if (titleClicks >= 5) {
                titleClicks = 0;
                heroTitle.style.animation = 'none';
                heroTitle.offsetHeight; // reflow
                heroTitle.style.animation = 'heavyGlitch 0.5s ease';
                setTimeout(() => {
                    heroTitle.style.animation = 'glitchAnim 4s infinite';
                }, 500);
            }
        });
    }

    // Add heavy glitch keyframes
    const glitchStyle = document.createElement('style');
    glitchStyle.textContent = `
        @keyframes heavyGlitch {
            0% { transform: translate(0); filter: hue-rotate(0deg); }
            10% { transform: translate(-5px, 3px); filter: hue-rotate(90deg); text-shadow: -4px 0 #FF6AD5, 4px 0 #4DA6FF; }
            20% { transform: translate(5px, -3px); filter: hue-rotate(180deg); text-shadow: 4px 0 #4DFF88, -4px 0 #FF3B3B; }
            30% { transform: translate(-3px, -2px); filter: hue-rotate(270deg); clip-path: inset(20% 0 40% 0); }
            40% { transform: translate(3px, 2px); filter: hue-rotate(360deg); clip-path: inset(60% 0 10% 0); }
            50% { transform: translate(-2px, 5px); text-shadow: -6px 0 #FF9F40, 6px 0 #4DA6FF; clip-path: none; }
            60% { transform: translate(4px, -4px); }
            80% { transform: translate(-1px, 1px); filter: hue-rotate(0deg); text-shadow: 0 0 60px rgba(77,166,255,0.4); }
            100% { transform: translate(0); filter: none; }
        }
    `;
    document.head.appendChild(glitchStyle);

    // ======================== BOSS SECTION SHAKE ========================
    const bossSection = document.getElementById('boss');
    const bossObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                bossSection.style.animation = 'bossShake 0.3s ease';
                setTimeout(() => bossSection.style.animation = '', 300);
                bossObserver.unobserve(bossSection);
            }
        });
    }, { threshold: 0.3 });
    if (bossSection) bossObserver.observe(bossSection);

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes bossShake {
            0%, 100% { transform: translate(0); }
            25% { transform: translate(2px, -1px); }
            50% { transform: translate(-2px, 1px); }
            75% { transform: translate(1px, -2px); }
        }
    `;
    document.head.appendChild(shakeStyle);

    // ======================== LEADERBOARD ========================
    const ROLE_LB_COLORS = { vanguard: '#4cc9f0', engineer: '#f4a261', scout: '#06d6a0', medic: '#ef476f' };
    function loadLeaderboard() {
        fetch('/api/leaderboard')
            .then(r => r.json())
            .then(data => {
                const body = document.getElementById('lbBody');
                if (!body) return;
                if (!data || data.length === 0) {
                    body.innerHTML = '<div class="lb-loading">NO DATA YET</div>';
                    return;
                }
                body.innerHTML = data.map((p, i) => {
                    const topClass = i === 0 ? 'lb-top1' : i === 1 ? 'lb-top2' : i === 2 ? 'lb-top3' : '';
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
                    const roleColor = ROLE_LB_COLORS[p.role] || '#fff';
                    return `<div class="lb-row ${topClass}">
                        <span class="lb-rank">${medal}</span>
                        <span class="lb-name">${p.name}</span>
                        <span class="lb-role" style="color:${roleColor}">${(p.role || '—').toUpperCase()}</span>
                        <span class="lb-score">${p.totalScore}</span>
                        <span class="lb-missions">${p.missionsCompleted}</span>
                        <span class="lb-kills">${p.enemiesKilled}</span>
                        <span class="lb-games">${p.gamesPlayed}</span>
                    </div>`;
                }).join('');
            })
            .catch(() => {
                const body = document.getElementById('lbBody');
                if (body) body.innerHTML = '<div class="lb-loading">FAILED TO LOAD</div>';
            });
    }
    loadLeaderboard();

    // ======================== GAME LOOP ========================
    let lastTime = performance.now();
    function loop(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        // Only render starfield if hero is visible
        if (scrollY < window.innerHeight * 1.5) {
            renderStarfield(dt);
        }

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

})();
