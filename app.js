const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const stateLeft = document.getElementById('stateLeft');
const stateRight = document.getElementById('stateRight');
const openBtn = document.getElementById('openBtn');
const closeBtn = document.getElementById('closeBtn');
const guideTip = document.getElementById('guideTip');

let stream = null;
let runLoop = false;
let audioCtx = null;
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  }
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
    const prime = new SpeechSynthesisUtterance("\u200b");
    prime.volume = 0.01;
    prime.lang = "zh-CN";
    speechSynthesis.speak(prime);
  }
  audioUnlocked = true;
}

function applyDeviceClass() {
  const isTablet = window.matchMedia("(min-width: 768px)").matches;
  document.documentElement.classList.toggle("is-tablet", isTablet);
  document.documentElement.classList.toggle("is-phone", !isTablet);
}
applyDeviceClass();
window.addEventListener("resize", applyDeviceClass);

let texts = {
  leftA: "我",
  leftB: "很",
  leftC: "爱",
  leftD: "你",
  rightA: "开心",
  rightB: "生气",
  rightC: "难过",
  rightD: "吗"
};

const colorMap = {
  A:"#ff6688",
  B:"#ffdd33",
  C:"#66eeff",
  D:"#bb88ff"
};

// 绑定：食指/中指/无名指/小指 = A/B/C/D，拇指不参与文字
const fingerMap = [
  { landmark:8,  code:"A" }, // 食指 A
  { landmark:12, code:"B" }, // 中指 B
  { landmark:16, code:"C" }, // 无名指 C
  { landmark:20, code:"D" }  // 小指 D
];

document.querySelectorAll('.edit-item input').forEach(input=>{
  input.addEventListener('input',(e)=>{
    const key = e.target.dataset.key;
    texts[key] = e.target.value;
  })
})

const handState = {
  Left: { gestureLock: false, lastWord:"-", lastCode:"" },
  Right: { gestureLock: false, lastWord:"-", lastCode:"" }
};
let particles = [];

const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands:2,
  modelComplexity:1,
  minDetectionConfidence:0.5,
  minTrackingConfidence:0.5
});
hands.onResults(onResults);

function speak(text){
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.volume = 1;
  speechSynthesis.speak(utterance);
}

function spawnEffect(x,y){
  for(let i=0;i<12;i++){
    const isYellow = Math.random()>0.4;
    particles.push({
      x:x,
      y:y,
      vx:(Math.random()-0.5)*8,
      vy:(Math.random()-0.5)*8,
      life:45,
      size: Math.random()*3+1,
      color: isYellow ? "#fff280" : "#ffffff"
    })
  }
}
function drawParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if(p.life <=0){
      particles.splice(i,1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = p.life/45;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

openBtn.onclick = async ()=>{
  if(stream) return;
  unlockAudio();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:"user", width:{ideal:1280}, height:{ideal:720} }
    });
  } catch (err) {
    console.error("摄像头开启失败:", err);
    return;
  }
  video.srcObject = stream;
  await video.play();
  const onReady = ()=>{
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    runLoop = true;
    loopFrame();
    guideTip.classList.add("show");
    setTimeout(()=>{
      guideTip.classList.remove("show");
    },3500);
  };
  if (video.readyState >= 1) {
    onReady();
  } else {
    video.onloadedmetadata = onReady;
  }
}
closeBtn.onclick = ()=>{
  if(!stream) return;
  runLoop = false;
  stream.getTracks().forEach(t=>t.stop());
  stream = null;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  particles = [];
  handState.Left = { gestureLock: false, lastWord:"-", lastCode:"" };
  handState.Right = { gestureLock: false, lastWord:"-", lastCode:"" };
  stateLeft.innerText = "-";
  stateRight.innerText = "-";
}

async function loopFrame(){
  if(!runLoop) return;
  await hands.send({image:video});
  drawParticles();
  requestAnimationFrame(loopFrame);
}
function getDist(p1,p2){
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx*dx + dy*dy);
}

function onResults(res){
  ctx.save();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!res.multiHandLandmarks || res.multiHandLandmarks.length ===0){
    handState.Left.gestureLock = false;
    handState.Right.gestureLock = false;
    stateLeft.innerText = handState.Left.lastWord || "-";
    stateRight.innerText = handState.Right.lastWord || "-";
    ctx.restore();
    return;
  }

  for(let i=0; i<res.multiHandLandmarks.length; i++){
    const landmarks = res.multiHandLandmarks[i];
    const handedness = res.multiHandedness[i];
    const side = handedness.label;

    const thumb = landmarks[4];
    const index = landmarks[8];
    const middle = landmarks[12];
    const ring = landmarks[16];
    const pinky = landmarks[20];
    const touchThreshold = 0.08;
    let gestureCode = null;

    if(getDist(thumb,index) < touchThreshold) gestureCode = "A";
    if(getDist(thumb,middle) < touchThreshold) gestureCode = "B";
    if(getDist(thumb,ring) < touchThreshold) gestureCode = "C";
    if(getDist(thumb,pinky) < touchThreshold) gestureCode = "D";

    if(gestureCode && !handState[side].gestureLock){
      handState[side].gestureLock = true;
      handState[side].lastCode = gestureCode;
      const key = handedness.label.toLowerCase() + gestureCode;
      handState[side].lastWord = texts[key];
      speak(handState[side].lastWord);
      const tx = thumb.x * canvas.width;
      const ty = thumb.y * canvas.height;
      spawnEffect(tx,ty);
    }else if(!gestureCode){
      handState[side].gestureLock = false;
    }

    // 全部5个指尖画白点（拇指保留白点，无文字）
    const allTips = [4,8,12,16,20];
    for(const ti of allTips){
      const pt = landmarks[ti];
      const px = pt.x * canvas.width;
      const py = pt.y * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py,5,0,Math.PI*2);
      ctx.fillStyle="#ffffff";
      ctx.fill();
    }

    // 只给四根手指绘制常驻文字：食指/中指/无名指/小指
    for(const cfg of fingerMap){
      const pt = landmarks[cfg.landmark];
      const px = pt.x * canvas.width;
      const py = pt.y * canvas.height;

      const wordKey = handedness.label.toLowerCase() + cfg.code;
      const showWord = texts[wordKey];
      const wordColor = colorMap[cfg.code];

      ctx.save();
      ctx.translate(px, py - 22);
      ctx.scale(-1,1);
      ctx.fillStyle = wordColor;
      ctx.font = "bold 28px 'ZCOOL KuaiLe', sans‑serif";
      ctx.fillText(showWord,0,0);
      ctx.restore();
    }
  }
  stateLeft.innerText = handState.Left.lastWord || "-";
  stateRight.innerText = handState.Right.lastWord || "-";
  ctx.restore();
}