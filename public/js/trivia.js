// ======================== TRIVIA SYSTEM ========================
import { S } from './state.js';

const triviaOverlay    = document.getElementById('triviaOverlay');
const triviaCounterEl  = document.getElementById('triviaCounter');
const triviaQuestionEl = document.getElementById('triviaQuestion');
const triviaOptionsEl  = document.getElementById('triviaOptions');
const triviaTimerNumEl = document.getElementById('triviaTimerNum');
const triviaTimerEl    = document.getElementById('triviaTimer');

export function startTrivia(difficulty, timeLimit, phase) {
    if (!S.triviaData || !S.triviaData.questions) return;
    S.terminalOpen = true;
    S.terminalPhase = phase;
    S.terminalDifficulty = difficulty;
    S.terminalTime = timeLimit;

    const filtered = S.triviaData.questions.filter(q => q.difficulty === difficulty);
    if (filtered.length > 0) {
        S.terminalQuestion = filtered[Math.floor(Math.random() * filtered.length)];
    } else {
        S.terminalQuestion = S.triviaData.questions[0];
    }

    S.keys.w = S.keys.a = S.keys.s = S.keys.d = false;

    S.triviaAnswered++;
    triviaCounterEl.textContent = `QUESTION ${S.triviaAnswered}`;
    triviaQuestionEl.textContent = S.terminalQuestion.question || '';
    triviaTimerNumEl.textContent = S.terminalTime;
    triviaTimerEl.classList.remove('tt-urgent');

    triviaOptionsEl.innerHTML = '';
    (S.terminalQuestion.options || []).forEach((opt, idx) => {
        const label = String.fromCharCode(65 + idx);
        const btn = document.createElement('div');
        btn.className = 'tt-opt';
        btn.dataset.option = opt;
        btn.innerHTML = `<span class="tt-opt-label">${label})</span><span class="tt-opt-text">${opt}</span>`;
        btn.addEventListener('click', () => handleTriviaClick(opt));
        triviaOptionsEl.appendChild(btn);
    });

    triviaOverlay.style.display = 'flex';

    if (S.terminalTimerEvent) clearInterval(S.terminalTimerEvent);
    S.terminalTimerEvent = setInterval(() => {
        S.terminalTime--;
        triviaTimerNumEl.textContent = S.terminalTime;
        if (S.terminalTime <= 3) triviaTimerEl.classList.add('tt-urgent');
        if (S.terminalTime <= 0) {
            submitTriviaAnswer(null);
        }
    }, 1000);
}

export function handleTriviaClick(selectedOption) {
    if (!S.terminalOpen || !S.terminalQuestion) return;
    clearInterval(S.terminalTimerEvent);

    const isCorrect = selectedOption === S.terminalQuestion.correctAnswer;

    const allOpts = triviaOptionsEl.querySelectorAll('.tt-opt');
    allOpts.forEach(el => {
        el.style.pointerEvents = 'none';
        if (el.dataset.option === S.terminalQuestion.correctAnswer) {
            el.classList.add('tt-correct');
        } else if (el.dataset.option === selectedOption && !isCorrect) {
            el.classList.add('tt-wrong');
        }
    });

    setTimeout(() => {
        submitTriviaAnswer(selectedOption);
    }, 800);
}

export function submitTriviaAnswer(selectedOption) {
    if (!S.terminalOpen) return;
    clearInterval(S.terminalTimerEvent);
    S.terminalOpen = false;

    let success = (selectedOption !== null && selectedOption === S.terminalQuestion.correctAnswer);
    if (!success) {
        S.camShakeIntensity = 15;
    }

    triviaOverlay.style.display = 'none';

    if (S.ws && S.ws.readyState === 1) {
        S.ws.send(JSON.stringify({ type: 'triviaResult', success: success }));
    }
}
