const cameraEl = document.getElementById("camera");
const instructionEl = document.getElementById("instruction");
const shapeLayerEl = document.getElementById("shape-layer");
const heardEl = document.getElementById("heard");
const successMessageEl = document.getElementById("success-message");
const modePopupEl = document.getElementById("mode-popup");
const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const fallbackForm = document.getElementById("fallback-form");
const fallbackInput = document.getElementById("fallback-input");
const fallbackLabel = document.getElementById("fallback-label");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsCloseBtn = document.getElementById("settings-close-btn");
const colorblindToggle = document.getElementById("colorblind-toggle");
const flipCameraToggle = document.getElementById("flip-camera-toggle");
const cameraOffToggle = document.getElementById("camera-off-toggle");
const highContrastToggle = document.getElementById("high-contrast-toggle");
const showHeardToggle = document.getElementById("show-heard-toggle");
const slowModeToggle = document.getElementById("slow-mode-toggle");

const shapes = ["circle", "square", "triangle", "star"];
const baseColors = [
    { name: "red", hex: "#ef4444" },
    { name: "blue", hex: "#3b82f6" },
    { name: "green", hex: "#22c55e" },
    { name: "yellow", hex: "#eab308" },
    { name: "purple", hex: "#a855f7" },
    { name: "orange", hex: "#f97316" },
    { name: "pink", hex: "#ec4899" },
    { name: "white", hex: "#f9fafb" }
];

const countModeColors = ["#ffffff"];

const numberWords = {
    0: ["0", "zero"],
    1: ["1", "one", "won"],
    2: ["2", "two", "to", "too"],
    3: ["3", "three"],
    4: ["4", "four", "for"],
    5: ["5", "five"],
    6: ["6", "six"],
    7: ["7", "seven"],
    8: ["8", "eight", "ate"],
    9: ["9", "nine"]
};

const successPhrases = [
    { center: "Nice and steady", status: "Nice and steady. Next shape." },
    { center: "You got it", status: "You got it. Next shape." },
    { center: "Good focus", status: "Good focus. Next shape." },
    { center: "Calm and clear", status: "Calm and clear. Next shape." },
    { center: "Well done", status: "Well done. Next shape." },
    { center: "Great noticing", status: "Great noticing. Next shape." }
];

let recognition = null;
let listening = false;
let currentTarget = null;
let activeShapeNodes = [];
let transitionInFlight = false;
let queuedTarget = null;
let successTimer = null;
let lastSuccessPhraseIndex = -1;
let isColorblindMode = false;
let isCameraOff = false;
let experienceStarted = false;
let isSlowMode = false;

const SHAPE_FADE_NORMAL_MS = 320;
const SHAPE_FADE_SLOW_MS = 620;

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function pickRandomIndex(listLength, lastIndex) {
    if (listLength <= 1) {
        return 0;
    }

    let nextIndex = Math.floor(Math.random() * listLength);
    while (nextIndex === lastIndex) {
        nextIndex = Math.floor(Math.random() * listLength);
    }
    return nextIndex;
}

function randomPosition() {
    const { width, height } = shapeLayerEl.getBoundingClientRect();
    const zoneWidth = width || window.innerWidth;
    const zoneHeight = height || window.innerHeight;
    const padX = zoneWidth * 0.14;
    const padY = zoneHeight * 0.14;
    const x = padX + Math.random() * (zoneWidth - padX * 2);
    const y = padY + Math.random() * (zoneHeight - padY * 2);
    return { x, y };
}

function buildCountModePositions(count) {
    const { width, height } = shapeLayerEl.getBoundingClientRect();
    const zoneWidth = width || window.innerWidth;
    const zoneHeight = height || window.innerHeight;
    const cols = 3;
    const rows = 3;
    const cellWidth = zoneWidth / cols;
    const cellHeight = zoneHeight / rows;
    const padX = Math.min(cellWidth * 0.28, 55);
    const padY = Math.min(cellHeight * 0.28, 55);

    const cells = [];
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
        for (let colIndex = 0; colIndex < cols; colIndex += 1) {
            const minX = colIndex * cellWidth + padX;
            const maxX = (colIndex + 1) * cellWidth - padX;
            const minY = rowIndex * cellHeight + padY;
            const maxY = (rowIndex + 1) * cellHeight - padY;
            cells.push({ minX, maxX, minY, maxY });
        }
    }

    const shuffledCells = [...cells].sort(() => Math.random() - 0.5);
    const selected = shuffledCells.slice(0, count);

    return selected.map((cell) => ({
        x: cell.minX + Math.random() * Math.max(1, cell.maxX - cell.minX),
        y: cell.minY + Math.random() * Math.max(1, cell.maxY - cell.minY)
    }));
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getShapeFadeMs() {
    return isSlowMode ? SHAPE_FADE_SLOW_MS : SHAPE_FADE_NORMAL_MS;
}

function numberToWord(value) {
    const valueWords = numberWords[value];
    return valueWords ? valueWords[1] || String(value) : String(value);
}

function updateInputHint() {
    if (!fallbackLabel) {
        return;
    }

    if (isColorblindMode) {
        fallbackLabel.textContent = "If speech doesn’t work, type number + shape:";
        fallbackInput.placeholder = "e.g. 4 circles";
        return;
    }

    fallbackLabel.textContent = "If speech doesn’t work, type color + shape:";
    fallbackInput.placeholder = "e.g. red circle";
}

function updateModePopup() {
    if (!modePopupEl) {
        return;
    }

    if (isColorblindMode) {
        modePopupEl.textContent = "Count Mode: say the number (0-9) and shape, like \"4 circles\".";
        modePopupEl.classList.add("show");
        return;
    }

    modePopupEl.classList.remove("show");
}

function buildShapeNode(shapeName, colorHex, useCountModeStyle = false, fixedPosition = null) {
    const node = document.createElement("div");
    node.className = `shape ${shapeName}`;
    if (useCountModeStyle) {
        node.classList.add("count-mode-shape");
    }

    const transformBase = shapeName === "triangle" ? "translate(-50%, -55%)" : "translate(-50%, -50%)";
    node.style.setProperty("--shape-transform", transformBase);

    const { x, y } = fixedPosition || randomPosition();
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;

    if (shapeName === "triangle") {
        node.style.borderBottomColor = colorHex;
    } else {
        node.style.background = colorHex;
    }

    return node;
}

function showSuccessMessage(message) {
    if (!successMessageEl) {
        return;
    }
    window.clearTimeout(successTimer);
    successMessageEl.textContent = message;
    successMessageEl.classList.add("show");
    successTimer = window.setTimeout(() => {
        successMessageEl.classList.remove("show");
    }, isSlowMode ? 1300 : 850);
}

async function fadeOutActiveShapes() {
    if (activeShapeNodes.length === 0) {
        return;
    }
    for (const node of activeShapeNodes) {
        node.classList.remove("is-visible");
        node.classList.add("is-exiting");
    }
    await delay(getShapeFadeMs());
    for (const node of activeShapeNodes) {
        node.remove();
    }
    activeShapeNodes = [];
}

async function renderTarget(target) {
    if (transitionInFlight) {
        queuedTarget = target;
        return;
    }

    transitionInFlight = true;
    await fadeOutActiveShapes();

    const nodesToRender = [];

    if (target.mode === "count") {
        const positions = buildCountModePositions(target.count);
        for (let index = 0; index < target.count; index += 1) {
            const tone = pickRandom(countModeColors);
            nodesToRender.push(buildShapeNode(target.shape, tone, true, positions[index]));
        }
    } else {
        nodesToRender.push(buildShapeNode(target.shape, target.color.hex));
    }

    for (const node of nodesToRender) {
        shapeLayerEl.appendChild(node);
    }
    requestAnimationFrame(() => {
        for (const node of nodesToRender) {
            node.classList.add("is-visible");
        }
    });
    activeShapeNodes = nodesToRender;
    transitionInFlight = false;

    if (queuedTarget) {
        const nextTarget = queuedTarget;
        queuedTarget = null;
        await renderTarget(nextTarget);
    }
}

function clearShape() {
    queuedTarget = null;
    transitionInFlight = false;
    activeShapeNodes = [];
    shapeLayerEl.replaceChildren();
}

async function newTarget() {
    let nextTarget;

    if (isColorblindMode) {
        const count = Math.floor(Math.random() * 9) + 1;
        nextTarget = {
            mode: "count",
            shape: pickRandom(shapes),
            count
        };
        const shapePrompt = count === 1 ? nextTarget.shape : `${nextTarget.shape}s`;
        instructionEl.textContent = `Find and say: ${numberToWord(count)} ${shapePrompt}`;
    } else {
        nextTarget = {
            mode: "color",
            shape: pickRandom(shapes),
            color: pickRandom(baseColors)
        };
        instructionEl.textContent = `Find and say: ${nextTarget.color.name} ${nextTarget.shape}`;
    }

    currentTarget = nextTarget;
    await renderTarget(nextTarget);
}

function normalize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function parseCount(input) {
    for (let value = 0; value <= 9; value += 1) {
        const tokens = numberWords[value];
        for (const token of tokens) {
            const matcher = new RegExp(`(^|\\s)${token}(\\s|$)`);
            if (matcher.test(input)) {
                return value;
            }
        }
    }
    return null;
}

function parseAttempt(text) {
    const input = normalize(text);
    const shapeHit = shapes.find((item) => input.includes(item));
    const countHit = parseCount(input);
    const colorHit = currentTarget?.mode === "color"
        ? input.includes(currentTarget.color.name)
        : false;

    return {
        shape: shapeHit,
        count: countHit,
        colorMatched: colorHit
    };
}

function onAttempt(rawText) {
    const spoken = normalize(rawText);
    if (!spoken) {
        return;
    }

    heardEl.classList.remove("success");
    heardEl.textContent = `Heard: \"${spoken}\"`;

    if (!currentTarget) {
        return;
    }

    const parsed = parseAttempt(spoken);
    const isMatch = currentTarget.mode === "count"
        ? parsed.shape === currentTarget.shape && parsed.count === currentTarget.count
        : parsed.shape === currentTarget.shape && parsed.colorMatched;

    if (!isMatch) {
        return;
    }

    const successIndex = pickRandomIndex(successPhrases.length, lastSuccessPhraseIndex);
    lastSuccessPhraseIndex = successIndex;
    const successPhrase = successPhrases[successIndex];

    heardEl.classList.add("success");
    heardEl.textContent = successPhrase.status;
    showSuccessMessage(successPhrase.center);
    window.setTimeout(() => {
        newTarget();
    }, 200);
}

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        instructionEl.textContent =
            "Camera started. Speech recognition isn’t supported here — use the text input below.";
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const latest = event.results[event.results.length - 1];
        if (!latest?.[0]?.transcript) {
            return;
        }
        onAttempt(latest[0].transcript);
    };

    recognition.onerror = () => {
        heardEl.textContent = "Mic note: recognition hiccuped, retrying...";
    };

    recognition.onend = () => {
        if (listening) {
            recognition.start();
        }
    };
}

async function startCamera() {
    if (isCameraOff) {
        return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: false
    });

    cameraEl.srcObject = stream;
}

function stopCamera() {
    const media = cameraEl.srcObject;
    if (media && "getTracks" in media) {
        media.getTracks().forEach((track) => track.stop());
    }
    cameraEl.srcObject = null;
}

async function setCameraOffState(shouldBeOff) {
    isCameraOff = shouldBeOff;
    document.body.classList.toggle("camera-off", isCameraOff);

    if (isCameraOff) {
        stopCamera();
        heardEl.textContent = "Camera is off.";
        return;
    }

    if (!experienceStarted) {
        heardEl.textContent = "Camera will start after you press Start.";
        return;
    }

    try {
        await startCamera();
        heardEl.textContent = "Camera is on.";
    } catch (error) {
        isCameraOff = true;
        document.body.classList.add("camera-off");
        if (cameraOffToggle) {
            cameraOffToggle.checked = true;
        }
        heardEl.textContent = `Error: ${error.message}`;
    }
}

function setFlipCameraState(isFlipped) {
    document.body.classList.toggle("camera-flipped", isFlipped);
}

async function setColorblindMode(enabled) {
    isColorblindMode = enabled;
    updateInputHint();
    updateModePopup();

    if (!currentTarget) {
        heardEl.textContent = enabled
            ? "Count mode enabled."
            : "Color mode enabled.";
        return;
    }

    await newTarget();
    heardEl.textContent = enabled
        ? "Count mode enabled."
        : "Color mode enabled.";
}

function openSettings() {
    if (!settingsModal) {
        return;
    }
    settingsModal.classList.add("open");
    settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
    if (!settingsModal) {
        return;
    }
    settingsModal.classList.remove("open");
    settingsModal.setAttribute("aria-hidden", "true");
}

async function startExperience() {
    startBtn.disabled = true;
    heardEl.textContent = "Starting camera and microphone...";

    try {
        experienceStarted = true;
        await startCamera();
        document.body.classList.add("started");
        setupSpeechRecognition();

        if (recognition) {
            listening = true;
            recognition.start();
        }

        nextBtn.disabled = false;
        await newTarget();
        heardEl.textContent = isColorblindMode
            ? "Say number + shape, like \"4 circles\"."
            : "Speak color + shape, like \"blue circle\".";
    } catch (error) {
        experienceStarted = false;
        startBtn.disabled = false;
        instructionEl.textContent =
            "Couldn’t access camera/mic permissions. Allow access and try again.";
        heardEl.textContent = `Error: ${error.message}`;
    }
}

startBtn.addEventListener("click", startExperience);
nextBtn.addEventListener("click", () => {
    if (!startBtn.disabled) {
        return;
    }
    heardEl.textContent = "Skipping to a new target...";
    newTarget();
});

fallbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    onAttempt(fallbackInput.value);
    fallbackInput.value = "";
});

if (settingsBtn) {
    settingsBtn.addEventListener("click", openSettings);
}

if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener("click", closeSettings);
}

if (settingsModal) {
    settingsModal.addEventListener("click", (event) => {
        if (event.target === settingsModal) {
            closeSettings();
        }
    });
}

if (colorblindToggle) {
    colorblindToggle.addEventListener("change", async () => {
        await setColorblindMode(colorblindToggle.checked);
    });
}

if (flipCameraToggle) {
    setFlipCameraState(flipCameraToggle.checked);
    flipCameraToggle.addEventListener("change", () => {
        setFlipCameraState(flipCameraToggle.checked);
    });
}

if (cameraOffToggle) {
    cameraOffToggle.addEventListener("change", async () => {
        await setCameraOffState(cameraOffToggle.checked);
    });
}

if (highContrastToggle) {
    highContrastToggle.addEventListener("change", () => {
        document.body.classList.toggle("high-contrast", highContrastToggle.checked);
    });
}

if (showHeardToggle) {
    showHeardToggle.addEventListener("change", () => {
        document.body.classList.toggle("hide-heard", !showHeardToggle.checked);
    });
}

if (slowModeToggle) {
    slowModeToggle.addEventListener("change", () => {
        isSlowMode = slowModeToggle.checked;
    });
}

updateInputHint();
updateModePopup();

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeSettings();
    }
});

window.addEventListener("beforeunload", () => {
    window.clearTimeout(successTimer);
    listening = false;
    if (recognition) {
        recognition.stop();
    }
    stopCamera();
});
