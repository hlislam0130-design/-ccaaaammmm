const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const flipBtn = document.getElementById("flipBtn");
const photoBtn = document.getElementById("photoBtn");

const placeholder = document.getElementById("placeholder");
const status = document.getElementById("status");
const message = document.getElementById("message");

let stream = null;
let pose = null;
let facing = "user";
let selectedLook = "jersey";
let processing = false;
let latestLandmarks = null;
let animationFrame = null;

const colors = {
  jersey: ["#1742c4", "#d52b42"],
  hoodie: ["#292932", "#777784"],
  suit: ["#111119", "#555563"],
  hero: ["#a20c28", "#172e77"]
};

// Set canvas size
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;

  ctx.setTransform(
    devicePixelRatio, 0, 0,
    devicePixelRatio, 0, 0
  );
}

window.addEventListener("resize", resizeCanvas);

// Initialize MediaPipe
async function initializePose() {
  if (pose) return;

  pose = new Pose({
    locateFile: file =>
      https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults(results => {
    latestLandmarks = results.poseLandmarks || null;
    drawOutfit();
  });
}

// Start camera
async function startCamera() {
  try {
    status.textContent = "LOADING...";

    await initializePose();

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facing,
        width: { ideal: 720 },
        height: { ideal: 960 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    resizeCanvas();

    placeholder.style.display = "none";
    status.textContent = "● LIVE";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    photoBtn.disabled = false;

    processFrames();

  } catch (error) {
    status.textContent = "CAMERA ERROR";
    message.textContent =
      "Allow camera permission and use HTTPS. " + error.message;
  }
}

// Process camera frames
async function processFrames() {
  if (!stream || processing) return;

  processing = true;

  try {
    await pose.send({ image: video });
  } catch (error) {
    console.error(error);
  }

  processing = false;

  if (stream) {
    animationFrame = requestAnimationFrame(processFrames);
  }
}

// Stop camera
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  stream = null;

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  video.srcObject = null;
  latestLandmarks = null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  placeholder.style.display = "flex";
  status.textContent = "CAMERA OFF";

  startBtn.disabled = false;
  stopBtn.disabled = true;
  photoBtn.disabled = true;
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);

// Switch camera
flipBtn.addEventListener("click", async () => {
  const wasRunning = !!stream;

  if (wasRunning) {
    stopCamera();
  }

  facing = facing === "user" ? "environment" : "user";

  if (wasRunning) {
    await startCamera();
  }
});

// Draw body-tracked outfit
function drawOutfit() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  ctx.clearRect(0, 0, width, height);

  if (!latestLandmarks) return;

  const lm = latestLandmarks;

  const leftShoulder = lm[11];
  const rightShoulder = lm[12];
  const leftHip = lm[23];
  const rightHip = lm[24];

  if (
    !leftShoulder || !rightShoulder ||
    !leftHip || !rightHip
  ) return;

  if (
    leftShoulder.visibility < 0.5 ||
    rightShoulder.visibility < 0.5 ||
    leftHip.visibility < 0.5 ||
    rightHip.visibility < 0.5
  ) return;

  // Mirror coordinates to match front camera
  const point = p => ({
    x: (1 - p.x) * width,
    y: p.y * height
  });

  const ls = point(leftShoulder);
  const rs = point(rightShoulder);
  const lh = point(leftHip);
  const rh = point(rightHip);

  // Calculate garment shape
  const centerX = (ls.x + rs.x) / 2;
  const shoulderWidth = Math.hypot(
    rs.x - ls.x, rs.y - ls.y
  );

  const hipWidth = Math.hypot(
    rh.x - lh.x, rh.y - lh.y
  );

  const gradient = ctx.createLinearGradient(
    ls.x, ls.y, rh.x, rh.y
  );

  gradient.addColorStop(0, colors[selectedLook][0]);
  gradient.addColorStop(1, colors[selectedLook][1]);

  ctx.save();

  ctx.fillStyle = gradient;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;

  const neckWidth = shoulderWidth * 0.20;
  const outerWidth = shoulderWidth * 0.68;
  const hipExtra = hipWidth * 0.12;

  ctx.beginPath();

  ctx.moveTo(centerX - neckWidth, ls.y);
  ctx.lineTo(centerX - outerWidth, ls.y + shoulderWidth * 0.12);
  ctx.lineTo(lh.x - hipExtra, lh.y);
  ctx.lineTo(rh.x + hipExtra, rh.y);
  ctx.lineTo(centerX + outerWidth, rs.y + shoulderWidth * 0.12);
  ctx.lineTo(centerX + neckWidth, rs.y);

  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Outfit label
  ctx.fillStyle = "white";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";

  const labels = {
    jersey: "11",
    hoodie: "VYBE",
    suit: "V",
    hero: "✦"
  };

  ctx.fillText(
    labels[selectedLook],
    centerX,
    (lh.y + ls.y) / 2
  );

  ctx.restore();
}

// Select outfit
document.querySelectorAll(".outfit").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".outfit")
      .forEach(item => item.classList.remove("active"));

    button.classList.add("active");
    selectedLook = button.dataset.look;

    drawOutfit();
  });
});

// Capture photo with overlay
photoBtn.addEventListener("click", () => {
  if (!stream) return;

  const output = document.createElement("canvas");

  output.width = video.videoWidth;
  output.height = video.videoHeight;

  const out = output.getContext("2d");

  out.translate(output.width, 0);
  out.scale(-1, 1);

  out.drawImage(video, 0, 0);

  // Overlay is already mirrored; unmirror it for saved output
  out.save();
  out.translate(output.width, 0);
  out.scale(-1, 1);
  out.drawImage(canvas, 0, 0, output.width, output.height);
  out.restore();

  const link = document.createElement("a");

  link.download = "vybe-virtual-look.png";
  link.href = output.toDataURL("image/png");

  link.click();
});

// Transformation modes
const arBtn = document.getElementById("arBtn");
const aiBtn = document.getElementById("aiBtn");
const modeInfo = document.getElementById("modeInfo");

arBtn.addEventListener("click", () => {
  arBtn.classList.add("active");
  aiBtn.classList.remove("active");

  modeInfo.textContent =
    "Live body-tracked outfit overlay is active.";
});

aiBtn.addEventListener("click", () => {
  aiBtn.classList.add("active");
  arBtn.classList.remove("active");

  modeInfo.textContent =
    "AI realistic mode requires a connected virtual try-on API. Backend integration is the next development stage.";
});

// Upload photo
const uploadBtn = document.getElementById("uploadBtn");
const photoInput = document.getElementById("photoInput");

uploadBtn.addEventListener("click", () => {
  photoInput.click();
});

photoInput.addEventListener("change", event => {
  const file = event.target.files[0];

  if (!file) return;

  message.textContent =
    "Photo selected: " + file.name +
    ". AI processing will be added through the backend.";
});
