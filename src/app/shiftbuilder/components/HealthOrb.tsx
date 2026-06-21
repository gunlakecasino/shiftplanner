"use client";

import { Mesh, Program, Renderer, Triangle, Vec3 } from "ogl";
import { useEffect, useRef } from "react";
import "./Orb.css";

export type HealthOrbProps = {
  primaryColor: string;
  secondaryColor: string;
  tailColor: string;
  backgroundColor: string;
  /** Diameter in CSS px — used to widen the swirl by 2px. */
  pixelSize?: number;
  hoverIntensity?: number;
  forceHoverState?: boolean;
};

/** Rotation-health orb — health palette + orbiting trail highlight from React Bits. */
export default function HealthOrb({
  primaryColor,
  secondaryColor,
  tailColor,
  backgroundColor,
  pixelSize = 60,
  hoverIntensity = 0.18,
  forceHoverState = false,
}: HealthOrbProps) {
  const swirlExpandUv = 4 / Math.max(pixelSize, 1);
  const ctnDom = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    primaryColor,
    secondaryColor,
    tailColor,
    backgroundColor,
    hoverIntensity,
    forceHoverState,
    swirlExpandUv,
  });

  propsRef.current = {
    primaryColor,
    secondaryColor,
    tailColor,
    backgroundColor,
    hoverIntensity,
    forceHoverState,
    swirlExpandUv,
  };

  const vert = /* glsl */ `
    precision highp float;
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const frag = /* glsl */ `
    precision highp float;

    uniform float iTime;
    uniform vec3 iResolution;
    uniform float hover;
    uniform float rot;
    uniform float hoverIntensity;
    uniform vec3 backgroundColor;
    uniform vec3 primaryColor;
    uniform vec3 secondaryColor;
    uniform vec3 tailColor;
    uniform float swirlExpand;
    varying vec2 vUv;

    vec3 hash33(vec3 p3) {
      p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
      p3 += dot(p3, p3.yxz + 19.19);
      return -1.0 + 2.0 * fract(vec3(
        p3.x + p3.y,
        p3.x + p3.z,
        p3.y + p3.z
      ) * p3.zyx);
    }

    float snoise3(vec3 p) {
      const float K1 = 0.333333333;
      const float K2 = 0.166666667;
      vec3 i = floor(p + (p.x + p.y + p.z) * K1);
      vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
      vec3 e = step(vec3(0.0), d0 - d0.yzx);
      vec3 i1 = e * (1.0 - e.zxy);
      vec3 i2 = 1.0 - e.zxy * (1.0 - e);
      vec3 d1 = d0 - (i1 - K2);
      vec3 d2 = d0 - (i2 - K1);
      vec3 d3 = d0 - 0.5;
      vec4 h = max(0.6 - vec4(
        dot(d0, d0),
        dot(d1, d1),
        dot(d2, d2),
        dot(d3, d3)
      ), 0.0);
      vec4 n = h * h * h * h * vec4(
        dot(d0, hash33(i)),
        dot(d1, hash33(i + i1)),
        dot(d2, hash33(i + i2)),
        dot(d3, hash33(i + 1.0))
      );
      return dot(vec4(31.316), n);
    }

    float light1(float intensity, float attenuation, float dist) {
      return intensity / (1.0 + dist * attenuation);
    }

    float light2(float intensity, float attenuation, float dist) {
      return intensity / (1.0 + dist * dist * attenuation);
    }

    vec4 extractAlpha(vec3 colorIn) {
      float a = max(max(colorIn.r, colorIn.g), colorIn.b);
      return vec4(colorIn.rgb / (a + 1e-5), a);
    }

    vec4 draw(vec2 uv) {
      vec3 color1 = primaryColor;
      vec3 color2 = secondaryColor;
      vec3 color3 = tailColor;

      float innerRadius = 0.64 - swirlExpand * 0.4;
      const float noiseScale = 0.65;

      float ang = atan(uv.y, uv.x);
      float len = length(uv);
      float invLen = len > 0.0 ? 1.0 / len : 0.0;

      float bgLuminance = dot(backgroundColor, vec3(0.299, 0.587, 0.114));

      float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
      float r0 = mix(mix(innerRadius, 1.0, 0.36), mix(innerRadius, 1.0, 0.58), n0);
      float d0 = distance(uv, (r0 * invLen) * uv);
      float v0 = light1(1.05, 9.0, d0);

      v0 *= smoothstep(r0 * 1.05, r0 - swirlExpand * 0.22, len);
      float innerFade = smoothstep(r0 * 0.74, r0 * 0.92, len);
      v0 *= mix(innerFade, 1.0, bgLuminance * 0.22);
      float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

      float trailAng = iTime * -1.18;
      vec2 trailPos = vec2(cos(trailAng), sin(trailAng)) * r0;
      float trailDist = distance(uv, trailPos);
      float v1 = light2(1.45, 4.4, trailDist);
      v1 *= light1(1.0, 46.0, d0);

      float trailArc = smoothstep(0.09, 0.0, abs(len - r0));
      float trailArcAng = abs(ang - trailAng);
      trailArcAng = min(trailArcAng, 6.2831853 - trailArcAng);
      trailArc *= smoothstep(0.42, 0.06, trailArcAng);
      v1 += trailArc * 0.28;

      float v2 = smoothstep(1.0, mix(innerRadius + 0.08, 0.98, n0 * 0.3), len);
      float v3 = smoothstep(innerRadius + 0.12, mix(innerRadius + 0.02, 0.8, 0.3), len);

      vec3 colBase = mix(color1, color2, cl);
      float fadeAmount = mix(0.72, 0.18, bgLuminance);

      vec3 trailTint = mix(secondaryColor, vec3(1.0), 0.28);
      vec3 darkCol = mix(color3 * 0.55, colBase, v0);
      darkCol = (darkCol + v1 * trailTint) * v2 * v3;
      darkCol = clamp(darkCol, 0.0, 1.0);

      vec3 lightCol = (colBase + v1 * 1.05) * mix(1.0, v2 * v3, fadeAmount);
      lightCol = mix(backgroundColor, lightCol, v0 * 0.92);
      lightCol = clamp(lightCol, 0.0, 1.0);

      vec3 finalCol = mix(darkCol, lightCol, clamp(bgLuminance * 0.82, 0.35, 0.88));
      finalCol *= mix(1.0, 0.9, smoothstep(0.78, 1.0, len));

      vec4 result = extractAlpha(finalCol);
      result.a *= smoothstep(1.01, 0.9, len);
      return result;
    }

    vec4 mainImage(vec2 fragCoord) {
      vec2 center = iResolution.xy * 0.5;
      float size = min(iResolution.x, iResolution.y);
      vec2 uv = (fragCoord - center) / size * 2.0;

      float angle = rot;
      float s = sin(angle);
      float c = cos(angle);
      uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

      uv.x += hover * hoverIntensity * 0.09 * sin(uv.y * 10.0 + iTime);
      uv.y += hover * hoverIntensity * 0.09 * sin(uv.x * 10.0 + iTime);

      return draw(uv);
    }

    void main() {
      vec2 fragCoord = vUv * iResolution.xy;
      vec4 col = mainImage(fragCoord);
      gl_FragColor = vec4(col.rgb * col.a, col.a);
    }
  `;

  useEffect(() => {
    const container = ctnDom.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vert,
      fragment: frag,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new Vec3(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height),
        },
        hover: { value: 0 },
        rot: { value: 0 },
        hoverIntensity: { value: propsRef.current.hoverIntensity },
        backgroundColor: { value: hexToVec3(propsRef.current.backgroundColor) },
        primaryColor: { value: hexToVec3(propsRef.current.primaryColor) },
        secondaryColor: { value: hexToVec3(propsRef.current.secondaryColor) },
        tailColor: { value: hexToVec3(propsRef.current.tailColor) },
        swirlExpand: { value: propsRef.current.swirlExpandUv },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      if (!container) return;
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width * dpr, height * dpr);
      gl.canvas.style.width = `${width}px`;
      gl.canvas.style.height = `${height}px`;
      program.uniforms.iResolution.value.set(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / gl.canvas.height,
      );
    }
    window.addEventListener("resize", resize);
    resize();

    let targetHover = 0;
    let lastTime = 0;
    let currentRot = 0;
    const rotationSpeed = 0.14;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = Math.min(rect.width, rect.height);
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const uvX = ((x - centerX) / size) * 2.0;
      const uvY = ((y - centerY) / size) * 2.0;
      targetHover = Math.sqrt(uvX * uvX + uvY * uvY) < 0.82 ? 1 : 0;
    };

    const handleMouseLeave = () => {
      targetHover = 0;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    let rafId = 0;
    const update = (t: number) => {
      rafId = requestAnimationFrame(update);
      const dt = (t - lastTime) * 0.001;
      lastTime = t;
      const p = propsRef.current;
      program.uniforms.iTime.value = t * 0.001;
      program.uniforms.hoverIntensity.value = p.hoverIntensity;
      program.uniforms.backgroundColor.value = hexToVec3(p.backgroundColor);
      program.uniforms.primaryColor.value = hexToVec3(p.primaryColor);
      program.uniforms.secondaryColor.value = hexToVec3(p.secondaryColor);
      program.uniforms.tailColor.value = hexToVec3(p.tailColor);
      program.uniforms.swirlExpand.value = p.swirlExpandUv;

      const effectiveHover = p.forceHoverState ? 1 : targetHover;
      program.uniforms.hover.value += (effectiveHover - program.uniforms.hover.value) * 0.1;

      currentRot += dt * rotationSpeed * (0.65 + effectiveHover * 0.55);
      program.uniforms.rot.value = currentRot;

      renderer.render({ scene: mesh });
    };
    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <div ref={ctnDom} className="orb-container" />;
}

function hexToVec3(color: string) {
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    return new Vec3(r, g, b);
  }

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return new Vec3(
      parseInt(rgbMatch[1], 10) / 255,
      parseInt(rgbMatch[2], 10) / 255,
      parseInt(rgbMatch[3], 10) / 255,
    );
  }

  return new Vec3(0.63, 0.63, 0.67);
}