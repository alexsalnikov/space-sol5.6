export const LensShader = {
  name: 'LensShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.00125 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uAberration;
    varying vec2 vUv;

    float hash12(vec2 point) {
      vec3 p3 = fract(vec3(point.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float radius2 = dot(centered, centered);
      vec2 offset = centered * uAberration * (0.25 + radius2 * 2.2);

      float red = texture2D(tDiffuse, vUv + offset).r;
      float green = texture2D(tDiffuse, vUv).g;
      float blue = texture2D(tDiffuse, vUv - offset).b;
      vec3 color = vec3(red, green, blue);

      float vignette = smoothstep(0.86, 0.18, length(centered * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0)));
      float grain = hash12(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
      color *= mix(0.67, 1.0, vignette);
      color += grain * 0.008;
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};
