"use strict";

let gl;
let surface;
let shProgram;
let webcamProg;
let spaceball;
let stereoCam;

let arSource;
let arContext;
let arMarker;
let markerRoot;
let lastVisible = null;

let video;
let webcamTexture;
let quadVBO;

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

/**
 * @param {Float32Array} frustumMat
 * @param {Float32Array} eyeTranslate
 */
function drawEye(frustumMat, eyeTranslate) {
  drawWebcamBackground();

  gl.useProgram(shProgram.prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, surface.iVertexBuffer);
  gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(shProgram.iAttribVertex);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.iIndexBuffer);

  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, frustumMat);

  let modelView = spaceball.getViewMatrix();
  let rotateToCenter = m4.axisRotation([0.707, 0.707, 0], 0.7);
  let translateToScene = m4.translation(0, 0, -8);

  let acc = m4.multiply(rotateToCenter, modelView);
  acc = m4.multiply(eyeTranslate, acc);
  acc = m4.multiply(translateToScene, acc);

  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, acc);

  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1.0, 1.0);
  gl.uniform4fv(shProgram.iColor, [0.55, 0.55, 0.55, 1.0]);
  surface.Draw();
  gl.disable(gl.POLYGON_OFFSET_FILL);

  gl.uniform4fv(shProgram.iColor, [1.0, 1.0, 1.0, 1.0]);
  surface.DrawWireframe();
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
  requestAnimationFrame(draw);
    if (!arSource.ready) return;

    arContext.update(arSource.domElement);
    updateStatus();
 
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
 
    if (!markerRoot.visible) return;
 
    shProgram.Use();

    const projMat = arContext.getProjectionMatrix();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projMat.elements);

    const markerMat = Array.from(markerRoot.matrix.elements);
    const scaleMat  = m4.scaling(0.5, 0.5, 0.5);
    const modelView = m4.multiply(markerMat, scaleMat);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);

    gl.bindBuffer(gl.ARRAY_BUFFER, surface.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.iIndexBuffer);

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);
    gl.uniform4fv(shProgram.iColor, [0.55, 0.55, 0.55, 1.0]);
    surface.Draw();
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.uniform4fv(shProgram.iColor, [1.0, 1.0, 1.0, 1.0]);
    surface.DrawWireframe();
}

function updateStatus() {
    if (markerRoot.visible === lastVisible) return;
    lastVisible = markerRoot.visible;
    const s = document.getElementById('status');
    if (markerRoot.visible) {
        s.textContent = 'Marker locked — surface tracked';
        s.classList.add('found');
    } else {
        s.textContent = 'Point camera at your printed marker…';
        s.classList.remove('found');
    }
}

function initAR(canvas) {
    arSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' });
    arSource.init(() => setTimeout(onResize, 200));
    window.addEventListener('resize', onResize);

    arContext = new THREEx.ArToolkitContext({
        cameraParametersUrl:
            'https://raw.githack.com/AR-js-org/AR.js/3.4.5/data/data/camera_para.dat',
        detectionMode:    'mono',
        maxDetectionRate: 30,
    });
    arContext.init();
    markerRoot = new THREE.Group();
    markerRoot.matrixAutoUpdate = false;
 
    arMarker = new THREEx.ArMarkerControls(arContext, markerRoot, {
        type:       'pattern',
        patternUrl: 'pattern.patt',
    });
 
    function onResize() {
        arSource.onResizeElement();
        arSource.copyElementSizeTo(canvas);
        if (arContext.arController !== null) {
            arSource.copyElementSizeTo(arContext.arController.canvas);
        }
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = canvas.clientWidth  * dpr;
        canvas.height = canvas.clientHeight * dpr;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
}

function renderLoop() {
  draw();
  requestAnimationFrame(renderLoop);
}

function initWebcam() {
  video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;

  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        video.play();
      };

      document.getElementById("camStatus").textContent = "🎥 Webcam active";
    })
    .catch((err) => {
      console.error(err);
    });

  console.log(video.readyState);

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

  let quad = new Float32Array([
    -1, -1, 0, 1, 1, -1, 1, 1, 1, 1, 1, 0, -1, 1, 0, 0,
  ]);
  quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
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
  let prog3d = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  shProgram = new ShaderProgram("Basic", prog3d);
  shProgram.Use();
  shProgram.iAttribVertex = gl.getAttribLocation(prog3d, "vertex");
  shProgram.iModelViewMatrix = gl.getUniformLocation(prog3d, "ModelViewMatrix");
  shProgram.iProjectionMatrix = gl.getUniformLocation(
    prog3d,
    "ProjectionMatrix",
  );
  shProgram.iColor = gl.getUniformLocation(prog3d, "color");

  let progCam = createProgram(gl, webcamVertexSource, webcamFragmentSource);
  webcamProg = new ShaderProgram("Webcam", progCam);
  webcamProg.iPosition = gl.getAttribLocation(progCam, "aPosition");
  webcamProg.iTexCoord = gl.getAttribLocation(progCam, "aTexCoord");
  webcamProg.iSampler = gl.getUniformLocation(progCam, "uSampler");

  let data = {};
  CreateSurfaceData(data);
  surface = new Model("Surface");
  surface.BufferData(data.verticesF32, data.indicesU16);

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
    let sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  let prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error("Link error: " + gl.getProgramInfoLog(prog));
  return prog;
}

/**
 * @param {string}   sliderId
 * @param {string}   spanId
 * @param {Function} setter
 */
function bindSlider(sliderId, spanId, setter) {
  let slider = document.getElementById(sliderId);
  let span = document.getElementById(spanId);
  function update() {
    let v = parseFloat(slider.value);
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
  try{
    initAR(canvas);
  } catch(e){
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not initialise AR: " + e + "</p>";
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

  renderLoop();
}
