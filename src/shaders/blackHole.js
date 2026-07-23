export const fullscreenVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const blackHoleFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  in vec2 vUv;
  out vec4 fragColor;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec3 uCameraPosition;
  uniform vec3 uCameraForward;
  uniform vec3 uCameraRight;
  uniform vec3 uCameraUp;
  uniform float uVerticalFov;
  uniform vec3 uDiskNormal;
  uniform float uDiskBrightness;
  uniform int uStepBudget;

  #define PI 3.141592653589793
  #define MAX_STEPS 560
  #define HORIZON_U 0.4992
  #define ESCAPE_RADIUS 82.0

  float saturate(float value) {
    return clamp(value, 0.0, 1.0);
  }

  float hash12(vec2 point) {
    vec3 p3 = fract(vec3(point.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float hash13(vec3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.zyx + 31.32);
    return fract((point.x + point.y) * point.z);
  }

  float valueNoise(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float n000 = hash13(cell + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(cell + vec3(1.0, 1.0, 1.0));

    return mix(
      mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y),
      mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y),
      local.z
    );
  }

  float fbm(vec3 point) {
    float result = 0.0;
    float amplitude = 0.56;
    for (int octave = 0; octave < 4; octave++) {
      result += amplitude * valueNoise(point);
      point = point * 2.03 + vec3(13.1, 7.7, 5.3);
      amplitude *= 0.48;
    }
    return result;
  }

  mat2 rotate2d(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat2(cosine, -sine, sine, cosine);
  }

  vec3 starLayer(vec3 direction, float scale, float threshold) {
    float longitude = atan(direction.z, direction.x) / (2.0 * PI) + 0.5;
    float latitude = asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5;
    vec2 gridUv = vec2(longitude * 2.0, latitude) * scale;
    vec2 cell = floor(gridUv);
    vec2 local = fract(gridUv) - 0.5;
    float seed = hash12(cell);
    vec2 offset = vec2(hash12(cell + 17.7), hash12(cell + 41.3)) - 0.5;
    float radius = length(local - offset * 0.72);
    float star = smoothstep(0.045, 0.0, radius) * smoothstep(threshold, 1.0, seed);
    float temperature = hash12(cell + 91.0);
    vec3 warm = vec3(1.0, 0.66, 0.38);
    vec3 cool = vec3(0.58, 0.75, 1.0);
    vec3 color = mix(warm, cool, temperature);
    return color * star * (1.5 + 7.0 * pow(seed, 18.0));
  }

  vec3 sampleSky(vec3 direction) {
    direction = normalize(direction);
    vec3 galacticNormal = normalize(vec3(0.18, 0.91, -0.37));
    float bandDistance = abs(dot(direction, galacticNormal));
    float dustNoise = fbm(direction * 4.4 + vec3(2.0, 7.0, 1.0));
    float milkyWay = exp(-bandDistance * (10.0 + 7.0 * dustNoise));
    float dustLane = smoothstep(0.38, 0.72, dustNoise);

    vec3 sky = vec3(0.0015, 0.0025, 0.0065);
    sky += vec3(0.032, 0.044, 0.078) * milkyWay * (0.35 + 0.65 * dustLane);
    sky += vec3(0.045, 0.022, 0.012) * milkyWay * smoothstep(0.7, 0.35, dustNoise);
    sky += starLayer(direction, 118.0, 0.988);
    sky += starLayer(direction.yzx, 223.0, 0.996) * 0.72;
    return sky;
  }

  vec3 blackbody(float normalizedTemperature) {
    vec3 ember = vec3(1.0, 0.13, 0.015);
    vec3 gold = vec3(1.0, 0.55, 0.15);
    vec3 whiteHot = vec3(1.0, 0.93, 0.74);
    vec3 blueWhite = vec3(0.67, 0.82, 1.0);
    vec3 low = mix(ember, gold, smoothstep(0.0, 0.38, normalizedTemperature));
    vec3 high = mix(whiteHot, blueWhite, smoothstep(0.72, 1.0, normalizedTemperature));
    return mix(low, high, smoothstep(0.3, 0.78, normalizedTemperature));
  }

  vec4 shadeDisk(vec3 hitPosition, vec3 photonDirection) {
    float radius = length(hitPosition);
    vec3 radialDirection = hitPosition / radius;
    vec3 tangentDirection = normalize(cross(uDiskNormal, radialDirection));
    vec3 axisA = normalize(cross(uDiskNormal, abs(uDiskNormal.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 axisB = cross(uDiskNormal, axisA);
    float azimuth = atan(dot(hitPosition, axisB), dot(hitPosition, axisA));

    float orbitalPhase = azimuth - uTime * (2.1 / pow(max(radius, 6.0), 1.5));
    vec2 angularPoint = vec2(cos(orbitalPhase), sin(orbitalPhase));

    // Filaments sheared along the flow: low angular frequency, high radial frequency
    // produces the thin concentric streaks of a differentially rotating disk.
    float streaks = fbm(vec3(angularPoint * 1.7, radius * 1.45));
    float striation = 0.5 + 0.5 * sin(radius * 4.6 + (streaks - 0.5) * 10.0 + orbitalPhase * 2.0);
    float turbulence = fbm(vec3(angularPoint * 3.6, radius * 0.42 + uTime * 0.02));
    float density = smoothstep(0.12, 0.96, streaks * 0.52 + striation * 0.3 + turbulence * 0.34);

    float innerFade = smoothstep(6.0, 6.55, radius);
    float outerFade = 1.0 - smoothstep(16.5, 25.0, radius);
    float radialHeat = pow(6.0 / radius, 0.78);
    float temperature = saturate(radialHeat * 1.28);

    float orbitalSpeed = clamp(sqrt(1.0 / max(radius - 2.0, 0.1)), 0.0, 0.72);
    float gamma = inversesqrt(max(1.0 - orbitalSpeed * orbitalSpeed, 0.05));
    vec3 directionToObserver = -normalize(photonDirection);
    float doppler = 1.0 / max(gamma * (1.0 - orbitalSpeed * dot(tangentDirection, directionToObserver)), 0.2);
    float gravitationalShift = sqrt(max(1.0 - 2.0 / radius, 0.01));
    float frequencyShift = doppler * gravitationalShift;

    vec3 color = blackbody(saturate(temperature * frequencyShift));
    color *= mix(vec3(1.2, 0.67, 0.42), vec3(0.72, 0.88, 1.18), saturate((frequencyShift - 0.72) * 1.65));

    float emissivity = radialHeat * radialHeat * (0.42 + density * 1.3);
    emissivity *= pow(clamp(frequencyShift, 0.4, 1.6), 2.0);
    emissivity *= innerFade * outerFade * uDiskBrightness;
    float opticalDepth = saturate((0.86 + density * 0.14) * innerFade * outerFade);
    return vec4(color * emissivity, opticalDepth);
  }

  vec2 orbitDerivative(vec2 state) {
    // Exact Schwarzschild null-orbit equation in geometrized units (G = c = M = 1):
    // d²u/dφ² + u = 3u², where u = 1/r.
    return vec2(state.y, -state.x + 3.0 * state.x * state.x);
  }

  vec2 integrateRk4(vec2 state, float deltaPhi) {
    vec2 k1 = orbitDerivative(state);
    vec2 k2 = orbitDerivative(state + 0.5 * deltaPhi * k1);
    vec2 k3 = orbitDerivative(state + 0.5 * deltaPhi * k2);
    vec2 k4 = orbitDerivative(state + deltaPhi * k3);
    return state + (deltaPhi / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }

  vec3 orbitPosition(vec3 radialBasis, vec3 tangentBasis, float phi, float radius) {
    return radius * (radialBasis * cos(phi) + tangentBasis * sin(phi));
  }

  vec3 orbitDirection(vec3 radialBasis, vec3 tangentBasis, float phi, vec2 state) {
    vec3 radial = radialBasis * cos(phi) + tangentBasis * sin(phi);
    vec3 tangent = -radialBasis * sin(phi) + tangentBasis * cos(phi);
    float radius = 1.0 / max(state.x, 0.00001);
    float radialDerivative = -state.y / max(state.x * state.x, 0.000001);
    return normalize(radial * radialDerivative + tangent * radius);
  }

  vec3 traceGeodesic(vec3 rayOrigin, vec3 rayDirection) {
    float initialRadius = length(rayOrigin);
    vec3 radialBasis = rayOrigin / initialRadius;
    float radialProjection = dot(rayDirection, radialBasis);
    vec3 tangentialComponent = rayDirection - radialBasis * radialProjection;
    float sineAlpha = length(tangentialComponent);

    if (sineAlpha < 0.0005) {
      return radialProjection < 0.0 ? vec3(0.0) : sampleSky(rayDirection);
    }

    float initialU = 1.0 / initialRadius;
    float metricFactor = sqrt(max(1.0 - 2.0 * initialU, 0.001));
    float impactParameter = initialRadius * sineAlpha / metricFactor;

    vec3 tangentBasis = tangentialComponent / sineAlpha;
    float initialSlope = -initialU * metricFactor * radialProjection / sineAlpha;
    vec2 state = vec2(initialU, initialSlope);
    float phi = 0.0;
    vec3 previousPosition = rayOrigin;
    vec3 previousDirection = rayDirection;
    float previousPlaneDistance = dot(previousPosition, uDiskNormal);
    vec3 radiance = vec3(0.0);
    float transmittance = 1.0;
    bool escaped = false;
    bool captured = false;

    for (int step = 0; step < MAX_STEPS; step++) {
      if (step >= uStepBudget) break;

      float radius = 1.0 / max(state.x, 0.000001);
      float nearPhotonSphere = exp(-abs(radius - 3.0) * 0.7);
      float deltaPhi = mix(0.032, 0.009, nearPhotonSphere);
      deltaPhi *= mix(0.78, 1.18, smoothstep(3.0, 28.0, radius));

      vec2 nextState = integrateRk4(state, deltaPhi);
      float nextPhi = phi + deltaPhi;

      if (nextState.x >= HORIZON_U) {
        captured = true;
        break;
      }

      if (nextState.x <= 0.0) {
        escaped = true;
        previousDirection = orbitDirection(radialBasis, tangentBasis, nextPhi, max(nextState, vec2(0.00001, -1e6)));
        break;
      }

      float nextRadius = 1.0 / nextState.x;
      vec3 nextPosition = orbitPosition(radialBasis, tangentBasis, nextPhi, nextRadius);
      vec3 travelDirection = normalize(nextPosition - previousPosition);
      float nextPlaneDistance = dot(nextPosition, uDiskNormal);

      if (previousPlaneDistance * nextPlaneDistance <= 0.0 && abs(previousPlaneDistance - nextPlaneDistance) > 0.00001) {
        float crossing = previousPlaneDistance / (previousPlaneDistance - nextPlaneDistance);
        vec3 hitPosition = mix(previousPosition, nextPosition, crossing);
        float hitRadius = length(hitPosition);
        if (hitRadius >= 6.0 && hitRadius <= 25.5 && transmittance > 0.015) {
          vec4 diskSample = shadeDisk(hitPosition, travelDirection);
          radiance += transmittance * diskSample.rgb * diskSample.a;
          transmittance *= 1.0 - diskSample.a;
        }
      }

      state = nextState;
      phi = nextPhi;
      previousPosition = nextPosition;
      previousDirection = travelDirection;
      previousPlaneDistance = nextPlaneDistance;

      if (nextRadius >= ESCAPE_RADIUS && state.y < 0.0) {
        escaped = true;
        previousDirection = orbitDirection(radialBasis, tangentBasis, phi, state);
        break;
      }
    }

    if (escaped) {
      radiance += transmittance * sampleSky(previousDirection);
    } else if (!captured) {
      float continuation = smoothstep(5.19615, 5.30, impactParameter);
      radiance += transmittance * sampleSky(previousDirection) * continuation;
    }

    float photonGlow = captured ? 0.0 : pow(saturate(1.0 - transmittance), 2.0) * 0.06;
    return radiance + vec3(1.0, 0.42, 0.12) * photonGlow;
  }

  void main() {
    vec2 screen = vUv * 2.0 - 1.0;
    screen.x *= uResolution.x / max(uResolution.y, 1.0);
    float focalLength = 1.0 / tan(0.5 * uVerticalFov);
    vec3 rayDirection = normalize(
      uCameraForward * focalLength + uCameraRight * screen.x + uCameraUp * screen.y
    );

    vec3 color = traceGeodesic(uCameraPosition, rayDirection);
    fragColor = vec4(max(color, vec3(0.0)), 1.0);
  }
`;
