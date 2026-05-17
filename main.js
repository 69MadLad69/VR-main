"use strict";

let gl;
let surface;
let sphere;
let shProgram;
let webcamProg;
let spaceball;
let stereoCam;

let video;
let webcamTexture;
let quadVBO;

const SOUND_RADIUS = 2.5;

let soundSourcePos = [0.0, 0.0, SOUND_RADIUS];

let audioCtx = null;
let panner = null;
let hpFilter = null;
let gainNode = null;
let audioSrc = null;
let audioBuffer = null;
let isPlaying = false;

let ws = null;
let filteredAccel = { x: 0.0, y: 0.0, z: 9.81 };
const SMOOTH = 0.15;

function ShaderProgram(name, program) {
  this.name = name;
  this.prog = program;
  this.iAttribVertex = -1;
  this.iModelViewMatrix = -1;
  this.iProjectionMatrix = -1;
  this.iColor = -1;
  this.Use = function () {
    gl.useProgram(this.prog);
  };
}

function ensureAudioContext() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  panner = audioCtx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 2.0;
  panner.maxDistance = 100.0;
  panner.rolloffFactor = 5;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  panner.coneOuterGain = 0;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = parseFloat(document.getElementById('volume').value);
  gainNode.connect(audioCtx.destination);

  panner.disconnect();
  panner.connect(gainNode);

  hpFilter = audioCtx.createBiquadFilter();
  hpFilter.type = "highpass";
  hpFilter.frequency.value = parseFloat(
    document.getElementById("hpfFreq").value,
  );
  hpFilter.Q.value = parseFloat(document.getElementById("hpfQ").value);

  const L = audioCtx.listener;
  if (L.positionX !== undefined) {
    L.positionX.value = 0;
    L.positionY.value = 0;
    L.positionZ.value = 0;
    L.forwardX.value = 0;
    L.forwardY.value = 0;
    L.forwardZ.value = -1;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    L.setPosition(0, 0, 0);
    L.setOrientation(0, 0, -1, 0, 1, 0);
  }

  updatePannerPosition();
}

function updatePannerPosition() {
  if (!panner || !audioCtx) return;
  const [x, y, z] = soundSourcePos;
  if (panner.positionX !== undefined) {
    const t = audioCtx.currentTime;
    panner.positionX.setValueAtTime(x, t);
    panner.positionY.setValueAtTime(y, t);
    panner.positionZ.setValueAtTime(z, t);
  } else {
    panner.setPosition(x, y, z);
  }
}

function connectGraph() {
  if (!audioSrc || !panner) return;
  try {
    audioSrc.disconnect();
  } catch (_) {}
  try {
    hpFilter.disconnect();
  } catch (_) {}

  if (document.getElementById("filterEnabled").checked) {
    audioSrc.connect(hpFilter);
    hpFilter.connect(panner);
  } else {
    audioSrc.connect(panner);
  }
}

async function loadAudioFile(file) {
  ensureAudioContext();
  const ab = await file.arrayBuffer();
  audioBuffer = await audioCtx.decodeAudioData(ab);
  document.getElementById("playBtn").disabled = false;
  document.getElementById("playBtn").textContent = "Play";
}

function startPlayback() {
  if (!audioBuffer) return;
  ensureAudioContext();
  audioCtx.resume();

  if (audioSrc) {
    try {
      audioSrc.stop();
    } catch (_) {}
  }

  audioSrc = audioCtx.createBufferSource();
  audioSrc.buffer = audioBuffer;
  audioSrc.loop = true;
  connectGraph();
  audioSrc.start();
  isPlaying = true;
  document.getElementById("playBtn").textContent = "Stop";
}

function stopPlayback() {
  if (audioSrc) {
    try {
      audioSrc.stop();
    } catch (_) {}
    audioSrc = null;
  }
  isPlaying = false;
  document.getElementById("playBtn").textContent = "Play";
}

function accelToSoundPos(ax, ay, az) {
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-5) return [0.0, 0.0, SOUND_RADIUS];
  return [
    (ax / len) * SOUND_RADIUS,
    (ay / len) * SOUND_RADIUS,
    (az / len) * SOUND_RADIUS,
  ];
}

function connectSensor() {
  const ip = document.getElementById("wsIP").value.trim();
  const port = document.getElementById("wsPort").value.trim();
  const url = `ws://${ip}:${port}/sensor/connect?type=android.sensor.accelerometer`;

  setSensorStatus("connecting");
  try {
    ws = new WebSocket(url);
  } catch (e) {
    setSensorStatus("error", "Invalid address");
    return;
  }

  ws.onopen = () => setSensorStatus("connected");

  ws.onmessage = (event) => {
    try {
      const {
        values: [ax, ay, az],
      } = JSON.parse(event.data);

      filteredAccel.x = SMOOTH * ax + (1 - SMOOTH) * filteredAccel.x;
      filteredAccel.y = SMOOTH * ay + (1 - SMOOTH) * filteredAccel.y;
      filteredAccel.z = SMOOTH * az + (1 - SMOOTH) * filteredAccel.z;

      soundSourcePos = accelToSoundPos(
        filteredAccel.x,
        filteredAccel.y,
        filteredAccel.z,
      );
      updatePannerPosition();
    } catch (_) {}
  };

  ws.onerror = () => {
    setSensorStatus("error", "Connection failed");
  };
  ws.onclose = () => {
    setSensorStatus("disconnected");
    ws = null;
  };
}

function disconnectSensor() {
  if (ws) {
    ws.close();
    ws = null;
  }
  setSensorStatus("disconnected");
}

function setSensorStatus(state, detail) {
  const el = document.getElementById("wsStatus");
  const btn = document.getElementById("wsConnect");
  const map = {
    connecting: ["○ Connecting…", "#FFC107"],
    connected: ["● Connected", "#4CAF50"],
    error: ["● Error" + (detail ? ": " + detail : ""), "#F44336"],
    disconnected: ["● Disconnected", "#888"],
  };
  const [text, color] = map[state] || map.disconnected;
  el.textContent = text;
  el.style.color = color;

  if (state === "connected" || state === "connecting") {
    btn.textContent = state === "connecting" ? "Cancel" : "Disconnect";
    btn.onclick = disconnectSensor;
  } else {
    btn.textContent = "Connect";
    btn.onclick = connectSensor;
  }
}

function bindModel(model) {
  gl.bindBuffer(gl.ARRAY_BUFFER, model.iVertexBuffer);
  gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(shProgram.iAttribVertex);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iIndexBuffer);
}

function drawEye(frustumMat, eyeTranslate) {
  drawWebcamBackground();

  gl.useProgram(shProgram.prog);
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, frustumMat);

  const rotateToCenter = m4.axisRotation([0.707, 0.707, 0], 0.7);
  const translateToScene = m4.translation(0, 0, -10);

  bindModel(surface);

  let accSurface = m4.multiply(rotateToCenter, spaceball.getViewMatrix());
  accSurface = m4.multiply(eyeTranslate, accSurface);
  accSurface = m4.multiply(translateToScene, accSurface);
  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, accSurface);

  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1.0, 1.0);
  gl.uniform4fv(shProgram.iColor, [0.55, 0.55, 0.55, 1.0]);
  surface.Draw();
  gl.disable(gl.POLYGON_OFFSET_FILL);

  gl.uniform4fv(shProgram.iColor, [1.0, 1.0, 1.0, 1.0]);
  surface.DrawWireframe();

  bindModel(sphere);

  let accSphere = m4.multiply(
    eyeTranslate,
    m4.translation(soundSourcePos[0], soundSourcePos[1], soundSourcePos[2]),
  );
  accSphere = m4.multiply(translateToScene, accSphere);
  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, accSphere);

  gl.uniform4fv(shProgram.iColor, [1.0, 0.75, 0.0, 1.0]);
  sphere.Draw();
}

function drawWebcamBackground() {
  if (!webcamTexture || !video || video.readyState < 2) return;

  gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

  gl.useProgram(webcamProg.prog);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);

  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.vertexAttribPointer(webcamProg.iPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(webcamProg.iTexCoord, 2, gl.FLOAT, false, 16, 8);
  gl.enableVertexAttribArray(webcamProg.iPosition);
  gl.enableVertexAttribArray(webcamProg.iTexCoord);
  gl.uniform1i(webcamProg.iSampler, 0);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
}

function draw() {
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const leftProj = stereoCam.calcLeftFrustum();
  const rightProj = stereoCam.calcRightFrustum();
  const eyeL = m4.translation(stereoCam.eyeSeparation / 2, 0, 0);
  const eyeR = m4.translation(-stereoCam.eyeSeparation / 2, 0, 0);

  gl.colorMask(true, false, false, true);
  drawEye(leftProj, eyeL);

  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.colorMask(false, true, true, true);
  drawEye(rightProj, eyeR);

  gl.colorMask(true, true, true, true);
}

function renderLoop() {
  draw();
  requestAnimationFrame(renderLoop);
}

function initWebcam() {
  video = document.createElement("video");
  video.autoplay = video.playsInline = video.muted = true;

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "user" } })
    .then((stream) => {
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
      };
      document.getElementById("camStatus").textContent = "🎥 Webcam active";
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("camStatus").textContent = "⚠ Webcam unavailable";
    });

  webcamTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );

  quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, 1, 1, 1, 0, -1, 1, 0, 0]),
    gl.STATIC_DRAW,
  );
}

function CreateSurfaceData(data) {
  const a = 0.8;
  const c = 1.0;
  const theta = -Math.PI / 2;

  const tMin = -2.0;
  const tMax = 2.0;

  const uSteps = 50;
  const tSteps = 50;

  let vertices = [];
  let indices = [];

  function surfacePoint(u, t) {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);

    const radius = a + t * cosTheta + c * t * t * sinTheta;

    return {
      x: radius * cosU,
      y: radius * sinU,
      z: t * sinTheta + c * t * t * cosTheta,
    };
  }

  for (let i = 0; i <= tSteps; i++) {
    let t = tMin + ((tMax - tMin) * i) / tSteps;

    for (let j = 0; j <= uSteps; j++) {
      let u = (2 * Math.PI * j) / uSteps;

      let p = surfacePoint(u, t);
      vertices.push(p.x, p.y, p.z);
    }
  }

  for (let i = 0; i < tSteps; i++) {
    for (let j = 0; j < uSteps; j++) {
      let row1 = i * (uSteps + 1);
      let row2 = (i + 1) * (uSteps + 1);

      let a0 = row1 + j;
      let b0 = row1 + j + 1;
      let c0 = row2 + j;
      let d0 = row2 + j + 1;

      indices.push(a0, c0, b0);
      indices.push(b0, c0, d0);
    }
  }

  data.verticesF32 = new Float32Array(vertices);
  data.indicesU16 = new Uint16Array(indices);
}

function initGL() {
  const prog3d = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  shProgram = new ShaderProgram("Basic", prog3d);
  shProgram.Use();
  shProgram.iAttribVertex = gl.getAttribLocation(prog3d, "vertex");
  shProgram.iModelViewMatrix = gl.getUniformLocation(prog3d, "ModelViewMatrix");
  shProgram.iProjectionMatrix = gl.getUniformLocation(
    prog3d,
    "ProjectionMatrix",
  );
  shProgram.iColor = gl.getUniformLocation(prog3d, "color");

  const progCam = createProgram(gl, webcamVertexSource, webcamFragmentSource);
  webcamProg = new ShaderProgram("Webcam", progCam);
  webcamProg.iPosition = gl.getAttribLocation(progCam, "aPosition");
  webcamProg.iTexCoord = gl.getAttribLocation(progCam, "aTexCoord");
  webcamProg.iSampler = gl.getUniformLocation(progCam, "uSampler");

  const surfData = {};
  CreateSurfaceData(surfData);
  surface = new Model("Surface");
  surface.BufferData(surfData.verticesF32, surfData.indicesU16);

  const sphData = {};
  CreateSphereData(sphData, 0.22, 18, 14);
  sphere = new Model("SoundSource");
  sphere.BufferData(sphData.verticesF32, sphData.indicesU16);

  stereoCam = new StereoCamera(
    10.0,
    0.5,
    1.0,
    (28.6 * Math.PI) / 180,
    8.0,
    20.0,
  );

  initWebcam();
  gl.enable(gl.DEPTH_TEST);
}

function createProgram(gl, vSrc, fSrc) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error("Link error: " + gl.getProgramInfoLog(prog));
  return prog;
}

function bindSlider(sliderId, spanId, setter) {
  const slider = document.getElementById(sliderId);
  const span = document.getElementById(spanId);
  function update() {
    const v = parseFloat(slider.value);
    span.textContent = v.toFixed(2);
    setter(v);
  }
  slider.addEventListener("input", update);
  update();
}

function init() {
  let canvas;
  try {
    canvas = document.getElementById("webglcanvas");
    gl = canvas.getContext("webgl");
    if (!gl) throw "WebGL not supported by this browser.";
  } catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not obtain a WebGL context: " + e + "</p>";
    return;
  }
  try {
    initGL();
  } catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not initialise WebGL: " + e + "</p>";
    return;
  }

  spaceball = new TrackballRotator(canvas, null, 0);

  bindSlider("eyeSep", "eyeSepVal", (v) => {
    stereoCam.eyeSeparation = v;
  });
  bindSlider("fov", "fovVal", (v) => {
    stereoCam.mFOV = (v * Math.PI) / 180;
  });
  bindSlider("near", "nearVal", (v) => {
    stereoCam.mNearClippingDistance = v;
  });
  bindSlider("convergence", "convergenceVal", (v) => {
    stereoCam.mConvergence = v;
  });

  document.getElementById("audioFile").addEventListener("change", function () {
    const file = this.files[0];
    if (file)
      loadAudioFile(file).catch((e) => alert("Could not decode audio: " + e));
  });

  document.getElementById("playBtn").addEventListener("click", function () {
    if (isPlaying) stopPlayback();
    else startPlayback();
  });

  document
    .getElementById("filterEnabled")
    .addEventListener("change", function () {
      connectGraph();
    });

  bindSlider("hpfFreq", "hpfFreqVal", (v) => {
    if (hpFilter) hpFilter.frequency.value = v;
  });

  bindSlider("hpfQ", "hpfQVal", (v) => {
    if (hpFilter) hpFilter.Q.value = v;
  });

  bindSlider('volume', 'volumeVal', v => {
        if (gainNode) gainNode.gain.value = v;
  });

  setSensorStatus("disconnected");
  renderLoop();
}
