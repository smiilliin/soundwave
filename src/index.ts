import { mat4 } from "gl-matrix";

(async () => {
  const vertices = [-1, 0, 1, 0, 1, 1, -1, 1];
  const indices = [0, 1, 2, 0, 2, 3];

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl");
  if (!gl) {
    alert("This browser does not support webgl.");
    return;
  }

  const hideColorsButton = document.getElementById("hideColors") as HTMLButtonElement;
  const startColorInput = document.getElementById("startColor") as HTMLInputElement;
  const endColorInput = document.getElementById("endColor") as HTMLInputElement;
  const colorsDiv = document.getElementById("colors") as HTMLDivElement;

  const heightSizeInput = document.getElementById("heightSize") as HTMLInputElement;
  const distanceSizeInput = document.getElementById("distanceSize") as HTMLInputElement;

  const hexToRGB = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result && result.length >= 4
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : {
          r: 0,
          g: 0,
          b: 0,
        };
  };

  hideColorsButton.onclick = () => {
    document.body.removeChild(colorsDiv);
  };
  const createShader = (type: number, source: string) => {
    const shader = gl.createShader(type);

    if (!shader) return undefined;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      return shader;
    }
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return undefined;
  };
  const loadShader = () => {
    const vertexShaderSource = `
    attribute vec2 apos;
    uniform mediump float angle;
    uniform mediump float width;
    uniform mediump float height;
    uniform mat4 projection;

    void main() {
      float _angle = (angle + apos.x * width) * 3.1415926535 / 180.0;

      if (apos.y == 0.0) {
          gl_Position = projection * vec4(cos(_angle) * 2.0, sin(_angle) * 2.0, 0, 1.0);
      }
      else {
          float _height = height + 2.0;
          gl_Position = projection * vec4(cos(_angle) * _height, sin(_angle) * _height, 0, 1.0);
      }
    }
    `;
    const fragmentShaderSource = `
    uniform mediump vec3 color;

    void main() {
      gl_FragColor = vec4(color.x / 255.0, color.y / 255.0, color.z / 255.0, 1.0);
    }
    `;
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader) {
      return undefined;
    }
    if (!fragmentShader) {
      return undefined;
    }

    const program = gl.createProgram();

    if (!program) {
      return undefined;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      console.log(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return undefined;
    }
    return program;
  };
  const program = loadShader();
  if (program == undefined) {
    alert("Unable to load shaders.");
    return;
  }
  gl.useProgram(program);

  const aposLoc = gl.getAttribLocation(program, "apos");
  const projectionLoc = gl.getUniformLocation(program, "projection");

  let buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aposLoc);
  gl.vertexAttribPointer(aposLoc, 2, gl.FLOAT, false, 0, 0);

  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  gl.canvas.width = canvas.clientWidth;
  gl.canvas.height = canvas.clientHeight;

  const angleLog = gl.getUniformLocation(program, "angle");
  const widthLoc = gl.getUniformLocation(program, "width");
  const heightLoc = gl.getUniformLocation(program, "height");
  const colorLoc = gl.getUniformLocation(program, "color");

  const getMicrophoneStream = () => {
    return new Promise<MediaStream>((resolve, reject) => {
      navigator.getUserMedia(
        {
          audio: true,
          video: false,
        },
        (stream: MediaStream) => {
          resolve(stream);
        },
        (e) => {
          alert("Error capturing audio.");
          reject();
        }
      );
    });
  };

  const micStream = await getMicrophoneStream();

  const context = new AudioContext();
  const src = context.createMediaStreamSource(micStream);
  const analyser = context.createAnalyser();

  src.connect(analyser);

  analyser.fftSize = 512;

  const bufferLength = analyser.frequencyBinCount * 0.5;
  let dataArray = new Uint8Array(bufferLength);

  const barWidth = 360 / bufferLength / 2;
  const fov = 60 * (Math.PI / 180);

  let heightSize = Number(heightSizeInput.value);
  let distanceSize = Number(distanceSizeInput.value);

  heightSizeInput.oninput = () => {
    heightSize = Number(heightSizeInput.value);
  };
  distanceSizeInput.oninput = () => {
    distanceSize = Number(distanceSizeInput.value);
  };

  let startColor = hexToRGB(startColorInput.value);
  let endColor = hexToRGB(endColorInput.value);
  startColorInput.oninput = () => {
    startColor = hexToRGB(startColorInput.value);
  };
  endColorInput.oninput = () => {
    endColor = hexToRGB(endColorInput.value);
  };

  const renderFrame = () => {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const aspect = canvas.clientWidth / canvas.clientHeight;

    let projection = mat4.create();
    mat4.perspective(projection, fov, aspect, 0.0001, 500);

    let camera = mat4.create();
    mat4.lookAt(camera, [0, 1, 10], [0, 1, 0], [0, 1, 0]);

    let worldViewProjection = mat4.create();
    mat4.multiply(worldViewProjection, projection, camera);
    gl.uniformMatrix4fv(projectionLoc, false, worldViewProjection);
    gl.uniform1f(widthLoc, barWidth);

    analyser.getByteFrequencyData(dataArray);

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = dataArray[i]; // 0 ~ 255
      const distance = i > bufferLength / 2 ? (bufferLength - i) / (bufferLength / 2) : i / (bufferLength / 2); //0 ~ 1

      const gradation = (n: number, start: number, end: number) => (end - start) * n + start;
      const getR = (n: number) => gradation(n, startColor.r, endColor.r);
      const getG = (n: number) => gradation(n, startColor.g, endColor.g);
      const getB = (n: number) => gradation(n, startColor.b, endColor.b);

      const r = getR(Math.min((barHeight / 255) * heightSize + distance * distanceSize, 1));
      const g = getG(Math.min((barHeight / 255) * heightSize + distance * distanceSize, 1));
      const b = getB(Math.min((barHeight / 255) * heightSize + distance * distanceSize, 1));

      gl.uniform1f(angleLog, 360 * (i / bufferLength));
      gl.uniform1f(heightLoc, (barHeight * 1.25) / 100);
      gl.uniform3fv(colorLoc, [r, g, b]);

      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }
    requestAnimationFrame(renderFrame);
  };

  renderFrame();
})();
